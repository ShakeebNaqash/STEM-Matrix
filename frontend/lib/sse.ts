export type SseFrame = {
  event: string;
  data: string;
};

export type SseMessage = {
  event: string;
  data: unknown;
};

export type SseReader = {
  push: (chunk: string) => SseMessage[];
  finish: () => SseMessage[];
};

export function createSseReader(): SseReader {
  let buffer = "";

  const take = (flush: boolean): SseMessage[] => {
    let pendingCarriageReturn = "";
    if (!flush && buffer.endsWith("\r")) {
      pendingCarriageReturn = "\r";
      buffer = buffer.slice(0, -1);
    }
    const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const blocks = normalized.split("\n\n");
    buffer = flush ? "" : `${blocks.pop() ?? ""}${pendingCarriageReturn}`;
    const messages: SseMessage[] = [];
    for (const block of blocks) {
      const frame = readFrame(block);
      if (!frame) continue;
      const message = readMessage(frame);
      if (message) messages.push(message);
    }
    return messages;
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      return take(false);
    },
    finish() {
      return take(true);
    },
  };
}

function readFrame(block: string): SseFrame | null {
  let event = "";
  const dataLines: string[] = [];
  let sawData = false;
  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") {
      sawData = true;
      dataLines.push(value);
    }
  }
  if (!sawData) return null;
  return { event, data: dataLines.join("\n") };
}

function readMessage(frame: SseFrame): SseMessage | null {
  try {
    return { event: frame.event, data: JSON.parse(frame.data) as unknown };
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.warn("Skipped a malformed server-sent event.");
    }
    return null;
  }
}
