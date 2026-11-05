import { cn } from "cn";
import { sourceHint, sourceLabel } from "@/lib/format";
import type { SourceType } from "@/lib/types";

const tones: Record<SourceType, string> = {
  textbook: "bg-textbook-soft text-textbook",
  solver: "bg-solver-soft text-solver",
  model: "bg-model-soft text-model",
};

export function SourceBadge({ source }: { source: SourceType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        tones[source],
      )}
      title={sourceHint(source)}
    >
      {sourceLabel(source)}
    </span>
  );
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
