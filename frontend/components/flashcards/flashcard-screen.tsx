"use client";

import { useEffect, useState } from "react";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/ui/button";
import { listFlashcards, getSource } from "@/lib/api";
import { shortBook } from "@/lib/format";
import type { Flashcard, SourcePassage, Subject } from "@/lib/types";
import { SUBJECTS } from "@/lib/types";
import { cn } from "cn";

export function FlashcardScreen() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [subject, setSubject] = useState<Subject | "all">("all");
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [loadedPassage, setLoadedPassage] = useState<{
    chunkId: string;
    passage: SourcePassage;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listFlashcards()
      .then((next) => {
        setCards(next);
        setOrder(next.map((card) => card.id));
      })
      .catch(() => setError("Could not load flashcards."));
  }, []);

  const visible = order
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is Flashcard => {
      if (!card) return false;
      return subject === "all" || card.subject === subject;
    });
  const card = visible[index] ?? null;
  const passage =
    flipped && card && loadedPassage?.chunkId === card.citation.chunkId ? loadedPassage.passage : null;

  useEffect(() => {
    if (!card || !flipped) return;
    const chunkId = card.citation.chunkId;
    let cancelled = false;
    void getSource(chunkId)
      .then((next) => {
        if (!cancelled) setLoadedPassage({ chunkId, passage: next });
      })
      .catch(() => {
        if (!cancelled) setLoadedPassage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [card, flipped]);

  function chooseSubject(next: Subject | "all") {
    setSubject(next);
    setIndex(0);
    setFlipped(false);
    setKnown(0);
    setLoadedPassage(null);
  }

  function advance(remembered: boolean) {
    if (!card) return;
    if (remembered) setKnown((current) => current + 1);
    setFlipped(false);
    setLoadedPassage(null);
    setOrder((current) => {
      if (remembered) return current.filter((id) => id !== card.id);
      const without = current.filter((id) => id !== card.id);
      return [...without, card.id];
    });
    setIndex((current) => {
      const nextLength = remembered ? visible.length - 1 : visible.length;
      if (nextLength <= 0) return 0;
      return current >= nextLength ? 0 : current;
    });
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Flashcards</p>
          <h2 className="font-heading text-3xl">Formulas and definitions</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={subject === "all"} onClick={() => chooseSubject("all")}>
            All
          </FilterButton>
          {SUBJECTS.map((item) => (
            <FilterButton key={item} active={subject === item} onClick={() => chooseSubject(item)}>
              {item === "Engineering mathematics" ? "Mathematics" : item}
            </FilterButton>
          ))}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {card ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <p className="text-sm text-muted-foreground">
            {index + 1} of {visible.length}
            {known > 0 ? ` · ${known} known` : ""}
          </p>
          <button
            type="button"
            onClick={() => setFlipped((current) => !current)}
            className="mt-3 min-h-72 rounded-3xl bg-card px-8 py-10 text-left ring-1 ring-border"
          >
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {flipped ? "Meaning" : card.chapter}
            </p>
            {flipped ? (
              <MathText text={card.back} className="font-reading mt-4 text-2xl leading-9" />
            ) : (
              <>
                <p className="font-heading mt-4 text-3xl">{card.front}</p>
                {card.frontMath ? <MathText text={`$$${card.frontMath}$$`} /> : null}
              </>
            )}
            <p className="mt-6 text-sm text-muted-foreground">{flipped ? "Click to show the formula" : "Click to flip"}</p>
          </button>
          {flipped && passage ? (
            <p className="mt-3 text-sm text-textbook">
              {shortBook(passage.book)} · {passage.section} · p. {passage.page}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => advance(false)}>
              Again
            </Button>
            <Button type="button" onClick={() => advance(true)}>
              Know
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <h3 className="font-heading text-3xl">{cards.length === 0 ? "Loading cards" : "Deck clear"}</h3>
          <p className="mt-2 text-muted-foreground">
            {cards.length === 0
              ? "Fetching formulas from the preview corpus."
              : "Every card in this filter is marked known."}
          </p>
          {cards.length > 0 ? (
            <Button
              type="button"
              className="mt-4 w-fit"
              variant="outline"
              onClick={() => {
                setOrder(cards.map((item) => item.id));
                setKnown(0);
                setIndex(0);
              }}
            >
              Reset deck
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-sm",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}
