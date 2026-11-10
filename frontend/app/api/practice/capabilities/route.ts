import type { PracticeCapabilities, PracticeQuestionType } from "@/lib/types";
import { backendFailure, backendFetch, isLive, onRequest, upstreamFailure } from "@/lib/server/backend";

const TYPES: readonly PracticeQuestionType[] = ["mcq", "msq", "nat", "short"];

const MOCK_CAPABILITIES: PracticeCapabilities = {
  types: ["mcq", "msq", "nat", "short"],
  filters: { book: true, chapter: true },
};

const LIVE_FALLBACK: PracticeCapabilities = {
  types: ["nat"],
  filters: { book: false, chapter: false },
};

export async function GET() {
  await onRequest();
  if (!isLive("practice")) return Response.json(MOCK_CAPABILITIES);

  try {
    const response = await backendFetch("/api/practice/capabilities");
    if (response.status === 404) return Response.json(LIVE_FALLBACK);
    const failed = upstreamFailure(response, "Could not load practice options.");
    if (failed) return failed;
    return Response.json(readCapabilities(await response.json()) ?? LIVE_FALLBACK);
  } catch (error: unknown) {
    return backendFailure(error);
  }
}

function readCapabilities(body: unknown): PracticeCapabilities | null {
  if (!isRecord(body) || !Array.isArray(body.types) || !isRecord(body.filters)) return null;
  if (typeof body.filters.book !== "boolean" || typeof body.filters.chapter !== "boolean") return null;
  const types = body.types.filter((item): item is PracticeQuestionType => typeof item === "string" && isType(item));
  if (types.length === 0) return null;
  return { types, filters: { book: body.filters.book, chapter: body.filters.chapter } };
}

function isType(value: string): value is PracticeQuestionType {
  return TYPES.some((type) => type === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
