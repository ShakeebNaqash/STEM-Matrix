import type { FeedbackRequest } from "@/lib/types";

const OUTBOX_KEY = "stemmatrix.feedback.outbox";

export function readOutbox(): FeedbackRequest[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFeedbackRequest);
  } catch {
    return [];
  }
}

export function enqueueFeedback(payload: FeedbackRequest) {
  const next = readOutbox().filter((item) => item.messageId !== payload.messageId);
  next.push(payload);
  writeOutbox(next);
}

export function dropFeedback(messageId: string, createdAt: string) {
  writeOutbox(readOutbox().filter((item) => item.messageId !== messageId || item.createdAt !== createdAt));
}

function writeOutbox(items: FeedbackRequest[]) {
  try {
    if (items.length === 0) localStorage.removeItem(OUTBOX_KEY);
    else localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    // A full quota leaves the vote on the message, still marked unsent.
  }
}

function isFeedbackRequest(value: unknown): value is FeedbackRequest {
  if (!isRecord(value)) return false;
  if (typeof value.messageId !== "string" || typeof value.question !== "string") return false;
  if (typeof value.answerText !== "string" || typeof value.mode !== "string" || typeof value.createdAt !== "string") {
    return false;
  }
  if (value.vote !== "up" && value.vote !== "down" && value.vote !== null) return false;
  if (!Array.isArray(value.segments) || !Array.isArray(value.attempts)) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
