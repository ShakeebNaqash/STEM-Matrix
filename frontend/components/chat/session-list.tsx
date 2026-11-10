"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StudySession } from "@/lib/types";
import { cn } from "cn";

function stamp(updatedAt: number): string {
  if (updatedAt === 0) return "Draft";
  if (updatedAt < 10) return "Sample";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(updatedAt);
}

export function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew,
  onRemove,
}: {
  sessions: StudySession[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Chats</p>
        <Button type="button" variant="outline" size="sm" onClick={onNew}>
          <PlusIcon />
          New
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-1 px-2 pb-4">
          {sessions.map((session) => {
            const active = session.id === activeId;
            return (
              <li key={session.id}>
                <div
                  className={cn(
                    "group flex items-start gap-1 rounded-lg pr-1",
                    active ? "bg-card ring-1 ring-border" : "hover:bg-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(session.id)}
                    className="min-w-0 flex-1 px-2.5 py-2 text-left"
                  >
                    <span className="block truncate text-sm font-medium">{session.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {stamp(session.updatedAt)}
                      {session.messages.length > 0
                        ? ` · ${session.messages.length} messages`
                        : ""}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-1 opacity-100 can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Delete ${session.title}`}
                    onClick={() => onRemove(session.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
