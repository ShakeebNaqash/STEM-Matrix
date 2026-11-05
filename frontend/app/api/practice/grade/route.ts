import { gradePractice } from "@/lib/mock/practice";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Expected a question id and an answer." }, { status: 400 });
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.questionId !== "string") {
    return Response.json({ error: "Expected a question id." }, { status: 400 });
  }

  const answer = record.answer;
  if (typeof answer !== "string" && !(Array.isArray(answer) && answer.every((item) => typeof item === "string"))) {
    return Response.json({ error: "Expected an answer." }, { status: 400 });
  }

  const result = gradePractice(record.questionId, answer);
  if (!result) {
    return Response.json({ error: "Unknown question." }, { status: 404 });
  }
  return Response.json(result);
}
