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

function deriveJobState(job) {
  const elapsedMs = Date.now() - job.createdAtMs;
  const timeline = [
    {
      until: 3000,
      status: "queued",
      phase: "queued",
      progress: 5,
      message: "Job accepted by worker"
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
    message: "Mock worker finished. Replace this server with FFmpeg pipeline next.",
    updatedAt: new Date().toISOString(),
    artifacts: [
      { kind: "source", label: "source-ready" },
      { kind: "transcript", label: `${job.payload.transcriptMode}-resolved` },
      { kind: "plan", label: `${job.payload.outputMode}-plan` }
    ]
  };
}

function normalizePayload(payload) {
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

function createJob(payload) {
  const nowIso = new Date().toISOString();
  const job = {
    id: `job_${randomUUID().slice(0, 8)}`,
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
      version: "0.1.0-mock",
      mockMode: true
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/jobs") {
    try {
      const body = await parseJsonBody(request);
      const payload = normalizePayload(body);
      sendJson(response, 201, createJob(payload));
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
