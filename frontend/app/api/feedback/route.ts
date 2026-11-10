import { toWireFeedback } from "@/lib/server/adapters";
import { backendFailure, backendFetch, isLive, upstreamFailure } from "@/lib/server/backend";
import type { AnswerSegment, Citation, FeedbackRequest, SolverAttempt, SolverParams, SourceType } from "@/lib/types";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  const feedback = readFeedback(payload);
  if (!feedback) return Response.json({ error: "Expected a message id and a vote." }, { status: 400 });

  if (!isLive("feedback")) {
    if (process.env.MOCK_HEALTH === "offline") {
      return Response.json({ error: "The StemMatrix server isn't running." }, { status: 502 });
    }
    return Response.json({ recorded: true });
  }

  try {
    const response = await backendFetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toWireFeedback(feedback)),
    });
    const failed = upstreamFailure(response, "Could not record that vote.");
    if (failed) return failed;
    return Response.json({ recorded: true });
  } catch (error: unknown) {
    return backendFailure(error);
  }
}

function readFeedback(payload: unknown): FeedbackRequest | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.messageId !== "string" || typeof payload.question !== "string") return null;
  if (typeof payload.answerText !== "string" || typeof payload.mode !== "string" || typeof payload.createdAt !== "string") {
    return null;
  }
  if (payload.vote !== "up" && payload.vote !== "down" && payload.vote !== null) return null;
  if (!Array.isArray(payload.segments) || !Array.isArray(payload.attempts)) return null;
  const feedback: FeedbackRequest = {
    messageId: payload.messageId,
    vote: payload.vote,
    question: payload.question,
    answerText: payload.answerText,
    mode: payload.mode,
    segments: readSegments(payload.segments),
    attempts: readAttempts(payload.attempts),
    createdAt: payload.createdAt,
  };
  if (typeof payload.reason === "string" && payload.reason.trim()) feedback.reason = payload.reason;
  if (typeof payload.comment === "string" && payload.comment.trim()) feedback.comment = payload.comment.slice(0, 500);
  if (payload.outcomeStatus === "verified" || payload.outcomeStatus === "unmatched" || payload.outcomeStatus === "failed") {
    feedback.outcomeStatus = payload.outcomeStatus;
  }
  return feedback;
}

function readSegments(value: unknown): AnswerSegment[] {
  if (!Array.isArray(value)) return [];
  const segments: AnswerSegment[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.text !== "string" || !isSource(item.sourceType)) continue;
    const segment: AnswerSegment = {
      id: item.id,
      text: item.text,
      sourceType: item.sourceType,
      citations: readCitations(item.citations),
    };
    if (typeof item.displayMath === "string") segment.displayMath = item.displayMath;
    segments.push(segment);
  }
  return segments;
}

function readCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];
  const citations: Citation[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.book !== "string" ||
      typeof item.chapter !== "string" ||
      typeof item.section !== "string" ||
      typeof item.page !== "number" ||
      typeof item.chunkId !== "string"
    ) {
      continue;
    }
    citations.push({
      book: item.book,
      chapter: item.chapter,
      section: item.section,
      page: item.page,
      chunkId: item.chunkId,
    });
  }
  return citations;
}

function readAttempts(value: unknown): SolverAttempt[] {
  if (!Array.isArray(value)) return [];
  const attempts: SolverAttempt[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.attempt !== "number" || typeof item.match !== "boolean") continue;
    const modelAnswer = item.modelAnswer;
    const solverAnswer = item.solverAnswer;
    if (modelAnswer !== null && typeof modelAnswer !== "string") continue;
    if (solverAnswer !== null && typeof solverAnswer !== "string") continue;
    const attempt: SolverAttempt = { attempt: item.attempt, modelAnswer, solverAnswer, match: item.match };
    if (typeof item.solver === "string" && item.solver.trim()) attempt.solver = item.solver;
    if (typeof item.feedback === "string") attempt.feedback = item.feedback;
    const params = readParams(item.params);
    if (params) attempt.params = params;
    attempts.push(attempt);
  }
  return attempts;
}

function readParams(value: unknown): SolverParams | undefined {
  if (!isRecord(value)) return undefined;
  const params: SolverParams = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") params[key] = item;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function isSource(value: unknown): value is SourceType {
  return value === "textbook" || value === "solver" || value === "model";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
