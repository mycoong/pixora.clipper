export type ClipperJobPhase =
  | "queued"
  | "fetch-source"
  | "transcript"
  | "analysis"
  | "render-plan"
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

export interface CreateClipperJobInput {
  sourceType: ClipperSourceType;
  sourceUrl: string;
  transcriptMode: ClipperTranscriptMode;
  outputMode: ClipperOutputMode;
  clipCount: number;
  notes?: string;
}

export interface ClipperArtifact {
  kind: "source" | "transcript" | "plan" | "render";
  label: string;
  url?: string;
}

export interface ClipperJobStatus {
  id: string;
  status: ClipperJobStatusKind;
  phase: ClipperJobPhase;
  progress: number;
  message: string;
  submittedAt: string;
  updatedAt: string;
  payload: CreateClipperJobInput;
  artifacts: ClipperArtifact[];
}

export interface WorkerHealth {
  ok: boolean;
  service: string;
  version: string;
  mockMode: boolean;
}
