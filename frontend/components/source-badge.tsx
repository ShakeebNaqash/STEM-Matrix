"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sourceAria, sourceExplanation, sourceLabel } from "@/lib/format";
import type { SourceType } from "@/lib/types";
import { cn } from "cn";

const tones: Record<SourceType, string> = {
  textbook: "bg-textbook-soft text-textbook",
  solver: "bg-solver-soft text-solver",
  model: "bg-model-soft text-model",
};

export function SourceBadge({ source }: { source: SourceType }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={200}
        aria-label={sourceAria(source)}
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
          tones[source],
        )}
      >
        {sourceLabel(source)}
      </PopoverTrigger>
      <PopoverContent>
        <p>{sourceExplanation(source)}</p>
      </PopoverContent>
    </Popover>
  );
}
