"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MenuIcon } from "lucide-react";
import { AnswerMessage } from "@/components/chat/answer-message";
import { Composer } from "@/components/chat/composer";
import { InspectPanel } from "@/components/chat/inspect-panel";
import { SessionList } from "@/components/chat/session-list";
import { useSessions } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isLivePhase, useHealth } from "@/components/health-provider";
import { enqueueFeedback } from "@/lib/feedback-outbox";
import { isServerDown, listBooks, sendFeedback, streamChat } from "@/lib/api";
import type { Book, ChatMessage, Citation, FeedbackRequest, HistoryTurn, MessageFeedback, Subject } from "@/lib/types";

const SUGGESTIONS = [
  "What is Lenz's law?",
  "Integrate x^2 from 0 to 3",
  "Formula for integration by parts",
  "Eigenvalues of [[2, 1], [1, 2]]",
];

function answerText(message: ChatMessage): string {
  const parts = message.segments.map((segment) => segment.text);
  if (message.clarification) parts.push(message.clarification.message);
  return parts.join("\n");
}

function historyOf(messages: ChatMessage[]): HistoryTurn[] {
  return messages
    .filter((message) => !message.pending)
    .map((message) => ({
      role: message.role,
      text:
        message.role === "user"
          ? message.text
          : message.segments.map((segment) => segment.text).join("\n"),
    }));
}

export function ChatScreen() {
  const { store, dispatch } = useSessions();
  const { phase, scripted, refresh } = useHealth();
  const session = store.sessions.find((item) => item.id === store.activeId) ?? store.sessions[0];
  const [draft, setDraft] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [tab, setTab] = useState<"passage" | "verification">("passage");
  const [chunkId, setChunkId] = useState<string | null>(null);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const pinningRef = useRef(false);

  useEffect(() => {
    void listBooks()
      .then(setBooks)
      .catch(() => setBooks([]));
  }, []);

  const pinToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    pinningRef.current = true;
    scroller.scrollTop = scroller.scrollHeight;
    requestAnimationFrame(() => {
      pinningRef.current = false;
    });
  }, []);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  useEffect(() => {
    const current = sessionRef.current;
    if (!current) return;
    const last = [...current.messages]
      .reverse()
      .find((message) => message.role === "assistant" && !message.pending);
    if (!last) return;
    if (last.attempts.length > 0) {
      setVerifyId(last.id);
      setTab("verification");
      return;
    }
    const citation = last.segments.flatMap((segment) => segment.citations)[0];
    if (citation) {
      setChunkId(citation.chunkId);
      setTab("passage");
    }
  }, [session?.id]);

  useEffect(() => {
    followRef.current = true;
    pinToBottom();
  }, [session?.id, pinToBottom]);

  useEffect(() => {
    if (!followRef.current) return;
    pinToBottom();
  }, [session?.messages, pinToBottom]);

  const answerPending = session?.messages.some((message) => message.pending) ?? false;
  useEffect(() => {
    if (!answerPending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      abortRef.current?.abort();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answerPending]);

  if (!session) return null;

  const pending = session.messages.some((message) => message.pending);
  const verified = session.messages.find((message) => message.id === verifyId);

  function openMobileInspect() {
    if (window.matchMedia("(max-width: 1023px)").matches) setInspectOpen(true);
  }

  function chooseCitation(citation: Citation) {
    setChunkId(citation.chunkId);
    setTab("passage");
    openMobileInspect();
  }

  function onMessagesScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || pinningRef.current) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    followRef.current = distance < 80;
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending || phase === "offline") return;
    followRef.current = true;
    const sessionId = session.id;
    const user: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      segments: [],
      attempts: [],
    };
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      segments: [],
      attempts: [],
      pending: true,
    };
    dispatch({ type: "add-exchange", sessionId, user, assistant });
    setDraft("");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let finished = false;
    try {
      await streamChat(
        {
          question: trimmed,
          subject: session.subject,
          bookId: session.bookId,
          history: historyOf(session.messages),
        },
        (event) => {
          switch (event.event) {
            case "meta":
              dispatch({
                type: "patch",
                sessionId,
                messageId: assistant.id,
                update: (message) => ({
                  ...message,
                  mode: event.data.mode,
                  retrievalNote: event.data.retrievalNote,
                  scripted: event.data.scripted === true,
                }),
              });
              break;
            case "segment":
              dispatch({
                type: "patch",
                sessionId,
                messageId: assistant.id,
                update: (message) => ({
                  ...message,
                  segments: [...message.segments, event.data],
                }),
              });
              break;
            case "attempt":
              dispatch({
                type: "patch",
                sessionId,
                messageId: assistant.id,
                update: (message) => ({
                  ...message,
                  attempts: [...message.attempts, event.data],
                }),
              });
              setVerifyId(assistant.id);
              setTab("verification");
              openMobileInspect();
              break;
            case "done":
              finished = true;
              dispatch({
                type: "patch",
                sessionId,
                messageId: assistant.id,
                update: (message) => ({
                  ...message,
                  note: event.data.note,
                  pending: false,
                }),
              });
              break;
            case "error":
              finished = true;
              dispatch({
                type: "patch",
                sessionId,
                messageId: assistant.id,
                update: (message) => ({
                  ...message,
                  pending: false,
                  error: event.data.message,
                }),
              });
              break;
            case "solver_result":
              dispatch({
                type: "patch",
                sessionId,
                messageId: assistant.id,
                update: (message) => ({
                  ...message,
                  outcome: event.data,
                }),
              });
              setVerifyId(assistant.id);
              setTab("verification");
              openMobileInspect();
              break;
            case "clarification":
              dispatch({
                type: "patch",
                sessionId,
                messageId: assistant.id,
                update: (message) => ({
                  ...message,
                  clarification: event.data,
                }),
              });
              break;
            default: {
              const neverEvent: never = event;
              return neverEvent;
            }
          }
        },
        controller.signal,
      );
      if (!finished) {
        dispatch({
          type: "patch",
          sessionId,
          messageId: assistant.id,
          update: (message) => ({
            ...message,
            pending: false,
            error: "The answer was cut off. Ask again.",
          }),
        });
      }
    } catch (reason: unknown) {
      if (isAbortError(reason)) {
        if (finished) return;
        dispatch({
          type: "patch",
          sessionId,
          messageId: assistant.id,
          update: (message) => ({
            ...message,
            pending: false,
            note: "Stopped before the answer finished.",
          }),
        });
        return;
      }
      if (isServerDown(reason)) void refresh();
      if (finished) return;
      dispatch({
        type: "patch",
        sessionId,
        messageId: assistant.id,
        update: (message) => ({
          ...message,
          pending: false,
          error: "Lost the connection before the answer finished. Ask again.",
        }),
      });
    }
  }

  function openCheck(messageId: string) {
    setVerifyId(messageId);
    setTab("verification");
    openMobileInspect();
  }

  function editQuestion(messageId: string) {
    const index = session.messages.findIndex((message) => message.id === messageId);
    const previous = session.messages.slice(0, index).reverse().find((message) => message.role === "user");
    if (!previous) return;
    setDraft(previous.text);
    composerRef.current?.focus();
  }

  async function vote(
    message: ChatMessage,
    input: { vote: "up" | "down" | null; reason?: string; comment?: string },
  ) {
    const stored: MessageFeedback = { vote: input.vote, sent: false };
    if (input.reason) stored.reason = input.reason;
    if (input.comment) stored.comment = input.comment;
    const index = session.messages.findIndex((item) => item.id === message.id);
    const question = session.messages
      .slice(0, index)
      .reverse()
      .find((item) => item.role === "user");
    const payload: FeedbackRequest = {
      messageId: message.id,
      vote: input.vote,
      question: question?.text ?? "",
      answerText: answerText(message),
      mode: message.mode ?? "",
      segments: message.segments,
      attempts: message.attempts,
      createdAt: new Date().toISOString(),
      ...(message.outcome ? { outcomeStatus: message.outcome.status } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.comment ? { comment: input.comment } : {}),
    };
    dispatch({
      type: "patch",
      sessionId: session.id,
      messageId: message.id,
      update: (current) => ({ ...current, feedback: stored }),
    });
    try {
      await sendFeedback(payload);
      dispatch({
        type: "patch",
        sessionId: session.id,
        messageId: message.id,
        update: (current) => ({
          ...current,
          feedback: current.feedback ? { ...current.feedback, sent: true } : stored,
        }),
      });
    } catch {
      enqueueFeedback(payload);
    }
  }

  function setSubject(subject: Subject | null) {
    const bookStillVisible =
      session.bookId === null ||
      books.some((book) => book.id === session.bookId && (subject === null || book.subject === subject));
    dispatch({
      type: "set-filter",
      subject,
      bookId: bookStillVisible ? session.bookId : null,
    });
  }

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[16.5rem_minmax(0,1fr)_22rem]">
      <aside className="hidden min-h-0 border-r bg-sidebar lg:block">
        <SessionList
          sessions={store.sessions}
          activeId={session.id}
          onSelect={(id) => dispatch({ type: "select", id })}
          onNew={() => dispatch({ type: "new-chat" })}
          onRemove={(id) => dispatch({ type: "remove", id })}
        />
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2 lg:hidden">
          <Button type="button" variant="outline" size="sm" onClick={() => setChatsOpen(true)}>
            <MenuIcon />
            Chats
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setInspectOpen(true)}>
            Sources
          </Button>
        </div>
        <div ref={scrollerRef} onScroll={onMessagesScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-6 px-4 py-6">
            {session.messages.length === 0 ? (
              <EmptyState onAsk={(question) => void ask(question)} />
            ) : (
              session.messages.map((message) => (
                <AnswerMessage
                  key={message.id}
                  message={message}
                  onCite={chooseCitation}
                  onEdit={() => editQuestion(message.id)}
                  onOpenCheck={() => openCheck(message.id)}
                  onFeedback={(input) => void vote(message, input)}
                  onFollowUp={(text) => void ask(text)}
                />
              ))
            )}
          </div>
        </div>
        {phase === "offline" ? (
          <p className="px-4 pt-3 text-sm leading-6">
            The StemMatrix server isn&apos;t running. This will reconnect on its own once it&apos;s back.
          </p>
        ) : null}
        {isLivePhase(phase) && scripted.includes("chat") ? (
          <p className="px-4 pt-3 text-sm leading-6 text-muted-foreground">
            Chat answers here are scripted previews. The real model and textbook search aren&apos;t connected yet.
          </p>
        ) : null}
        {phase === "no_model" && !scripted.includes("chat") ? (
          <p className="px-4 pt-3 text-sm leading-6 text-muted-foreground">
            The model isn&apos;t running, so only calculations can be answered right now.
          </p>
        ) : null}
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void ask(draft)}
          onStop={() => abortRef.current?.abort()}
          disabled={pending}
          askDisabled={phase === "offline"}
          inputRef={composerRef}
          subject={session.subject}
          bookId={session.bookId}
          books={books}
          onSubject={setSubject}
          onBook={(bookId) => dispatch({ type: "set-filter", subject: session.subject, bookId })}
        />
      </section>

      <aside className="hidden min-h-0 border-l bg-sidebar lg:block">
        <InspectPanel
          tab={tab}
          onTab={setTab}
          chunkId={chunkId}
          attempts={verified?.attempts ?? []}
          note={verified?.note}
          outcome={verified?.outcome}
        />
      </aside>

      <Sheet open={chatsOpen} onOpenChange={setChatsOpen}>
        <SheetContent side="left" className="w-80 data-[side=left]:w-80">
          <SheetHeader>
            <SheetTitle>Chats</SheetTitle>
          </SheetHeader>
          <SessionList
            sessions={store.sessions}
            activeId={session.id}
            onSelect={(id) => {
              dispatch({ type: "select", id });
              setChatsOpen(false);
            }}
            onNew={() => {
              dispatch({ type: "new-chat" });
              setChatsOpen(false);
            }}
            onRemove={(id) => dispatch({ type: "remove", id })}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={inspectOpen} onOpenChange={setInspectOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md data-[side=right]:w-full">
          <SheetHeader className="sr-only">
            <SheetTitle>Sources and verification</SheetTitle>
          </SheetHeader>
          <InspectPanel
            tab={tab}
            onTab={setTab}
            chunkId={chunkId}
            attempts={verified?.attempts ?? []}
            note={verified?.note}
            outcome={verified?.outcome}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function isAbortError(reason: unknown): boolean {
  return typeof reason === "object" && reason !== null && "name" in reason && reason.name === "AbortError";
}

function EmptyState({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="mx-auto flex max-w-[40rem] flex-col gap-8 pt-8">
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Textbook, solver, or model
        </p>
        <h2 className="font-heading mt-2 text-4xl leading-tight text-foreground">
          What do you want to work through?
        </h2>
        <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
          Concept questions come back with a book, chapter, and page. Numerical problems come back with a solver check. If a sentence has no source, it is marked Model.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              onClick={() => onAsk(suggestion)}
              className="h-full w-full rounded-xl bg-card px-4 py-3 text-left text-sm leading-6 ring-1 ring-border hover:bg-muted"
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-sm leading-6 text-muted-foreground">
        This preview uses scripted answers so the interface can be reviewed before the FastAPI model server is connected. Two sample chats are already in the list.
      </p>
    </div>
  );
}
