import { citationFor, passageById, toSourcePassage } from "@/lib/mock/corpus";
import { gradePractice, practiceByType } from "@/lib/mock/practice";
import { planAnswer } from "@/lib/mock/router";
import { clarificationText, explainSolverError } from "@/lib/result-display";
import { shortBook } from "@/lib/format";
import type { ChatRequest } from "@/lib/types";

export const INTEGRAL = "Integrate x^2 from 0 to 3";
export const SINGULAR = "Inverse of [[1,2],[2,4]]";
export const CUBIC = "Integrate x^3 from 0 to 2";
export const CAR = "How fast is a car";
export const FRESNEL = "Integrate sin(x^2) from 0 to 1";

function request(question: string): ChatRequest {
  return { question, subject: null, bookId: null, history: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function integralPlan() {
  return planAnswer(request(INTEGRAL));
}

export function singularStatus(): { heading: string; detail: string } {
  const plan = planAnswer(request(SINGULAR));
  const event = plan.wire?.find((item) => item.event === "solver_result");
  if (!event || !isRecord(event.data) || !isRecord(event.data.solver_result)) {
    throw new Error("The singular-matrix mock has no solver result.");
  }
  const error = event.data.solver_result.error;
  if (typeof error !== "string") throw new Error("The singular-matrix mock has no error string.");
  return { heading: "The solver couldn't work this out", detail: explainSolverError(error) };
}

export const UNMATCHED_STATUS = "The model's answer didn't match. Showing the solver's result.";

export function carClarification(): { message: string; patterns: string[] } {
  const plan = planAnswer(request(CAR));
  const event = plan.wire?.find((item) => item.event === "clarification");
  if (!event || !isRecord(event.data) || typeof event.data.message !== "string" || !Array.isArray(event.data.supported_patterns)) {
    throw new Error("The car mock has no clarification.");
  }
  const patterns = event.data.supported_patterns.filter((item): item is string => typeof item === "string");
  return { message: clarificationText(event.data.message, patterns), patterns };
}

export function fresnelFeedback(): string {
  const feedback = planAnswer(request(FRESNEL)).attempts[0]?.feedback;
  if (!feedback) throw new Error("The Fresnel mock has no first attempt.");
  return feedback;
}

export function integralCitation() {
  const citation = integralPlan().segments.find((segment) => segment.citations.length > 0)?.citations[0];
  if (!citation) throw new Error("The integral mock has no citation.");
  const passage = toSourcePassage(citation.chunkId);
  const record = passageById(citation.chunkId);
  if (!passage || !record) throw new Error("The integral citation is missing from the corpus.");
  return {
    chip: `${shortBook(citation.book)} · p. ${citation.page}`,
    book: shortBook(passage.book),
    line: `${passage.chapter} · ${passage.section} · p. ${passage.page}`,
  };
}

export function firstPractice(type: "mcq" | "nat" | "short") {
  const question = practiceByType(type)[0];
  if (!question) throw new Error(`No ${type} practice question.`);
  return question;
}

export function partialShortAnswer() {
  const question = firstPractice("short");
  if (!Array.isArray(question.answer) || question.answer.length < 2) {
    throw new Error("The short-answer mock needs more than one key term.");
  }
  const given = question.answer[0] ?? "";
  const graded = gradePractice(question.id, given);
  return { question, given, missing: graded?.missing ?? [] };
}

export function flashcardCitation() {
  const citation = citationFor("phys2-lenz");
  const passage = toSourcePassage(citation.chunkId);
  if (!passage) throw new Error("Missing Lenz passage.");
  return {
    chip: `${shortBook(citation.book)} · p. ${citation.page}`,
    book: shortBook(passage.book),
    line: `${passage.chapter} · ${passage.section} · p. ${passage.page}`,
  };
}
