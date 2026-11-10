import { beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage, StudySession } from "@/lib/types";
import {
  INTERRUPTED_ERROR,
  LEGACY_SESSION_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  initialStore,
  loadSavedStore,
  reducer,
  writeSavedStore,
  type SessionStore,
} from "@/lib/session-store";

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function memoryStorage(throwOn?: "get" | "set" | "remove"): MemoryStorage {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      if (throwOn === "get") throw new Error("denied");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (throwOn === "set") throw new Error("quota");
      values.set(key, value);
    },
    removeItem(key) {
      if (throwOn === "remove") throw new Error("denied");
      values.delete(key);
    },
  };
}

function useStorage(storage: MemoryStorage) {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  return storage;
}

function message(id: string, role: "user" | "assistant", text: string): ChatMessage {
  return { id, role, text, segments: [], attempts: [] };
}

function session(id: string, messages: ChatMessage[] = []): StudySession {
  return { id, title: id, subject: null, bookId: null, updatedAt: 1, messages };
}

describe("reducer", () => {
  it("adds an exchange, titles the chat, and moves it to the front", () => {
    const start = initialStore();
    const user = message("u", "user", "What is a vector space?");
    const assistant = message("a", "assistant", "");
    const next = reducer(start, { type: "add-exchange", sessionId: "draft", user, assistant });
    expect(next.sessions[0]?.id).toBe("draft");
    expect(next.sessions[0]?.title).toBe("What is a vector space?");
    expect(next.sessions[0]?.messages.map((item) => item.id)).toEqual(["u", "a"]);
    expect(next.sessions[0]?.updatedAt).toBeGreaterThan(2);
  });

  it("patches one message and leaves the others alone", () => {
    const start = reducer(initialStore(), {
      type: "add-exchange",
      sessionId: "draft",
      user: message("u", "user", "Hi"),
      assistant: message("a", "assistant", ""),
    });
    const next = reducer(start, {
      type: "patch",
      sessionId: "draft",
      messageId: "a",
      update: (current) => ({ ...current, note: "Checked" }),
    });
    expect(next.sessions[0]?.messages[1]?.note).toBe("Checked");
    expect(next.sessions[0]?.messages[0]?.text).toBe("Hi");
  });

  it("selects a session, opens a new chat, and moves off a removed active session", () => {
    const start = initialStore();
    const selected = reducer(start, { type: "select", id: "sample-integral" });
    expect(selected.activeId).toBe("sample-integral");
    expect(reducer(selected, { type: "select", id: "missing" })).toBe(selected);

    const opened = reducer(selected, { type: "new-chat" });
    expect(opened.activeId.startsWith("chat-")).toBe(true);
    expect(opened.sessions[0]?.messages).toEqual([]);
    expect(opened.sessions[0]?.subject).toBeNull();
    expect(reducer(opened, { type: "new-chat" })).toBe(opened);

    const filtered = reducer(selected, { type: "set-filter", subject: "Physics", bookId: "phys-2" });
    expect(filtered.sessions.find((item) => item.id === "sample-integral")).toMatchObject({
      subject: "Physics",
      bookId: "phys-2",
    });

    const removed = reducer(start, { type: "remove", id: "draft" });
    expect(removed.activeId).toBe("sample-lenz");
    expect(removed.sessions.some((item) => item.id === "draft")).toBe(false);

    const kept = reducer(start, { type: "remove", id: "sample-lenz" });
    expect(kept.activeId).toBe("draft");

    let only = start;
    for (const id of ["draft", "sample-lenz", "sample-integral"]) {
      only = reducer(only, { type: "remove", id });
    }
    expect(only.sessions).toHaveLength(1);
    expect(only.activeId).toBe(only.sessions[0]?.id);
    expect(only.sessions[0]?.messages).toEqual([]);
  });
});

describe("loadSavedStore", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = useStorage(memoryStorage());
  });

  it("turns a pending message into an interrupted one", () => {
    const saved: SessionStore = {
      activeId: "s",
      sessions: [
        session("s", [{ ...message("a", "assistant", ""), pending: true, mode: "problem" }]),
      ],
    };
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(saved));
    const loaded = loadSavedStore(initialStore());
    const restored = loaded.sessions[0]?.messages[0];
    expect(restored?.pending).toBe(false);
    expect(restored?.error).toBe(INTERRUPTED_ERROR);
  });

  it("drops invalid sessions and messages, and falls back when the active id is missing", () => {
    storage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        sessions: [
          { id: 4 },
          {
            id: "kept",
            title: "Kept",
            messages: [
              { id: 1 },
              {
                id: "ok",
                role: "user",
                text: "Hello",
                segments: [{ id: "bad" }, { id: "seg", text: "Hi", sourceType: "model", citations: [] }],
                attempts: [{ attempt: "no" }, { attempt: 1, modelAnswer: "1", solverAnswer: null, match: false }],
              },
            ],
          },
        ],
      }),
    );
    const loaded = loadSavedStore(initialStore());
    expect(loaded.activeId).toBe("kept");
    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.sessions[0]?.messages).toHaveLength(1);
    expect(loaded.sessions[0]?.messages[0]?.segments.map((item) => item.id)).toEqual(["seg"]);
    expect(loaded.sessions[0]?.messages[0]?.attempts).toEqual([
      { attempt: 1, modelAnswer: "1", solverAnswer: null, match: false },
    ]);
  });

  it("uses the active session when its id is present, and the initial store when nothing valid remains", () => {
    const fallback = initialStore();
    storage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        activeId: "second",
        sessions: [session("first", [message("u", "user", "One")]), session("second", [message("u2", "user", "Two")])],
      }),
    );
    expect(loadSavedStore(fallback).activeId).toBe("second");

    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ activeId: "nope", sessions: [{ nope: true }] }));
    expect(loadSavedStore(fallback)).toBe(fallback);

    storage.setItem(SESSION_STORAGE_KEY, "{");
    expect(loadSavedStore(fallback)).toBe(fallback);
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("removes the old v1 key on load", () => {
    storage.setItem(LEGACY_SESSION_STORAGE_KEY, "{\"sessions\":[]}");
    loadSavedStore(initialStore());
    expect(storage.getItem(LEGACY_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("swallows localStorage failures", () => {
    const fallback = initialStore();
    useStorage(memoryStorage("get"));
    expect(() => loadSavedStore(fallback)).not.toThrow();
    expect(loadSavedStore(fallback)).toBe(fallback);

    useStorage(memoryStorage("set"));
    expect(() => writeSavedStore(fallback)).not.toThrow();

    useStorage(memoryStorage("remove"));
    expect(() => loadSavedStore(fallback)).not.toThrow();
  });

  it("treats a saved assistant answer with no scripted flag as a preview", () => {
    storage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        activeId: "s1",
        sessions: [
          {
            id: "s1",
            title: "Old",
            subject: null,
            bookId: null,
            updatedAt: 1,
            messages: [
              { id: "u", role: "user", text: "Hi", segments: [], attempts: [] },
              { id: "a", role: "assistant", text: "", mode: "textbook", segments: [], attempts: [], scripted: false },
              { id: "b", role: "assistant", text: "", mode: "textbook", segments: [], attempts: [] },
            ],
          },
        ],
      }),
    );
    const loaded = loadSavedStore(initialStore());
    const messages = loaded.sessions[0]?.messages ?? [];
    expect(messages[0]?.scripted).toBeUndefined();
    expect(messages[1]?.scripted).toBe(false);
    expect(messages[2]?.scripted).toBe(true);
  });

  it("keeps feedback, outcomes, and clarifications across a save and load", () => {
    const store: SessionStore = {
      activeId: "s1",
      sessions: [
        {
          id: "s1",
          title: "Saved",
          subject: "Physics",
          bookId: "phys-2",
          updatedAt: 42,
          messages: [
            message("u", "user", "How fast is a car"),
            {
              ...message("a", "assistant", ""),
              mode: "problem",
              scripted: true,
              feedback: { vote: "down", reason: "Wrong answer", comment: "off by ten", sent: false },
              outcome: {
                status: "failed",
                solver: "physics_force",
                display: { kind: "number", value: "1", unit: "N" },
                checkMessage: "Force equals mass times acceleration.",
                conversions: [{ field: "mass", from: "500 g", to: "0.5 kg" }],
                error: "Singular matrix",
                note: "Shown as written.",
                trace: { title: "Force (F = ma)", steps: [{ label: "Formula", value: "F=m*a" }], raw: "{\"extra\":1}" },
              },
              clarification: { message: "Need units.", patterns: ["force from mass and acceleration"] },
              segments: [
                {
                  id: "seg",
                  text: "The wording reached the solver.",
                  sourceType: "model",
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
              ],
            },
          ],
        },
      ],
    };
    writeSavedStore(store);
    expect(loadSavedStore(initialStore())).toEqual(store);
  });
});
