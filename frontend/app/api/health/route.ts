import type { HealthStatus } from "@/lib/types";

export function GET() {
  const body: HealthStatus = {
    status: "ok",
    backend: "mock",
    model: "not_connected",
  };
  return Response.json(body);
}
