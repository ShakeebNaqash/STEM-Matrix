import { passages, toSourcePassage } from "@/lib/mock/corpus";

export function generateStaticParams() {
  return passages.map((passage) => ({ chunkId: passage.chunkId }));
}

export async function GET(_request: Request, context: RouteContext<"/api/sources/[chunkId]">) {
  const { chunkId } = await context.params;
  const passage = toSourcePassage(chunkId);
  if (!passage) {
    return Response.json({ error: "Passage not found." }, { status: 404 });
  }
  return Response.json(passage);
}
