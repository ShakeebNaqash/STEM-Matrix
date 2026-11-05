"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getHealth } from "@/lib/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

const LINKS = [
  { href: "/ask", label: "Ask" },
  { href: "/practice", label: "Practice" },
  { href: "/flashcards", label: "Flashcards" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [modelNote, setModelNote] = useState("Checking the preview server");

  useEffect(() => {
    void getHealth()
      .then((health) => {
        setModelNote(
          health.model === "not_connected"
            ? "Scripted answers. The on-device model is not connected."
            : "Model connected.",
        );
      })
      .catch(() => setModelNote("The preview server did not respond."));
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="font-heading text-xl tracking-tight">
            StemMatrix
          </Link>
          <nav className="flex items-center gap-1">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-sm",
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
          <TooltipTrigger className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Preview
          </TooltipTrigger>
          <TooltipContent>{modelNote}</TooltipContent>
        </Tooltip>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
