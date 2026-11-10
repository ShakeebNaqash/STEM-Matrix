import { adaptHealth } from "@/lib/server/adapters";
import { backendFailure, backendFetch, isLive, onRequest, scriptedRoutes, upstreamFailure } from "@/lib/server/backend";
import type { HealthStatus } from "@/lib/types";

export async function GET() {
  await onRequest();
  if (!isLive("health")) return mockHealth();

  try {
    const response = await backendFetch("/api/health");
    const failed = upstreamFailure(response, "The StemMatrix server isn't running.");
    if (failed) return failed;
    return Response.json(withScripted(adaptHealth(await response.json())));
  } catch (error: unknown) {
    return backendFailure(error);
  }
}

function mockHealth(): Response {
  const requested = process.env.MOCK_HEALTH ?? "";
  switch (requested) {
    case "":
      return Response.json(withScripted(previewHealth()));
    case "ready":
      return Response.json(withScripted({ status: "ok", backend: "live", model: "connected" }));
    case "test_model":
      return Response.json(withScripted({ status: "ok", backend: "live", model: "mock" }));
    case "no_model":
      return Response.json(withScripted({ status: "ok", backend: "live", model: "not_connected" }));
    case "offline":
      return Response.json({ error: "The StemMatrix server isn't running." }, { status: 502 });
    default:
      return Response.json(withScripted(previewHealth()));
  }
}

function previewHealth(): Omit<HealthStatus, "scripted"> {
  return { status: "ok", backend: "mock", model: "not_connected" };
}

function withScripted(health: Omit<HealthStatus, "scripted">): HealthStatus {
  return { ...health, scripted: scriptedRoutes() };
}
