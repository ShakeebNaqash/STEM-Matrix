"use client";

import { useEffect, useState } from "react";
import { CitationChip } from "@/components/citation-chip";
import { MathText } from "@/components/math-text";
import { PassageView } from "@/components/passage-view";
import { useHealth } from "@/components/health-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isServerDown, listFlashcards } from "@/lib/api";
import type { Flashcard, Subject } from "@/lib/types";
import { SUBJECTS } from "@/lib/types";
import { cn } from "cn";

export function FlashcardScreen() {
  const { phase, refresh } = useHealth();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [subject, setSubject] = useState<Subject | "all">("all");
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [passageId, setPassageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offline = phase === "offline";

  useEffect(() => {
    void listFlashcards()
      .then((next) => {
        setCards(next);
        setOrder(next.map((card) => card.id));
        setLoaded(true);
        setError(null);
      })
      .catch((reason: unknown) => {
        setLoaded(true);
        if (isServerDown(reason)) {
          void refresh();
          setError(null);
          return;
        }
        setError(reason instanceof Error ? reason.message : "Could not load flashcards.");
      });
  }, [refresh]);

  const visible = order
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is Flashcard => {
      if (!card) return false;
      return subject === "all" || card.subject === subject;
    });
  const card = visible[index] ?? null;

  function chooseSubject(next: Subject | "all") {
    setSubject(next);
    setIndex(0);
    setFlipped(false);
    setKnown(0);
  }

  function advance(remembered: boolean) {
    if (!card) return;
    if (remembered) setKnown((current) => current + 1);
    setFlipped(false);
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

      {offline ? (
        <p className="mt-4 text-sm leading-6">
          The StemMatrix server isn&apos;t running. This will reconnect on its own once it&apos;s back.
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {card ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <p className="text-sm text-muted-foreground">
            {index + 1} of {visible.length}
            {known > 0 ? ` · ${known} known` : ""}
          </p>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setFlipped((current) => !current)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setFlipped((current) => !current);
              }
            }}
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
            {flipped && card.citation ? (
              <div className="mt-4">
                <CitationChip citation={card.citation} onOpen={() => setPassageId(card.citation?.chunkId ?? null)} />
              </div>
            ) : null}
            <p className="mt-6 text-sm text-muted-foreground">
              <span className="hidden can-hover:inline">
                {flipped ? "Click to show the formula" : "Click to flip"}
              </span>
              <span className="can-hover:hidden">{flipped ? "Tap to show the formula" : "Tap to flip"}</span>
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => advance(false)}>
              Again
            </Button>
            <Button type="button" onClick={() => advance(true)}>
              Know
            </Button>
          </div>
        </div>
      ) : offline && loaded && cards.length === 0 ? (
        <div className="flex-1" />
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <h3 className="font-heading text-3xl">
            {!loaded ? "Loading cards" : cards.length === 0 ? "Flashcards will appear once the textbooks are loaded." : "Deck clear"}
          </h3>
          <p className="mt-2 text-muted-foreground">
            {!loaded
              ? "Fetching formulas from the preview corpus."
              : cards.length === 0
                ? "Each card cites the page it came from."
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
      <Sheet open={passageId !== null} onOpenChange={(open) => { if (!open) setPassageId(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Textbook passage</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            <PassageView chunkId={passageId} />
          </div>
        </SheetContent>
      </Sheet>
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
