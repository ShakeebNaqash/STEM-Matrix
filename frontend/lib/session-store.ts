import type {
  AnswerSegment,
  ChatMessage,
  ChatMode,
  Citation,
  Clarification,
  MessageFeedback,
  ResultDisplay,
  SolverAttempt,
  SolverOutcome,
  SolverParams,
  SourceType,
  StudySession,
  Subject,
} from "@/lib/types";

export const SESSION_STORAGE_KEY = "stemmatrix.sessions.v2";
export const LEGACY_SESSION_STORAGE_KEY = "stemmatrix.sessions.v1";
export const INTERRUPTED_ERROR = "This answer was interrupted. Ask again.";

export type SessionStore = {
  activeId: string;
  sessions: StudySession[];
};

export type SessionAction =
  | { type: "new-chat" }
  | { type: "select"; id: string }
  | { type: "remove"; id: string }
  | { type: "set-filter"; subject: Subject | null; bookId: string | null }
  | { type: "add-exchange"; sessionId: string; user: ChatMessage; assistant: ChatMessage }
  | {
      type: "patch";
      sessionId: string;
      messageId: string;
      update: (message: ChatMessage) => ChatMessage;
    };

const sampleLenz: StudySession = {
  id: "sample-lenz",
  title: "What is Lenz's law?",
  subject: null,
  bookId: null,
  updatedAt: 1,
  messages: [
    {
      id: "sample-lenz-user",
      role: "user",
      text: "What is Lenz's law?",
      segments: [],
      attempts: [],
    },
    {
      id: "sample-lenz-assistant",
      role: "assistant",
      text: "",
      mode: "textbook",
      scripted: true,
      attempts: [],
      segments: [
        {
          id: "sample-lenz-1",
          text: "The induced emf drives a current whose magnetic field opposes the change in flux that produced it. That opposition is the content of the minus sign in Faraday's law.",
          sourceType: "textbook",
          citations: [
            {
              book: "OpenStax University Physics Volume 2",
              chapter: "Electromagnetic induction",
              section: "Lenz's law",
              page: 478,
              chunkId: "phys2-lenz",
            },
          ],
        },
        {
          id: "sample-lenz-2",
          text: "Faraday's law gives the size of the induced emf. Lenz's law gives the direction.",
          sourceType: "textbook",
          citations: [
            {
              book: "OpenStax University Physics Volume 2",
              chapter: "Electromagnetic induction",
              section: "Faraday's law",
              page: 470,
              chunkId: "phys2-faraday",
            },
            {
              book: "OpenStax University Physics Volume 2",
              chapter: "Electromagnetic induction",
              section: "Lenz's law",
              page: 478,
              chunkId: "phys2-lenz",
            },
          ],
        },
      ],
    },
  ],
};

const sampleIntegral: StudySession = {
  id: "sample-integral",
  title: "Integrate x^2 from 0 to 3",
  subject: null,
  bookId: null,
  updatedAt: 2,
  messages: [
    {
      id: "sample-integral-user",
      role: "user",
      text: "Integrate x^2 from 0 to 3",
      segments: [],
      attempts: [],
    },
    {
      id: "sample-integral-assistant",
      role: "assistant",
      text: "",
      mode: "problem",
      scripted: true,
      segments: [
        {
          id: "sample-integral-1",
          text: "The power rule says the antiderivative of $x^2$ is $x^3/3$.",
          sourceType: "textbook",
          citations: [
            {
              book: "OpenStax Calculus Volume 1",
              chapter: "Integrals",
              section: "The power rule",
              page: 342,
              chunkId: "calc1-power",
            },
          ],
        },
        {
          id: "sample-integral-2",
          text: "Evaluated from 0 to 3, the definite integral is 9.",
          sourceType: "solver",
          citations: [],
          displayMath: "\\int_0^3 x^2\\,dx = \\left[\\frac{x^3}{3}\\right]_0^3 = 9",
        },
        {
          id: "sample-integral-3",
          text: "The first draft reported 27, which is $3^3$ with the factor of $1/3$ left out. The solver sent that error back, and the second draft matched.",
          sourceType: "model",
          citations: [],
        },
      ],
      attempts: [
        {
          attempt: 1,
          modelAnswer: "$27$",
          solverAnswer: "$9$",
          match: false,
          solver: "SymPy",
          params: { type: "definite_integral", expr: "x**2", lower: 0, upper: 3 },
          feedback:
            "The antiderivative of x**2 is x**3/3, not x**3. Evaluating x**3 from 0 to 3 gives 27. Dividing by 3 gives 9.",
        },
        {
          attempt: 2,
          modelAnswer: "$9$",
          solverAnswer: "$9$",
          match: true,
          solver: "SymPy",
          params: { type: "definite_integral", expr: "x**2", lower: 0, upper: 3 },
        },
      ],
    },
  ],
};

function blankSession(subject: Subject | null, bookId: string | null): StudySession {
  return {
    id: `chat-${crypto.randomUUID()}`,
    title: "New question",
    subject,
    bookId,
    updatedAt: Date.now(),
    messages: [],
  };
}

export function initialStore(): SessionStore {
  return {
    activeId: "draft",
    sessions: [
      {
        id: "draft",
        title: "New question",
        subject: null,
        bookId: null,
        updatedAt: 0,
        messages: [],
      },
      sampleLenz,
      sampleIntegral,
    ],
  };
}

function collect<T>(items: unknown[], read: (value: unknown) => T | null): T[] {
  const next: T[] = [];
  for (const item of items) {
    const value = read(item);
    if (value !== null) next.push(value);
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSubject(value: unknown): Subject | null {
  if (value === "Engineering mathematics" || value === "Physics") return value;
  return null;
}

function readMode(value: unknown): ChatMode | undefined {
  if (value === "textbook" || value === "problem" || value === "out_of_scope") return value;
  return undefined;
}

function readSourceType(value: unknown): SourceType | null {
  if (value === "textbook" || value === "solver" || value === "model") return value;
  return null;
}

function readCitation(value: unknown): Citation | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.book !== "string" ||
    typeof value.chapter !== "string" ||
    typeof value.section !== "string" ||
    typeof value.page !== "number" ||
    typeof value.chunkId !== "string"
  ) {
    return null;
  }
  return {
    book: value.book,
    chapter: value.chapter,
    section: value.section,
    page: value.page,
    chunkId: value.chunkId,
  };
}

function readSegment(value: unknown): AnswerSegment | null {
  if (!isRecord(value) || !Array.isArray(value.citations)) return null;
  const sourceType = readSourceType(value.sourceType);
  if (typeof value.id !== "string" || typeof value.text !== "string" || !sourceType) return null;
  const citations = collect(value.citations, readCitation);
  const segment: AnswerSegment = { id: value.id, text: value.text, sourceType, citations };
  if (typeof value.displayMath === "string") segment.displayMath = value.displayMath;
  return segment;
}

function readParams(value: unknown): SolverParams {
  if (!isRecord(value)) return {};
  const params: SolverParams = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      params[key] = item;
    }
  }
  return params;
}

function readNullableText(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
}

function readAttempt(value: unknown): SolverAttempt | null {
  if (!isRecord(value) || typeof value.attempt !== "number" || typeof value.match !== "boolean") return null;
  const modelAnswer = readNullableText(value.modelAnswer);
  const solverAnswer = readNullableText(value.solverAnswer);
  if (modelAnswer === undefined || solverAnswer === undefined) return null;
  const attempt: SolverAttempt = {
    attempt: value.attempt,
    modelAnswer,
    solverAnswer,
    match: value.match,
  };
  if (typeof value.solver === "string" && value.solver.trim()) attempt.solver = value.solver;
  if (isRecord(value.params)) {
    const params = readParams(value.params);
    if (Object.keys(params).length > 0) attempt.params = params;
  }
  if (typeof value.feedback === "string") attempt.feedback = value.feedback;
  return attempt;
}

function readResultDisplay(value: unknown): ResultDisplay | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "number":
      if (typeof value.value !== "string") return null;
      return typeof value.unit === "string"
        ? { kind: "number", value: value.value, unit: value.unit }
        : { kind: "number", value: value.value };
    case "list":
      if (
        typeof value.label !== "string" ||
        !Array.isArray(value.items) ||
        !value.items.every((item) => typeof item === "string")
      ) {
        return null;
      }
      return { kind: "list", label: value.label, items: value.items };
    case "matrix":
      if (
        !Array.isArray(value.rows) ||
        !value.rows.every((row) => Array.isArray(row) && row.every((item) => typeof item === "string"))
      ) {
        return null;
      }
      return { kind: "matrix", rows: value.rows };
    case "assignments": {
      if (!Array.isArray(value.sets)) return null;
      const sets = [];
      for (const set of value.sets) {
        if (!Array.isArray(set)) return null;
        const pairs = [];
        for (const pair of set) {
          if (!isRecord(pair) || typeof pair.name !== "string" || typeof pair.value !== "string") return null;
          pairs.push({ name: pair.name, value: pair.value });
        }
        sets.push(pairs);
      }
      return { kind: "assignments", sets };
    }
    case "table": {
      if (!Array.isArray(value.rows)) return null;
      const rows = [];
      for (const row of value.rows) {
        if (!isRecord(row) || typeof row.label !== "string" || typeof row.value !== "string") return null;
        rows.push({ label: row.label, value: row.value });
      }
      return { kind: "table", rows };
    }
    case "text":
      return typeof value.value === "string" ? { kind: "text", value: value.value } : null;
    default:
      return null;
  }
}

function readTrace(value: unknown): SolverOutcome["trace"] {
  if (!isRecord(value) || typeof value.title !== "string" || !Array.isArray(value.steps)) return undefined;
  const steps: { label: string; value: string }[] = [];
  for (const step of value.steps) {
    if (!isRecord(step) || typeof step.label !== "string" || typeof step.value !== "string") return undefined;
    steps.push({ label: step.label, value: step.value });
  }
  const trace: NonNullable<SolverOutcome["trace"]> = { title: value.title, steps };
  if (typeof value.raw === "string") trace.raw = value.raw;
  return trace;
}

function readOutcome(value: unknown): SolverOutcome | null {
  if (!isRecord(value) || typeof value.solver !== "string") return null;
  if (value.status !== "verified" && value.status !== "unmatched" && value.status !== "failed") return null;
  const display = value.display === null ? null : readResultDisplay(value.display);
  if (value.display !== null && !display) return null;
  const outcome: SolverOutcome = { status: value.status, solver: value.solver, display };
  if (typeof value.checkMessage === "string") outcome.checkMessage = value.checkMessage;
  if (typeof value.error === "string") outcome.error = value.error;
  if (typeof value.note === "string") outcome.note = value.note;
  if (Array.isArray(value.conversions)) {
    const conversions = [];
    for (const item of value.conversions) {
      if (!isRecord(item) || typeof item.field !== "string" || typeof item.from !== "string" || typeof item.to !== "string") {
        continue;
      }
      conversions.push({ field: item.field, from: item.from, to: item.to });
    }
    if (conversions.length > 0) outcome.conversions = conversions;
  }
  const trace = readTrace(value.trace);
  if (trace) outcome.trace = trace;
  return outcome;
}

function readFeedback(value: unknown): MessageFeedback | undefined {
  if (value === "up" || value === "down") return { vote: value, sent: true };
  if (!isRecord(value) || typeof value.sent !== "boolean") return undefined;
  if (value.vote !== "up" && value.vote !== "down" && value.vote !== null) return undefined;
  const feedback: MessageFeedback = { vote: value.vote, sent: value.sent };
  if (typeof value.reason === "string" && value.reason.trim()) feedback.reason = value.reason;
  if (typeof value.comment === "string" && value.comment.trim()) feedback.comment = value.comment;
  return feedback;
}

function readClarification(value: unknown): Clarification | null {
  if (!isRecord(value) || typeof value.message !== "string" || !Array.isArray(value.patterns)) return null;
  if (!value.patterns.every((item) => typeof item === "string")) return null;
  return { message: value.message, patterns: value.patterns };
}

function readMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value) || !Array.isArray(value.segments) || !Array.isArray(value.attempts)) return null;
  if (typeof value.id !== "string") return null;
  if (value.role !== "user" && value.role !== "assistant") return null;
  const message: ChatMessage = {
    id: value.id,
    role: value.role,
    text: typeof value.text === "string" ? value.text : "",
    segments: collect(value.segments, readSegment),
    attempts: collect(value.attempts, readAttempt),
  };
  const mode = readMode(value.mode);
  if (mode) message.mode = mode;
  if (typeof value.retrievalNote === "string") message.retrievalNote = value.retrievalNote;
  if (typeof value.note === "string") message.note = value.note;
  const feedback = readFeedback(value.feedback);
  if (feedback) message.feedback = feedback;
  if (value.pending === true) {
    message.pending = false;
    message.error = INTERRUPTED_ERROR;
  } else if (typeof value.error === "string") {
    message.error = value.error;
  }
  const outcome = readOutcome(value.outcome);
  if (outcome) message.outcome = outcome;
  const clarification = readClarification(value.clarification);
  if (clarification) message.clarification = clarification;
  if (value.role === "assistant") message.scripted = typeof value.scripted === "boolean" ? value.scripted : true;
  return message;
}

function readSession(value: unknown): StudySession | null {
  if (!isRecord(value) || !Array.isArray(value.messages)) return null;
  if (typeof value.id !== "string" || typeof value.title !== "string") return null;
  return {
    id: value.id,
    title: value.title,
    subject: readSubject(value.subject),
    bookId: typeof value.bookId === "string" ? value.bookId : null,
    updatedAt: typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
    messages: collect(value.messages, readMessage),
  };
}

function readStore(value: unknown): SessionStore | null {
  if (!isRecord(value) || !Array.isArray(value.sessions)) return null;
  const sessions = collect(value.sessions, readSession);
  if (sessions.length === 0) return null;
  const requested = typeof value.activeId === "string" ? value.activeId : "";
  const activeId = sessions.some((session) => session.id === requested) ? requested : sessions[0].id;
  return { activeId, sessions };
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode and a full quota should leave the in-memory chats usable.
  }
}

function storageRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures. The page can still reload from memory.
  }
}

export function clearSavedChats() {
  storageRemove(SESSION_STORAGE_KEY);
  storageRemove(LEGACY_SESSION_STORAGE_KEY);
}

export function loadSavedStore(fallback: SessionStore): SessionStore {
  storageRemove(LEGACY_SESSION_STORAGE_KEY);
  const raw = storageGet(SESSION_STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return readStore(parsed) ?? fallback;
  } catch {
    storageRemove(SESSION_STORAGE_KEY);
    return fallback;
  }
}

export function writeSavedStore(store: SessionStore) {
  storageSet(SESSION_STORAGE_KEY, JSON.stringify(store));
}

function mapSession(store: SessionStore, sessionId: string, update: (session: StudySession) => StudySession): SessionStore {
  return {
    ...store,
    sessions: store.sessions.map((session) => (session.id === sessionId ? update(session) : session)),
  };
}

export function reducer(state: SessionStore, action: SessionAction): SessionStore {
  switch (action.type) {
    case "select":
      return state.sessions.some((session) => session.id === action.id) ? { ...state, activeId: action.id } : state;
    case "new-chat": {
      const current = state.sessions.find((session) => session.id === state.activeId);
      if (current && current.messages.length === 0) return state;
      const session = blankSession(current?.subject ?? null, current?.bookId ?? null);
      return { activeId: session.id, sessions: [session, ...state.sessions] };
    }
    case "remove": {
      const remaining = state.sessions.filter((session) => session.id !== action.id);
      if (remaining.length === 0) {
        const session = blankSession(null, null);
        return { activeId: session.id, sessions: [session] };
      }
      const activeId = state.activeId === action.id ? remaining[0].id : state.activeId;
      return { activeId, sessions: remaining };
    }
    case "set-filter":
      return mapSession(state, state.activeId, (session) => ({
        ...session,
        subject: action.subject,
        bookId: action.bookId,
      }));
    case "add-exchange": {
      const next = mapSession(state, action.sessionId, (session) => {
        const title = session.messages.length === 0 ? action.user.text.slice(0, 72) : session.title;
        return {
          ...session,
          title,
          updatedAt: Date.now(),
          messages: [...session.messages, action.user, action.assistant],
        };
      });
      const session = next.sessions.find((item) => item.id === action.sessionId);
      if (!session) return next;
      return {
        ...next,
        sessions: [session, ...next.sessions.filter((item) => item.id !== action.sessionId)],
      };
    }
    case "patch":
      return mapSession(state, action.sessionId, (session) => ({
        ...session,
        messages: session.messages.map((message) =>
          message.id === action.messageId ? action.update(message) : message,
        ),
      }));
    default: {
      const neverAction: never = action;
      return neverAction;
    }
  }
}
