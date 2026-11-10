"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useHealth, type HealthPhase } from "@/components/health-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

const LINKS = [
  { href: "/ask", label: "Ask" },
  { href: "/practice", label: "Practice" },
  { href: "/flashcards", label: "Flashcards" },
];

function phaseLabel(phase: HealthPhase): string {
  switch (phase) {
    case "checking":
      return "Checking…";
    case "preview":
      return "Preview";
    case "ready":
      return "Ready";
    case "test_model":
      return "Test model";
    case "no_model":
      return "No model";
    case "offline":
      return "Offline";
    default: {
      const neverPhase: never = phase;
      return neverPhase;
    }
  }
}

function phaseTip(phase: HealthPhase): string {
  switch (phase) {
    case "checking":
      return "Checking whether the StemMatrix server is running.";
    case "preview":
      return "Scripted answers. The on-device model is not connected.";
    case "ready":
      return "The solver and the model are connected.";
    case "test_model":
      return "The solver is connected. A scripted model is standing in.";
    case "no_model":
      return "The solver is connected, and no model is running. Only calculations can be answered.";
    case "offline":
      return "The StemMatrix server isn't running.";
    default: {
      const neverPhase: never = phase;
      return neverPhase;
    }
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { phase } = useHealth();
  const label = phaseLabel(phase);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-6">
          <Link href="/" className="font-heading shrink-0 text-lg tracking-tight sm:text-xl">
            StemMatrix
          </Link>
          <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-1.5 py-1 text-sm sm:px-2.5",
                    active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <Tooltip>
          <TooltipTrigger
            aria-label={label}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card text-xs font-medium text-muted-foreground sm:flex sm:h-auto sm:w-auto sm:items-center sm:gap-2 sm:px-2.5 sm:py-1"
          >
            <span className={cn("size-2 rounded-full", phaseDot(phase))} aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </TooltipTrigger>
          <TooltipContent>{phaseTip(phase)}</TooltipContent>
        </Tooltip>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function phaseDot(phase: HealthPhase): string {
  switch (phase) {
    case "checking":
    case "preview":
    case "no_model":
      return "bg-muted-foreground";
    case "ready":
      return "bg-solver";
    case "test_model":
      return "bg-model";
    case "offline":
      return "bg-destructive";
    default: {
      const neverPhase: never = phase;
      return neverPhase;
    }
  }
}
