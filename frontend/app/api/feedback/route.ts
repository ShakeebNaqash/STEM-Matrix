export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Expected feedback." }, { status: 400 });
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.messageId !== "string" || (record.value !== "up" && record.value !== "down")) {
    return Response.json({ error: "Expected a message id and a vote." }, { status: 400 });
  }

  return Response.json({ recorded: true });
}
