import { parseChatRequest, planAnswer } from "@/lib/mock/router";

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

  const plan = planAnswer(chatRequest);
  const encoder = new TextEncoder();
  const messageId = `msg_${crypto.randomUUID()}`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("meta", {
        messageId,
        mode: plan.mode,
        retrievalNote: plan.retrievalNote,
      });

      for (const attempt of plan.attempts) {
        await delay(220);
        send("attempt", attempt);
      }

      for (const segment of plan.segments) {
        await delay(140);
        send("segment", segment);
      }

      send("done", { note: plan.note });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
