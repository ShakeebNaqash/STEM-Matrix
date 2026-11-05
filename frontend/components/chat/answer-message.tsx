"use client";

import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { MathText } from "@/components/math-text";
import { SourceBadge, sourceBorder } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { modeLabel, shortBook } from "@/lib/format";
import type { AnswerSegment, ChatMessage, Citation } from "@/lib/types";
import { cn } from "cn";

export function AnswerMessage({
  message,
  onCite,
  onFeedback,
  onFollowUp,
}: {
  message: ChatMessage;
  onCite: (citation: Citation) => void;
  onFeedback: (value: "up" | "down") => void;
  onFollowUp: (text: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[36rem] rounded-2xl bg-primary px-4 py-3 text-primary-foreground">
        <MathText text={message.text} className="text-sm leading-6" />
      </div>
    );
  }

  if (message.error) {
    return <p className="text-sm text-destructive">{message.error}</p>;
  }

  const pendingLabel = statusLabel(message);

  return (
    <article className="max-w-[42rem]" aria-live={message.pending ? "polite" : undefined}>
      {message.mode ? (
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {modeLabel(message.mode)}
        </p>
      ) : null}
      {message.retrievalNote ? (
        <p className="mt-2 rounded-lg bg-model-soft px-3 py-2 text-sm leading-6 text-model">
          {message.retrievalNote}
        </p>
      ) : null}
      {message.mode === "out_of_scope" ? (
        <p className="font-reading mt-3 text-lg leading-8">{message.segments[0]?.text}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {message.segments.map((segment) => (
            <SegmentBlock key={segment.id} segment={segment} onCite={onCite} />
          ))}
        </div>
      )}
      {message.note ? (
        <p className="mt-4 rounded-lg bg-solver-soft px-3 py-2 text-sm leading-6 text-solver">
          {message.note}
        </p>
      ) : null}
      {message.pending ? (
        <p className="mt-3 text-sm text-muted-foreground">{pendingLabel}</p>
      ) : null}
      {!message.pending && message.mode && message.mode !== "out_of_scope" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={message.feedback === "up" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={message.feedback === "up"}
            onClick={() => onFeedback("up")}
          >
            <ThumbsUpIcon />
            Helpful
          </Button>
          <Button
            type="button"
            variant={message.feedback === "down" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={message.feedback === "down"}
            onClick={() => onFeedback("down")}
          >
            <ThumbsDownIcon />
            Not helpful
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onFollowUp("Explain that more simply")}>
            Explain more simply
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onFollowUp("Show an example")}>
            Show an example
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function SegmentBlock({
  segment,
  onCite,
}: {
  segment: AnswerSegment;
  onCite: (citation: Citation) => void;
}) {
  return (
    <section className={cn("border-l-2 pl-4", sourceBorder(segment.sourceType))}>
      <SourceBadge source={segment.sourceType} />
      <MathText text={segment.text} className="font-reading mt-2 text-[1.05rem] leading-7" />
      {segment.displayMath ? (
        <MathText text={`$$${segment.displayMath}$$`} className="font-reading" />
      ) : null}
      {segment.citations.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {segment.citations.map((citation) => (
            <button
              key={`${segment.id}-${citation.chunkId}`}
              type="button"
              onClick={() => onCite(citation)}
              className="rounded-full bg-textbook-soft px-2.5 py-1 text-left text-xs font-medium text-textbook hover:opacity-80"
            >
              {shortBook(citation.book)} · p. {citation.page}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function statusLabel(message: ChatMessage): string {
  switch (message.mode) {
    case "problem":
      return message.attempts.length > 0
        ? "Checking the answer against the solver"
        : "Setting up the solver";
    case "textbook":
      return "Looking through the textbooks";
    case "out_of_scope":
      return "Checking the subject";
    case undefined:
      return "Reading the question";
    default: {
      const neverMode: never = message.mode;
      return neverMode;
    }
  }
}
