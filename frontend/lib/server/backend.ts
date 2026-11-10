import { connection } from "next/server";

const LIVE_ROUTES = [
  "health",
  "chat",
  "books",
  "sources",
  "practice",
  "grade",
  "flashcards",
  "feedback",
] as const;

export type LiveRoute = (typeof LIVE_ROUTES)[number];

const UNREACHABLE = "The StemMatrix server isn't running.";
const TIMEOUT = "The StemMatrix server took too long to answer.";
const FAILED = "The StemMatrix server could not complete that request.";

export class BackendError extends Error {
  readonly status: 502 | 504;

  constructor(status: 502 | 504, message: string) {
    super(message);
    this.name = "BackendError";
    this.status = status;
  }
}

export type BackendFetchInit = {
  method?: string;
  body?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  stream?: boolean;
};

function isRouteName(value: string): value is LiveRoute | "*" {
  return value === "*" || (LIVE_ROUTES as readonly string[]).includes(value);
}

export function isLive(route: LiveRoute): boolean {
  const names = (process.env.BACKEND_LIVE_ROUTES ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(isRouteName);
  return names.includes("*") || names.includes(route);
}

export async function onRequest(): Promise<void> {
  await connection();
}

export async function backendFetch(path: string, init: BackendFetchInit = {}): Promise<Response> {
  if (typeof window !== "undefined") {
    throw new Error("backendFetch can only run on the server.");
  }
  const base = process.env.BACKEND_URL?.replace(/\/$/, "");
  if (!base) throw new BackendError(502, UNREACHABLE);

  const timeoutController = new AbortController();
  const timer = init.stream ? null : setTimeout(() => timeoutController.abort(), 30_000);
  const signal = combineSignals(
    [init.signal, timeoutController.signal].filter((item): item is AbortSignal => item !== undefined),
  );

  try {
    return await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
      signal,
    });
  } catch (error: unknown) {
    if (init.signal?.aborted) throw error;
    if (timeoutController.signal.aborted) throw new BackendError(504, TIMEOUT);
    throw new BackendError(502, UNREACHABLE);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function backendFailure(error: unknown): Response {
  if (error instanceof BackendError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: FAILED }, { status: 502 });
}

export function upstreamFailure(response: Response, notFound: string): Response | null {
  if (response.ok) return null;
  if (response.status === 404) {
    return Response.json({ error: notFound }, { status: 404 });
  }
  return Response.json({ error: FAILED }, { status: 502 });
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}
