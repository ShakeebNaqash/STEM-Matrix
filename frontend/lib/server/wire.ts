import type { components } from "@/lib/generated/backend-api";

export type WireChatRequest = {
  question: string;
  subject: string | null;
  book_id: string | null;
  history: { role: "user" | "assistant"; text: string }[];
};

export type WireChatMode = "textbook_qa" | "problem_solving" | "out_of_scope";

export type WireCitation = {
  book: string;
  chapter: string;
  section: string;
  page: number;
  chunk_id: string;
};

export type WireSegment = {
  id: string;
  text: string;
  source_type: "textbook" | "solver" | "model";
  citations: WireCitation[];
  display_math?: string;
};

export type WireAttempt = components["schemas"]["RepairAttempt"] & {
  solver?: string;
  params?: Record<string, string | number | boolean>;
};

export type WireMeta = {
  message_id: string;
  mode: WireChatMode;
  retrieval_note?: string;
};

export type WireSource = {
  chunk_id: string;
  book: string;
  book_id: string;
  subject: string;
  chapter: string;
  section: string;
  page: number;
  text: string;
};

export type WireBook = {
  id: string;
  title: string;
  short_title: string;
  subject: string;
  chapters: { id: string; title: string }[];
};

export type WireFlashcard = {
  id: string;
  subject: string;
  book: string;
  chapter: string;
  front: string;
  front_math?: string;
  back: string;
  citation: WireCitation;
};

export type WireFeedbackRequest = {
  message_id: string;
  value: "up" | "down";
};
