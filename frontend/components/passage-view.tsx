"use client";

import { useEffect, useState } from "react";
import { MathText } from "@/components/math-text";
import { getSource } from "@/lib/api";
import { shortBook } from "@/lib/format";
import type { SourcePassage } from "@/lib/types";

export function PassageView({ chunkId }: { chunkId: string | null }) {
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
      <p className="text-xs font-semibold tracking-wide text-textbook uppercase">{passage.subject}</p>
      <h3 className="font-heading mt-1 text-xl leading-snug">{shortBook(passage.book)}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {passage.chapter} · {passage.section} · p. {passage.page}
      </p>
      <MathText text={passage.text} className="font-reading mt-4 text-base leading-7" />
      <p className="mt-4 font-mono text-[11px] text-muted-foreground">{passage.chunkId}</p>
    </article>
  );
}
