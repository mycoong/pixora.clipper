import { clipperEnv, isWorkerConfigured } from "@/lib/env";
import type {
  ClipperJobStatus,
  CreateClipperAnalyzeJobInput,
  CreateClipperRenderJobInput,
  WorkerHealth
} from "@/types/clipper";

function buildHeaders() {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (clipperEnv.workerToken) {
    headers.set("x-clipper-worker-token", clipperEnv.workerToken);
  }

  return headers;
}

async function workerFetch<T>(pathname: string, init?: RequestInit): Promise<T> {
  if (!isWorkerConfigured()) {
    throw new Error("CLIPPER_WORKER_URL is not configured");
  }

  const response = await fetch(`${clipperEnv.workerUrl}${pathname}`, {
    ...init,
    cache: "no-store",
    headers: buildHeaders()
  });

  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`;
    let message = fallback;

    try {
      const json = (await response.json()) as { error?: string };
      message = json.error || fallback;
    } catch {
      message = fallback;
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function fetchWorkerHealth(): Promise<WorkerHealth | null> {
  if (!isWorkerConfigured()) {
    return null;
  }

  try {
    return await workerFetch<WorkerHealth>("/health", { method: "GET" });
  } catch {
    return {
      ok: false,
      service: "clipper-worker",
      version: "unreachable",
      mockMode: false
    };
  }
}

export async function createAnalyzeWorkerJob(payload: CreateClipperAnalyzeJobInput) {
  return workerFetch<ClipperJobStatus>("/jobs/analyze", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createRenderWorkerJob(payload: CreateClipperRenderJobInput) {
  return workerFetch<ClipperJobStatus>("/jobs/render", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function fetchWorkerJob(jobId: string) {
  return workerFetch<ClipperJobStatus>(`/jobs/${jobId}`, {
    method: "GET"
  });
}
