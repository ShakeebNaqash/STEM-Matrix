"use client";

import type { RefObject } from "react";
import { SendIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Book, Subject } from "@/lib/types";
import { SUBJECTS } from "@/lib/types";

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  askDisabled,
  inputRef,
  subject,
  bookId,
  books,
  onSubject,
  onBook,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  disabled: boolean;
  askDisabled: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  subject: Subject | null;
  bookId: string | null;
  books: Book[];
  onSubject: (subject: Subject | null) => void;
  onBook: (bookId: string | null) => void;
}) {
  const visibleBooks = subject ? books.filter((book) => book.subject === subject) : books;

  return (
    <form
      className="border-t bg-background/95 px-4 py-3 backdrop-blur-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !askDisabled) onSubmit();
      }}
    >
      <div className="mx-auto flex max-w-[42rem] flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="subject-filter">
            Subject
          </label>
          <select
            id="subject-filter"
            value={subject ?? ""}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "") {
                onSubject(null);
                return;
              }
              const match = SUBJECTS.find((item) => item === next);
              if (match) onSubject(match);
            }}
            className="h-8 rounded-lg border border-border bg-card px-2 text-sm"
          >
            <option value="">All subjects</option>
            {SUBJECTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="book-filter">
            Book
          </label>
          <select
            id="book-filter"
            value={bookId ?? ""}
            onChange={(event) => onBook(event.target.value === "" ? null : event.target.value)}
            className="h-8 max-w-full rounded-lg border border-border bg-card px-2 text-sm"
          >
            <option value="">All books</option>
            {visibleBooks.map((book) => (
              <option key={book.id} value={book.id}>
                {book.shortTitle}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Ask about a concept, a formula, or a numerical problem"
            ref={inputRef}
            rows={2}
            disabled={disabled}
            className="max-h-40 min-h-16 bg-card"
            onKeyDown={(event) => {
              if (event.key === "Escape" && disabled) {
                event.preventDefault();
                onStop();
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!disabled && !askDisabled) onSubmit();
              }
            }}
          />
          {disabled ? (
            <Button type="button" size="lg" onClick={onStop}>
              <SquareIcon />
              Stop
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={askDisabled || value.trim().length === 0}>
              <SendIcon />
              Ask
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
