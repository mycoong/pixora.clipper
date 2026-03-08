import { NextRequest, NextResponse } from "next/server";
import { createWorkerJob } from "@/lib/worker-client";
import type { CreateClipperJobInput } from "@/types/clipper";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as CreateClipperJobInput;
    const job = await createWorkerJob(payload);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create worker job";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
