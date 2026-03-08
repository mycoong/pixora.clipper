import { NextResponse } from "next/server";
import { isWorkerConfigured } from "@/lib/env";
import { fetchWorkerHealth } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isWorkerConfigured();
  const worker = configured ? await fetchWorkerHealth() : null;

  return NextResponse.json({
    ok: true,
    app: "clipper-web",
    workerConfigured: configured,
    worker
  });
}
