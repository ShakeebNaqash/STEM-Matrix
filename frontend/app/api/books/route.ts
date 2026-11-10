import { books } from "@/lib/mock/corpus";
import { adaptBooks } from "@/lib/server/adapters";
import { backendFailure, backendFetch, isLive, onRequest, upstreamFailure } from "@/lib/server/backend";

export async function GET() {
  await onRequest();
  if (!isLive("books")) return Response.json(books);

  try {
    const response = await backendFetch("/api/books");
    const failed = upstreamFailure(response, "Could not load books.");
    if (failed) return failed;
    return Response.json(adaptBooks(await response.json()));
  } catch (error: unknown) {
    return backendFailure(error);
  }
}
