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

export function shortBook(title: string): string {
  return title.replace(/^OpenStax /, "");
}
