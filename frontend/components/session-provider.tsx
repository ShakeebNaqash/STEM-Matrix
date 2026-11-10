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
import {
  initialStore,
  loadSavedStore,
  reducer,
  writeSavedStore,
  type SessionAction,
  type SessionStore,
} from "@/lib/session-store";

export { clearSavedChats } from "@/lib/session-store";

type SessionContextValue = {
  store: SessionStore;
  dispatch: Dispatch<SessionAction>;
};

const serverStore = initialStore();
let clientStore: SessionStore | null = null;
const listeners = new Set<() => void>();

function loadClient(): SessionStore {
  if (clientStore) return clientStore;
  clientStore = loadSavedStore(serverStore);
  return clientStore;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: SessionStore) {
  clientStore = next;
  writeSavedStore(next);
  for (const listener of listeners) listener();
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const store = useSyncExternalStore(subscribe, loadClient, () => serverStore);
  const dispatch = useCallback((action: SessionAction) => {
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
