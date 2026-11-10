import type { components } from "@/lib/generated/backend-api";
import { gradePractice } from "@/lib/mock/practice";
import { parseDecimal } from "@/lib/number";
import { adaptGrade } from "@/lib/server/adapters";
import { backendFailure, backendFetch, isLive, upstreamFailure } from "@/lib/server/backend";

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

  if (!isLive("grade")) {
    const result = gradePractice(record.questionId, answer, {
      shortUngraded: process.env.MOCK_HEALTH === "no_model",
    });
    if (!result) return Response.json({ error: "Unknown question." }, { status: 404 });
    return Response.json(result);
  }

  if (typeof answer !== "string") {
    return Response.json({ error: "Enter a number." }, { status: 400 });
  }
  const submitted = parseDecimal(answer);
  if (submitted === null) {
    return Response.json({ error: "Enter a number." }, { status: 400 });
  }

  try {
    const response = await backendFetch("/api/practice/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: record.questionId,
        submitted_value: submitted,
      } satisfies Pick<components["schemas"]["PracticeGradeRequest"], "question_id" | "submitted_value">),
    });
    const failed = upstreamFailure(response, "Unknown question.");
    if (failed) return failed;
    return Response.json(adaptGrade(await response.json()));
  } catch (error: unknown) {
    return backendFailure(error);
  }
}
