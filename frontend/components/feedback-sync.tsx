"use client";

import { useEffect, useRef } from "react";
import { useHealth } from "@/components/health-provider";
import { useSessions } from "@/components/session-provider";
import { sendFeedback } from "@/lib/api";
import { dropFeedback, readOutbox } from "@/lib/feedback-outbox";
import type { FeedbackRequest } from "@/lib/types";

const sending = new Set<string>();

function outboxKey(item: FeedbackRequest): string {
  return `${item.messageId}\u0000${item.createdAt}`;
}

export function FeedbackSync() {
  const { phase } = useHealth();
  const { store, dispatch } = useSessions();
  const storeRef = useRef(store);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    if (phase === "checking" || phase === "offline") return;
    let cancelled = false;
    void (async () => {
      for (const item of readOutbox()) {
        if (cancelled) return;
        const key = outboxKey(item);
        if (sending.has(key)) continue;
        sending.add(key);
        try {
          await sendFeedback(item);
        } catch {
          sending.delete(key);
          return;
        }
        sending.delete(key);
        dropFeedback(item.messageId, item.createdAt);
        const session = storeRef.current.sessions.find((entry) =>
          entry.messages.some((message) => message.id === item.messageId),
        );
        if (!session) continue;
        dispatch({
          type: "patch",
          sessionId: session.id,
          messageId: item.messageId,
          update: (message) => {
            if (!message.feedback || message.feedback.vote !== item.vote) return message;
            return { ...message, feedback: { ...message.feedback, sent: true } };
          },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, dispatch]);

  return null;
}
