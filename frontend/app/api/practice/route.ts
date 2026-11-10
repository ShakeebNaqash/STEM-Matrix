import type { components } from "@/lib/generated/backend-api";
import { selectPracticeQuestions } from "@/lib/mock/practice";
import { adaptPractice } from "@/lib/server/adapters";
import { backendFailure, backendFetch, isLive, upstreamFailure } from "@/lib/server/backend";
import type { PracticeQuestionType, PracticeRequest } from "@/lib/types";

const TYPES: readonly PracticeQuestionType[] = ["mcq", "msq", "nat", "short"];

function isType(value: string): value is PracticeQuestionType {
  return TYPES.some((type) => type === value);
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const bookId = typeof record.bookId === "string" ? record.bookId : null;
  const chapterId = typeof record.chapterId === "string" ? record.chapterId : null;
  const types = Array.isArray(record.types)
    ? record.types.filter((item): item is PracticeQuestionType => typeof item === "string" && isType(item))
    : [];
  const practiceRequest: PracticeRequest = { bookId, chapterId, types };

  if (!isLive("practice")) return Response.json(selectPracticeQuestions(practiceRequest));
  if (!types.includes("nat")) return Response.json([]);

  try {
    const response = await backendFetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "definite_integral",
        count: 5,
      } satisfies components["schemas"]["PracticeGenerateRequest"]),
    });
    const failed = upstreamFailure(response, "Could not build a practice set.");
    if (failed) return failed;
    return Response.json(adaptPractice(await response.json()));
  } catch (error: unknown) {
    return backendFailure(error);
  }
}
