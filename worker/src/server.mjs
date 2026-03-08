import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number.parseInt(process.env.PORT || "4010", 10);
const workerToken = String(process.env.CLIPPER_WORKER_TOKEN || "").trim();
const jobs = new Map();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-clipper-worker-token"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function enforceToken(request) {
  if (!workerToken) return true;
  return request.headers["x-clipper-worker-token"] === workerToken;
}

function normalizeAnalyzePayload(payload) {
  const sourceUrl = String(payload?.sourceUrl || "").trim();
  if (!sourceUrl) {
    throw new Error("sourceUrl is required");
  }

  return {
    sourceType: payload?.sourceType === "cloud" ? "cloud" : "youtube",
    sourceUrl,
    transcriptMode:
      payload?.transcriptMode === "subtitle"
        ? "subtitle"
        : payload?.transcriptMode === "auto-stt"
          ? "auto-stt"
          : "youtube",
    outputMode:
      payload?.outputMode === "variations"
        ? "variations"
        : payload?.outputMode === "gaming"
          ? "gaming"
          : "standard",
    clipCount: Math.max(
      3,
      Math.min(12, Number.parseInt(String(payload?.clipCount || "6"), 10) || 6)
    ),
    notes: String(payload?.notes || "").trim()
  };
}

function normalizeRenderPayload(payload) {
  const clipIds = Array.isArray(payload?.clipIds)
    ? payload.clipIds
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];

  if (clipIds.length === 0) {
    throw new Error("clipIds is required");
  }

  return {
    sourceJobId: String(payload?.sourceJobId || "").trim() || undefined,
    clipIds: [...new Set(clipIds)],
    outputMode:
      payload?.outputMode === "variations"
        ? "variations"
        : payload?.outputMode === "gaming"
          ? "gaming"
          : "standard",
    resolution: String(payload?.resolution || "1080x1920").trim() || "1080x1920",
    titleVoEnabled: Boolean(payload?.titleVoEnabled),
    gamingEnabled: Boolean(payload?.gamingEnabled),
    notes: String(payload?.notes || "").trim()
  };
}

function getAnalyzeTimeline() {
  return [
    {
      until: 3000,
      status: "queued",
      phase: "queued",
      progress: 5,
      message: "Analyze job accepted by worker"
    },
    {
      until: 9000,
      status: "running",
      phase: "fetch-source",
      progress: 18,
      message: "Preparing source bundle"
    },
    {
      until: 15000,
      status: "running",
      phase: "transcript",
      progress: 42,
      message: "Resolving transcript strategy"
    },
    {
      until: 22000,
      status: "running",
      phase: "analysis",
      progress: 71,
      message: "Analyzing transcript and clip candidates"
    },
    {
      until: 28000,
      status: "running",
      phase: "render-plan",
      progress: 92,
      message: "Building render plan"
    }
  ];
}

function getRenderTimeline() {
  return [
    {
      until: 2500,
      status: "queued",
      phase: "queued",
      progress: 8,
      message: "Render job accepted by worker"
    },
    {
      until: 9000,
      status: "running",
      phase: "render-plan",
      progress: 36,
      message: "Preparing clip render batches"
    },
    {
      until: 18000,
      status: "running",
      phase: "rendering",
      progress: 78,
      message: "Rendering selected clips"
    },
    {
      until: 24000,
      status: "running",
      phase: "rendering",
      progress: 95,
      message: "Finalizing output artifacts"
    }
  ];
}

function buildAnalyzeArtifacts(job) {
  return [
    { kind: "source", label: "source-ready" },
    { kind: "transcript", label: `${job.payload.transcriptMode}-resolved` },
    { kind: "plan", label: `${job.payload.outputMode}-plan` }
  ];
}

function buildRenderArtifacts(job) {
  const renders = job.payload.clipIds.map((clipId, index) => ({
    kind: "render",
    label: `${index + 1}-${clipId}-${job.payload.resolution}`
  }));

  return [
    { kind: "plan", label: `${job.payload.outputMode}-render-batch` },
    ...renders
  ];
}

function deriveJobState(job) {
  const elapsedMs = Date.now() - job.createdAtMs;
  const timeline =
    job.kind === "render" ? getRenderTimeline() : getAnalyzeTimeline();

  const active = timeline.find((item) => elapsedMs < item.until);
  if (active) {
    return {
      ...job,
      status: active.status,
      phase: active.phase,
      progress: active.progress,
      message: active.message,
      updatedAt: new Date().toISOString(),
      artifacts: []
    };
  }

  return {
    ...job,
    status: "completed",
    phase: "completed",
    progress: 100,
    message:
      job.kind === "render"
        ? "Mock render worker finished. Replace this route with FFmpeg pipeline next."
        : "Mock analyze worker finished. Replace this route with transcript pipeline next.",
    updatedAt: new Date().toISOString(),
    artifacts:
      job.kind === "render" ? buildRenderArtifacts(job) : buildAnalyzeArtifacts(job)
  };
}

function createJob(kind, payload) {
  const nowIso = new Date().toISOString();
  const job = {
    id: `job_${randomUUID().slice(0, 8)}`,
    kind,
    status: "queued",
    phase: "queued",
    progress: 0,
    message: "Queued",
    submittedAt: nowIso,
    updatedAt: nowIso,
    createdAtMs: Date.now(),
    payload,
    artifacts: []
  };

  jobs.set(job.id, job);
  return deriveJobState(job);
}

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || "localhost"}`
  );

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (!enforceToken(request)) {
    sendJson(response, 401, { ok: false, error: "Invalid worker token" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "clipper-worker",
      version: "0.2.0-mock",
      mockMode: true,
      routes: {
        analyze: "/jobs/analyze",
        render: "/jobs/render",
        status: "/jobs/:id"
      }
    });
    return;
  }

  if (
    request.method === "POST" &&
    (url.pathname === "/jobs" || url.pathname === "/jobs/analyze")
  ) {
    try {
      const body = await parseJsonBody(request);
      const payload = normalizeAnalyzePayload(body);
      sendJson(response, 201, createJob("analyze", payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      sendJson(response, 400, { ok: false, error: message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/jobs/render") {
    try {
      const body = await parseJsonBody(request);
      const payload = normalizeRenderPayload(body);
      sendJson(response, 201, createJob("render", payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      sendJson(response, 400, { ok: false, error: message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/jobs/")) {
    const jobId = url.pathname.slice("/jobs/".length);
    const job = jobs.get(jobId);

    if (!job) {
      sendJson(response, 404, { ok: false, error: "Job not found" });
      return;
    }

    sendJson(response, 200, deriveJobState(job));
    return;
  }

  sendJson(response, 404, { ok: false, error: "Route not found" });
});

server.listen(port, () => {
  console.log(`[clipper-worker] listening on http://localhost:${port}`);
});
