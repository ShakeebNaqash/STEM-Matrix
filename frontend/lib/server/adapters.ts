import type {
  AnswerSegment,
  Book,
  ChatMode,
  ChatRequest,
  ChatStreamEvent,
  Citation,
  Clarification,
  FeedbackRequest,
  Flashcard,
  GradeResult,
  HealthStatus,
  PracticeQuestion,
  SolverAttempt,
  SolverOutcome,
  SolverParams,
  SourcePassage,
  SourceType,
  Subject,
  UnitConversion,
} from "@/lib/types";
import type { components, paths } from "@/lib/generated/backend-api";
import { clarificationText, toResultDisplay } from "@/lib/result-display";
import { solverTrace } from "@/lib/solver-trace";
import type { SseMessage } from "@/lib/sse";
import type { WireAttempt, WireChatRequest } from "@/lib/server/wire";

export function toWireChatRequest(request: ChatRequest): WireChatRequest {
  return {
    question: request.question,
    subject: request.subject,
    book_id: request.bookId,
    history: request.history.map((turn) => ({ role: turn.role, text: turn.text })),
  };
}

type HealthBody = paths["/api/health"]["get"]["responses"][200]["content"]["application/json"];
type PracticeSet = components["schemas"]["PracticeSet"];
type PracticeGradeResponse = components["schemas"]["PracticeGradeResponse"];

export function adaptHealth(body: HealthBody): HealthStatus {
  if (!isRecord(body) || typeof body.model_configured !== "boolean" || typeof body.model_mode !== "string") {
    throw new Error("unreadable");
  }
  return {
    status: "ok",
    backend: "live",
    model: healthModel(body.model_configured, body.model_mode),
  };
}

export function adaptPractice(body: unknown): PracticeQuestion[] {
  const set = readPracticeSet(body);
  return set.questions.map((question) => ({
    id: question.question_id,
    type: "nat",
    prompt: question.prompt,
    bookId: "",
    book: "",
    chapter: "Integrals",
  }));
}

export function adaptGrade(body: unknown): GradeResult {
  const grade = readGrade(body);
  const segment: AnswerSegment = {
    id: "feedback",
    text: grade.feedback,
    sourceType: "solver",
    citations: [],
  };
  return {
    result: grade.correct ? "correct" : "incorrect",
    expected: String(grade.expected_value),
    segments: [segment],
  };
}

export function adaptBooks(body: unknown): Book[] {
  if (!Array.isArray(body)) throw new Error("unreadable");
  const books: Book[] = [];
  for (const item of body) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.short_title !== "string") {
      throw new Error("unreadable");
    }
    const subject = readSubject(item.subject);
    if (!subject || !Array.isArray(item.chapters)) throw new Error("unreadable");
    const chapters = item.chapters.map((chapter) => {
      if (!isRecord(chapter) || typeof chapter.id !== "string" || typeof chapter.title !== "string") {
        throw new Error("unreadable");
      }
      return { id: chapter.id, title: chapter.title };
    });
    books.push({ id: item.id, title: item.title, shortTitle: item.short_title, subject, chapters });
  }
  return books;
}

export function adaptSource(body: unknown): SourcePassage {
  if (
    !isRecord(body) ||
    typeof body.chunk_id !== "string" ||
    typeof body.book !== "string" ||
    typeof body.book_id !== "string" ||
    typeof body.chapter !== "string" ||
    typeof body.section !== "string" ||
    typeof body.page !== "number" ||
    typeof body.text !== "string"
  ) {
    throw new Error("unreadable");
  }
  const subject = readSubject(body.subject);
  if (!subject) throw new Error("unreadable");
  return {
    chunkId: body.chunk_id,
    book: body.book,
    bookId: body.book_id,
    subject,
    chapter: body.chapter,
    section: body.section,
    page: body.page,
    text: body.text,
  };
}

export function adaptFlashcards(body: unknown): Flashcard[] {
  if (!Array.isArray(body)) throw new Error("unreadable");
  return body.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.book !== "string" ||
      typeof item.chapter !== "string" ||
      typeof item.front !== "string" ||
      typeof item.back !== "string"
    ) {
      throw new Error("unreadable");
    }
    const subject = readSubject(item.subject);
    if (!subject) throw new Error("unreadable");
    const card: Flashcard = {
      id: item.id,
      subject,
      book: item.book,
      chapter: item.chapter,
      front: item.front,
      back: item.back,
    };
    const citation = readCitation(item.citation);
    if (citation) card.citation = citation;
    if (typeof item.front_math === "string") card.frontMath = item.front_math;
    return card;
  });
}

export function toWireFeedback(body: FeedbackRequest) {
  return {
    message_id: body.messageId,
    vote: body.vote,
    question: body.question,
    answer_text: body.answerText,
    mode: body.mode,
    segments: body.segments.map((segment) => ({
      id: segment.id,
      text: segment.text,
      source_type: segment.sourceType,
      citations: segment.citations.map((citation) => ({
        book: citation.book,
        chapter: citation.chapter,
        section: citation.section,
        page: citation.page,
        chunk_id: citation.chunkId,
      })),
      ...(segment.displayMath ? { display_math: segment.displayMath } : {}),
    })),
    attempts: body.attempts.map((attempt) => ({
      attempt: attempt.attempt,
      model_answer: attempt.modelAnswer,
      solver_answer: attempt.solverAnswer,
      matched: attempt.match,
      ...(attempt.solver ? { solver: attempt.solver } : {}),
      ...(attempt.params ? { params: attempt.params } : {}),
      ...(attempt.feedback ? { feedback: attempt.feedback } : {}),
    })),
    ...(body.outcomeStatus ? { outcome_status: body.outcomeStatus } : {}),
    ...(body.reason ? { reason: body.reason } : {}),
    ...(body.comment ? { comment: body.comment } : {}),
    created_at: body.createdAt,
  };
}

export function adaptChatMessage(message: SseMessage): ChatStreamEvent | null {
  switch (message.event) {
    case "meta":
      return adaptMeta(message.data);
    case "segment":
      return adaptSegment(message.data);
    case "attempt":
      return adaptAttempt(message.data);
    case "done":
      return adaptDone(message.data);
    case "error":
      return { event: "error", data: { message: publicText(recordField(message.data, "message"), "The answer was cut off. Ask again.") } };
    case "solver_result":
      return adaptSolverResult(message.data);
    case "clarification":
      return adaptClarification(message.data);
    default:
      return null;
  }
}

function adaptMeta(data: unknown): ChatStreamEvent | null {
  if (!isRecord(data) || typeof data.message_id !== "string") return null;
  const mode = adaptMode(data.mode);
  if (!mode) return null;
  return {
    event: "meta",
    data: {
      messageId: data.message_id,
      mode,
      ...(typeof data.retrieval_note === "string" ? { retrievalNote: data.retrieval_note } : {}),
    },
  };
}

function adaptSegment(data: unknown): ChatStreamEvent | null {
  if (!isRecord(data) || typeof data.id !== "string" || typeof data.text !== "string" || !Array.isArray(data.citations)) {
    return null;
  }
  const sourceType = readSourceType(data.source_type);
  if (!sourceType) return null;
  const citations: Citation[] = [];
  for (const item of data.citations) {
    const citation = readCitation(item);
    if (!citation) return null;
    citations.push(citation);
  }
  const segment: AnswerSegment = { id: data.id, text: data.text, sourceType, citations };
  if (typeof data.display_math === "string") segment.displayMath = data.display_math;
  return { event: "segment", data: segment };
}

function adaptAttempt(data: unknown): ChatStreamEvent | null {
  const attempt = readAttempt(data);
  if (!attempt) return null;
  const params = readParams(attempt.params);
  const view: SolverAttempt = {
    attempt: attempt.attempt,
    modelAnswer: typeof attempt.model_answer === "string" ? attempt.model_answer : null,
    solverAnswer: typeof attempt.solver_answer === "string" ? attempt.solver_answer : null,
    match: attempt.matched,
  };
  if (typeof attempt.solver === "string" && attempt.solver.trim()) view.solver = attempt.solver;
  if (Object.keys(params).length > 0) view.params = params;
  if (typeof attempt.feedback === "string") view.feedback = attempt.feedback;
  return { event: "attempt", data: view };
}

function adaptSolverResult(data: unknown): ChatStreamEvent | null {
  if (!isRecord(data)) return null;
  const status = outcomeStatus(data.status);
  const raw = data.solver_result;
  if (!status || !isRecord(raw) || typeof raw.solver !== "string") return null;
  const details = isRecord(raw.details) ? raw.details : undefined;
  const outcome: SolverOutcome = {
    status,
    solver: raw.solver,
    display: status === "failed" ? null : toResultDisplay(raw.solver, raw.result ?? null, raw.numeric_result ?? null, details),
  };
  if (isRecord(raw.verification) && typeof raw.verification.message === "string" && raw.verification.message.trim()) {
    outcome.checkMessage = raw.verification.message;
  }
  const conversions = readConversions(details);
  if (conversions.length > 0) outcome.conversions = conversions;
  if (typeof raw.error === "string" && raw.error.trim()) outcome.error = raw.error;
  if (typeof data.note === "string" && data.note.trim()) outcome.note = data.note;
  outcome.trace = solverTrace(raw.solver, details);
  return { event: "solver_result", data: outcome };
}

function adaptClarification(data: unknown): ChatStreamEvent | null {
  if (!isRecord(data) || typeof data.message !== "string") return null;
  const patterns = Array.isArray(data.supported_patterns)
    ? data.supported_patterns.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : null;
  const clarification: Clarification = {
    message: clarificationText(data.message, patterns),
    patterns: patterns ?? [],
  };
  return { event: "clarification", data: clarification };
}

function outcomeStatus(value: unknown): SolverOutcome["status"] | null {
  switch (value) {
    case "verified":
      return "verified";
    case "solver_result_unmatched":
      return "unmatched";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

function readConversions(details: unknown): UnitConversion[] {
  if (!isRecord(details) || !isRecord(details.preflight) || !Array.isArray(details.preflight.conversions)) return [];
  const rows: UnitConversion[] = [];
  for (const item of details.preflight.conversions) {
    if (!isRecord(item) || typeof item.field !== "string" || typeof item.from !== "string" || typeof item.to !== "string") {
      continue;
    }
    rows.push({ field: item.field, from: item.from, to: item.to });
  }
  return rows;
}

function adaptDone(data: unknown): ChatStreamEvent | null {
  if (!isRecord(data) && data !== null && data !== undefined) return null;
  const note = isRecord(data) && typeof data.note === "string" ? data.note : undefined;
  return { event: "done", data: note ? { note } : {} };
}

function adaptMode(mode: unknown): ChatMode | null {
  switch (mode) {
    case "textbook_qa":
      return "textbook";
    case "problem_solving":
      return "problem";
    case "out_of_scope":
      return "out_of_scope";
    default:
      return null;
  }
}

function healthModel(configured: boolean, mode: string): HealthStatus["model"] {
  if (!configured) return "not_connected";
  if (mode === "mock") return "mock";
  return "connected";
}

function readSubject(value: unknown): Subject | null {
  if (value === "Engineering mathematics" || value === "Physics") return value;
  return null;
}

function readSourceType(value: unknown): SourceType | null {
  if (value === "textbook" || value === "solver" || value === "model") return value;
  return null;
}

function readCitation(value: unknown): Citation | null {
  if (
    !isRecord(value) ||
    typeof value.book !== "string" ||
    typeof value.chapter !== "string" ||
    typeof value.section !== "string" ||
    typeof value.page !== "number" ||
    typeof value.chunk_id !== "string"
  ) {
    return null;
  }
  return {
    book: value.book,
    chapter: value.chapter,
    section: value.section,
    page: value.page,
    chunkId: value.chunk_id,
  };
}

function readParams(value: unknown): SolverParams {
  if (!isRecord(value)) return {};
  const params: SolverParams = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") params[key] = item;
  }
  return params;
}

function publicText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 240 || trimmed.includes("\n") || trimmed.includes("Traceback")) return fallback;
  return trimmed;
}

function recordField(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function readPracticeSet(body: unknown): PracticeSet {
  if (!isRecord(body) || !Array.isArray(body.questions)) throw new Error("unreadable");
  const questions: PracticeSet["questions"] = [];
  for (const question of body.questions) {
    if (!isRecord(question) || typeof question.question_id !== "string" || typeof question.prompt !== "string" || !isRecord(question.solver_request)) {
      throw new Error("unreadable");
    }
    const solver = question.solver_request;
    if (typeof solver.request_id !== "string" || typeof solver.solver !== "string") throw new Error("unreadable");
    questions.push({
      question_id: question.question_id,
      prompt: question.prompt,
      solver_request: {
        request_id: solver.request_id,
        solver: "definite_integral",
        variable: typeof solver.variable === "string" ? solver.variable : "x",
        tolerance: 1e-8,
        max_iterations: 100,
      },
    });
  }
  return { questions };
}

function readGrade(body: unknown): PracticeGradeResponse {
  if (
    !isRecord(body) ||
    typeof body.correct !== "boolean" ||
    typeof body.expected_value !== "number" ||
    typeof body.submitted_value !== "number" ||
    typeof body.feedback !== "string"
  ) {
    throw new Error("unreadable");
  }
  return {
    correct: body.correct,
    expected_value: body.expected_value,
    submitted_value: body.submitted_value,
    feedback: body.feedback,
  };
}

function readAttempt(data: unknown): WireAttempt | null {
  if (!isRecord(data) || typeof data.attempt !== "number" || typeof data.matched !== "boolean") return null;
  return {
    attempt: data.attempt,
    model_answer: typeof data.model_answer === "string" || data.model_answer === null ? data.model_answer : null,
    solver_answer: typeof data.solver_answer === "string" || data.solver_answer === null ? data.solver_answer : null,
    matched: data.matched,
    ...(typeof data.feedback === "string" || data.feedback === null ? { feedback: data.feedback } : {}),
    ...(typeof data.solver === "string" ? { solver: data.solver } : {}),
    ...(isRecord(data.params) ? { params: readParams(data.params) } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
