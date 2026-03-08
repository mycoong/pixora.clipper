import { NextRequest, NextResponse } from "next/server";
import { createAnalyzeWorkerJob } from "@/lib/worker-client";
import type { CreateClipperAnalyzeJobInput } from "@/types/clipper";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as CreateClipperAnalyzeJobInput;
    const job = await createAnalyzeWorkerJob(payload);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create analyze job";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
