"use client";

import { useState } from "react";
import { ConversionNotes, SolverStatusLine } from "@/components/chat/solver-status";
import { PassageView } from "@/components/passage-view";
import { MathText } from "@/components/math-text";
import { explainSolverError } from "@/lib/result-display";
import type { SolverAttempt, SolverOutcome } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "cn";

export function InspectPanel({
  tab,
  onTab,
  chunkId,
  attempts,
  note,
  outcome,
}: {
  tab: "passage" | "verification";
  onTab: (tab: "passage" | "verification") => void;
  chunkId: string | null;
  attempts: SolverAttempt[];
  note?: string;
  outcome?: SolverOutcome;
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
        <VerificationView attempts={attempts} note={note} outcome={outcome} />
      </TabsContent>
    </Tabs>
  );
}

function VerificationView({
  attempts,
  note,
  outcome,
}: {
  attempts: SolverAttempt[];
  note?: string;
  outcome?: SolverOutcome;
}) {
  if (!outcome && attempts.length === 0) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Numerical questions show each solver attempt here: what the model said, what the solver computed, and the note sent back when they disagree.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {outcome ? (
        <div className="flex flex-col gap-2">
          <SolverStatusLine status={outcome.status} />
          {outcome.trace ? (
            <div>
              <p className="text-sm font-semibold">{outcome.trace.title}</p>
              {outcome.trace.steps.length > 0 ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  {outcome.trace.steps.map((step) => (
                    <div key={step.label} className="contents">
                      <dt className="text-muted-foreground">{step.label}</dt>
                      <dd>{step.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {outcome.trace.raw ? <RawDetails raw={outcome.trace.raw} /> : null}
            </div>
          ) : null}
          {outcome.checkMessage ? <p className="text-sm leading-6">{outcome.checkMessage}</p> : null}
          {outcome.conversions ? <ConversionNotes conversions={outcome.conversions} /> : null}
          {outcome.status === "failed" && attempts.length === 0 ? (
            <p className="text-sm leading-6">{explainSolverError(outcome.error ?? "")}</p>
          ) : null}
        </div>
      ) : null}
      {attempts.length > 0 ? (
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
              {attempt.solver ? <p className="mt-2 text-xs text-muted-foreground">{attempt.solver}</p> : null}
              <div className="mt-3 grid gap-2">
                <AttemptValue label="Model" value={attempt.modelAnswer} />
                <AttemptValue label="Solver" value={attempt.solverAnswer} />
              </div>
              {attempt.feedback ? (
                <p className="mt-3 text-sm leading-6 text-foreground">{attempt.feedback}</p>
              ) : null}
              {attempt.params && Object.keys(attempt.params).length > 0 ? (
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                  {Object.entries(attempt.params).map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt>{key}</dt>
                      <dd className="truncate">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {note ? <p className="text-sm leading-6 text-foreground">{note}</p> : null}
      {outcome?.note ? <p className="text-sm leading-6 text-foreground">{outcome.note}</p> : null}
    </div>
  );
}

function RawDetails({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        All details
      </button>
      {open ? <pre className="mt-2 overflow-x-auto font-mono text-xs">{raw}</pre> : null}
    </div>
  );
}

function AttemptValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      {value === null ? <p className="text-sm">No answer</p> : <MathText text={value} className="text-sm" />}
    </div>
  );
}
