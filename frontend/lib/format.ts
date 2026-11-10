import type { ChatMode, SourceType } from "@/lib/types";

export function modeLabel(mode: ChatMode): string {
  switch (mode) {
    case "textbook":
      return "Textbook Q&A";
    case "problem":
      return "Problem solving";
    case "out_of_scope":
      return "Outside the supported subjects";
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

export function sourceLabel(source: SourceType): string {
  switch (source) {
    case "textbook":
      return "Textbook";
    case "solver":
      return "Solver";
    case "model":
      return "Model";
    default: {
      const neverSource: never = source;
      return neverSource;
    }
  }
}

export function sourceHint(source: SourceType): string {
  switch (source) {
    case "textbook":
      return "Supported by a retrieved passage";
    case "solver":
      return "Computed and checked";
    case "model":
      return "No textbook or solver behind this part";
    default: {
      const neverSource: never = source;
      return neverSource;
    }
  }
}

export function sourceExplanation(source: SourceType): string {
  switch (source) {
    case "textbook":
      return "Textbook marks a sentence taken from a retrieved passage. The citation opens that page.";
    case "solver":
      return "Solver marks a value the solver computed. The check lists the steps and whether the model's answer matched.";
    case "model":
      return "Model marks the language model's own wording. It is not a textbook passage and it is not a solver result.";
    default: {
      const neverSource: never = source;
      return neverSource;
    }
  }
}

export function sourceAria(source: SourceType): string {
  switch (source) {
    case "textbook":
      return "Textbook source";
    case "solver":
      return "Solver source";
    case "model":
      return "Model source";
    default: {
      const neverSource: never = source;
      return neverSource;
    }
  }
}

export function sourceBorder(source: SourceType): string {
  switch (source) {
    case "textbook":
      return "border-textbook";
    case "solver":
      return "border-solver";
    case "model":
      return "border-model";
    default: {
      const neverSource: never = source;
      return neverSource;
    }
  }
}

export function shortBook(title: string): string {
  return title.replace(/^OpenStax /, "");
}
