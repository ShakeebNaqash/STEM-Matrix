import { flashcards } from "@/lib/mock/corpus";
import { adaptFlashcards } from "@/lib/server/adapters";
import { backendFailure, backendFetch, isLive, onRequest, upstreamFailure } from "@/lib/server/backend";

export async function GET() {
  await onRequest();
  if (!isLive("flashcards")) return Response.json(flashcards);

  try {
    const response = await backendFetch("/api/flashcards");
    const failed = upstreamFailure(response, "Could not load flashcards.");
    if (failed) return failed;
    return Response.json(adaptFlashcards(await response.json()));
  } catch (error: unknown) {
    return backendFailure(error);
  }
}
