"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { getHealth } from "@/lib/api";
import type { HealthStatus } from "@/lib/types";

export type HealthPhase = "checking" | "preview" | "ready" | "test_model" | "no_model" | "offline";

type HealthContextValue = {
  phase: HealthPhase;
  refresh: () => Promise<void>;
};

const HealthContext = createContext<HealthContextValue | null>(null);

let phase: HealthPhase = "checking";
const listeners = new Set<() => void>();
let request = 0;

function emit(next: HealthPhase) {
  phase = next;
  for (const listener of listeners) listener();
}

async function loadHealth() {
  const token = ++request;
  try {
    const health = await getHealth();
    if (token !== request) return;
    emit(phaseOf(health));
  } catch {
    if (token !== request) return;
    emit("offline");
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
  const current = useSyncExternalStore(subscribe, getPhase, getServerPhase);
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

  const value = useMemo(() => ({ phase: current, refresh }), [current, refresh]);
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
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

function getPhase() {
  return phase;
}

function getServerPhase(): HealthPhase {
  return "checking";
}
