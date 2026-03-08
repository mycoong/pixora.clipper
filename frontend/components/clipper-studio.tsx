"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  browserProfileOptions,
  buildCreateJobInputFromWorkspace,
  createMockClipCandidates,
  createRenderQueueFromSelection,
  defaultClipperWorkspaceState,
  framingModeOptions,
  getSourceDisplayName,
  outputModeOptions,
  resolutionOptions,
  transcriptModeOptions,
  type ClipperApiSettings,
  type ClipperFramingSettings,
  type ClipperGamingSettings,
  type ClipperOutputSettings,
  type ClipperRenderedClip,
  type ClipperSourceSettings,
  type ClipperWorkspaceState
} from "@/lib/clipper-workspace";
import type {
  ClipperJobPhase,
  ClipperJobStatus,
  CreateClipperRenderJobInput,
  WorkerHealth
} from "@/types/clipper";

type Props = {
  workerConfigured: boolean;
  workerHealth: WorkerHealth | null;
};

type KeyGroup = "geminiKeys" | "groqKeys";

type KeyDrafts = Record<KeyGroup, string>;

const providerLabel = {
  gemini: "Gemini",
  groq: "Groq"
} as const;

const apiStorageKey = "pixora.clipper.api-settings.v1";

const phaseLabel: Record<ClipperJobPhase, string> = {
  queued: "Queued",
  "fetch-source": "Fetch source",
  transcript: "Transcript",
  analysis: "Analyze",
  "render-plan": "Render plan",
  rendering: "Rendering",
  completed: "Completed",
  failed: "Failed"
};

function countFilled(values: string[]) {
  return values.filter((value) => value.trim()).length;
}

function normalizeStoredKeys(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function readStoredApiSettings(): Partial<ClipperApiSettings> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(apiStorageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ClipperApiSettings> | null;
    if (!parsed || typeof parsed !== "object") return null;

    return {
      activeProvider: parsed.activeProvider === "groq" ? "groq" : "gemini",
      geminiKeys: normalizeStoredKeys(parsed.geminiKeys),
      groqKeys: normalizeStoredKeys(parsed.groqKeys),
      supadataApiKey: String(parsed.supadataApiKey || "").trim(),
      microsoftTtsKey: String(parsed.microsoftTtsKey || "").trim(),
      microsoftTtsRegion: String(parsed.microsoftTtsRegion || "").trim(),
      microsoftTtsVoice: String(parsed.microsoftTtsVoice || "").trim()
    };
  } catch {
    return null;
  }
}

function writeStoredApiSettings(value: ClipperApiSettings) {
  if (typeof window === "undefined") return;

  const payload: ClipperApiSettings = {
    activeProvider: value.activeProvider,
    geminiKeys: normalizeStoredKeys(value.geminiKeys),
    groqKeys: normalizeStoredKeys(value.groqKeys),
    supadataApiKey: value.supadataApiKey.trim(),
    microsoftTtsKey: value.microsoftTtsKey.trim(),
    microsoftTtsRegion: value.microsoftTtsRegion.trim(),
    microsoftTtsVoice: value.microsoftTtsVoice.trim()
  };

  window.localStorage.setItem(apiStorageKey, JSON.stringify(payload));
}

function maskKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "********";
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}${"*".repeat(Math.max(6, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

function toDownloadName(value: string) {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "pixora-output";
}

function createLocalAnalyzePreviewJob(
  payload: ReturnType<typeof buildCreateJobInputFromWorkspace>
): ClipperJobStatus {
  const now = new Date().toISOString();
  return {
    id: `preview_${Date.now().toString(36)}`,
    kind: "analyze",
    status: "queued",
    phase: "queued",
    progress: 0,
    message: "Demo analyze dimulai.",
    submittedAt: now,
    updatedAt: now,
    payload,
    artifacts: []
  };
}

function createLocalRenderPreviewJob(
  payload: CreateClipperRenderJobInput
): ClipperJobStatus {
  const now = new Date().toISOString();
  return {
    id: `render_${Date.now().toString(36)}`,
    kind: "render",
    status: "queued",
    phase: "queued",
    progress: 0,
    message: "Demo render dimulai.",
    submittedAt: now,
    updatedAt: now,
    payload,
    artifacts: []
  };
}

function deriveLocalPreviewJobState(job: ClipperJobStatus): ClipperJobStatus {
  const startedAt = new Date(job.submittedAt).getTime();
  const elapsedMs = Math.max(0, Date.now() - startedAt);

  const timeline =
    job.kind === "render"
      ? [
          { until: 700, status: "queued" as const, phase: "queued" as const, progress: 8, message: "Render masuk ke queue demo." },
          { until: 2200, status: "running" as const, phase: "render-plan" as const, progress: 38, message: "Menyusun render plan." },
          { until: 4200, status: "running" as const, phase: "rendering" as const, progress: 74, message: "Menyusun output demo." },
          { until: 5600, status: "running" as const, phase: "rendering" as const, progress: 94, message: "Finalisasi file download." }
        ]
      : [
          { until: 700, status: "queued" as const, phase: "queued" as const, progress: 6, message: "Analyze masuk ke queue demo." },
          { until: 1800, status: "running" as const, phase: "fetch-source" as const, progress: 24, message: "Mengecek source." },
          { until: 3200, status: "running" as const, phase: "transcript" as const, progress: 51, message: "Menyusun transcript." },
          { until: 4700, status: "running" as const, phase: "analysis" as const, progress: 79, message: "Memilih kandidat clip." },
          { until: 5900, status: "running" as const, phase: "render-plan" as const, progress: 95, message: "Menyiapkan hasil analyze." }
        ];

  const current = timeline.find((item) => elapsedMs < item.until);
  if (current) {
    return {
      ...job,
      status: current.status,
      phase: current.phase,
      progress: current.progress,
      message: current.message,
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
        ? "Render demo selesai. File manifest siap di-download."
        : "Analyze demo selesai. Pilih clip lalu generate.",
    updatedAt: new Date().toISOString(),
    artifacts:
      job.kind === "render"
        ? (job.payload as CreateClipperRenderJobInput).clipIds.map((clipId: string, index: number) => ({
            kind: "render",
            label: `render-${index + 1}-${clipId}`
          }))
        : [{ kind: "plan", label: "local-preview-plan" }]
  };
}

function Drawer({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="drawer-layer is-open" aria-hidden={false}>
      <button className="drawer-backdrop" type="button" onClick={onClose} />
      <aside className="drawer-panel" role="dialog" aria-label={title}>
        <div className="drawer-head">
          <div>
            <span className="drawer-kicker">PIXORA</span>
            <h2>{title}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

function Toggle({
  checked,
  label,
  onToggle
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      className={`toggle-row${checked ? " is-on" : ""}`}
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
    >
      <span>{label}</span>
      <strong>{checked ? "On" : "Off"}</strong>
    </button>
  );
}

export function ClipperStudio({ workerConfigured, workerHealth }: Props) {
  const [workspace, setWorkspace] = useState<ClipperWorkspaceState>(
    defaultClipperWorkspaceState
  );
  const [job, setJob] = useState<ClipperJobStatus | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiDrawerOpen, setApiDrawerOpen] = useState(false);
  const [apiStorageReady, setApiStorageReady] = useState(false);
  const [keyDrafts, setKeyDrafts] = useState<KeyDrafts>({
    geminiKeys: "",
    groqKeys: ""
  });

  useEffect(() => {
    const stored = readStoredApiSettings();
    if (stored) {
      setWorkspace((current) => ({
        ...current,
        api: {
          ...current.api,
          ...stored
        }
      }));
    }
    setApiStorageReady(true);
  }, []);

  useEffect(() => {
    if (!apiStorageReady) return;
    writeStoredApiSettings(workspace.api);
  }, [apiStorageReady, workspace.api]);

  useEffect(() => {
    if (!workerConfigured || !job) return;
    if (job.status === "completed" || job.status === "failed") return;

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
      if (!response.ok) return;
      setJob((await response.json()) as ClipperJobStatus);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [job, workerConfigured]);

  useEffect(() => {
    if (workerConfigured || !job) return;
    if (job.status === "completed" || job.status === "failed") return;

    const timer = window.setInterval(() => {
      setJob((current) => {
        if (!current) return current;
        return deriveLocalPreviewJobState(current);
      });
    }, 250);

    return () => window.clearInterval(timer);
  }, [job, workerConfigured]);

  useEffect(() => {
    if (!job) return;
    if (job.status === "completed" || job.status === "failed") {
      setSubmitting(false);
    }
  }, [job]);

  useEffect(() => {
    if (!job || job.kind !== "render") return;

    setWorkspace((current) => ({
      ...current,
      renderedClips: current.renderedClips.map((entry) => ({
        ...entry,
        status: job.status === "completed" ? "ready" : "queued"
      }))
    }));
  }, [job]);

  const mergeSource = (patch: Partial<ClipperSourceSettings>) =>
    setWorkspace((current) => ({ ...current, source: { ...current.source, ...patch } }));
  const mergeApi = (patch: Partial<ClipperApiSettings>) =>
    setWorkspace((current) => ({ ...current, api: { ...current.api, ...patch } }));
  const mergeFraming = (patch: Partial<ClipperFramingSettings>) =>
    setWorkspace((current) => ({ ...current, framing: { ...current.framing, ...patch } }));
  const mergeOutput = (patch: Partial<ClipperOutputSettings>) =>
    setWorkspace((current) => ({ ...current, output: { ...current.output, ...patch } }));
  const mergeGaming = (patch: Partial<ClipperGamingSettings>) =>
    setWorkspace((current) => ({ ...current, gaming: { ...current.gaming, ...patch } }));

  const sourceReady =
    workspace.source.inputMode === "youtube"
      ? workspace.source.youtubeUrl.trim().length > 0
      : workspace.source.localVideoName.trim().length > 0;

  const sourceLabel = getSourceDisplayName(workspace);
  const progressValue = job?.progress ?? 0;
  const allClipIds = useMemo(
    () => workspace.analyzedClips.map((clip) => clip.id),
    [workspace.analyzedClips]
  );
  const allClipsSelected =
    allClipIds.length > 0 &&
    allClipIds.every((clipId) => workspace.selectedClipIds.includes(clipId));
  const readyRenderCount = workspace.renderedClips.filter(
    (item) => item.status === "ready"
  ).length;

  function updateKeyDraft(group: KeyGroup, value: string) {
    setKeyDrafts((current) => ({ ...current, [group]: value }));
  }

  function addKey(group: KeyGroup) {
    const value = keyDrafts[group].trim();
    if (!value) return;
    mergeApi({ [group]: [...workspace.api[group], value] } as Partial<ClipperApiSettings>);
    setKeyDrafts((current) => ({ ...current, [group]: "" }));
  }

  function removeKey(group: KeyGroup, index: number) {
    mergeApi({
      [group]: workspace.api[group].filter((_, itemIndex) => itemIndex !== index)
    } as Partial<ClipperApiSettings>);
  }

  async function handleAnalyze() {
    setError("");
    if (!sourceReady) {
      setError("Isi YouTube URL atau pilih video lokal dulu.");
      return;
    }

    const payload = buildCreateJobInputFromWorkspace(workspace);
    setSubmitting(true);

    try {
      if (!workerConfigured) {
        setJob(createLocalAnalyzePreviewJob(payload));
        setWorkspace((current) => ({
          ...current,
          analyzedClips: createMockClipCandidates(current),
          selectedClipIds: [],
          renderedClips: []
        }));
        return;
      }

      const response = await fetch("/api/jobs/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await response.json()) as ClipperJobStatus | { error?: string };
      if (!response.ok || !("id" in json)) {
        throw new Error(("error" in json && json.error) || "Worker unavailable");
      }

      setJob(json);
      setWorkspace((current) => ({
        ...current,
        analyzedClips: createMockClipCandidates(current),
        selectedClipIds: [],
        renderedClips: []
      }));
    } catch (caughtError) {
      setSubmitting(false);
      setError(caughtError instanceof Error ? caughtError.message : "Analyze failed");
    }
  }

  async function handleGenerate() {
    if (workspace.selectedClipIds.length === 0) {
      setError("Pilih clip dulu sebelum generate.");
      return;
    }

    setError("");
    setSubmitting(true);
    const queuedClips: ClipperRenderedClip[] = createRenderQueueFromSelection(
      workspace
    ).map((entry) => ({
      ...entry,
      status: "queued"
    }));

    setWorkspace((current) => ({
      ...current,
      renderedClips: queuedClips
    }));

    const payload: CreateClipperRenderJobInput = {
      sourceJobId: job?.kind === "analyze" ? job.id : undefined,
      clipIds: workspace.selectedClipIds,
      outputMode: workspace.framing.outputMode,
      resolution: workspace.output.resolution,
      titleVoEnabled: workspace.output.titleVoEnabled,
      gamingEnabled: workspace.gaming.enabled,
      notes: workspace.source.notes.trim() || undefined
    };

    try {
      if (!workerConfigured) {
        setJob(createLocalRenderPreviewJob(payload));
        return;
      }

      const response = await fetch("/api/jobs/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await response.json()) as ClipperJobStatus | { error?: string };
      if (!response.ok || !("id" in json)) {
        throw new Error(("error" in json && json.error) || "Render worker unavailable");
      }
      setJob(json);
    } catch (caughtError) {
      setSubmitting(false);
      setError(caughtError instanceof Error ? caughtError.message : "Generate failed");
    }
  }

  function toggleClip(clipId: string) {
    setWorkspace((current) => ({
      ...current,
      selectedClipIds: current.selectedClipIds.includes(clipId)
        ? current.selectedClipIds.filter((id) => id !== clipId)
        : [...current.selectedClipIds, clipId]
    }));
  }

  function toggleSelectAllClips() {
    setWorkspace((current) => ({
      ...current,
      selectedClipIds:
        current.analyzedClips.length > 0 &&
        current.analyzedClips.every((clip) => current.selectedClipIds.includes(clip.id))
          ? []
          : current.analyzedClips.map((clip) => clip.id)
    }));
  }

  function downloadTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  }

  function handleDownloadClip(item: ClipperRenderedClip) {
    const payload = {
      app: "PIXORA Clipper Web",
      mode: workerConfigured
        ? workerHealth?.mockMode
          ? "mock-worker"
          : "live-worker"
        : "demo",
      source: {
        inputMode: workspace.source.inputMode,
        sourceLabel,
        youtubeUrl: workspace.source.youtubeUrl || undefined,
        localVideoName: workspace.source.localVideoName || undefined
      },
      render: {
        title: item.title,
        duration: item.durationLabel,
        preset: item.presetLabel,
        status: item.status
      },
      generatedAt: new Date().toISOString()
    };

    downloadTextFile(
      `${toDownloadName(item.title)}.json`,
      JSON.stringify(payload, null, 2)
    );
  }

  function handleDownloadAll() {
    const payload = {
      app: "PIXORA Clipper Web",
      mode: workerConfigured
        ? workerHealth?.mockMode
          ? "mock-worker"
          : "live-worker"
        : "demo",
      source: {
        inputMode: workspace.source.inputMode,
        sourceLabel
      },
      clips: workspace.renderedClips,
      generatedAt: new Date().toISOString()
    };

    downloadTextFile(
      `pixora-render-batch-${Date.now()}.json`,
      JSON.stringify(payload, null, 2)
    );
  }

  function resetWorkspace() {
    setWorkspace(defaultClipperWorkspaceState);
    setJob(null);
    setError("");
    setSubmitting(false);
    setKeyDrafts({
      geminiKeys: "",
      groqKeys: ""
    });
  }

  return (
    <>
      <section className="lite-shell">
        <header className="lite-header">
          <div>
            <span className="eyebrow">PIXORA CLIPPER WEB</span>
            <h1>Simple Source Runner</h1>
            <p>Masukkan link YouTube atau file lokal. Fokus hanya source, hasil analyze, dan output download.</p>
          </div>
          <div className="header-tools">
            <span className="meta-chip">
              {workerConfigured
                ? workerHealth?.mockMode
                  ? "mode: mock worker"
                  : "mode: live worker"
                : "mode: demo"}
            </span>
            <span className="meta-chip">{`provider: ${providerLabel[workspace.api.activeProvider].toLowerCase()}`}</span>
            <button className="ghost-button" type="button" onClick={() => setApiDrawerOpen(true)}>
              Setting API Key
            </button>
          </div>
        </header>

        <div className="lite-grid">
          <section className="lite-card form-card">
            <div className="card-head">
              <div>
                <span className="eyebrow">Source</span>
                <h2>{"\u{1F3AC} Input"}</h2>
              </div>
            </div>

            <div className="mode-toggle">
              <button
                className={workspace.source.inputMode === "youtube" ? "is-active" : ""}
                type="button"
                onClick={() => mergeSource({ inputMode: "youtube" })}
              >
                YouTube Link
              </button>
              <button
                className={workspace.source.inputMode === "upload" ? "is-active" : ""}
                type="button"
                onClick={() => mergeSource({ inputMode: "upload" })}
              >
                Local Source
              </button>
            </div>

            {workspace.source.inputMode === "youtube" ? (
              <label className="field-block">
                <span>YOUTUBE URL</span>
                <input
                  value={workspace.source.youtubeUrl}
                  onChange={(event) => mergeSource({ youtubeUrl: event.target.value })}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </label>
            ) : (
              <label className="field-block">
                <span>LOCAL VIDEO</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(event) =>
                    mergeSource({
                      localVideoName: event.target.files?.[0]?.name || ""
                    })
                  }
                />
              </label>
            )}

            <div className="field-block">
              <span>CURRENT SOURCE</span>
              <div className="value-box">{sourceLabel}</div>
            </div>

            <div className="drawer-grid compact-grid">
              <label className="field-block">
                <span>TRANSCRIPT</span>
                <select
                  value={workspace.source.transcriptMode}
                  onChange={(event) =>
                    mergeSource({
                      transcriptMode: event.target.value as ClipperSourceSettings["transcriptMode"]
                    })
                  }
                >
                  {transcriptModeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>SUBTITLE FILE</span>
                <input
                  type="file"
                  accept=".srt,.vtt,.txt"
                  onChange={(event) =>
                    mergeSource({
                      subtitleFileName: event.target.files?.[0]?.name || ""
                    })
                  }
                />
              </label>
            </div>

            <div className="field-block">
              <span>COOKIE ACCESS</span>
              <div className="mode-toggle three-up compact-toggle">
                <button
                  className={workspace.source.cookieAccess === "none" ? "is-active" : ""}
                  type="button"
                  onClick={() => mergeSource({ cookieAccess: "none" })}
                >
                  None
                </button>
                <button
                  className={workspace.source.cookieAccess === "browser" ? "is-active" : ""}
                  type="button"
                  onClick={() => mergeSource({ cookieAccess: "browser" })}
                >
                  Browser
                </button>
                <button
                  className={workspace.source.cookieAccess === "file" ? "is-active" : ""}
                  type="button"
                  onClick={() => mergeSource({ cookieAccess: "file" })}
                >
                  cookies.txt
                </button>
              </div>
            </div>

            {workspace.source.cookieAccess !== "none" ? (
              <div className="drawer-grid compact-grid">
                <label className="field-block">
                  <span>BROWSER</span>
                  <select
                    value={workspace.source.browserProfile}
                    onChange={(event) =>
                      mergeSource({
                        browserProfile: event.target.value as ClipperSourceSettings["browserProfile"]
                      })
                    }
                  >
                    {browserProfileOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                {workspace.source.cookieAccess === "file" ? (
                  <label className="field-block">
                    <span>COOKIES FILE</span>
                    <input
                      type="file"
                      accept=".txt"
                      onChange={(event) =>
                        mergeSource({
                          cookiesFileName: event.target.files?.[0]?.name || ""
                        })
                      }
                    />
                  </label>
                ) : (
                  <div className="field-block">
                    <span>INFO</span>
                    <div className="value-box">Pakai cookie browser aktif.</div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="drawer-grid compact-grid">
              <label className="field-block">
                <span>TARGET CLIPS</span>
                <input
                  inputMode="numeric"
                  value={String(workspace.source.clipCount)}
                  onChange={(event) =>
                    mergeSource({
                      clipCount: Math.max(
                        3,
                        Math.min(
                          10,
                          Number.parseInt(event.target.value || "10", 10) || 10
                        )
                      )
                    })
                  }
                />
              </label>

              <label className="field-block">
                <span>FRAME MODE</span>
                <select
                  value={workspace.framing.framingMode}
                  onChange={(event) =>
                    mergeFraming({
                      framingMode: event.target.value as ClipperFramingSettings["framingMode"]
                    })
                  }
                >
                  {framingModeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="drawer-grid compact-grid">
              <label className="field-block">
                <span>OUTPUT MODE</span>
                <select
                  value={workspace.framing.outputMode}
                  onChange={(event) =>
                    mergeFraming({
                      outputMode: event.target.value as ClipperWorkspaceState["framing"]["outputMode"]
                    })
                  }
                >
                  {outputModeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>RESOLUTION</span>
                <select
                  value={workspace.output.resolution}
                  onChange={(event) =>
                    mergeOutput({
                      resolution: event.target.value as ClipperOutputSettings["resolution"]
                    })
                  }
                >
                  {resolutionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="drawer-grid compact-grid">
              <Toggle
                checked={workspace.output.titleVoEnabled}
                label="Title VO"
                onToggle={() => mergeOutput({ titleVoEnabled: !workspace.output.titleVoEnabled })}
              />

              <Toggle
                checked={workspace.gaming.enabled}
                label="Gaming Layout"
                onToggle={() => mergeGaming({ enabled: !workspace.gaming.enabled })}
              />
            </div>

            <label className="field-block">
              <span>NOTES</span>
              <textarea
                value={workspace.source.notes}
                onChange={(event) => mergeSource({ notes: event.target.value })}
                placeholder="Optional notes untuk analyze atau render."
              />
            </label>

            <div className="button-row">
              <button className="primary-button" type="button" disabled={submitting} onClick={handleAnalyze}>
                {submitting && job?.kind === "analyze" ? "Running..." : "Analyze"}
              </button>
              <button className="ghost-button" type="button" onClick={resetWorkspace}>
                Reset
              </button>
            </div>
          </section>

          <section className="lite-card status-card">
            <div className="card-head">
              <div>
                <span className="eyebrow">Status</span>
                <h2>Session</h2>
              </div>
            </div>

            <div className="stats-list">
              <div className="stat-row">
                <span>Worker</span>
                <strong>
                  {workerConfigured
                    ? workerHealth?.mockMode
                      ? "Mock"
                      : "Live"
                    : "Demo"}
                </strong>
              </div>
              <div className="stat-row">
                <span>Status</span>
                <strong>{job?.status || "waiting input"}</strong>
              </div>
              <div className="stat-row">
                <span>Selected clips</span>
                <strong>{workspace.selectedClipIds.length}</strong>
              </div>
            </div>

            <div className="progress-stack">
              <div className="progress-copy">
                <span>{job ? phaseLabel[job.phase] : "Idle"}</span>
                <strong>{progressValue}%</strong>
              </div>
              <div className="progress-track" aria-hidden="true">
                <div className="progress-fill" style={{ width: `${progressValue}%` }} />
              </div>
              <div className="progress-note">
                {job?.message || "Belum ada job. Masukkan source lalu klik Analyze."}
              </div>
            </div>
          </section>
        </div>

        <section className="lite-card results-card">
          <div className="results-head">
            <div>
              <span className="eyebrow">Results</span>
              <h2>Detected Clips</h2>
            </div>
            <div className="results-actions">
              <span className="meta-chip">{workspace.selectedClipIds.length} selected</span>
              <button
                className="ghost-button"
                type="button"
                disabled={workspace.analyzedClips.length === 0}
                onClick={toggleSelectAllClips}
              >
                {allClipsSelected ? "Clear all" : "Select all"}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={submitting || workspace.selectedClipIds.length === 0}
                onClick={handleGenerate}
              >
                {submitting && job?.kind === "render" ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>

          {workspace.analyzedClips.length === 0 ? (
            <div className="empty-box">
              <strong>No clips yet</strong>
              <span>Analyze source dulu. Hasil clip akan tampil di sini.</span>
            </div>
          ) : (
            <div className="clip-list">
              {workspace.analyzedClips.map((clip) => (
                <button
                  key={clip.id}
                  className={`clip-row${workspace.selectedClipIds.includes(clip.id) ? " is-selected" : ""}`}
                  type="button"
                  onClick={() => toggleClip(clip.id)}
                >
                  <div className="clip-main">
                    <strong>{clip.title}</strong>
                    <span>{clip.hook}</span>
                  </div>
                  <div className="clip-meta">
                    <span>{clip.rangeLabel}</span>
                    <strong>{clip.score}</strong>
                  </div>
                </button>
              ))}
            </div>
          )}

          {workspace.renderedClips.length > 0 ? (
            <div className="queue-block">
              <div className="results-head">
                <div>
                  <span className="eyebrow">Queue</span>
                  <h2>Rendered Output</h2>
                </div>
                <div className="results-actions">
                  <span className="meta-chip">{readyRenderCount} ready</span>
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={readyRenderCount === 0}
                    onClick={handleDownloadAll}
                  >
                    Download all
                  </button>
                </div>
              </div>
              <div className="queue-list">
                {workspace.renderedClips.map((item) => (
                  <div key={item.id} className="queue-row">
                    <div>
                      <strong>{item.title}</strong>
                      <span>{`${item.durationLabel} · ${item.presetLabel}`}</span>
                    </div>
                    <div className="queue-actions">
                      <em>{item.status}</em>
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={item.status !== "ready"}
                        onClick={() => handleDownloadClip(item)}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {job?.kind === "render" && readyRenderCount === 0 ? (
            <div className="message-box">
              Render masih berjalan. Tombol download akan aktif setelah status menjadi ready.
            </div>
          ) : null}
        </section>

        {error ? <div className="error-banner">{error}</div> : null}
      </section>

      <Drawer
        open={apiDrawerOpen}
        title="Setting API Key"
        onClose={() => setApiDrawerOpen(false)}
      >
        <div className="drawer-stack">
          <div className="mode-toggle compact-toggle">
            {(["gemini", "groq"] as const).map((provider) => (
              <button
                key={provider}
                className={workspace.api.activeProvider === provider ? "is-active" : ""}
                type="button"
                onClick={() => mergeApi({ activeProvider: provider })}
              >
                {providerLabel[provider]}
              </button>
            ))}
          </div>

          <div className="drawer-grid compact-grid">
            <div className="value-box">
              Gemini keys: <strong>{countFilled(workspace.api.geminiKeys)}</strong>
            </div>
            <div className="value-box">
              Groq keys: <strong>{countFilled(workspace.api.groqKeys)}</strong>
            </div>
          </div>

          {(["geminiKeys", "groqKeys"] as const).map((group) => (
            <div key={group} className="drawer-group">
              <div className="group-head">
                <strong>{group === "geminiKeys" ? "Gemini Key" : "Groq Key"}</strong>
                <button className="ghost-button" type="button" onClick={() => addKey(group)}>
                  Add
                </button>
              </div>
              <div className="drawer-list">
                {workspace.api[group].length === 0 ? (
                  <div className="empty-box">Belum ada key tersimpan.</div>
                ) : null}
                {workspace.api[group].map((value, index) => (
                  <div key={`${group}-${index}`} className="key-row">
                    <div className="masked-key" title={`Key ${index + 1}`}>
                      {maskKey(value)}
                    </div>
                    <button
                      className="icon-button danger-button"
                      type="button"
                      onClick={() => removeKey(group, index)}
                      aria-label={`Delete ${group} key ${index + 1}`}
                      title="Delete key"
                    >
                      {"\u{1F5D1}\uFE0F"}
                    </button>
                  </div>
                ))}
              </div>
              <input
                value={keyDrafts[group]}
                onChange={(event) => updateKeyDraft(group, event.target.value)}
                placeholder={group === "geminiKeys" ? "AIza..." : "gsk_..."}
              />
            </div>
          ))}

          <label className="field-block">
            <span>SUPADATA</span>
            <input
              value={workspace.api.supadataApiKey}
              onChange={(event) => mergeApi({ supadataApiKey: event.target.value })}
              placeholder="Supadata API key"
            />
          </label>

          <label className="field-block">
            <span>MICROSOFT TTS KEY</span>
            <input
              value={workspace.api.microsoftTtsKey}
              onChange={(event) => mergeApi({ microsoftTtsKey: event.target.value })}
              placeholder="Microsoft TTS key"
            />
          </label>
        </div>
      </Drawer>
    </>
  );
}










