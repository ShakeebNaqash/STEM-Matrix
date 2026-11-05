import { selectPracticeQuestions } from "@/lib/mock/practice";
import type { PracticeQuestionType } from "@/lib/types";

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
  const types = Array.isArray(record.types) ? record.types.filter((item): item is PracticeQuestionType => typeof item === "string" && isType(item)) : [];

  return Response.json(selectPracticeQuestions({ bookId, chapterId, types }));
}
