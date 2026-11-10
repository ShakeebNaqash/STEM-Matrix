import { describe, expect, it } from "vitest";
import { createSseReader, type SseMessage } from "@/lib/sse";

function read(chunks: string[]): SseMessage[] {
  const reader = createSseReader();
  const messages = chunks.flatMap((chunk) => reader.push(chunk));
  return [...messages, ...reader.finish()];
}

describe("sse reader", () => {
  it("accepts CRLF event boundaries", () => {
    expect(read(["event: meta\r\ndata: {\"a\":1}\r\n\r\n"])).toEqual([{ event: "meta", data: { a: 1 } }]);
  });

  it("strips one optional space after the data colon", () => {
    expect(
      read(["event: meta\ndata: {\"a\":1}\n\nevent: done\ndata:{\"b\":2}\n\n"]),
    ).toEqual([
      { event: "meta", data: { a: 1 } },
      { event: "done", data: { b: 2 } },
    ]);
  });

  it("joins multiple data lines with a newline", () => {
    const chunk = 'event: segment\ndata: {"text":"hello",\ndata: "extra":"world"}\n\n';
    expect(read([chunk])).toEqual([{ event: "segment", data: { text: "hello", extra: "world" } }]);
  });

  it("ignores comment lines and unknown fields", () => {
    const chunk = ": keep-alive\n\nid: 7\nretry: 1000\nevent: meta\n: ping\ndata: {\"a\":1}\n\n";
    expect(read([chunk])).toEqual([{ event: "meta", data: { a: 1 } }]);
  });

  it("skips a malformed JSON event and keeps the ones around it", () => {
    const chunk = 'event: meta\ndata: {"a":1}\n\nevent: meta\ndata: {nope}\n\nevent: done\ndata: {"a":2}\n\n';
    expect(read([chunk])).toEqual([
      { event: "meta", data: { a: 1 } },
      { event: "done", data: { a: 2 } },
    ]);
  });

  it("keeps an event that arrives in two chunks", () => {
    const reader = createSseReader();
    expect(reader.push('event: meta\ndata: {"a":')).toEqual([]);
    expect(reader.push("1}\n\n")).toEqual([{ event: "meta", data: { a: 1 } }]);
    expect(reader.finish()).toEqual([]);
  });

  it("flushes a final event that has no trailing blank line", () => {
    const reader = createSseReader();
    expect(reader.push('event: done\ndata: {"note":"ok"}')).toEqual([]);
    expect(reader.finish()).toEqual([{ event: "done", data: { note: "ok" } }]);
  });
});
