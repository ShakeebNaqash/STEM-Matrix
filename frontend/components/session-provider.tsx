"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
} from "react";
import type { ChatMessage, StudySession, Subject } from "@/lib/types";

const STORAGE_KEY = "stemmatrix.sessions.v1";

type Store = {
  activeId: string;
  sessions: StudySession[];
};

type Action =
  | { type: "new-chat" }
  | { type: "select"; id: string }
  | { type: "remove"; id: string }
  | { type: "set-filter"; subject: Subject | null; bookId: string | null }
  | { type: "add-exchange"; sessionId: string; user: ChatMessage; assistant: ChatMessage }
  | {
      type: "patch";
      sessionId: string;
      messageId: string;
      update: (message: ChatMessage) => ChatMessage;
    };

const sampleLenz: StudySession = {
  id: "sample-lenz",
  title: "What is Lenz's law?",
  subject: null,
  bookId: null,
  updatedAt: 1,
  messages: [
    {
      id: "sample-lenz-user",
      role: "user",
      text: "What is Lenz's law?",
      segments: [],
      attempts: [],
    },
    {
      id: "sample-lenz-assistant",
      role: "assistant",
      text: "",
      mode: "textbook",
      attempts: [],
      segments: [
        {
          id: "sample-lenz-1",
          text: "The induced emf drives a current whose magnetic field opposes the change in flux that produced it. That opposition is the content of the minus sign in Faraday's law.",
          sourceType: "textbook",
          citations: [
            {
              book: "OpenStax University Physics Volume 2",
              chapter: "Electromagnetic induction",
              section: "Lenz's law",
              page: 478,
              chunkId: "phys2-lenz",
            },
          ],
        },
        {
          id: "sample-lenz-2",
          text: "Faraday's law gives the size of the induced emf. Lenz's law gives the direction.",
          sourceType: "textbook",
          citations: [
            {
              book: "OpenStax University Physics Volume 2",
              chapter: "Electromagnetic induction",
              section: "Faraday's law",
              page: 470,
              chunkId: "phys2-faraday",
            },
            {
              book: "OpenStax University Physics Volume 2",
              chapter: "Electromagnetic induction",
              section: "Lenz's law",
              page: 478,
              chunkId: "phys2-lenz",
            },
          ],
        },
      ],
    },
  ],
};

const sampleIntegral: StudySession = {
  id: "sample-integral",
  title: "Integrate x^2 from 0 to 3",
  subject: null,
  bookId: null,
  updatedAt: 2,
  messages: [
    {
      id: "sample-integral-user",
      role: "user",
      text: "Integrate x^2 from 0 to 3",
      segments: [],
      attempts: [],
    },
    {
      id: "sample-integral-assistant",
      role: "assistant",
      text: "",
      mode: "problem",
      segments: [
        {
          id: "sample-integral-1",
          text: "The power rule says the antiderivative of $x^2$ is $x^3/3$.",
          sourceType: "textbook",
          citations: [
            {
              book: "OpenStax Calculus Volume 1",
              chapter: "Integrals",
              section: "The power rule",
              page: 342,
              chunkId: "calc1-power",
            },
          ],
        },
        {
          id: "sample-integral-2",
          text: "Evaluated from 0 to 3, the definite integral is 9.",
          sourceType: "solver",
          citations: [],
          displayMath: "\\int_0^3 x^2\\,dx = \\left[\\frac{x^3}{3}\\right]_0^3 = 9",
        },
        {
          id: "sample-integral-3",
          text: "The first draft reported 27, which is $3^3$ with the factor of $1/3$ left out. The solver sent that error back, and the second draft matched.",
          sourceType: "model",
          citations: [],
        },
      ],
      attempts: [
        {
          attempt: 1,
          modelAnswer: "$27$",
          solverAnswer: "$9$",
          match: false,
          solver: "SymPy",
          params: { type: "definite_integral", expr: "x**2", lower: 0, upper: 3 },
          feedback:
            "The antiderivative of x**2 is x**3/3, not x**3. Evaluating x**3 from 0 to 3 gives 27. Dividing by 3 gives 9.",
        },
        {
          attempt: 2,
          modelAnswer: "$9$",
          solverAnswer: "$9$",
          match: true,
          solver: "SymPy",
          params: { type: "definite_integral", expr: "x**2", lower: 0, upper: 3 },
        },
      ],
    },
  ],
};

function blankSession(subject: Subject | null, bookId: string | null): StudySession {
  return {
    id: `chat-${crypto.randomUUID()}`,
    title: "New question",
    subject,
    bookId,
    updatedAt: Date.now(),
    messages: [],
  };
}

function initialStore(): Store {
  return {
    activeId: "draft",
    sessions: [
      {
        id: "draft",
        title: "New question",
        subject: null,
        bookId: null,
        updatedAt: 0,
        messages: [],
      },
      sampleLenz,
      sampleIntegral,
    ],
  };
}

function isStore(value: unknown): value is Store {
  if (!value || typeof value !== "object") return false;
  const record = value as { activeId?: unknown; sessions?: unknown };
  return typeof record.activeId === "string" && Array.isArray(record.sessions);
}

function mapSession(store: Store, sessionId: string, update: (session: StudySession) => StudySession): Store {
  return {
    ...store,
    sessions: store.sessions.map((session) => (session.id === sessionId ? update(session) : session)),
  };
}

function reducer(state: Store, action: Action): Store {
  switch (action.type) {
    case "select":
      return state.sessions.some((session) => session.id === action.id)
        ? { ...state, activeId: action.id }
        : state;
    case "new-chat": {
      const current = state.sessions.find((session) => session.id === state.activeId);
      if (current && current.messages.length === 0) return state;
      const session = blankSession(current?.subject ?? null, current?.bookId ?? null);
      return { activeId: session.id, sessions: [session, ...state.sessions] };
    }
    case "remove": {
      const remaining = state.sessions.filter((session) => session.id !== action.id);
      if (remaining.length === 0) {
        const session = blankSession(null, null);
        return { activeId: session.id, sessions: [session] };
      }
      const activeId = state.activeId === action.id ? remaining[0].id : state.activeId;
      return { activeId, sessions: remaining };
    }
    case "set-filter":
      return mapSession(state, state.activeId, (session) => ({
        ...session,
        subject: action.subject,
        bookId: action.bookId,
      }));
    case "add-exchange": {
      const next = mapSession(state, action.sessionId, (session) => {
        const title =
          session.messages.length === 0 ? action.user.text.slice(0, 72) : session.title;
        return {
          ...session,
          title,
          updatedAt: Date.now(),
          messages: [...session.messages, action.user, action.assistant],
        };
      });
      const session = next.sessions.find((item) => item.id === action.sessionId);
      if (!session) return next;
      return {
        ...next,
        sessions: [session, ...next.sessions.filter((item) => item.id !== action.sessionId)],
      };
    }
    case "patch":
      return mapSession(state, action.sessionId, (session) => ({
        ...session,
        messages: session.messages.map((message) =>
          message.id === action.messageId ? action.update(message) : message,
        ),
      }));
    default: {
      const neverAction: never = action;
      return neverAction;
    }
  }
}

type SessionContextValue = {
  store: Store;
  dispatch: Dispatch<Action>;
};

const serverStore = initialStore();
let clientStore: Store | null = null;
const listeners = new Set<() => void>();

function loadClient(): Store {
  if (clientStore) return clientStore;
  clientStore = serverStore;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return clientStore;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStore(parsed) && parsed.sessions.length > 0) clientStore = parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return clientStore;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: Store) {
  clientStore = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const store = useSyncExternalStore(subscribe, loadClient, () => serverStore);
  const dispatch = useCallback((action: Action) => {
    publish(reducer(loadClient(), action));
  }, []);
  const value = useMemo(() => ({ store, dispatch }), [store, dispatch]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessions() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSessions must be used inside SessionProvider");
  }
  return context;
}
