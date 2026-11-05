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
  modelAnswer: string;
  solverAnswer: string;
  match: boolean;
  solver: string;
  params: SolverParams;
  feedback?: string;
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
};

export type ChatDone = {
  note?: string;
};

export type ChatStreamEvent =
  | { event: "meta"; data: ChatMeta }
  | { event: "segment"; data: AnswerSegment }
  | { event: "attempt"; data: SolverAttempt }
  | { event: "done"; data: ChatDone };

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

export type GradeRequest = {
  questionId: string;
  answer: string | string[];
};

export type GradeResult = {
  correct: boolean;
  expected: string;
  segments: AnswerSegment[];
};

export type Flashcard = {
  id: string;
  subject: Subject;
  book: string;
  chapter: string;
  front: string;
  frontMath?: string;
  back: string;
  citation: Citation;
};

export type FeedbackRequest = {
  messageId: string;
  value: "up" | "down";
};

export type HealthStatus = {
  status: "ok";
  backend: "mock";
  model: "not_connected";
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
  feedback?: "up" | "down";
  pending?: boolean;
  error?: string;
};

export type StudySession = {
  id: string;
  title: string;
  subject: Subject | null;
  bookId: string | null;
  updatedAt: number;
  messages: ChatMessage[];
};
