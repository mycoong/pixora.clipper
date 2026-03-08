
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import https from "node:https";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { promises as fsp } from "node:fs";

const port = Number.parseInt(process.env.PORT || "4010", 10);
const workerToken = String(process.env.CLIPPER_WORKER_TOKEN || "").trim();
const workerDataDir = String(
  process.env.CLIPPER_WORKER_DATA_DIR || path.join(os.tmpdir(), "pixora-clipper-worker")
).trim();

const jobs = new Map();

const KNOWN_WINDOWS_FFMPEG_PATHS = [
  "C:\\PIXORA\\resources\\ffmpeg.exe",
  "C:\\Program Files\\Clipiee\\resources\\ffmpeg.exe",
  "C:\\Program Files\\PIXORA\\resources\\ffmpeg.exe"
];

const KNOWN_WINDOWS_FFPROBE_PATHS = [
  "C:\\PIXORA\\resources\\ffprobe.exe",
  "C:\\Program Files\\Clipiee\\resources\\ffprobe.exe",
  "C:\\Program Files\\PIXORA\\resources\\ffprobe.exe"
];

const KNOWN_WINDOWS_YTDLP_PATHS = [
  "C:\\PIXORA\\resources\\yt-dlp.exe",
  "C:\\Program Files\\Clipiee\\resources\\yt-dlp.exe",
  "C:\\Program Files\\PIXORA\\resources\\yt-dlp.exe"
];

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-clipper-worker-token"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendFile(response, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".mp4"
      ? "video/mp4"
      : ext === ".json"
        ? "application/json; charset=utf-8"
        : "application/octet-stream";
  const stat = fs.statSync(filePath);

  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Access-Control-Allow-Origin": "*",
    "Content-Disposition": `attachment; filename="${path.basename(filePath)}"`
  });

  fs.createReadStream(filePath).pipe(response);
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
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

function isPublicRoute(method, pathname) {
  return method === "GET" && (pathname === "/health" || pathname.startsWith("/artifacts/"));
}

function getRequestOrigin(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").trim();
  const protocol = forwardedProto || "http";
  const host = String(request.headers.host || "localhost").trim();
  return `${protocol}://${host}`;
}

function nowIso() {
  return new Date().toISOString();
}

function updateJob(job, patch) {
  Object.assign(job, patch, { updatedAt: nowIso() });
}

function toPublicJob(job) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    message: job.message,
    submittedAt: job.submittedAt,
    updatedAt: job.updatedAt,
    payload: job.payload,
    artifacts: Array.isArray(job.artifacts) ? job.artifacts : [],
    result: job.result || {}
  };
}

function normalizeAnalyzePayload(payload) {
  const sourceUrl = String(payload?.sourceUrl || "").trim();
  if (!sourceUrl) throw new Error("sourceUrl is required");

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
    ? payload.clipIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  if (clipIds.length === 0) throw new Error("clipIds is required");

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
function parseResolution(rawValue) {
  const safe = String(rawValue || "1080x1920").trim();
  const match = safe.match(/^(\d{3,5})x(\d{3,5})$/);
  if (!match) return { width: 1080, height: 1920 };
  const width = Math.max(360, Math.min(2160, Number(match[1]) || 1080));
  const height = Math.max(640, Math.min(3840, Number(match[2]) || 1920));
  return { width, height };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeFileName(value, fallback = "clip") {
  const safe = slugify(value).slice(0, 80);
  return safe || fallback;
}

function toClock(totalSeconds) {
  const clamped = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseTimecodeToSeconds(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const parts = raw.split(":").map((item) => Number(item) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function probeCommandAvailability(command, prefixArgs = []) {
  try {
    const result = spawnSync(command, [...prefixArgs, "--version"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 12000
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function pickFirstExisting(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveFfmpegPath() {
  const envPath = String(process.env.FFMPEG_PATH || "").trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  if (process.platform === "win32") {
    const fromKnown = pickFirstExisting(KNOWN_WINDOWS_FFMPEG_PATHS);
    if (fromKnown) return fromKnown;
  }

  if (probeCommandAvailability("ffmpeg")) return "ffmpeg";
  return null;
}

function resolveFfprobePath() {
  const envPath = String(process.env.FFPROBE_PATH || "").trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  if (process.platform === "win32") {
    const fromKnown = pickFirstExisting(KNOWN_WINDOWS_FFPROBE_PATHS);
    if (fromKnown) return fromKnown;
  }

  if (probeCommandAvailability("ffprobe")) return "ffprobe";
  return null;
}

function getWorkerBinDir() {
  return path.join(workerDataDir, "bin");
}

function getYtdlpBinaryName() {
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

function getYtdlpDownloadUrl() {
  const base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
  if (process.platform === "win32") return `${base}/yt-dlp.exe`;
  if (process.platform === "darwin") return `${base}/yt-dlp_macos`;
  return `${base}/yt-dlp_linux`;
}

async function downloadFile(url, destinationPath, redirectCount = 0) {
  if (redirectCount > 5) throw new Error("Too many redirects while downloading yt-dlp");

  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const status = Number(response.statusCode || 0);
      if ([301, 302, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destinationPath, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (status !== 200) {
        reject(new Error(`Download failed with status ${status}`));
        response.resume();
        return;
      }

      const stream = fs.createWriteStream(destinationPath);
      response.pipe(stream);
      stream.on("finish", () => {
        stream.close();
        resolve();
      });
      stream.on("error", reject);
    });

    request.on("error", reject);
  });

  if (process.platform !== "win32") {
    await fsp.chmod(destinationPath, 0o755).catch(() => {});
  }
}

async function ensureYtdlpBinary() {
  const envPath = String(process.env.YTDLP_PATH || "").trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  if (process.platform === "win32") {
    const knownPath = pickFirstExisting(KNOWN_WINDOWS_YTDLP_PATHS);
    if (knownPath) return knownPath;
  }

  const localPath = path.join(getWorkerBinDir(), getYtdlpBinaryName());
  if (fs.existsSync(localPath)) return localPath;

  await downloadFile(getYtdlpDownloadUrl(), localPath);
  return localPath;
}

async function resolveYtdlpRunners() {
  const unique = new Map();

  const add = (command, prefixArgs = [], label = "yt-dlp") => {
    const key = `${command} ${prefixArgs.join(" ")}`.trim();
    if (!command || unique.has(key)) return;
    unique.set(key, { command, prefixArgs, label });
  };

  const envPath = String(process.env.YTDLP_PATH || "").trim();
  if (envPath && fs.existsSync(envPath)) add(envPath, [], "yt-dlp-env");

  if (process.platform === "win32") {
    const known = pickFirstExisting(KNOWN_WINDOWS_YTDLP_PATHS);
    if (known) add(known, [], "yt-dlp-known");
  }

  const localBin = path.join(getWorkerBinDir(), getYtdlpBinaryName());
  if (fs.existsSync(localBin)) add(localBin, [], "yt-dlp-local");

  add("yt-dlp", [], "yt-dlp-path");
  add("python", ["-m", "yt_dlp"], "python-yt_dlp");
  add("python3", ["-m", "yt_dlp"], "python3-yt_dlp");

  let available = [...unique.values()].filter((runner) =>
    probeCommandAvailability(runner.command, runner.prefixArgs)
  );
  if (available.length > 0) return available;

  try {
    const downloadedPath = await ensureYtdlpBinary();
    add(downloadedPath, [], "yt-dlp-downloaded");
    available = [...unique.values()].filter((runner) =>
      probeCommandAvailability(runner.command, runner.prefixArgs)
    );
  } catch {
    // no-op, caller will handle unavailable runner.
  }

  return available;
}
function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      shell: false,
      windowsHide: true,
      ...options.spawnOptions
    });

    let stdout = "";
    let stderr = "";
    const timeoutMs = Number(options.timeoutMs) || 0;
    let timedOut = false;
    let timeout;

    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignored
        }
      }, timeoutMs);
    }

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });

    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderr?.(text);
    });

    proc.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });

    proc.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${command} timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({
        code: Number(code ?? 1),
        stdout,
        stderr
      });
    });
  });
}

async function probeDurationSec(ffprobePath, inputPath) {
  const result = await runProcess(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nokey=1:noprint_wrappers=1",
    inputPath
  ]);

  if (result.code !== 0) {
    const reason = (result.stderr || result.stdout || "ffprobe failed").trim();
    throw new Error(`ffprobe failed: ${reason}`);
  }

  const duration = Number.parseFloat(String(result.stdout || "").trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Unable to read source duration");
  }
  return duration;
}

function makeAnalyzeClipCandidates(durationSec, clipCount, sourceLabel) {
  const count = Math.max(3, Math.min(12, Number(clipCount) || 6));
  const total = Math.max(20, Number(durationSec) || 20);
  const baseDuration = Math.max(12, Math.min(35, Math.floor(total / (count + 1))));
  const gap = total / (count + 1);
  const hookTemplates = [
    "Strong opening line, cocok untuk hook clip.",
    "Bagian ini punya tension dan clear transition.",
    "Candidate bagus untuk payoff singkat.",
    "Moment kontras yang berpotensi viral.",
    "Segmen story pendek untuk retention.",
    "Penutup cepat untuk outro clip."
  ];

  return Array.from({ length: count }).map((_, index) => {
    const center = gap * (index + 1);
    const clipDuration = Math.max(8, Math.min(baseDuration + (index % 3), 42));
    const start = Math.max(0, Math.min(total - clipDuration, Math.floor(center - clipDuration / 2)));
    const end = Math.max(start + 4, Math.min(total, start + clipDuration));
    const durationLabel = `${Math.max(1, Math.round(end - start))}s`;

    return {
      id: `clip-${index + 1}`,
      title: `Clip ${index + 1} / ${sourceLabel}`,
      rangeLabel: `${toClock(start)} - ${toClock(end)}`,
      durationLabel,
      score: Math.max(60, 96 - index * 4),
      hook: hookTemplates[index % hookTemplates.length],
      tags: ["auto", "timeline"],
      startSec: start,
      endSec: end,
      durationSec: Number((end - start).toFixed(2))
    };
  });
}

function artifactUrl(origin, jobId, fileName) {
  return `${origin}/artifacts/${encodeURIComponent(jobId)}/${encodeURIComponent(fileName)}`;
}

async function resolveAnalyzeSource(job, payload) {
  if (payload.sourceType === "cloud") {
    const raw = String(payload.sourceUrl || "").trim();
    if (raw.startsWith("upload://")) {
      throw new Error("Local upload belum didukung dari browser. Gunakan YouTube URL dulu.");
    }

    const localPath = raw.startsWith("file://")
      ? decodeURIComponent(raw.replace("file://", ""))
      : raw;
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local source tidak ditemukan: ${localPath}`);
    }

    return {
      path: localPath,
      sourceLabel: path.basename(localPath),
      title: path.basename(localPath, path.extname(localPath))
    };
  }

  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    throw new Error("FFmpeg tidak ditemukan. Set FFMPEG_PATH atau install ffmpeg.");
  }

  const runners = await resolveYtdlpRunners();
  if (runners.length === 0) {
    throw new Error("yt-dlp tidak tersedia. Set YTDLP_PATH atau install yt-dlp.");
  }

  const sourceDir = path.join(workerDataDir, job.id, "source");
  await fsp.mkdir(sourceDir, { recursive: true });
  const outputTemplate = path.join(sourceDir, "source.%(ext)s");
  const ffmpegDir = ffmpegPath.includes(path.sep) ? path.dirname(ffmpegPath) : null;
  const url = String(payload.sourceUrl || "").trim();

  let lastFailure = "Unknown yt-dlp error";

  for (const runner of runners) {
    updateJob(job, {
      status: "running",
      phase: "fetch-source",
      progress: 14,
      message: `Downloading source via ${runner.label}`
    });

    const args = [
      ...runner.prefixArgs,
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "-f",
      "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--merge-output-format",
      "mp4",
      "-o",
      outputTemplate
    ];

    if (ffmpegDir) {
      args.push("--ffmpeg-location", ffmpegDir);
    }

    args.push(url);

    try {
      const result = await runProcess(runner.command, args, {
        timeoutMs: 15 * 60 * 1000,
        onStdout: (line) => {
          const match = line.match(/(\d+(?:\.\d+)?)%/);
          if (!match) return;
          const percent = Number.parseFloat(match[1]) || 0;
          updateJob(job, {
            status: "running",
            phase: "fetch-source",
            progress: Math.max(14, Math.min(35, Math.round(14 + percent * 0.21))),
            message: `Downloading source ${Math.round(percent)}%`
          });
        }
      });

      if (result.code !== 0) {
        lastFailure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
        continue;
      }

      const entries = await fsp.readdir(sourceDir);
      const videoFiles = entries
        .filter((name) => name.toLowerCase().endsWith(".mp4"))
        .map((name) => path.join(sourceDir, name));
      if (videoFiles.length === 0) {
        lastFailure = "yt-dlp selesai tapi file mp4 tidak ditemukan";
        continue;
      }

      const sortedFiles = videoFiles.sort((a, b) => {
        const statA = fs.statSync(a).mtimeMs;
        const statB = fs.statSync(b).mtimeMs;
        return statB - statA;
      });
      const finalPath = sortedFiles[0];
      const title = path.basename(finalPath, path.extname(finalPath));

      return {
        path: finalPath,
        sourceLabel: (() => {
          try {
            const parsed = new URL(url);
            return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`;
          } catch {
            return "youtube";
          }
        })(),
        title
      };
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "yt-dlp run failed";
    }
  }

  throw new Error(`Gagal download YouTube source: ${lastFailure}`);
}
async function processAnalyzeJob(job) {
  try {
    const ffprobePath = resolveFfprobePath();
    if (!ffprobePath) {
      throw new Error("ffprobe tidak ditemukan. Set FFPROBE_PATH atau install ffprobe.");
    }

    updateJob(job, {
      status: "running",
      phase: "fetch-source",
      progress: 8,
      message: "Preparing source"
    });

    const source = await resolveAnalyzeSource(job, job.payload);

    updateJob(job, {
      status: "running",
      phase: "transcript",
      progress: 45,
      message: "Inspecting source metadata"
    });

    const durationSec = await probeDurationSec(ffprobePath, source.path);

    updateJob(job, {
      status: "running",
      phase: "analysis",
      progress: 72,
      message: "Building clip candidates"
    });

    const clips = makeAnalyzeClipCandidates(
      durationSec,
      job.payload.clipCount,
      source.sourceLabel
    );

    job.runtime = {
      sourcePath: source.path,
      sourceLabel: source.sourceLabel,
      sourceTitle: source.title,
      durationSec
    };

    updateJob(job, {
      status: "completed",
      phase: "completed",
      progress: 100,
      message: `Analyze completed: ${clips.length} clip candidate(s)`,
      artifacts: [
        { kind: "source", label: path.basename(source.path) },
        { kind: "transcript", label: `${job.payload.transcriptMode}-ready` },
        { kind: "plan", label: `${clips.length}-clips` }
      ],
      result: {
        source: {
          path: source.path,
          title: source.title,
          durationSec: Number(durationSec.toFixed(2))
        },
        clips
      }
    });
  } catch (error) {
    updateJob(job, {
      status: "failed",
      phase: "failed",
      progress: 100,
      message: error instanceof Error ? error.message : "Analyze failed"
    });
  }
}

async function renderClipToMp4({
  ffmpegPath,
  sourcePath,
  targetPath,
  startSec,
  endSec,
  width,
  height,
  onProgress
}) {
  const duration = Math.max(1, endSec - startSec);
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
  const args = [
    "-y",
    "-ss",
    startSec.toFixed(3),
    "-to",
    endSec.toFixed(3),
    "-i",
    sourcePath,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    targetPath
  ];

  const result = await runProcess(ffmpegPath, args, {
    timeoutMs: 15 * 60 * 1000,
    onStderr: (line) => {
      const match = line.match(/time=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
      if (!match) return;
      const currentSec = parseTimecodeToSeconds(match[1]);
      const progress = Math.max(0, Math.min(100, Math.round((currentSec / duration) * 100)));
      onProgress?.(progress);
    }
  });

  if (result.code !== 0) {
    const reason = (result.stderr || result.stdout || `ffmpeg exited ${result.code}`).trim();
    throw new Error(`Render failed: ${reason}`);
  }
}

async function processRenderJob(job) {
  try {
    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) {
      throw new Error("FFmpeg tidak ditemukan. Set FFMPEG_PATH atau install ffmpeg.");
    }

    updateJob(job, {
      status: "running",
      phase: "render-plan",
      progress: 10,
      message: "Preparing render plan"
    });

    if (!job.payload.sourceJobId) {
      throw new Error("sourceJobId wajib diisi untuk render job");
    }

    const sourceJob = jobs.get(job.payload.sourceJobId);
    if (!sourceJob || sourceJob.kind !== "analyze") {
      throw new Error("sourceJobId tidak valid");
    }
    if (sourceJob.status !== "completed") {
      throw new Error("Analyze job belum selesai");
    }
    if (!sourceJob.runtime?.sourcePath || !fs.existsSync(sourceJob.runtime.sourcePath)) {
      throw new Error("Source file tidak ditemukan. Jalankan analyze ulang.");
    }

    const allClips = Array.isArray(sourceJob.result?.clips) ? sourceJob.result.clips : [];
    const selected = job.payload.clipIds
      .map((clipId) => allClips.find((clip) => clip.id === clipId))
      .filter(Boolean);

    if (selected.length === 0) {
      throw new Error("clipIds tidak ditemukan di hasil analyze");
    }

    const renderDir = path.join(workerDataDir, job.id, "renders");
    await fsp.mkdir(renderDir, { recursive: true });

    const { width, height } = parseResolution(job.payload.resolution);
    const artifacts = [{ kind: "plan", label: `${selected.length}-render-batch` }];
    const renders = [];

    for (let index = 0; index < selected.length; index += 1) {
      const clip = selected[index];
      const safeName = sanitizeFileName(clip.title || clip.id, `clip-${index + 1}`);
      const fileName = `${String(index + 1).padStart(2, "0")}-${safeName}.mp4`;
      const outputPath = path.join(renderDir, fileName);
      const startSec = Number(clip.startSec) || 0;
      const endSec = Number(clip.endSec) || Math.max(startSec + 1, startSec + 12);
      const baseProgress = 12 + Math.round((index / selected.length) * 82);

      updateJob(job, {
        status: "running",
        phase: "rendering",
        progress: baseProgress,
        message: `Rendering ${index + 1}/${selected.length}: ${clip.title}`
      });

      await renderClipToMp4({
        ffmpegPath,
        sourcePath: sourceJob.runtime.sourcePath,
        targetPath: outputPath,
        startSec,
        endSec,
        width,
        height,
        onProgress: (localProgress) => {
          const span = Math.round(82 / selected.length);
          const progress = Math.min(
            96,
            baseProgress + Math.round((localProgress / 100) * Math.max(6, span))
          );
          updateJob(job, {
            status: "running",
            phase: "rendering",
            progress,
            message: `Rendering ${index + 1}/${selected.length}: ${clip.title}`
          });
        }
      });

      const downloadUrl = artifactUrl(job.origin, job.id, fileName);
      artifacts.push({
        kind: "render",
        label: clip.id,
        clipId: clip.id,
        url: downloadUrl
      });
      renders.push({
        clipId: clip.id,
        fileName,
        url: downloadUrl,
        status: "ready"
      });
    }

    updateJob(job, {
      status: "completed",
      phase: "completed",
      progress: 100,
      message: `Render completed: ${renders.length} MP4 file(s)`,
      artifacts,
      result: {
        renders
      }
    });
  } catch (error) {
    updateJob(job, {
      status: "failed",
      phase: "failed",
      progress: 100,
      message: error instanceof Error ? error.message : "Render failed"
    });
  }
}
function createJob(kind, payload, origin) {
  const now = nowIso();
  const job = {
    id: `job_${randomUUID().slice(0, 8)}`,
    kind,
    status: "queued",
    phase: "queued",
    progress: 0,
    message: "Queued",
    submittedAt: now,
    updatedAt: now,
    payload,
    artifacts: [],
    result: {},
    runtime: {},
    origin
  };

  jobs.set(job.id, job);

  if (kind === "analyze") {
    processAnalyzeJob(job);
  } else {
    processRenderJob(job);
  }

  return toPublicJob(job);
}

function parseArtifactPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "artifacts") return null;
  const jobId = decodeURIComponent(parts[1] || "");
  const fileName = decodeURIComponent(parts.slice(2).join("/") || "");
  if (!jobId || !fileName || fileName.includes("..")) return null;
  return { jobId, fileName };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (!isPublicRoute(request.method, url.pathname) && !enforceToken(request)) {
    sendJson(response, 401, { ok: false, error: "Invalid worker token" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "clipper-worker",
      version: "0.3.0-live",
      mockMode: false,
      tooling: {
        ffmpeg: Boolean(resolveFfmpegPath()),
        ffprobe: Boolean(resolveFfprobePath())
      },
      routes: {
        analyze: "/jobs/analyze",
        render: "/jobs/render",
        status: "/jobs/:id",
        artifacts: "/artifacts/:jobId/:fileName"
      }
    });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/artifacts/")) {
    const parsed = parseArtifactPath(url.pathname);
    if (!parsed) {
      sendJson(response, 404, { ok: false, error: "Artifact not found" });
      return;
    }

    const filePath = path.join(workerDataDir, parsed.jobId, "renders", parsed.fileName);
    if (!fs.existsSync(filePath)) {
      sendJson(response, 404, { ok: false, error: "Artifact file not found" });
      return;
    }

    sendFile(response, filePath);
    return;
  }

  if (
    request.method === "POST" &&
    (url.pathname === "/jobs" || url.pathname === "/jobs/analyze")
  ) {
    try {
      const payload = normalizeAnalyzePayload(await parseJsonBody(request));
      sendJson(response, 201, createJob("analyze", payload, getRequestOrigin(request)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      sendJson(response, 400, { ok: false, error: message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/jobs/render") {
    try {
      const payload = normalizeRenderPayload(await parseJsonBody(request));
      sendJson(response, 201, createJob("render", payload, getRequestOrigin(request)));
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

    sendJson(response, 200, toPublicJob(job));
    return;
  }

  sendJson(response, 404, { ok: false, error: "Route not found" });
});

async function bootstrap() {
  await fsp.mkdir(workerDataDir, { recursive: true });
  server.listen(port, () => {
    console.log(`[clipper-worker] listening on http://localhost:${port}`);
    console.log(`[clipper-worker] data dir: ${workerDataDir}`);
  });
}

bootstrap().catch((error) => {
  console.error("[clipper-worker] failed to start:", error);
  process.exit(1);
});
