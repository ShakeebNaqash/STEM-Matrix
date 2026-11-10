import { toSourcePassage } from "@/lib/mock/corpus";
import { adaptSource } from "@/lib/server/adapters";
import { backendFailure, backendFetch, isLive, onRequest, upstreamFailure } from "@/lib/server/backend";

export async function GET(_request: Request, context: RouteContext<"/api/sources/[chunkId]">) {
  await onRequest();
  const { chunkId } = await context.params;
  if (!isLive("sources")) {
    const passage = toSourcePassage(chunkId);
    if (!passage) return Response.json({ error: "Passage not found." }, { status: 404 });
    return Response.json(passage);
  }

  try {
    const response = await backendFetch(`/api/sources/${encodeURIComponent(chunkId)}`);
    const failed = upstreamFailure(response, "Passage not found.");
    if (failed) return failed;
    return Response.json(adaptSource(await response.json()));
  } catch (error: unknown) {
    return backendFailure(error);
  }
}
