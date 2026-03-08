"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  browserProfileOptions,
  buildCreateJobInputFromWorkspace,
  captionAnimationOptions,
  captionTemplateOptions,
  createMockClipCandidates,
  createRenderQueueFromSelection,
  defaultClipperWorkspaceState,
  framingModeOptions,
  getSourceDisplayName,
  outputModeOptions,
  resolutionOptions,
  shotTypeOptions,
  transcriptModeOptions,
  type ClipperAiProvider,
  type ClipperApiSettings,
  type ClipperEffectsSettings,
  type ClipperFramingSettings,
  type ClipperGamingSettings,
  type ClipperOutputSettings,
  type ClipperRenderedClip,
  type ClipperSourceSettings,
  type ClipperSubtitleSettings,
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

type Mode = "analyze" | "output";
type KeyGroup = "geminiKeys" | "groqKeys";

const analyzePhaseOrder: ClipperJobPhase[] = [
  "queued",
  "fetch-source",
  "transcript",
  "analysis",
  "render-plan",
  "completed"
];

const renderPhaseOrder: ClipperJobPhase[] = [
  "queued",
  "render-plan",
  "rendering",
  "completed"
];

const phaseLabel: Record<ClipperJobPhase, string> = {
  queued: "Queued",
  "fetch-source": "Fetch Source",
  transcript: "Transcript",
  analysis: "Analyze",
  "render-plan": "Render Plan",
  rendering: "Render",
  completed: "Completed",
  failed: "Failed"
};

const providerLabel: Record<ClipperAiProvider, string> = {
  gemini: "Gemini Pool",
  groq: "Groq Pool"
};

const stylePresetLabel = {
  kinetic: "MOZI",
  cinema: "PRINCE",
  clean: "BOXIES"
} as const;

const animationLabel = {
  "word-pop": "Rapid",
  "slide-up": "Elegant",
  none: "Static"
} as const;

const sidebarItems = [
  { label: "Buat", status: "active" },
  { label: "Otomatisasi", status: "soon" },
  { label: "Galeri", status: "soon" },
  { label: "Notifikasi", status: "soon" }
] as const;

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
    message: "Worker belum dipasang. PIXORA WEB memakai preview lokal untuk analyze.",
    submittedAt: now,
    updatedAt: now,
    payload,
    artifacts: [{ kind: "plan", label: `${payload.outputMode}-preview-plan` }]
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
    message: "Render preview lokal selesai. Sambungkan worker render PIXORA untuk output final.",
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
            <span className="drawer-kicker">PIXORA Engine</span>
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

function ToggleRow({
  label,
  hint,
  checked,
  onToggle
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="switch-row">
      <div>
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <button
        className={`switch-control${checked ? " is-on" : ""}`}
        type="button"
        aria-pressed={checked}
        onClick={onToggle}
      >
        <span />
      </button>
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="property-range">
      <div className="property-label-row">
        <span>{label}</span>
        <strong>{`${value}${suffix}`}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
      />
    </label>
  );
}

function ColorRow({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="property-color">
      <span>{label}</span>
      <div className="color-input-shell">
        <input
          className="color-chip"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </label>
  );
}

export function ClipperStudio({ workerConfigured, workerHealth }: Props) {
  const [workspace, setWorkspace] = useState<ClipperWorkspaceState>(
    defaultClipperWorkspaceState
  );
  const [mode, setMode] = useState<Mode>("analyze");
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
  const mergeSubtitle = (patch: Partial<ClipperSubtitleSettings>) =>
    setWorkspace((current) => ({
      ...current,
      subtitle: { ...current.subtitle, ...patch }
    }));
  const mergeFraming = (patch: Partial<ClipperFramingSettings>) =>
    setWorkspace((current) => ({ ...current, framing: { ...current.framing, ...patch } }));
  const mergeEffects = (patch: Partial<ClipperEffectsSettings>) =>
    setWorkspace((current) => ({ ...current, effects: { ...current.effects, ...patch } }));
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

  const activeClip = selectedClips[0] ?? null;
  const sourceLabel = getSourceDisplayName(workspace);
  const activePhaseOrder = job?.kind === "render" ? renderPhaseOrder : analyzePhaseOrder;
  const phaseIndex = activePhaseOrder.findIndex(
    (phase) => phase === (job?.phase ?? "queued")
  );
  const progressStyle = { "--progress": `${job?.progress ?? 0}%` } as CSSProperties;
  const assetLabel =
    workspace.source.inputMode === "youtube"
      ? sourceLabel
      : workspace.source.localVideoName || "No local asset";

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

  function toggleClip(clipId: string) {
    setWorkspace((current) => ({
      ...current,
      selectedClipIds: current.selectedClipIds.includes(clipId)
        ? current.selectedClipIds.filter((id) => id !== clipId)
        : [...current.selectedClipIds, clipId]
    }));
  }

  async function queueRender() {
    if (workspace.selectedClipIds.length === 0) {
      setError("Pilih clip dulu sebelum generate render.");
      return;
    }

    setError("");
    setMode("output");

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
      setError(caughtError instanceof Error ? caughtError.message : "Render failed");
    } finally {
      setSubmitting(false);
    }
  }

  function resetWorkspace() {
    setWorkspace(defaultClipperWorkspaceState);
    setJob(null);
    setError("");
    setMode("analyze");
  }

  return (
    <>
      <section className="clipper-app-shell">
        <aside className="app-sidebar">
          <div className="sidebar-brand">
            <div className="brand-logo">PX</div>
            <div>
              <strong>PIXORA</strong>
              <span>Web Clipper</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Workspace sections">
            {sidebarItems.map((item, index) => (
              <button
                key={item.label}
                className={`sidebar-link${item.status === "active" ? " is-active" : ""}`}
                type="button"
                disabled={item.status !== "active"}
              >
                <span className="sidebar-icon">{String(index + 1).padStart(2, "0")}</span>
                <span>{item.label}</span>
                {item.status !== "active" ? <em>Soon</em> : null}
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <button className="sidebar-link" type="button">
              <span className="sidebar-icon">UP</span>
              <span>Updates</span>
            </button>
            <button className="sidebar-link" type="button">
              <span className="sidebar-icon">?</span>
              <span>Bantuan</span>
            </button>
            <button className="sidebar-link" type="button" onClick={() => setApiDrawerOpen(true)}>
              <span className="sidebar-icon">PX</span>
              <span>Pengaturan</span>
            </button>
          </div>
        </aside>

        <div className="app-surface">
          <header className="workspace-topbar">
            <div>
              <span className="topbar-kicker">PIXORA CLIPPER WEB</span>
              <h1>Clipper Workspace</h1>
              <p>
                UI mengikuti struktur Clipiee, tapi seluruh routing settings dan
                API key tetap di namespace PIXORA.
              </p>
              <div className="topbar-meta">
                <span>{workerConfigured ? "worker connected" : "preview mode"}</span>
                <span>{providerLabel[workspace.api.activeProvider]}</span>
                <span>{workspace.selectedClipIds.length || workspace.analyzedClips.length} clips</span>
              </div>
            </div>

            <div className="topbar-actions">
              <button className="ghost-button" type="button" onClick={() => setAdvancedDrawerOpen(true)}>
                Advanced
              </button>
              <button className="ghost-button" type="button" onClick={() => setApiDrawerOpen(true)}>
                PIXORA Engine
              </button>
            </div>
          </header>

          <div className="studio-grid">
            <section className="panel source-panel">
              <div className="section-header">
                <div>
                  <span className="section-kicker">Buat</span>
                  <h2>Input dan Analisa</h2>
                </div>
                <div className="mode-switch">
                  <button
                    className={mode === "analyze" ? "is-active" : ""}
                    type="button"
                    onClick={() => setMode("analyze")}
                  >
                    Analyze
                  </button>
                  <button
                    className={mode === "output" ? "is-active" : ""}
                    type="button"
                    onClick={() => setMode("output")}
                  >
                    Output
                  </button>
                </div>
              </div>

              <div className="panel-card intro-card">
                <span className="section-kicker">Clipper Command Center</span>
                <h3>
                  Analyze source videos, pilih momen terbaik, lalu render vertikal
                  clip dari PIXORA worker.
                </h3>
              </div>

              <div className="panel-card stack-form">
                <div className="compact-switch">
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
                    Upload Video
                  </button>
                </div>

                {workspace.source.inputMode === "youtube" ? (
                  <label className="field-block">
                    <span>YOUTUBE LINK</span>
                    <input
                      value={workspace.source.youtubeUrl}
                      onChange={(event) => mergeSource({ youtubeUrl: event.target.value })}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                  </label>
                ) : (
                  <label className="field-block">
                    <span>VIDEO LOKAL</span>
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

                <div className="split-fields two-up">
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
                    <span>QUALITY</span>
                    <select
                      value={workspace.source.sourceQuality}
                      onChange={(event) =>
                        mergeSource({
                          sourceQuality: event.target.value as ClipperSourceSettings["sourceQuality"]
                        })
                      }
                    >
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="panel-card stack-form">
                <div className="section-header compact">
                  <div>
                    <span className="section-kicker">YouTube Access</span>
                    <h3>Optional cookies</h3>
                  </div>
                </div>

                <div className="compact-switch three-up">
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
                  <div className="split-fields two-up">
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
                        <span>FILE</span>
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

                <div className="split-fields two-up">
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
                    <span>SOURCE LABEL</span>
                    <input value={sourceLabel} readOnly />
                  </label>
                </div>

                <label className="field-block">
                  <span>NOTES</span>
                  <textarea
                    value={workspace.source.notes}
                    onChange={(event) => mergeSource({ notes: event.target.value })}
                    placeholder="Hook notes, subtitle tone, crop preference."
                  />
                </label>

                <div className="action-row wide">
                  <button className="primary-button" type="button" disabled={submitting} onClick={handleAnalyze}>
                    {submitting && mode === "analyze" ? "Analyzing..." : "Analyze"}
                  </button>
                  <button className="ghost-button" type="button" onClick={resetWorkspace}>
                    Reset
                  </button>
                </div>
              </div>

              <div className="panel-card status-stack">
                <div className="tiny-stat">
                  <span>Status</span>
                  <strong>{job?.status || "waiting input"}</strong>
                </div>
                <div className="tiny-stat">
                  <span>Current step</span>
                  <strong>{job ? phaseLabel[job.phase] : "Idle"}</strong>
                </div>
                <div className="tiny-stat">
                  <span>Worker version</span>
                  <strong>{workerHealth?.version || "frontend-only"}</strong>
                </div>
              </div>
            </section>

            <section className="panel preview-panel">
              <div className="preview-board">
                <div className="dot-grid" />

                <div className="preview-controls">
                  <button
                    type="button"
                    onClick={() =>
                      setWorkspace((current) => ({
                        ...current,
                        zoomPercent: Math.max(70, current.zoomPercent - 10)
                      }))
                    }
                  >
                    -
                  </button>
                  <strong>{workspace.zoomPercent}%</strong>
                  <button
                    type="button"
                    onClick={() =>
                      setWorkspace((current) => ({
                        ...current,
                        zoomPercent: Math.min(140, current.zoomPercent + 10)
                      }))
                    }
                  >
                    +
                  </button>
                </div>

                <div className="preview-phones">
                  <div className="phone-card">
                    <div className="phone-head">
                      <span>Source Video</span>
                      <span>{workspace.source.inputMode === "youtube" ? "Auto Source" : "Upload"}</span>
                    </div>
                    <div className="phone-shell">
                      <div className="phone-screen source-screen">
                        <div className="screen-content">
                          <strong>{sourceReady ? assetLabel : "No analyzed source yet"}</strong>
                          <span>
                            {workspace.source.inputMode === "youtube"
                              ? "Paste YouTube URL lalu Analyze"
                              : workspace.source.localVideoName || "Upload local video"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="phone-card">
                    <div className="phone-head">
                      <span>Output Live Preview</span>
                      <span>{workspace.framing.outputMode}</span>
                    </div>
                    <div className="phone-shell">
                      <div className="phone-screen output-screen">
                        <div className="screen-content">
                          {activeClip ? (
                            <>
                              <strong>{activeClip.title}</strong>
                              <span>{activeClip.rangeLabel}</span>
                              {workspace.effects.viralHookOverlayEnabled ? (
                                <div className="hook-chip">Overlay Hook Viral</div>
                              ) : null}
                              {workspace.subtitle.enabled ? (
                                <div
                                  className="caption-card"
                                  style={{
                                    "--caption-fill": workspace.subtitle.textColor,
                                    "--caption-accent": workspace.subtitle.highlightColor
                                  } as CSSProperties}
                                >
                                  <span>{activeClip.hook}</span>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <strong>Preview siap setelah clip dipilih</strong>
                              <span>
                                Pilih hasil analyze untuk melihat subtitle, crop, dan output
                                mode.
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="asset-row">
                <div className="row-title-block">
                  <span className="section-kicker">Assets</span>
                  <strong>Source payload</strong>
                </div>
                <div className="asset-actions">
                  <button className="ghost-button" type="button">
                    Upload
                  </button>
                  <button className="ghost-button" type="button" onClick={() => mergeSource({ inputMode: "youtube" })}>
                    Link
                  </button>
                </div>
                <div className="asset-card">
                  <strong>{assetLabel}</strong>
                  <span>{workspace.source.subtitleFileName || "No subtitle file"}</span>
                </div>
              </div>

              <div className="track-row-shell">
                <div className="row-title-block">
                  <span className="section-kicker">Video Track</span>
                  <strong>{workspace.renderedClips.length} render entries</strong>
                </div>
                <div className="track-row">
                  <div className="track-item">
                    <div className="track-thumb">PX</div>
                    <div className="track-copy">
                      <strong>{activeClip ? activeClip.title : assetLabel}</strong>
                      <span>
                        {activeClip
                          ? `${activeClip.durationLabel} / score ${activeClip.score}`
                          : "Ready to distribute"}
                      </span>
                    </div>
                    <div className="track-meta">
                      <span>{workspace.output.resolution}</span>
                      <span>{workspace.framing.outputMode}</span>
                    </div>
                  </div>
                  <button
                    className="generate-button"
                    type="button"
                    disabled={submitting || workspace.selectedClipIds.length === 0}
                    onClick={queueRender}
                  >
                    {submitting && mode === "output" ? "Generating..." : "Generate"}
                  </button>
                </div>
              </div>

              <div className="candidate-shell">
                <div className="section-header compact">
                  <div>
                    <span className="section-kicker">Analyzed Files</span>
                    <h3>{workspace.analyzedClips.length} clips detected</h3>
                  </div>
                  <span className="selection-pill">{workspace.selectedClipIds.length} selected</span>
                </div>

                <div className="candidate-grid">
                  {workspace.analyzedClips.length === 0 ? (
                    <div className="empty-block">
                      <strong>No clips detected yet</strong>
                      <span>Analyze source dulu. Top clips akan muncul di sini.</span>
                    </div>
                  ) : (
                    workspace.analyzedClips.map((clip) => (
                      <button
                        key={clip.id}
                        className={`candidate-card${workspace.selectedClipIds.includes(clip.id) ? " is-selected" : ""}`}
                        type="button"
                        onClick={() => toggleClip(clip.id)}
                      >
                        <div className="candidate-headline">
                          <strong>{clip.title}</strong>
                          <span>{clip.score}</span>
                        </div>
                        <span>{clip.rangeLabel}</span>
                        <p>{clip.hook}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </section>

            <aside className="panel inspector-panel">
              <div className="section-header compact inspector-header">
                <div>
                  <span className="section-kicker">Properti</span>
                  <h2>PIXORA Inspector</h2>
                </div>
                <div className="progress-orb" style={progressStyle}>
                  <strong>{job ? `${job.progress}%` : "--"}</strong>
                </div>
              </div>

              <div className="inspector-scroll">
                <div className="inspector-group">
                  <ToggleRow
                    label="Overlay Hook Viral"
                    hint="Tambahkan layer hook untuk output preview dan render plan."
                    checked={workspace.effects.viralHookOverlayEnabled}
                    onToggle={() =>
                      mergeEffects({
                        viralHookOverlayEnabled: !workspace.effects.viralHookOverlayEnabled
                      })
                    }
                  />
                  <ToggleRow
                    label="Teks Film"
                    hint="Aktifkan caption utama PIXORA di output final."
                    checked={workspace.subtitle.enabled}
                    onToggle={() => mergeSubtitle({ enabled: !workspace.subtitle.enabled })}
                  />
                </div>

                <div className="inspector-group">
                  <div className="property-title-row">
                    <span>Gaya Animasi</span>
                    <strong>{animationLabel[workspace.subtitle.animationType]}</strong>
                  </div>
                  <div className="style-grid">
                    {captionTemplateOptions.map((option) => (
                      <button
                        key={option}
                        className={`style-card${workspace.subtitle.template === option ? " is-active" : ""}`}
                        type="button"
                        onClick={() => mergeSubtitle({ template: option })}
                      >
                        {stylePresetLabel[option]}
                      </button>
                    ))}
                    <button className="style-card is-locked" type="button" disabled>
                      RAPID PRO
                    </button>
                    <button className="style-card is-locked" type="button" disabled>
                      SHADOW
                    </button>
                    <button className="style-card is-locked" type="button" disabled>
                      ELEGANT
                    </button>
                    <button className="style-card is-locked" type="button" disabled>
                      POD D
                    </button>
                  </div>
                </div>

                <div className="inspector-group split-fields two-up">
                  <label className="field-block">
                    <span>JENIS HURUF</span>
                    <input
                      value={workspace.subtitle.fontName}
                      onChange={(event) => mergeSubtitle({ fontName: event.target.value })}
                    />
                  </label>
                  <RangeRow
                    label="UKURAN"
                    value={workspace.subtitle.fontSize}
                    min={28}
                    max={84}
                    suffix="px"
                    onChange={(value) => mergeSubtitle({ fontSize: value })}
                  />
                </div>

                <div className="inspector-group split-fields two-up">
                  <ColorRow
                    label="WARNA TEKS"
                    value={workspace.subtitle.textColor}
                    onChange={(value) => mergeSubtitle({ textColor: value })}
                  />
                  <ColorRow
                    label="GARIS TEPI"
                    value={workspace.subtitle.strokeColor}
                    onChange={(value) => mergeSubtitle({ strokeColor: value })}
                  />
                </div>

                <div className="inspector-group split-fields two-up">
                  <RangeRow
                    label="KETEBALAN GARIS"
                    value={workspace.subtitle.strokeWidth}
                    min={0}
                    max={12}
                    suffix="px"
                    onChange={(value) => mergeSubtitle({ strokeWidth: value })}
                  />
                  <RangeRow
                    label="POSISI"
                    value={workspace.subtitle.marginV}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(value) => mergeSubtitle({ marginV: value })}
                  />
                </div>

                <div className="inspector-group split-fields two-up">
                  <label className="field-block">
                    <span>FRAMING</span>
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
                  <label className="field-block">
                    <span>SHOT TYPE</span>
                    <select
                      value={workspace.framing.shotType}
                      onChange={(event) =>
                        mergeFraming({
                          shotType: event.target.value as ClipperFramingSettings["shotType"]
                        })
                      }
                    >
                      {shotTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="inspector-group">
                  <ToggleRow
                    label="Tanda Air"
                    hint="Aktifkan watermark text atau image di pipeline PIXORA."
                    checked={workspace.effects.watermarkEnabled}
                    onToggle={() =>
                      mergeEffects({ watermarkEnabled: !workspace.effects.watermarkEnabled })
                    }
                  />
                </div>

                <div className="inspector-group">
                  <button className="property-expand" type="button" onClick={() => setAdvancedDrawerOpen(true)}>
                    <span>Pengaturan Lanjutan</span>
                    <strong>+</strong>
                  </button>
                </div>

                <div className="inspector-group">
                  <div className="property-title-row">
                    <span>Progress Pipeline</span>
                    <strong>{job?.kind || "idle"}</strong>
                  </div>
                  <div className="pipeline-list">
                    {activePhaseOrder.map((phase, index) => (
                      <div
                        key={phase}
                        className={`pipeline-step${
                          job?.status === "completed" || index < Math.max(phaseIndex, 0)
                            ? " is-done"
                            : ""
                        }${
                          job?.status !== "completed" && index === Math.max(phaseIndex, 0)
                            ? " is-active"
                            : ""
                        }`}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{phaseLabel[phase]}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="inspector-group">
                  <div className="property-title-row">
                    <span>Render Queue</span>
                    <strong>{workspace.renderedClips.length}</strong>
                  </div>
                  <div className="queue-list">
                    {workspace.renderedClips.length === 0 ? (
                      <div className="empty-block compact">
                        <strong>No queue</strong>
                        <span>Select clips lalu Generate.</span>
                      </div>
                    ) : (
                      workspace.renderedClips.map((item) => (
                        <div key={item.id} className="queue-card">
                          <strong>{item.title}</strong>
                          <span>{item.durationLabel}</span>
                          <p>{item.presetLabel}</p>
                          <em>{item.status}</em>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {error ? <div className="error-banner">{error}</div> : null}
        </div>
      </section>

      <Drawer
        open={apiDrawerOpen}
        title="API Keys dan Provider Routing"
        onClose={() => setApiDrawerOpen(false)}
      >
        <div className="drawer-section-stack">
          <div className="drawer-card">
            <div className="property-title-row">
              <span>Provider aktif</span>
              <strong>PIXORA Router</strong>
            </div>
            <div className="compact-switch two-up">
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
          </div>

          <div className="drawer-card">
            <div className="drawer-summary-grid">
              <div className="mini-card">
                <span>Gemini</span>
                <strong>{countFilled(workspace.api.geminiKeys)} keys</strong>
              </div>
              <div className="mini-card">
                <span>Groq</span>
                <strong>{countFilled(workspace.api.groqKeys)} keys</strong>
              </div>
              <div className="mini-card">
                <span>Supadata</span>
                <strong>{workspace.api.supadataApiKey ? "OK" : "Empty"}</strong>
              </div>
              <div className="mini-card">
                <span>Microsoft TTS</span>
                <strong>{workspace.api.microsoftTtsKey ? "OK" : "Empty"}</strong>
              </div>
            </div>
          </div>

          {(["geminiKeys", "groqKeys"] as const).map((group) => (
            <div key={group} className="drawer-card stack-form">
              <div className="section-header compact">
                <div>
                  <span className="section-kicker">PIXORA API Pool</span>
                  <h3>{group === "geminiKeys" ? "Gemini keys" : "Groq keys"}</h3>
                </div>
                <button className="ghost-button" type="button" onClick={() => addKey(group)}>
                  Add Key
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

          <div className="drawer-card stack-form">
            <label className="field-block">
              <span>SUPADATA API KEY</span>
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
            <div className="split-fields two-up">
              <label className="field-block">
                <span>REGION</span>
                <input
                  value={workspace.api.microsoftTtsRegion}
                  onChange={(event) => mergeApi({ microsoftTtsRegion: event.target.value })}
                  placeholder="Region"
                />
              </label>
              <label className="field-block">
                <span>VOICE</span>
                <input
                  value={workspace.api.microsoftTtsVoice}
                  onChange={(event) => mergeApi({ microsoftTtsVoice: event.target.value })}
                  placeholder="Voice"
                />
              </label>
            </div>
          </div>
        </div>
      </Drawer>

      <Drawer
        open={advancedDrawerOpen}
        title="Pengaturan Lanjutan Clipper"
        onClose={() => setAdvancedDrawerOpen(false)}
      >
        <div className="drawer-section-stack">
          <div className="drawer-card stack-form">
            <div className="split-fields two-up">
              <label className="field-block">
                <span>TEMPLATE</span>
                <select
                  value={workspace.subtitle.template}
                  onChange={(event) =>
                    mergeSubtitle({
                      template: event.target.value as ClipperSubtitleSettings["template"]
                    })
                  }
                >
                  {captionTemplateOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>ANIMATION</span>
                <select
                  value={workspace.subtitle.animationType}
                  onChange={(event) =>
                    mergeSubtitle({
                      animationType: event.target.value as ClipperSubtitleSettings["animationType"]
                    })
                  }
                >
                  {captionAnimationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="split-fields two-up">
              <label className="field-block">
                <span>OUTPUT MODE</span>
                <select
                  value={workspace.framing.outputMode}
                  onChange={(event) =>
                    mergeFraming({
                      outputMode: event.target.value as ClipperFramingSettings["outputMode"]
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

            <div className="split-fields two-up">
              <RangeRow
                label="VIGNETTE"
                value={workspace.effects.vignette}
                min={0}
                max={100}
                suffix="%"
                onChange={(value) => mergeEffects({ vignette: value })}
              />
              <RangeRow
                label="GRUNGE"
                value={workspace.effects.grunge}
                min={0}
                max={100}
                suffix="%"
                onChange={(value) => mergeEffects({ grunge: value })}
              />
            </div>

            <div className="split-fields two-up">
              <label className="field-block">
                <span>WATERMARK TEXT</span>
                <input
                  value={workspace.effects.watermarkText}
                  onChange={(event) => mergeEffects({ watermarkText: event.target.value })}
                />
              </label>
              <label className="field-block">
                <span>WATERMARK IMAGE</span>
                <input
                  value={workspace.effects.watermarkImageName}
                  onChange={(event) => mergeEffects({ watermarkImageName: event.target.value })}
                />
              </label>
            </div>

            <div className="drawer-switches">
              <ToggleRow
                label="Title VO"
                checked={workspace.output.titleVoEnabled}
                onToggle={() =>
                  mergeOutput({ titleVoEnabled: !workspace.output.titleVoEnabled })
                }
              />
              <ToggleRow
                label="Gaming Layout"
                checked={workspace.gaming.enabled}
                onToggle={() => mergeGaming({ enabled: !workspace.gaming.enabled })}
              />
            </div>

            <div className="split-fields two-up">
              <label className="field-block">
                <span>GAMING LAYOUT</span>
                <select
                  value={workspace.gaming.layout}
                  onChange={(event) =>
                    mergeGaming({
                      layout: event.target.value as ClipperGamingSettings["layout"]
                    })
                  }
                >
                  <option value="split">split</option>
                  <option value="stacked">stacked</option>
                </select>
              </label>
              <label className="field-block">
                <span>FACECAM SIZE</span>
                <input
                  type="range"
                  min="20"
                  max="60"
                  value={workspace.gaming.facecamSize}
                  onChange={(event) =>
                    mergeGaming({
                      facecamSize: Number.parseInt(event.target.value, 10)
                    })
                  }
                />
              </label>
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
}
