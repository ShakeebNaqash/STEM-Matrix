import type {
  Book,
  ChatRequest,
  ChatStreamEvent,
  FeedbackRequest,
  Flashcard,
  GradeRequest,
  GradeResult,
  HealthStatus,
  PracticeQuestion,
  PracticeRequest,
  SourcePassage,
} from "@/lib/types";

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
    throw new Error("The preview server could not answer.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const event = parseSse(chunk);
      if (event) onEvent(event);
    }
  }
}

function parseSse(chunk: string): ChatStreamEvent | null {
  let name = "";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event: ")) name = line.slice(7).trim();
    if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!data) return null;
  const parsed: unknown = JSON.parse(data);
  switch (name) {
    case "meta":
    case "segment":
    case "attempt":
    case "done":
      return { event: name, data: parsed } as ChatStreamEvent;
    default:
      return null;
  }
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

export async function createPractice(body: PracticeRequest): Promise<PracticeQuestion[]> {
  const response = await fetch("/api/practice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Could not build a practice set.");
  return (await response.json()) as PracticeQuestion[];
}

export async function gradePractice(body: GradeRequest): Promise<GradeResult> {
  const response = await fetch("/api/practice/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Could not grade that answer.");
  return (await response.json()) as GradeResult;
}

export async function listFlashcards(): Promise<Flashcard[]> {
  const response = await fetch("/api/flashcards");
  if (!response.ok) throw new Error("Could not load flashcards.");
  return (await response.json()) as Flashcard[];
}

export async function sendFeedback(body: FeedbackRequest): Promise<void> {
  await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getHealth(): Promise<HealthStatus> {
  const response = await fetch("/api/health");
  if (!response.ok) throw new Error("Health check failed.");
  return (await response.json()) as HealthStatus;
}
