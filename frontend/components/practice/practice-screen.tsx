"use client";

import { useEffect, useState } from "react";
import { CitationChip } from "@/components/citation-chip";
import { MathText } from "@/components/math-text";
import { PassageView } from "@/components/passage-view";
import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useHealth } from "@/components/health-provider";
import { createPractice, getPracticeCapabilities, gradePractice, isServerDown, listBooks } from "@/lib/api";
import type {
  Book,
  GradeMark,
  GradeResult,
  PracticeCapabilities,
  PracticeQuestion,
  PracticeQuestionType,
} from "@/lib/types";
import { cn } from "cn";

const ALL_CAPABILITIES: PracticeCapabilities = {
  types: ["mcq", "msq", "nat", "short"],
  filters: { book: true, chapter: true },
};

const TYPE_OPTIONS: { id: PracticeQuestionType; label: string }[] = [
  { id: "mcq", label: "Multiple choice" },
  { id: "msq", label: "Multiple select" },
  { id: "nat", label: "Numeric" },
  { id: "short", label: "Short answer" },
];

export function PracticeScreen() {
  const { phase, refresh } = useHealth();
  const offline = phase === "offline";
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [capabilities, setCapabilities] = useState<PracticeCapabilities>(ALL_CAPABILITIES);
  const [types, setTypes] = useState<PracticeQuestionType[]>(["mcq", "msq", "nat", "short"]);
  const [marks, setMarks] = useState<Record<string, "correct" | "incorrect">>({});
  const [passageId, setPassageId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string | string[]>("");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listBooks()
      .then(setBooks)
      .catch(() => setError("Could not load books."));
  }, []);

  useEffect(() => {
    void getPracticeCapabilities()
      .then((next) => {
        setCapabilities(next);
        setTypes((current) => current.filter((type) => next.types.includes(type)));
      })
      .catch((reason: unknown) => {
        if (isServerDown(reason)) void refresh();
      });
  }, [refresh]);

  const book = books.find((item) => item.id === bookId);
  const question = questions[index];
  const finished = questions.length > 0 && index >= questions.length;

  function toggleType(type: PracticeQuestionType, checked: boolean) {
    setTypes((current) => {
      if (checked) return current.includes(type) ? current : [...current, type];
      return current.filter((item) => item !== type);
    });
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    setMarks({});
    setScore(0);
    setIndex(0);
    setAnswer("");
    try {
      const next = await createPractice({
        bookId: capabilities.filters.book ? bookId || null : null,
        chapterId: capabilities.filters.chapter ? chapterId || null : null,
        types,
      });
      setQuestions(next);
      setAnswer(next[0]?.type === "msq" ? [] : "");
      if (next.length === 0) {
        setError("No questions match that book, chapter, and question type.");
      }
    } catch (reason: unknown) {
      if (isServerDown(reason)) void refresh();
      setError(reason instanceof Error ? reason.message : "Could not build a practice set.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!question || result) return;
    setBusy(true);
    setError(null);
    try {
      const graded = await gradePractice({ questionId: question.id, answer });
      setResult(graded);
      if (graded.result === "correct") setScore((current) => current + 1);
    } catch (reason: unknown) {
      if (isServerDown(reason)) void refresh();
      setError(reason instanceof Error ? reason.message : "Could not grade that answer.");
    } finally {
      setBusy(false);
    }
  }

  function markSelf(gotIt: boolean) {
    if (!question || marks[question.id]) return;
    setMarks((current) => ({ ...current, [question.id]: gotIt ? "correct" : "incorrect" }));
    if (gotIt) setScore((current) => current + 1);
  }

  function nextQuestion() {
    const upcoming = questions[index + 1];
    setResult(null);
    setAnswer(upcoming?.type === "msq" ? [] : "");
    setIndex((current) => current + 1);
  }

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto border-b bg-sidebar p-4 lg:border-r lg:border-b-0">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Practice</p>
        <h2 className="font-heading mt-1 text-2xl">Build a set</h2>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm" htmlFor="practice-book">
            Book
            <select
              id="practice-book"
              value={bookId}
              disabled={!capabilities.filters.book}
              onChange={(event) => {
                setBookId(event.target.value);
                setChapterId("");
              }}
              className="h-9 rounded-lg border border-border bg-card px-2 disabled:opacity-50"
            >
              <option value="">All books</option>
              {books.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.shortTitle}
                </option>
              ))}
            </select>
            {capabilities.filters.book ? null : <p className="text-xs text-muted-foreground">Not available yet</p>}
          </label>
          <label className="flex flex-col gap-1 text-sm" htmlFor="practice-chapter">
            Chapter
            <select
              id="practice-chapter"
              value={chapterId}
              onChange={(event) => setChapterId(event.target.value)}
              className="h-9 rounded-lg border border-border bg-card px-2 disabled:opacity-50"
              disabled={!capabilities.filters.chapter || !book}
            >
              <option value="">All chapters</option>
              {book?.chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </select>
            {capabilities.filters.chapter ? null : <p className="text-xs text-muted-foreground">Not available yet</p>}
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm">Question types</legend>
            {TYPE_OPTIONS.map((option) => {
              const supported = capabilities.types.includes(option.id);
              return (
                <div key={option.id}>
                  <Label className="font-normal">
                    <Checkbox
                      aria-label={option.label}
                      checked={supported && types.includes(option.id)}
                      disabled={!supported}
                      onCheckedChange={(checked) => toggleType(option.id, checked)}
                    />
                    {option.label}
                  </Label>
                  {supported ? null : <p className="mt-1 text-xs text-muted-foreground">Not available yet</p>}
                </div>
              );
            })}
          </fieldset>
          <Button type="button" onClick={() => void generate()} disabled={busy || offline || types.length === 0}>
            New set
          </Button>
        </div>
      </aside>

      <section className="min-h-0 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {offline ? (
            <p className="text-sm leading-6">
              The StemMatrix server isn&apos;t running. This will reconnect on its own once it&apos;s back.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!question && !finished ? (
            <div className="pt-8">
              <h2 className="font-heading text-3xl">Check a chapter</h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
                Multiple choice, multiple select, a typed number, or a short answer. Numeric items are graded against the solver. The others are graded against the textbook.
              </p>
            </div>
          ) : null}
          {finished ? (
            <div className="pt-8">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Set complete</p>
              <h2 className="font-heading mt-2 text-4xl">
                {score} of {questions.length}
              </h2>
              <Button type="button" className="mt-6" onClick={() => void generate()} disabled={busy || offline}>
                Another set
              </Button>
            </div>
          ) : null}
          {question ? (
            <article className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {index + 1} of {questions.length} · {question.chapter}
              </p>
              <MathText text={question.prompt} className="font-reading mt-3 text-xl leading-8" />
              <div className="mt-5">
                <AnswerControl question={question} answer={answer} onAnswer={setAnswer} locked={result !== null} />
              </div>
              {result ? (
                <GradeView
                  result={result}
                  marked={question ? marks[question.id] : undefined}
                  onMark={markSelf}
                  onCite={setPassageId}
                  last={index + 1 === questions.length}
                  onNext={nextQuestion}
                />
              ) : (
                <Button type="button" className="mt-5" onClick={() => void submit()} disabled={busy || offline || !hasAnswer(question, answer)}>
                  Check
                </Button>
              )}
            </article>
          ) : null}
        </div>
      </section>
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

function GradeView({
  result,
  marked,
  onMark,
  onCite,
  last,
  onNext,
}: {
  result: GradeResult;
  marked?: "correct" | "incorrect";
  onMark: (gotIt: boolean) => void;
  onCite: (chunkId: string) => void;
  last: boolean;
  onNext: () => void;
}) {
  const shown: GradeMark = result.result === "ungraded" && marked ? marked : result.result;
  const citations = result.segments.flatMap((segment) => segment.citations);
  return (
    <div className="mt-5 border-t pt-4">
      <p className={cn("text-sm font-semibold", gradeTone(shown))}>{gradeHeading(shown, result.result === "ungraded" && !marked)}</p>
      {result.result === "partial" && result.missing && result.missing.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-sm leading-6">
          {result.missing.map((item) => (
            <li key={item}>Missing: {item}</li>
          ))}
        </ul>
      ) : null}
      {result.result === "ungraded" && !marked ? (
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" onClick={() => onMark(true)}>
            I got it
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onMark(false)}>
            I missed it
          </Button>
        </div>
      ) : null}
      {marked ? (
        <p className="mt-2 text-sm">{marked === "correct" ? "You marked this right." : "You marked this missed."}</p>
      ) : null}
      <p className="mt-3 text-sm leading-6">Reference answer: {result.expected}</p>
      {citations.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {citations.map((citation) => (
            <CitationChip key={citation.chunkId} citation={citation} onOpen={() => onCite(citation.chunkId)} />
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-3">
        {result.segments.map((segment) => (
          <div key={segment.id} className="border-l-2 border-border pl-3">
            <SourceBadge source={segment.sourceType} />
            <MathText text={segment.text} className="font-reading mt-2 text-base leading-7" />
            {segment.displayMath ? <MathText text={`$$${segment.displayMath}$$`} /> : null}
          </div>
        ))}
      </div>
      <Button type="button" className="mt-4" onClick={onNext}>
        {last ? "See score" : "Next question"}
      </Button>
    </div>
  );
}

function gradeHeading(shown: GradeMark, stillUngraded: boolean): string {
  if (stillUngraded) return "Couldn't grade this automatically. Compare with the textbook answer.";
  switch (shown) {
    case "correct":
      return "Correct";
    case "incorrect":
      return "Not the expected answer";
    case "partial":
      return "Partly right";
    case "ungraded":
      return "Couldn't grade this automatically. Compare with the textbook answer.";
    default: {
      const neverMark: never = shown;
      return neverMark;
    }
  }
}

function gradeTone(shown: GradeMark): string {
  switch (shown) {
    case "correct":
      return "text-solver";
    case "incorrect":
      return "text-destructive";
    case "partial":
    case "ungraded":
      return "text-foreground";
    default: {
      const neverMark: never = shown;
      return neverMark;
    }
  }
}

function hasAnswer(question: PracticeQuestion, answer: string | string[]): boolean {
  switch (question.type) {
    case "mcq":
    case "nat":
    case "short":
      return typeof answer === "string" && answer.trim().length > 0;
    case "msq":
      return Array.isArray(answer) && answer.length > 0;
    default: {
      const neverType: never = question.type;
      return neverType;
    }
  }
}

function AnswerControl({
  question,
  answer,
  onAnswer,
  locked,
}: {
  question: PracticeQuestion;
  answer: string | string[];
  onAnswer: (answer: string | string[]) => void;
  locked: boolean;
}) {
  switch (question.type) {
    case "mcq":
      return (
        <div className="flex flex-col gap-2">
          {question.options?.map((option) => {
            const selected = answer === option.id;
            return (
              <label
                key={option.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-3",
                  selected ? "border-foreground bg-muted" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={option.id}
                  checked={selected}
                  disabled={locked}
                  onChange={() => onAnswer(option.id)}
                  className="mt-1"
                />
                <MathText text={option.text} />
              </label>
            );
          })}
        </div>
      );
    case "msq": {
      const selected = Array.isArray(answer) ? answer : [];
      return (
        <div className="flex flex-col gap-2">
          {question.options?.map((option) => {
            const checked = selected.includes(option.id);
            return (
              <Label
                key={option.id}
                className={cn(
                  "items-start rounded-xl border px-3 py-3 font-normal",
                  checked ? "border-foreground bg-muted" : "border-border",
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={locked}
                  onCheckedChange={(next) => {
                    onAnswer(next ? [...selected, option.id] : selected.filter((id) => id !== option.id));
                  }}
                  className="mt-1"
                />
                <MathText text={option.text} />
              </Label>
            );
          })}
        </div>
      );
    }
    case "nat":
      return (
        <Input
          inputMode="decimal"
          value={typeof answer === "string" ? answer : ""}
          disabled={locked}
          placeholder="Number"
          aria-label="Your numeric answer"
          onChange={(event) => onAnswer(event.target.value)}
          className="max-w-xs bg-background"
        />
      );
    case "short":
      return (
        <Textarea
          value={typeof answer === "string" ? answer : ""}
          disabled={locked}
          placeholder="Write the formula or the statement"
          aria-label="Your answer"
          onChange={(event) => onAnswer(event.target.value)}
          className="bg-background"
        />
      );
    default: {
      const neverType: never = question.type;
      return neverType;
    }
  }
}
