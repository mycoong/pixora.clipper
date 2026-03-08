import { NextRequest, NextResponse } from "next/server";
import { createRenderWorkerJob } from "@/lib/worker-client";
import type { CreateClipperRenderJobInput } from "@/types/clipper";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as CreateClipperRenderJobInput;
    const job = await createRenderWorkerJob(payload);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create render job";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
