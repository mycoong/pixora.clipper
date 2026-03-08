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
  ClipperJobKind,
  ClipperJobPhase,
  ClipperJobStatus,
  CreateClipperAnalyzeJobInput,
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
  "fetch-source": "Fetch source",
  transcript: "Transcript",
  analysis: "Analysis",
  "render-plan": "Render plan",
  rendering: "Rendering",
  completed: "Completed",
  failed: "Failed"
};

const providerLabel: Record<ClipperAiProvider, string> = {
  gemini: "Gemini",
  groq: "Groq"
};

function countFilled(values: string[]) {
  return values.filter((value) => value.trim()).length;
}

function createLocalAnalyzePreviewJob(
  payload: CreateClipperAnalyzeJobInput
): ClipperJobStatus {
  const now = new Date().toISOString();
  return {
    id: `preview_${Date.now().toString(36)}`,
    kind: "analyze",
    status: "completed",
    phase: "completed",
    progress: 100,
    message: "Worker belum dipasang. Preview ini memakai schema frontend lokal.",
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
    message: "Render preview lokal selesai. Sambungkan worker render untuk output final.",
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
          <h2>{title}</h2>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
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
    setWorkspace((current) => ({ ...current, subtitle: { ...current.subtitle, ...patch } }));
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
  const progressStyle = { "--progress": `${job?.progress ?? 0}%` } as CSSProperties;
  const sourceLabel = getSourceDisplayName(workspace);
  const activePhaseOrder = job?.kind === "render" ? renderPhaseOrder : analyzePhaseOrder;
  const phaseIndex = activePhaseOrder.findIndex(
    (phase) => phase === (job?.phase ?? "queued")
  );

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
      setError("Pilih clip dulu sebelum masuk render queue.");
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

  return (
    <>
      <section className="workspace">
        <header className="workspace-header">
          <div className="brand-block">
            <div className="brand-mark">PX</div>
            <div>
              <span className="panel-kicker">PIXORA / Clipper Web</span>
              <h1>Clipper Command Center</h1>
              <p>Layout ini sengaja meniru workspace Electron: source, preview, clip list, dan settings drawer.</p>
            </div>
          </div>
          <div className="header-actions">
            <div className="header-chip">
              <span>Worker</span>
              <strong>{workerConfigured ? workerHealth?.mockMode ? "Mock" : "Live" : "Preview"}</strong>
            </div>
            <div className="header-chip">
              <span>Provider</span>
              <strong>{providerLabel[workspace.api.activeProvider]}</strong>
            </div>
            <button className="ghost-button" type="button" onClick={() => setApiDrawerOpen(true)}>API Keys</button>
            <button className="ghost-button" type="button" onClick={() => setAdvancedDrawerOpen(true)}>Advanced</button>
          </div>
        </header>

        <div className="workspace-grid">
          <aside className="workspace-panel side-panel">
            <div className="hero-card">
              <span className="panel-kicker">Short-form clipping workspace</span>
              <h2>Analyze, preview, and queue output clips.</h2>
              <p>State v1 sudah mencakup source mode, transcript mode, provider routing, subtitle preset, framing, effects, dan render queue.</p>
            </div>

            <div className="segment">
              <button className={mode === "analyze" ? "is-active" : ""} type="button" onClick={() => setMode("analyze")}>Analyze</button>
              <button className={mode === "output" ? "is-active" : ""} type="button" onClick={() => setMode("output")}>Output</button>
            </div>

            {mode === "analyze" ? (
              <div className="stack-form">
                <div className="inline-segment">
                  <button className={workspace.source.inputMode === "youtube" ? "is-active" : ""} type="button" onClick={() => mergeSource({ inputMode: "youtube" })}>YouTube</button>
                  <button className={workspace.source.inputMode === "upload" ? "is-active" : ""} type="button" onClick={() => mergeSource({ inputMode: "upload" })}>Local video</button>
                </div>
                {workspace.source.inputMode === "youtube" ? (
                  <label className="field">
                    <span>YouTube URL</span>
                    <input value={workspace.source.youtubeUrl} onChange={(event) => mergeSource({ youtubeUrl: event.target.value })} placeholder="https://youtube.com/watch?v=..." />
                  </label>
                ) : (
                  <label className="field">
                    <span>Local video</span>
                    <input type="file" accept="video/*" onChange={(event) => mergeSource({ localVideoName: event.target.files?.[0]?.name || "" })} />
                  </label>
                )}
                <label className="field">
                  <span>Subtitle file</span>
                  <input type="file" accept=".srt,.vtt,.txt" onChange={(event) => mergeSource({ subtitleFileName: event.target.files?.[0]?.name || "" })} />
                </label>
                <div className="field-grid">
                  <label className="field">
                    <span>Transcript</span>
                    <select value={workspace.source.transcriptMode} onChange={(event) => mergeSource({ transcriptMode: event.target.value as ClipperSourceSettings["transcriptMode"] })}>
                      {transcriptModeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Source quality</span>
                    <select value={workspace.source.sourceQuality} onChange={(event) => mergeSource({ sourceQuality: event.target.value as ClipperSourceSettings["sourceQuality"] })}>
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                    </select>
                  </label>
                </div>
                <div className="inline-segment">
                  <button className={workspace.source.cookieAccess === "none" ? "is-active" : ""} type="button" onClick={() => mergeSource({ cookieAccess: "none" })}>No cookies</button>
                  <button className={workspace.source.cookieAccess === "browser" ? "is-active" : ""} type="button" onClick={() => mergeSource({ cookieAccess: "browser" })}>Browser</button>
                  <button className={workspace.source.cookieAccess === "file" ? "is-active" : ""} type="button" onClick={() => mergeSource({ cookieAccess: "file" })}>cookies.txt</button>
                </div>
                {workspace.source.cookieAccess !== "none" ? (
                  <div className="field-grid">
                    <label className="field">
                      <span>Browser</span>
                      <select value={workspace.source.browserProfile} onChange={(event) => mergeSource({ browserProfile: event.target.value as ClipperSourceSettings["browserProfile"] })}>
                        {browserProfileOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    {workspace.source.cookieAccess === "file" ? (
                      <label className="field">
                        <span>cookies.txt</span>
                        <input type="file" accept=".txt" onChange={(event) => mergeSource({ cookiesFileName: event.target.files?.[0]?.name || "" })} />
                      </label>
                    ) : null}
                  </div>
                ) : null}
                <div className="field-grid">
                  <label className="field">
                    <span>Target clips</span>
                    <input inputMode="numeric" value={String(workspace.source.clipCount)} onChange={(event) => mergeSource({ clipCount: Math.max(3, Math.min(10, Number.parseInt(event.target.value || "10", 10) || 10)) })} />
                  </label>
                  <label className="field">
                    <span>Current source</span>
                    <input value={sourceLabel} readOnly />
                  </label>
                </div>
                <label className="field">
                  <span>Notes</span>
                  <textarea value={workspace.source.notes} onChange={(event) => mergeSource({ notes: event.target.value })} placeholder="Hook preference, style, subtitle notes." />
                </label>
                <div className="action-row">
                  <button className="primary-button" type="button" disabled={submitting} onClick={handleAnalyze}>{submitting ? "Analyzing..." : "Analyze"}</button>
                  <button className="ghost-button" type="button" onClick={() => { setWorkspace(defaultClipperWorkspaceState); setJob(null); setError(""); }}>Reset</button>
                </div>
              </div>
            ) : (
              <div className="stack-form">
                <div className="summary-grid">
                  <div className="summary-card"><span>Selected</span><strong>{workspace.selectedClipIds.length}</strong></div>
                  <div className="summary-card"><span>Output mode</span><strong>{workspace.framing.outputMode}</strong></div>
                  <div className="summary-card"><span>Resolution</span><strong>{workspace.output.resolution}</strong></div>
                  <div className="summary-card"><span>Captions</span><strong>{workspace.subtitle.enabled ? workspace.subtitle.template : "Off"}</strong></div>
                </div>
                <label className="field">
                  <span>Output mode</span>
                  <select value={workspace.framing.outputMode} onChange={(event) => mergeFraming({ outputMode: event.target.value as ClipperFramingSettings["outputMode"] })}>
                    {outputModeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Resolution</span>
                  <select value={workspace.output.resolution} onChange={(event) => mergeOutput({ resolution: event.target.value as ClipperOutputSettings["resolution"] })}>
                    {resolutionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={workspace.output.titleVoEnabled} onChange={(event) => mergeOutput({ titleVoEnabled: event.target.checked })} />
                  <span>Enable title VO</span>
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={workspace.gaming.enabled} onChange={(event) => mergeGaming({ enabled: event.target.checked })} />
                  <span>Enable gaming layout</span>
                </label>
                <div className="action-row">
                  <button className="primary-button" type="button" disabled={submitting || workspace.selectedClipIds.length === 0} onClick={queueRender}>Render Clips</button>
                  <button className="ghost-button" type="button" onClick={() => setAdvancedDrawerOpen(true)}>More settings</button>
                </div>
              </div>
            )}
          </aside>

          <section className="workspace-panel center-panel">
            <div className="center-toolbar">
              <div className="inline-segment compact">
                <button type="button" onClick={() => setWorkspace((current) => ({ ...current, zoomPercent: Math.max(70, current.zoomPercent - 10) }))}>-</button>
                <strong>{workspace.zoomPercent}%</strong>
                <button type="button" onClick={() => setWorkspace((current) => ({ ...current, zoomPercent: Math.min(140, current.zoomPercent + 10) }))}>+</button>
              </div>
              <div className="metric-row">
                <span>{workspace.output.resolution}</span>
                <span>{workspace.framing.framingMode}</span>
                <span>{workspace.selectedClipIds.length} selected</span>
              </div>
            </div>
            <div className="preview-grid">
              <div className="preview-card">
                <div className="preview-head"><span>Source video</span><span>{workspace.source.inputMode}</span></div>
                <div className="preview-stage source-stage">
                  <strong>{sourceReady ? sourceLabel : "No analyzed source yet"}</strong>
                  <span>{workspace.source.inputMode === "youtube" ? "Paste URL lalu Analyze." : workspace.source.localVideoName || "Choose local file."}</span>
                </div>
              </div>
              <div className="preview-card">
                <div className="preview-head"><span>Output preview</span><span>{workspace.framing.outputMode}</span></div>
                <div className="preview-stage output-stage">
                  {activeClip ? (
                    <>
                      <strong>{activeClip.title}</strong>
                      <span>{activeClip.rangeLabel}</span>
                      {workspace.subtitle.enabled ? <div className="caption-ghost" style={{ "--caption-bg": workspace.subtitle.highlightColor, "--caption-fill": workspace.subtitle.textColor } as CSSProperties}>{activeClip.hook}</div> : null}
                    </>
                  ) : (
                    <>
                      <strong>Select clip from the right panel</strong>
                      <span>Preview final akan muncul di sini dengan caption dan framing aktif.</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="preview-footer">
              <div>
                <span className="footer-label">Selection status</span>
                <strong>{workspace.selectedClipIds.length === 0 ? "No clips selected" : `${workspace.selectedClipIds.length} clips ready`}</strong>
                <p>{activeClip ? `${activeClip.durationLabel} / score ${activeClip.score}` : "Analyze source lalu pilih clips yang mau dirender."}</p>
              </div>
              <div className="action-row">
                <button className="primary-button" type="button" disabled={submitting || workspace.selectedClipIds.length === 0} onClick={queueRender}>Render Clips</button>
                <button className="ghost-button" type="button" onClick={() => setWorkspace((current) => ({ ...current, selectedClipIds: [] }))}>Clear selection</button>
              </div>
            </div>
          </section>

          <aside className="workspace-panel side-panel">
            <section className="progress-card">
              <div className="progress-head">
                <div>
                  <span className="panel-kicker">Progress panel</span>
                  <h3>{job?.status || "waiting input"}</h3>
                  <p>{job ? `${job.kind} job` : "idle"}</p>
                </div>
                <div className="progress-ring" style={progressStyle}><strong>{job ? `${job.progress}%` : "--"}</strong></div>
              </div>
              <p>{job?.message || "Analyze source dulu. Clip candidates akan muncul di panel ini."}</p>
              <div className="progress-list">
                {activePhaseOrder.map((phase, index) => (
                  <div key={phase} className={`progress-step${job?.status === "completed" || index < Math.max(phaseIndex, 0) ? " is-done" : ""}${job?.status !== "completed" && index === Math.max(phaseIndex, 0) ? " is-active" : ""}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{phaseLabel[phase]}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="list-card">
              <div className="list-head">
                <div>
                  <span className="panel-kicker">Analyzed clips</span>
                  <h3>{workspace.analyzedClips.length} detected</h3>
                </div>
                <span className="count-pill">{workspace.selectedClipIds.length} selected</span>
              </div>
              <div className="card-list">
                {workspace.analyzedClips.length === 0 ? (
                  <div className="empty-state"><strong>No clips yet</strong><span>Analyze first.</span></div>
                ) : (
                  workspace.analyzedClips.map((clip) => (
                    <button key={clip.id} className={`clip-item${workspace.selectedClipIds.includes(clip.id) ? " is-selected" : ""}`} type="button" onClick={() => toggleClip(clip.id)}>
                      <div className="clip-item-head"><strong>{clip.title}</strong><span>{clip.score}</span></div>
                      <span>{clip.rangeLabel} / {clip.durationLabel}</span>
                      <p>{clip.hook}</p>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="list-card">
              <div className="list-head">
                <div>
                  <span className="panel-kicker">Render queue</span>
                  <h3>{workspace.renderedClips.length} items</h3>
                </div>
              </div>
              <div className="card-list">
                {workspace.renderedClips.length === 0 ? (
                  <div className="empty-state"><strong>No queue yet</strong><span>Select clips and click Render Clips.</span></div>
                ) : (
                  workspace.renderedClips.map((item) => (
                    <div key={item.id} className="render-item">
                      <strong>{item.title}</strong>
                      <span>{item.durationLabel} / {item.presetLabel}</span>
                      <p>{item.status}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
      </section>

      <Drawer open={apiDrawerOpen} title="API Keys and Provider Routing" onClose={() => setApiDrawerOpen(false)}>
        <div className="stack-form">
          <div className="inline-segment">
            {(["gemini", "groq"] as const).map((provider) => (
              <button key={provider} className={workspace.api.activeProvider === provider ? "is-active" : ""} type="button" onClick={() => mergeApi({ activeProvider: provider })}>{providerLabel[provider]}</button>
            ))}
          </div>
          <div className="summary-grid">
            <div className="summary-card"><span>Gemini</span><strong>{countFilled(workspace.api.geminiKeys)} keys</strong></div>
            <div className="summary-card"><span>Groq</span><strong>{countFilled(workspace.api.groqKeys)} keys</strong></div>
            <div className="summary-card"><span>Supadata</span><strong>{workspace.api.supadataApiKey ? "Configured" : "Empty"}</strong></div>
            <div className="summary-card"><span>TTS</span><strong>{workspace.api.microsoftTtsKey ? "Configured" : "Empty"}</strong></div>
          </div>
          {(["geminiKeys", "groqKeys"] as const).map((group) => (
            <div key={group} className="stack-form">
              <div className="list-head">
                <h3>{group}</h3>
                <button className="ghost-button" type="button" onClick={() => addKey(group)}>Add</button>
              </div>
              {workspace.api[group].map((value, index) => (
                <input key={`${group}-${index}`} value={value} onChange={(event) => updateKey(group, index, event.target.value)} placeholder={group === "geminiKeys" ? "AIza..." : "gsk_..."} />
              ))}
            </div>
          ))}
          <input value={workspace.api.supadataApiKey} onChange={(event) => mergeApi({ supadataApiKey: event.target.value })} placeholder="Supadata API key" />
          <input value={workspace.api.microsoftTtsKey} onChange={(event) => mergeApi({ microsoftTtsKey: event.target.value })} placeholder="Microsoft TTS key" />
          <div className="field-grid">
            <input value={workspace.api.microsoftTtsRegion} onChange={(event) => mergeApi({ microsoftTtsRegion: event.target.value })} placeholder="Region" />
            <input value={workspace.api.microsoftTtsVoice} onChange={(event) => mergeApi({ microsoftTtsVoice: event.target.value })} placeholder="Voice" />
          </div>
        </div>
      </Drawer>

      <Drawer open={advancedDrawerOpen} title="Advanced Clipper Settings" onClose={() => setAdvancedDrawerOpen(false)}>
        <div className="stack-form">
          <div className="field-grid">
            <label className="field"><span>Template</span><select value={workspace.subtitle.template} onChange={(event) => mergeSubtitle({ template: event.target.value as ClipperSubtitleSettings["template"] })}>{captionTemplateOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label className="field"><span>Animation</span><select value={workspace.subtitle.animationType} onChange={(event) => mergeSubtitle({ animationType: event.target.value as ClipperSubtitleSettings["animationType"] })}>{captionAnimationOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          </div>
          <div className="field-grid">
            <label className="field"><span>Font</span><input value={workspace.subtitle.fontName} onChange={(event) => mergeSubtitle({ fontName: event.target.value })} /></label>
            <label className="field"><span>Language</span><input value={workspace.subtitle.language} onChange={(event) => mergeSubtitle({ language: event.target.value })} /></label>
          </div>
          <div className="field-grid">
            <label className="field"><span>Framing</span><select value={workspace.framing.framingMode} onChange={(event) => mergeFraming({ framingMode: event.target.value as ClipperFramingSettings["framingMode"] })}>{framingModeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label className="field"><span>Shot type</span><select value={workspace.framing.shotType} onChange={(event) => mergeFraming({ shotType: event.target.value as ClipperFramingSettings["shotType"] })}>{shotTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          </div>
          <div className="field-grid">
            <label className="field"><span>Resolution</span><select value={workspace.output.resolution} onChange={(event) => mergeOutput({ resolution: event.target.value as ClipperOutputSettings["resolution"] })}>{resolutionOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label className="field"><span>Output mode</span><select value={workspace.framing.outputMode} onChange={(event) => mergeFraming({ outputMode: event.target.value as ClipperFramingSettings["outputMode"] })}>{outputModeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          </div>
          <div className="field-grid">
            <label className="field"><span>Vignette</span><input type="range" min="0" max="100" value={workspace.effects.vignette} onChange={(event) => mergeEffects({ vignette: Number.parseInt(event.target.value, 10) })} /></label>
            <label className="field"><span>Grunge</span><input type="range" min="0" max="100" value={workspace.effects.grunge} onChange={(event) => mergeEffects({ grunge: Number.parseInt(event.target.value, 10) })} /></label>
          </div>
          <div className="field-grid">
            <label className="field"><span>Text color</span><input type="color" value={workspace.subtitle.textColor} onChange={(event) => mergeSubtitle({ textColor: event.target.value })} /></label>
            <label className="field"><span>Highlight</span><input type="color" value={workspace.subtitle.highlightColor} onChange={(event) => mergeSubtitle({ highlightColor: event.target.value })} /></label>
          </div>
          <label className="toggle"><input type="checkbox" checked={workspace.subtitle.enabled} onChange={(event) => mergeSubtitle({ enabled: event.target.checked })} /><span>Enable captions</span></label>
          <label className="toggle"><input type="checkbox" checked={workspace.subtitle.autoEmoji} onChange={(event) => mergeSubtitle({ autoEmoji: event.target.checked })} /><span>Auto emoji</span></label>
          <label className="toggle"><input type="checkbox" checked={workspace.output.titleVoEnabled} onChange={(event) => mergeOutput({ titleVoEnabled: event.target.checked })} /><span>Title VO</span></label>
          <label className="toggle"><input type="checkbox" checked={workspace.gaming.enabled} onChange={(event) => mergeGaming({ enabled: event.target.checked })} /><span>Gaming layout</span></label>
        </div>
      </Drawer>
    </>
  );
}
