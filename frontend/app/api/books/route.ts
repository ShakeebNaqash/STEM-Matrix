import { books } from "@/lib/mock/corpus";

export function GET() {
  return Response.json(books);
}
