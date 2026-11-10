"use client";

import { clearSavedChats } from "@/components/session-provider";
import { Button } from "@/components/ui/button";

export function ErrorScreen({ retry }: { retry: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center px-6 py-16 text-center">
      <h2 className="font-heading text-3xl text-foreground">This page hit a problem.</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        Try the page again, or clear the chats saved in this browser.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            clearSavedChats();
            window.location.reload();
          }}
        >
          Reset saved chats
        </Button>
      </div>
    </div>
  );
}
