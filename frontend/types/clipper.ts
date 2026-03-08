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
  url?: string;
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
