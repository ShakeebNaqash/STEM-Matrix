import { adaptChatMessage, toWireChatRequest } from "@/lib/server/adapters";
import { backendFailure, backendFetch, isLive, upstreamFailure } from "@/lib/server/backend";
import { createSseReader } from "@/lib/sse";
import { parseChatRequest, planAnswer } from "@/lib/mock/router";
import type { ChatRequest, ChatStreamEvent } from "@/lib/types";

const encoder = new TextEncoder();

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  const chatRequest = parseChatRequest(payload);
  if (!chatRequest) {
    return Response.json({ error: "A question is required." }, { status: 400 });
  }

  if (!isLive("chat")) return mockChat(chatRequest);
  return liveChat(chatRequest, request.signal);
}

function mockChat(chatRequest: ChatRequest): Response {
  const plan = planAnswer(chatRequest);
  const messageId = `msg_${crypto.randomUUID()}`;
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cancelled = true;
        }
      };

      try {
        send("meta", {
          messageId,
          mode: plan.mode,
          retrievalNote: plan.retrievalNote,
        });

        if (plan.wire && plan.wire.length > 0) {
          for (const message of plan.wire) {
            await delay(220 * mockSlowdown());
            if (cancelled) return;
            const adapted = adaptChatMessage(message);
            if (!adapted) continue;
            switch (adapted.event) {
              case "attempt":
              case "segment":
              case "solver_result":
              case "clarification":
                send(adapted.event, adapted.data);
                break;
              case "meta":
              case "done":
              case "error":
                break;
              default: {
                const neverEvent: never = adapted;
                void neverEvent;
              }
            }
          }
        } else {
          for (const attempt of plan.attempts) {
            await delay(220 * mockSlowdown());
            if (cancelled) return;
            send("attempt", attempt);
          }
        }

        for (const segment of plan.segments) {
          await delay(140 * mockSlowdown());
          if (cancelled) return;
          send("segment", segment);
        }

        if (cancelled) return;
        send("done", { note: plan.note });
        if (!cancelled) controller.close();
      } catch {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, { headers: sseHeaders });
}

async function liveChat(chatRequest: ChatRequest, signal: AbortSignal): Promise<Response> {
  const upstream = new AbortController();
  const abortUpstream = () => upstream.abort();
  signal.addEventListener("abort", abortUpstream, { once: true });

  try {
    const response = await backendFetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(toWireChatRequest(chatRequest)),
      signal: upstream.signal,
      stream: true,
    });
    const failed = upstreamFailure(response, "The StemMatrix server could not answer.");
    if (failed || !response.body) {
      return failed ?? Response.json({ error: "The StemMatrix server could not answer." }, { status: 502 });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = createSseReader();
    let cancelled = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: ChatStreamEvent) => {
          if (cancelled) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`));
          } catch {
            cancelled = true;
          }
        };
        const emit = (chunk: string, flush: boolean) => {
          const messages = flush ? [...parser.push(chunk), ...parser.finish()] : parser.push(chunk);
          for (const message of messages) {
            const event = adaptChatMessage(message);
            if (event) send(event);
          }
        };

        try {
          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) {
              emit(decoder.decode(), true);
              break;
            }
            emit(decoder.decode(value, { stream: true }), false);
          }
          if (!cancelled) controller.close();
        } catch {
          if (!cancelled && !signal.aborted) {
            send({ event: "error", data: { message: "The answer was cut off. Ask again." } });
          }
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
        upstream.abort();
      },
    });

    return new Response(stream, { headers: sseHeaders });
  } catch (error: unknown) {
    if (signal.aborted || upstream.signal.aborted) return new Response(null, { status: 204 });
    return backendFailure(error);
  }
}

function mockSlowdown(): number {
  const parsed = Number(process.env.MOCK_STREAM_SLOWDOWN ?? "1");
  if (!Number.isFinite(parsed) || parsed < 0) return 1;
  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
