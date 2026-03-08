export type ClipperJobPhase =
  | "queued"
  | "fetch-source"
  | "transcript"
  | "analysis"
  | "render-plan"
  | "rendering"
  | "completed"
  | "failed";

export type ClipperJobStatusKind =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type ClipperSourceType = "youtube" | "cloud";

export type ClipperTranscriptMode = "youtube" | "subtitle" | "auto-stt";

export type ClipperOutputMode = "standard" | "variations" | "gaming";

export interface CreateClipperAnalyzeJobInput {
  sourceType: ClipperSourceType;
  sourceUrl: string;
  transcriptMode: ClipperTranscriptMode;
  outputMode: ClipperOutputMode;
  clipCount: number;
  notes?: string;
}

export interface CreateClipperRenderJobInput {
  sourceJobId?: string;
  clipIds: string[];
  outputMode: ClipperOutputMode;
  resolution: string;
  titleVoEnabled?: boolean;
  gamingEnabled?: boolean;
  notes?: string;
}

export type CreateClipperJobInput = CreateClipperAnalyzeJobInput;
export type ClipperJobKind = "analyze" | "render";
export type ClipperJobPayload =
  | CreateClipperAnalyzeJobInput
  | CreateClipperRenderJobInput;

export interface ClipperArtifact {
  kind: "source" | "transcript" | "plan" | "render";
  label: string;
  clipId?: string;
  url?: string;
}

export interface ClipperAnalyzeClip {
  id: string;
  title: string;
  rangeLabel: string;
  durationLabel: string;
  score: number;
  hook: string;
  tags: string[];
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface ClipperRenderResult {
  clipId: string;
  fileName: string;
  url: string;
  status: "ready";
}

export interface ClipperJobResult {
  source?: {
    path: string;
    title: string;
    durationSec: number;
  };
  clips?: ClipperAnalyzeClip[];
  renders?: ClipperRenderResult[];
}

export interface ClipperJobStatus {
  id: string;
  kind: ClipperJobKind;
  status: ClipperJobStatusKind;
  phase: ClipperJobPhase;
  progress: number;
  message: string;
  submittedAt: string;
  updatedAt: string;
  payload: ClipperJobPayload;
  artifacts: ClipperArtifact[];
  result?: ClipperJobResult;
}

export interface WorkerHealth {
  ok: boolean;
  service: string;
  version: string;
  mockMode: boolean;
  routes?: {
    analyze: string;
    render: string;
    status: string;
  };
}
