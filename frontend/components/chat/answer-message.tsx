"use client";

import { useState } from "react";
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { OutcomeBody, SolverStatusLine } from "@/components/chat/solver-status";
import { CitationChip } from "@/components/citation-chip";
import { MathText } from "@/components/math-text";
import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { modeLabel, sourceBorder } from "@/lib/format";
import type { AnswerSegment, ChatMessage, Citation } from "@/lib/types";
import { cn } from "cn";

const FEEDBACK_REASONS = [
  "Wrong answer",
  "Wrong or missing citation",
  "Hard to follow",
  "Didn't answer my question",
  "Other",
] as const;

export function AnswerMessage({
  message,
  onCite,
  onFeedback,
  onFollowUp,
  onEdit,
  onOpenCheck,
}: {
  message: ChatMessage;
  onCite: (citation: Citation) => void;
  onFeedback: (input: { vote: "up" | "down" | null; reason?: string; comment?: string }) => void;
  onFollowUp: (text: string) => void;
  onEdit?: () => void;
  onOpenCheck?: () => void;
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
      {message.clarification ? (
        <ClarificationBlock message={message.clarification.message} patterns={message.clarification.patterns} onEdit={onEdit} />
      ) : message.mode === "out_of_scope" ? (
        <p className="font-reading mt-3 text-lg leading-8">{message.segments[0]?.text}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {message.segments.map((segment) => (
            <SegmentBlock
              key={segment.id}
              segment={segment}
              onCite={onCite}
              failed={message.outcome?.status === "failed"}
              traceTitle={message.outcome?.trace?.title}
              onOpenCheck={onOpenCheck}
            />
          ))}
          {repairChecked(message) ? <SolverStatusLine status="verified" /> : null}
        </div>
      )}
      {message.outcome ? (
        <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-border">
          <OutcomeBody outcome={message.outcome} />
        </div>
      ) : null}
      {message.note ? (
        <p className="mt-4 rounded-lg bg-solver-soft px-3 py-2 text-sm leading-6 text-solver">
          {message.note}
        </p>
      ) : null}
      {message.pending ? (
        <p className="mt-3 text-sm text-muted-foreground">{pendingLabel}</p>
      ) : null}
      {!message.pending && message.mode && message.mode !== "out_of_scope" && !message.clarification ? (
        <FeedbackRow message={message} onFeedback={onFeedback} onFollowUp={onFollowUp} />
      ) : null}
    </article>
  );
}

function ClarificationBlock({
  message,
  patterns,
  onEdit,
}: {
  message: string;
  patterns: string[];
  onEdit?: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="font-reading text-lg leading-8">{message}</p>
      {patterns.length > 0 ? (
        <div>
          <p className="text-sm font-medium">I can check:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {patterns.map((pattern) => (
              <li key={pattern} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                {pattern}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          Edit your question
        </Button>
      </div>
    </div>
  );
}

function FeedbackRow({
  message,
  onFeedback,
  onFollowUp,
}: {
  message: ChatMessage;
  onFeedback: (input: { vote: "up" | "down" | null; reason?: string; comment?: string }) => void;
  onFollowUp: (text: string) => void;
}) {
  const [downOpen, setDownOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const vote = message.feedback?.vote;

  function sendDown(skip: boolean) {
    onFeedback({
      vote: "down",
      ...(skip || !reason ? {} : { reason }),
      ...(skip || comment.trim().length === 0 ? {} : { comment: comment.trim() }),
    });
    setDownOpen(false);
    setReason(null);
    setComment("");
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={vote === "up" ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={vote === "up"}
          onClick={() => {
            setDownOpen(false);
            onFeedback({ vote: vote === "up" ? null : "up" });
          }}
        >
          <ThumbsUpIcon />
          Helpful
        </Button>
        <Button
          type="button"
          variant={vote === "down" || downOpen ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={vote === "down"}
          aria-expanded={downOpen}
          onClick={() => {
            if (vote === "down") {
              setDownOpen(false);
              onFeedback({ vote: null });
              return;
            }
            setDownOpen(true);
          }}
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
        {message.feedback && !message.feedback.sent ? (
          <p className="text-sm text-muted-foreground">Will send when the server is back</p>
        ) : null}
      </div>
      {downOpen ? (
        <div className="mt-3 flex max-w-xl flex-col gap-3 rounded-xl bg-muted/60 p-3">
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_REASONS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={reason === item}
                onClick={() => setReason((current) => (current === item ? null : item))}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs",
                  reason === item ? "bg-foreground text-background" : "bg-card ring-1 ring-border",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <Textarea
            value={comment}
            maxLength={500}
            rows={2}
            aria-label="Optional comment"
            placeholder="Optional comment"
            onChange={(event) => setComment(event.target.value.slice(0, 500))}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => sendDown(false)}>
              Send
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => sendDown(true)}>
              Skip
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SegmentBlock({
  segment,
  onCite,
  failed,
  traceTitle,
  onOpenCheck,
}: {
  segment: AnswerSegment;
  onCite: (citation: Citation) => void;
  failed: boolean;
  traceTitle?: string;
  onOpenCheck?: () => void;
}) {
  const hideSolver = failed && segment.sourceType === "solver";
  return (
    <section className={cn("border-l-2 pl-4", hideSolver ? "border-border" : sourceBorder(segment.sourceType))}>
      {hideSolver ? null : <SourceBadge source={segment.sourceType} />}
      <MathText text={segment.text} className="font-reading mt-2 text-[1.05rem] leading-7" />
      {segment.displayMath ? <MathText text={`$$${segment.displayMath}$$`} className="font-reading" /> : null}
      {segment.citations.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {segment.citations.map((citation) => (
            <CitationChip key={`${segment.id}-${citation.chunkId}`} citation={citation} onOpen={() => onCite(citation)} />
          ))}
        </div>
      ) : null}
      {segment.sourceType === "model" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {failed ? "Not checked by a solver" : "Model text, not from a textbook or the solver."}
        </p>
      ) : null}
      {segment.sourceType === "solver" && !failed && traceTitle ? (
        <button type="button" onClick={onOpenCheck} className="mt-2 text-sm text-muted-foreground">
          {traceTitle} · See the check
        </button>
      ) : null}
    </section>
  );
}

function repairChecked(message: ChatMessage): boolean {
  if (message.pending || message.outcome) return false;
  const last = message.attempts[message.attempts.length - 1];
  return last?.match === true;
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
