"use client";

import { useEffect, useState } from "react";
import { MathText } from "@/components/math-text";
import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPractice, gradePractice, listBooks } from "@/lib/api";
import type {
  Book,
  GradeResult,
  PracticeQuestion,
  PracticeQuestionType,
} from "@/lib/types";
import { cn } from "cn";

const TYPE_OPTIONS: { id: PracticeQuestionType; label: string }[] = [
  { id: "mcq", label: "Multiple choice" },
  { id: "msq", label: "Multiple select" },
  { id: "nat", label: "Numeric" },
  { id: "short", label: "Short answer" },
];

export function PracticeScreen() {
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [types, setTypes] = useState<PracticeQuestionType[]>(["mcq", "msq", "nat", "short"]);
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
    setScore(0);
    setIndex(0);
    setAnswer("");
    try {
      const next = await createPractice({
        bookId: bookId || null,
        chapterId: chapterId || null,
        types,
      });
      setQuestions(next);
      setAnswer(next[0]?.type === "msq" ? [] : "");
      if (next.length === 0) {
        setError("No questions match that book, chapter, and question type.");
      }
    } catch (reason: unknown) {
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
      if (graded.correct) setScore((current) => current + 1);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not grade that answer.");
    } finally {
      setBusy(false);
    }
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
              onChange={(event) => {
                setBookId(event.target.value);
                setChapterId("");
              }}
              className="h-9 rounded-lg border border-border bg-card px-2"
            >
              <option value="">All books</option>
              {books.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.shortTitle}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm" htmlFor="practice-chapter">
            Chapter
            <select
              id="practice-chapter"
              value={chapterId}
              onChange={(event) => setChapterId(event.target.value)}
              className="h-9 rounded-lg border border-border bg-card px-2"
              disabled={!book}
            >
              <option value="">All chapters</option>
              {book?.chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm">Question types</legend>
            {TYPE_OPTIONS.map((option) => (
              <Label key={option.id} className="font-normal">
                <Checkbox
                  checked={types.includes(option.id)}
                  onCheckedChange={(checked) => toggleType(option.id, checked)}
                />
                {option.label}
              </Label>
            ))}
          </fieldset>
          <Button type="button" onClick={() => void generate()} disabled={busy || types.length === 0}>
            New set
          </Button>
        </div>
      </aside>

      <section className="min-h-0 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
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
              <Button type="button" className="mt-6" onClick={() => void generate()} disabled={busy}>
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
                <div className="mt-5 border-t pt-4">
                  <p className={cn("text-sm font-semibold", result.correct ? "text-solver" : "text-destructive")}>
                    {result.correct ? "Correct" : "Not the expected answer"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Expected: {result.expected}</p>
                  <div className="mt-4 flex flex-col gap-3">
                    {result.segments.map((segment) => (
                      <div key={segment.id} className="border-l-2 border-border pl-3">
                        <SourceBadge source={segment.sourceType} />
                        <MathText text={segment.text} className="font-reading mt-2 text-base leading-7" />
                        {segment.displayMath ? <MathText text={`$$${segment.displayMath}$$`} /> : null}
                      </div>
                    ))}
                  </div>
                  <Button type="button" className="mt-4" onClick={nextQuestion}>
                    {index + 1 === questions.length ? "See score" : "Next question"}
                  </Button>
                </div>
              ) : (
                <Button type="button" className="mt-5" onClick={() => void submit()} disabled={busy || !hasAnswer(question, answer)}>
                  Check
                </Button>
              )}
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
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
