"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { getHealth } from "@/lib/api";
import { API_ROUTES, type ApiRoute, type HealthStatus } from "@/lib/types";

export type HealthPhase = "checking" | "preview" | "ready" | "test_model" | "no_model" | "offline";

type HealthContextValue = {
  phase: HealthPhase;
  scripted: readonly ApiRoute[];
  refresh: () => Promise<void>;
};

type HealthSnapshot = {
  phase: HealthPhase;
  scripted: readonly ApiRoute[];
};

const HealthContext = createContext<HealthContextValue | null>(null);

const noScripted: readonly ApiRoute[] = [];
const serverSnapshot: HealthSnapshot = { phase: "checking", scripted: noScripted };
let snapshot: HealthSnapshot = serverSnapshot;
const listeners = new Set<() => void>();
let request = 0;

function emit(next: HealthSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function loadHealth() {
  const token = ++request;
  try {
    const health = await getHealth();
    if (token !== request) return;
    emit({ phase: phaseOf(health), scripted: readScripted(health.scripted) });
  } catch {
    if (token !== request) return;
    emit({ phase: "offline", scripted: noScripted });
  }
}

function phaseOf(health: HealthStatus): HealthPhase {
  switch (health.backend) {
    case "mock":
      return "preview";
    case "live":
      return livePhase(health.model);
    default: {
      const neverBackend: never = health.backend;
      return neverBackend;
    }
  }
}

function livePhase(model: HealthStatus["model"]): HealthPhase {
  switch (model) {
    case "connected":
      return "ready";
    case "mock":
      return "test_model";
    case "not_connected":
      return "no_model";
    default: {
      const neverModel: never = model;
      return neverModel;
    }
  }
}

export function HealthProvider({ children }: { children: ReactNode }) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const refresh = useCallback(() => loadHealth(), []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void loadHealth();
    };
    tick();
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const value = useMemo(
    () => ({ phase: current.phase, scripted: current.scripted, refresh }),
    [current, refresh],
  );
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function isLivePhase(phase: HealthPhase): boolean {
  switch (phase) {
    case "checking":
    case "preview":
    case "offline":
      return false;
    case "ready":
    case "test_model":
    case "no_model":
      return true;
    default: {
      const neverPhase: never = phase;
      return neverPhase;
    }
  }
}

export function useHealth(): HealthContextValue {
  const value = useContext(HealthContext);
  if (!value) throw new Error("useHealth must be used inside HealthProvider.");
  return value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return serverSnapshot;
}

function readScripted(value: unknown): readonly ApiRoute[] {
  if (!Array.isArray(value)) return noScripted;
  const routes = value.filter((item): item is ApiRoute => API_ROUTES.some((route) => route === item));
  return routes.length === API_ROUTES.length ? API_ROUTES : routes;
}
