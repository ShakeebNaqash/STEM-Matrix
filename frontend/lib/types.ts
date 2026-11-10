export const SUBJECTS = ["Engineering mathematics", "Physics"] as const;

export type Subject = (typeof SUBJECTS)[number];

export type SourceType = "textbook" | "solver" | "model";

export type ChatMode = "textbook" | "problem" | "out_of_scope";

export type PracticeQuestionType = "mcq" | "msq" | "nat" | "short";

export type Citation = {
  book: string;
  chapter: string;
  section: string;
  page: number;
  chunkId: string;
};

export type AnswerSegment = {
  id: string;
  text: string;
  sourceType: SourceType;
  citations: Citation[];
  displayMath?: string;
};

export type SolverParams = Record<string, string | number | boolean>;

export type SolverAttempt = {
  attempt: number;
  modelAnswer: string | null;
  solverAnswer: string | null;
  match: boolean;
  solver?: string;
  params?: SolverParams;
  feedback?: string;
};

export type ResultDisplay =
  | { kind: "number"; value: string; unit?: string }
  | { kind: "list"; label: string; items: string[] }
  | { kind: "matrix"; rows: string[][] }
  | { kind: "assignments"; sets: { name: string; value: string }[][] }
  | { kind: "table"; rows: { label: string; value: string }[] }
  | { kind: "text"; value: string };

export type UnitConversion = {
  field: string;
  from: string;
  to: string;
};

export type SolverTrace = {
  title: string;
  steps: { label: string; value: string }[];
  raw?: string;
};

export type SolverOutcome = {
  status: "verified" | "unmatched" | "failed";
  solver: string;
  display: ResultDisplay | null;
  checkMessage?: string;
  conversions?: UnitConversion[];
  error?: string;
  note?: string;
  trace?: SolverTrace;
};

export type Clarification = {
  message: string;
  patterns: string[];
};

export type HistoryTurn = {
  role: "user" | "assistant";
  text: string;
};

export type ChatRequest = {
  question: string;
  subject: Subject | null;
  bookId: string | null;
  history: HistoryTurn[];
};

export type ChatMeta = {
  messageId: string;
  mode: ChatMode;
  retrievalNote?: string;
  scripted?: boolean;
};

export type ChatDone = {
  note?: string;
};

export type ChatError = {
  message: string;
};

export type ChatStreamEvent =
  | { event: "meta"; data: ChatMeta }
  | { event: "segment"; data: AnswerSegment }
  | { event: "attempt"; data: SolverAttempt }
  | { event: "done"; data: ChatDone }
  | { event: "error"; data: ChatError }
  | { event: "solver_result"; data: SolverOutcome }
  | { event: "clarification"; data: Clarification };

export type BookChapter = {
  id: string;
  title: string;
};

export type Book = {
  id: string;
  title: string;
  shortTitle: string;
  subject: Subject;
  chapters: BookChapter[];
};

export type SourcePassage = {
  chunkId: string;
  book: string;
  bookId: string;
  subject: Subject;
  chapter: string;
  section: string;
  page: number;
  text: string;
};

export type PracticeOption = {
  id: string;
  text: string;
};

export type PracticeQuestion = {
  id: string;
  type: PracticeQuestionType;
  prompt: string;
  bookId: string;
  book: string;
  chapter: string;
  options?: PracticeOption[];
};

export type PracticeRequest = {
  bookId: string | null;
  chapterId: string | null;
  types: PracticeQuestionType[];
};

export type PracticeCapabilities = {
  types: PracticeQuestionType[];
  filters: { book: boolean; chapter: boolean };
};

export type GradeRequest = {
  questionId: string;
  answer: string | string[];
};

export type GradeMark = "correct" | "incorrect" | "partial" | "ungraded";

export type GradeResult = {
  result: GradeMark;
  expected: string;
  segments: AnswerSegment[];
  missing?: string[];
};

export type Flashcard = {
  id: string;
  subject: Subject;
  book: string;
  chapter: string;
  front: string;
  frontMath?: string;
  back: string;
  citation?: Citation;
};

export type MessageFeedback = {
  vote: "up" | "down" | null;
  reason?: string;
  comment?: string;
  sent: boolean;
};

export type FeedbackRequest = {
  messageId: string;
  vote: "up" | "down" | null;
  question: string;
  answerText: string;
  mode: string;
  segments: AnswerSegment[];
  attempts: SolverAttempt[];
  outcomeStatus?: SolverOutcome["status"];
  reason?: string;
  comment?: string;
  createdAt: string;
};

export const API_ROUTES = ["health", "chat", "books", "sources", "practice", "grade", "flashcards", "feedback"] as const;

export type ApiRoute = (typeof API_ROUTES)[number];

export type HealthStatus = {
  status: "ok";
  backend: "mock" | "live";
  model: "not_connected" | "mock" | "connected";
  scripted: ApiRoute[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  mode?: ChatMode;
  segments: AnswerSegment[];
  attempts: SolverAttempt[];
  retrievalNote?: string;
  note?: string;
  feedback?: MessageFeedback;
  pending?: boolean;
  error?: string;
  outcome?: SolverOutcome;
  clarification?: Clarification;
  scripted?: boolean;
};

export type StudySession = {
  id: string;
  title: string;
  subject: Subject | null;
  bookId: string | null;
  updatedAt: number;
  messages: ChatMessage[];
};
