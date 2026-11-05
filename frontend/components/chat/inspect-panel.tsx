"use client";

import { useEffect, useState } from "react";
import { MathText } from "@/components/math-text";
import { getSource } from "@/lib/api";
import { shortBook } from "@/lib/format";
import type { SolverAttempt, SourcePassage } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "cn";

export function InspectPanel({
  tab,
  onTab,
  chunkId,
  attempts,
  note,
}: {
  tab: "passage" | "verification";
  onTab: (tab: "passage" | "verification") => void;
  chunkId: string | null;
  attempts: SolverAttempt[];
  note?: string;
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (value === "passage" || value === "verification") onTab(value);
      }}
      className="h-full min-h-0"
    >
      <div className="border-b px-4 pt-4">
        <p className="font-heading text-lg text-foreground">Where this came from</p>
        <TabsList className="my-3 w-full">
          <TabsTrigger value="passage" className="flex-1">
            Passage
          </TabsTrigger>
          <TabsTrigger value="verification" className="flex-1">
            Verification
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="passage" className="min-h-0 overflow-y-auto px-4 py-4">
        <PassageView chunkId={chunkId} />
      </TabsContent>
      <TabsContent value="verification" className="min-h-0 overflow-y-auto px-4 py-4">
        <VerificationView attempts={attempts} note={note} />
      </TabsContent>
    </Tabs>
  );
}

function PassageView({ chunkId }: { chunkId: string | null }) {
  const [loaded, setLoaded] = useState<{
    id: string;
    passage: SourcePassage | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!chunkId) return;
    let cancelled = false;
    void getSource(chunkId)
      .then((next) => {
        if (!cancelled) setLoaded({ id: chunkId, passage: next, error: null });
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoaded({
            id: chunkId,
            passage: null,
            error: reason instanceof Error ? reason.message : "Could not load the passage.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chunkId]);

  if (!chunkId) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Click a citation on an answer to open the textbook passage, with its book, chapter, and page.
      </p>
    );
  }

  const current = loaded?.id === chunkId ? loaded : null;
  if (!current) return <p className="text-sm text-muted-foreground">Opening the passage…</p>;
  if (current.error || !current.passage) {
    return <p className="text-sm text-destructive">{current.error ?? "Could not load the passage."}</p>;
  }
  const passage = current.passage;

  return (
    <article>
      <p className="text-xs font-semibold tracking-wide text-textbook uppercase">
        {passage.subject}
      </p>
      <h3 className="font-heading mt-1 text-xl leading-snug">{shortBook(passage.book)}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {passage.chapter} · {passage.section} · p. {passage.page}
      </p>
      <MathText text={passage.text} className="font-reading mt-4 text-base leading-7" />
      <p className="mt-4 font-mono text-[11px] text-muted-foreground">{passage.chunkId}</p>
    </article>
  );
}

function VerificationView({ attempts, note }: { attempts: SolverAttempt[]; note?: string }) {
  if (attempts.length === 0) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Numerical questions show each solver attempt here: what the model said, what the solver computed, and the note sent back when they disagree.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {attempts.map((attempt) => (
        <li key={attempt.attempt} className="rounded-xl bg-card p-3 ring-1 ring-border">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Attempt {attempt.attempt}</p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
                attempt.match ? "bg-solver-soft text-solver" : "bg-model-soft text-model",
              )}
            >
              {attempt.match ? "Match" : "Mismatch"}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{attempt.solver}</p>
          <div className="mt-3 grid gap-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Model
              </p>
              <MathText text={attempt.modelAnswer} className="text-sm" />
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Solver
              </p>
              <MathText text={attempt.solverAnswer} className="text-sm" />
            </div>
          </div>
          {attempt.feedback ? (
            <p className="mt-3 text-sm leading-6 text-foreground">{attempt.feedback}</p>
          ) : null}
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
            {Object.entries(attempt.params).map(([key, value]) => (
              <div key={key} className="contents">
                <dt>{key}</dt>
                <dd className="truncate">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
      {note ? <li className="text-sm leading-6 text-foreground">{note}</li> : null}
    </ol>
  );
}
