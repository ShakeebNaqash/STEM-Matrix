import { createSseReader, type SseMessage } from "@/lib/sse";
import type {
  Book,
  ChatRequest,
  ChatStreamEvent,
  FeedbackRequest,
  Flashcard,
  GradeRequest,
  GradeResult,
  HealthStatus,
  PracticeCapabilities,
  PracticeQuestion,
  PracticeRequest,
  SourcePassage,
} from "@/lib/types";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isServerDown(reason: unknown): boolean {
  if (reason instanceof ApiError) return reason.status === 502 || reason.status === 504;
  return reason instanceof TypeError;
}

export async function streamChat(
  body: ChatRequest,
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new ApiError(response.status, await errorMessage(response, "The preview server could not answer."));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseReader();

  const emit = (messages: SseMessage[]) => {
    for (const message of messages) {
      const event = toChatEvent(message);
      if (event) onEvent(event);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      emit(parser.push(decoder.decode()));
      emit(parser.finish());
      break;
    }
    emit(parser.push(decoder.decode(value, { stream: true })));
  }
}

function toChatEvent(message: SseMessage): ChatStreamEvent | null {
  if (!isRecord(message.data)) return null;
  switch (message.event) {
    case "meta":
    case "segment":
    case "attempt":
    case "done":
      return { event: message.event, data: message.data } as ChatStreamEvent;
    case "error":
      return typeof message.data.message === "string"
        ? { event: "error", data: { message: message.data.message } }
        : null;
    case "solver_result":
    case "clarification":
      return { event: message.event, data: message.data } as ChatStreamEvent;
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    return fallback;
  }
  return fallback;
}

export async function listBooks(): Promise<Book[]> {
  const response = await fetch("/api/books");
  if (!response.ok) throw new Error("Could not load books.");
  return (await response.json()) as Book[];
}

export async function getSource(chunkId: string): Promise<SourcePassage> {
  const response = await fetch(`/api/sources/${encodeURIComponent(chunkId)}`);
  if (!response.ok) throw new Error("That passage is not in the preview corpus.");
  return (await response.json()) as SourcePassage;
}

export async function getPracticeCapabilities(): Promise<PracticeCapabilities> {
  const response = await fetch("/api/practice/capabilities");
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response, "Could not load practice options."));
  }
  return (await response.json()) as PracticeCapabilities;
}

export async function createPractice(body: PracticeRequest): Promise<PracticeQuestion[]> {
  const response = await fetch("/api/practice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response, "Could not build a practice set."));
  return (await response.json()) as PracticeQuestion[];
}

export async function gradePractice(body: GradeRequest): Promise<GradeResult> {
  const response = await fetch("/api/practice/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response, "Could not grade that answer."));
  return (await response.json()) as GradeResult;
}

export async function listFlashcards(): Promise<Flashcard[]> {
  const response = await fetch("/api/flashcards");
  if (response.status === 404) return [];
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response, "Could not load flashcards."));
  return (await response.json()) as Flashcard[];
}

export async function sendFeedback(body: FeedbackRequest): Promise<void> {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response, "Could not record that vote."));
}

export async function getHealth(): Promise<HealthStatus> {
  const response = await fetch("/api/health");
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response, "Health check failed."));
  return (await response.json()) as HealthStatus;
}
