import { NextRequest, NextResponse } from "next/server";
import { fetchWorkerJob } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = await fetchWorkerJob(jobId);
    return NextResponse.json(job);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch worker job";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
