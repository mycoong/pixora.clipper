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

const providerLabel = {
  gemini: "Gemini Pool",
  groq: "Groq Pool"
} as const;

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

const phaseOrder: ClipperJobPhase[] = [
  "queued",
  "fetch-source",
  "transcript",
  "analysis",
  "render-plan",
  "rendering",
  "completed"
];

function countFilled(values: string[]) {
  return values.filter((value) => value.trim()).length;
}

function createLocalAnalyzePreviewJob(
  payload: ReturnType<typeof buildCreateJobInputFromWorkspace>
): ClipperJobStatus {
  const now = new Date().toISOString();
  return {
    id: `preview_${Date.now().toString(36)}`,
    kind: "analyze",
    status: "completed",
    phase: "completed",
    progress: 100,
    message: "Worker belum dipasang. Analyze masih memakai preview lokal frontend.",
    submittedAt: now,
    updatedAt: now,
    payload,
    artifacts: [{ kind: "plan", label: "local-preview-plan" }]
  };
}

function createLocalRenderPreviewJob(
  payload: CreateClipperRenderJobInput
): ClipperJobStatus {
  const now = new Date().toISOString();
  return {
    id: `render_${Date.now().toString(36)}`,
    kind: "render",
    status: "completed",
    phase: "completed",
    progress: 100,
    message: "Generate preview lokal selesai. Sambungkan worker render untuk output final.",
    submittedAt: now,
    updatedAt: now,
    payload,
    artifacts: payload.clipIds.map((clipId, index) => ({
      kind: "render",
      label: `render-${index + 1}-${clipId}`
    }))
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
  return (
    <div className={`drawer-layer${open ? " is-open" : ""}`} aria-hidden={!open}>
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
  const [advancedDrawerOpen, setAdvancedDrawerOpen] = useState(false);

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

  const selectedClips = useMemo(
    () =>
      workspace.analyzedClips.filter((clip) =>
        workspace.selectedClipIds.includes(clip.id)
      ),
    [workspace.analyzedClips, workspace.selectedClipIds]
  );

  const sourceLabel = getSourceDisplayName(workspace);

  function updateKey(group: KeyGroup, index: number, value: string) {
    const next = [...workspace.api[group]];
    next[index] = value;
    mergeApi({ [group]: next } as Partial<ClipperApiSettings>);
  }

  function addKey(group: KeyGroup) {
    mergeApi({ [group]: [...workspace.api[group], ""] } as Partial<ClipperApiSettings>);
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
      setError(caughtError instanceof Error ? caughtError.message : "Analyze failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerate() {
    if (workspace.selectedClipIds.length === 0) {
      setError("Pilih clip dulu sebelum generate.");
      return;
    }

    setError("");
    const queuedClips: ClipperRenderedClip[] = createRenderQueueFromSelection(
      workspace
    ).map((entry) => ({
      ...entry,
      status: workerConfigured ? "queued" : "draft"
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

    if (!workerConfigured) {
      setJob(createLocalRenderPreviewJob(payload));
      return;
    }

    setSubmitting(true);
    try {
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
      setError(caughtError instanceof Error ? caughtError.message : "Generate failed");
    } finally {
      setSubmitting(false);
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

  function resetWorkspace() {
    setWorkspace(defaultClipperWorkspaceState);
    setJob(null);
    setError("");
  }

  return (
    <>
      <section className="lite-shell">
        <header className="lite-header">
          <div>
            <span className="eyebrow">PIXORA CLIPPER WEB</span>
            <h1>Simple Source Runner 🐧</h1>
            <p>Masukkan link YouTube atau file lokal. Tidak ada preview. Fokus hanya source dan hasil analyze.</p>
          </div>
          <div className="header-tools">
            <span className="meta-chip">
              {workerConfigured
                ? workerHealth?.mockMode
                  ? "worker mock"
                  : "worker live"
                : "preview mode"}
            </span>
            <span className="meta-chip">{providerLabel[workspace.api.activeProvider]}</span>
            <button className="ghost-button" type="button" onClick={() => setAdvancedDrawerOpen(true)}>
              ⚙️ Advanced
            </button>
            <button className="ghost-button" type="button" onClick={() => setApiDrawerOpen(true)}>
              🗝️ PIXORA Engine
            </button>
          </div>
        </header>

        <div className="lite-grid">
          <section className="lite-card form-card">
            <div className="card-head">
              <div>
                <span className="eyebrow">Source</span>
                <h2>🎬 Input</h2>
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

            <div className="button-row">
              <button className="primary-button" type="button" disabled={submitting} onClick={handleAnalyze}>
                {submitting ? "Running..." : "Analyze"}
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
                <h2>🖥️ Session</h2>
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
                    : "Preview"}
                </strong>
              </div>
              <div className="stat-row">
                <span>Provider</span>
                <strong>{providerLabel[workspace.api.activeProvider]}</strong>
              </div>
              <div className="stat-row">
                <span>Status</span>
                <strong>{job?.status || "waiting input"}</strong>
              </div>
              <div className="stat-row">
                <span>Phase</span>
                <strong>{job ? phaseLabel[job.phase] : "Idle"}</strong>
              </div>
              <div className="stat-row">
                <span>Selected clips</span>
                <strong>{workspace.selectedClipIds.length}</strong>
              </div>
            </div>

            <div className="phase-list">
              {phaseOrder.map((phase) => (
                <div
                  key={phase}
                  className={`phase-chip${
                    job?.phase === phase ? " is-active" : ""
                  }${
                    job?.status === "completed" ? " is-done" : ""
                  }`}
                >
                  {phaseLabel[phase]}
                </div>
              ))}
            </div>

            <div className="message-box">
              {job?.message || "Belum ada job. Masukkan source lalu klik Analyze."}
            </div>
          </section>
        </div>

        <section className="lite-card results-card">
          <div className="results-head">
            <div>
              <span className="eyebrow">Results</span>
              <h2>📋 Detected Clips</h2>
            </div>
            <div className="results-actions">
              <span className="meta-chip">{workspace.selectedClipIds.length} selected</span>
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
              <span className="eyebrow">Queue</span>
              <div className="queue-list">
                {workspace.renderedClips.map((item) => (
                  <div key={item.id} className="queue-row">
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.durationLabel}</span>
                    </div>
                    <em>{item.status}</em>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {error ? <div className="error-banner">{error}</div> : null}
      </section>

      <Drawer
        open={apiDrawerOpen}
        title="API Keys dan Provider"
        onClose={() => setApiDrawerOpen(false)}
      >
        <div className="drawer-stack">
          <div className="mode-toggle">
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

          <div className="drawer-grid">
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
                <strong>{group === "geminiKeys" ? "Gemini Keys" : "Groq Keys"}</strong>
                <button className="ghost-button" type="button" onClick={() => addKey(group)}>
                  Add
                </button>
              </div>
              {workspace.api[group].map((value, index) => (
                <input
                  key={`${group}-${index}`}
                  value={value}
                  onChange={(event) => updateKey(group, index, event.target.value)}
                  placeholder={group === "geminiKeys" ? "AIza..." : "gsk_..."}
                />
              ))}
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

      <Drawer
        open={advancedDrawerOpen}
        title="Advanced Source Settings ⚙️"
        onClose={() => setAdvancedDrawerOpen(false)}
      >
        <div className="drawer-stack">
          <label className="field-block">
            <span>TRANSCRIPT MODE</span>
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

          <div className="drawer-group">
            <span className="eyebrow">🧱 FRAME MODE</span>
            <div className="mode-toggle framing-toggle">
              {framingModeOptions.map((option) => (
                <button
                  key={option}
                  className={workspace.framing.framingMode === option ? "is-active" : ""}
                  type="button"
                  onClick={() => mergeFraming({ framingMode: option })}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

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

          <div className="mode-toggle three-up">
            <button
              className={workspace.source.cookieAccess === "none" ? "is-active" : ""}
              type="button"
              onClick={() => mergeSource({ cookieAccess: "none" })}
            >
              No Cookies
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

          {workspace.source.cookieAccess !== "none" ? (
            <div className="drawer-grid">
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
              ) : null}
            </div>
          ) : null}

          <div className="drawer-grid">
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
          </div>

          <div className="drawer-grid">
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

          <Toggle
            checked={workspace.output.titleVoEnabled}
            label="Enable title VO"
            onToggle={() => mergeOutput({ titleVoEnabled: !workspace.output.titleVoEnabled })}
          />

          <Toggle
            checked={workspace.gaming.enabled}
            label="Enable gaming layout"
            onToggle={() => mergeGaming({ enabled: !workspace.gaming.enabled })}
          />

          <label className="field-block">
            <span>NOTES</span>
            <textarea
              value={workspace.source.notes}
              onChange={(event) => mergeSource({ notes: event.target.value })}
              placeholder="Optional notes untuk analyze atau render."
            />
          </label>
        </div>
      </Drawer>
    </>
  );
}
