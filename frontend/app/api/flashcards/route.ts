import { flashcards } from "@/lib/mock/corpus";

export function GET() {
  return Response.json(flashcards);
}
