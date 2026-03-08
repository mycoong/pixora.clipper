import type {
  ClipperOutputMode,
  ClipperTranscriptMode,
  CreateClipperJobInput
} from "@/types/clipper";

export type ClipperSourceInputMode = "youtube" | "upload";
export type ClipperCookieAccess = "none" | "browser" | "file";
export type ClipperBrowserProfile = "chrome" | "edge" | "brave";
export type ClipperAiProvider = "gemini" | "groq";
export type ClipperSourceQuality = "720p" | "1080p";
export type ClipperFramingMode = "auto" | "single" | "dual" | "stack" | "wide";
export type ClipperShotType = "auto" | "face" | "action";
export type ClipperCaptionTemplate = "kinetic" | "cinema" | "clean";
export type ClipperCaptionAnimation = "word-pop" | "slide-up" | "none";
export type ClipperCaptionPosition = "bottom" | "center" | "top";
export type ClipperOutputResolution = "720x1280" | "1080x1920";
export type ClipperGamingLayout = "split" | "stacked";
export type ClipperGamingRatio = "16:9" | "4:3";
export type ClipperGamingCorner = "left" | "right";
export type ClipperRenderEntryStatus = "draft" | "queued" | "ready";

export interface ClipperSourceSettings {
  inputMode: ClipperSourceInputMode;
  youtubeUrl: string;
  localVideoName: string;
  subtitleFileName: string;
  transcriptMode: ClipperTranscriptMode;
  cookieAccess: ClipperCookieAccess;
  browserProfile: ClipperBrowserProfile;
  cookiesFileName: string;
  sourceQuality: ClipperSourceQuality;
  clipCount: number;
  notes: string;
}

export interface ClipperApiSettings {
  activeProvider: ClipperAiProvider;
  geminiKeys: string[];
  groqKeys: string[];
  supadataApiKey: string;
  microsoftTtsKey: string;
  microsoftTtsRegion: string;
  microsoftTtsVoice: string;
}

export interface ClipperSubtitleSettings {
  enabled: boolean;
  template: ClipperCaptionTemplate;
  animationType: ClipperCaptionAnimation;
  fontName: string;
  fontSize: number;
  textColor: string;
  highlightColor: string;
  strokeColor: string;
  strokeWidth: number;
  position: ClipperCaptionPosition;
  marginV: number;
  maxLines: number;
  autoEmoji: boolean;
  language: string;
}

export interface ClipperFramingSettings {
  framingMode: ClipperFramingMode;
  shotType: ClipperShotType;
  outputMode: ClipperOutputMode;
}

export interface ClipperEffectsSettings {
  viralHookOverlayEnabled: boolean;
  vignette: number;
  grunge: number;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkImageName: string;
}

export interface ClipperOutputSettings {
  resolution: ClipperOutputResolution;
  titleVoEnabled: boolean;
  titleVoVoice: string;
}

export interface ClipperGamingSettings {
  enabled: boolean;
  layout: ClipperGamingLayout;
  ratio: ClipperGamingRatio;
  corner: ClipperGamingCorner;
  facecamSize: number;
}

export interface ClipperClipCandidate {
  id: string;
  title: string;
  rangeLabel: string;
  durationLabel: string;
  score: number;
  hook: string;
  tags: string[];
}

export interface ClipperRenderedClip {
  id: string;
  title: string;
  status: ClipperRenderEntryStatus;
  durationLabel: string;
  presetLabel: string;
}

export interface ClipperWorkspaceState {
  source: ClipperSourceSettings;
  api: ClipperApiSettings;
  subtitle: ClipperSubtitleSettings;
  framing: ClipperFramingSettings;
  effects: ClipperEffectsSettings;
  output: ClipperOutputSettings;
  gaming: ClipperGamingSettings;
  analyzedClips: ClipperClipCandidate[];
  selectedClipIds: string[];
  renderedClips: ClipperRenderedClip[];
  zoomPercent: number;
}

export const browserProfileOptions: ClipperBrowserProfile[] = [
  "chrome",
  "edge",
  "brave"
];

export const transcriptModeOptions: ClipperTranscriptMode[] = [
  "youtube",
  "subtitle",
  "auto-stt"
];

export const outputModeOptions: ClipperOutputMode[] = [
  "standard",
  "variations",
  "gaming"
];

export const captionTemplateOptions: ClipperCaptionTemplate[] = [
  "kinetic",
  "cinema",
  "clean"
];

export const captionAnimationOptions: ClipperCaptionAnimation[] = [
  "word-pop",
  "slide-up",
  "none"
];

export const framingModeOptions: ClipperFramingMode[] = [
  "auto",
  "single",
  "dual",
  "stack",
  "wide"
];

export const shotTypeOptions: ClipperShotType[] = [
  "auto",
  "face",
  "action"
];

export const resolutionOptions: ClipperOutputResolution[] = [
  "720x1280",
  "1080x1920"
];

export const defaultClipperWorkspaceState: ClipperWorkspaceState = {
  source: {
    inputMode: "youtube",
    youtubeUrl: "",
    localVideoName: "",
    subtitleFileName: "",
    transcriptMode: "youtube",
    cookieAccess: "none",
    browserProfile: "chrome",
    cookiesFileName: "",
    sourceQuality: "1080p",
    clipCount: 10,
    notes: ""
  },
  api: {
    activeProvider: "gemini",
    geminiKeys: [""],
    groqKeys: [""],
    supadataApiKey: "",
    microsoftTtsKey: "",
    microsoftTtsRegion: "southeastasia",
    microsoftTtsVoice: "en-US-JennyNeural"
  },
  subtitle: {
    enabled: true,
    template: "kinetic",
    animationType: "word-pop",
    fontName: "Montserrat",
    fontSize: 48,
    textColor: "#F4F4F5",
    highlightColor: "#64C33C",
    strokeColor: "#7E6767",
    strokeWidth: 6,
    position: "bottom",
    marginV: 73,
    maxLines: 2,
    autoEmoji: false,
    language: "auto"
  },
  framing: {
    framingMode: "auto",
    shotType: "auto",
    outputMode: "standard"
  },
  effects: {
    viralHookOverlayEnabled: false,
    vignette: 24,
    grunge: 0,
    watermarkEnabled: false,
    watermarkText: "",
    watermarkImageName: ""
  },
  output: {
    resolution: "1080x1920",
    titleVoEnabled: false,
    titleVoVoice: "en-US-JennyNeural"
  },
  gaming: {
    enabled: false,
    layout: "split",
    ratio: "16:9",
    corner: "right",
    facecamSize: 34
  },
  analyzedClips: [],
  selectedClipIds: [],
  renderedClips: [],
  zoomPercent: 100
};

const clipBlueprints = [
  {
    startSec: 14,
    durationSec: 26,
    title: "Cold Open Hook",
    hook: "Punch in right before the first unexpected claim lands.",
    tags: ["hook", "retention"]
  },
  {
    startSec: 62,
    durationSec: 31,
    title: "Problem Escalation",
    hook: "This segment already has tension and a clean turn for captions.",
    tags: ["setup", "tension"]
  },
  {
    startSec: 118,
    durationSec: 29,
    title: "Audience Payoff",
    hook: "Keep the answer short and let the reaction carry the clip.",
    tags: ["payoff", "reaction"]
  },
  {
    startSec: 176,
    durationSec: 24,
    title: "Contrarian Moment",
    hook: "Strong candidate for a bold subtitle preset and tighter crop.",
    tags: ["opinion", "viral"]
  },
  {
    startSec: 228,
    durationSec: 33,
    title: "Mini Story Arc",
    hook: "Best used when you want a slightly longer narrative cut.",
    tags: ["story", "emotion"]
  },
  {
    startSec: 292,
    durationSec: 27,
    title: "Closing Punchline",
    hook: "Good fallback clip when you need a fast outro or callback.",
    tags: ["callback", "closer"]
  }
] as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getUploadSourceUrl(fileName: string) {
  const slug = slugify(fileName || "local-video");
  return `upload://${slug || "local-video"}`;
}

export function getSourceDisplayName(state: ClipperWorkspaceState) {
  if (state.source.inputMode === "upload" && state.source.localVideoName.trim()) {
    return state.source.localVideoName.trim();
  }

  if (!state.source.youtubeUrl.trim()) {
    return "Waiting input";
  }

  try {
    const url = new URL(state.source.youtubeUrl.trim());
    const value = `${url.hostname.replace(/^www\./, "")}${url.pathname}`;
    return value.length > 36 ? `${value.slice(0, 33)}...` : value;
  } catch {
    return state.source.youtubeUrl.trim();
  }
}

export function buildCreateJobInputFromWorkspace(
  state: ClipperWorkspaceState
): CreateClipperJobInput {
  const sourceUrl =
    state.source.inputMode === "youtube"
      ? state.source.youtubeUrl.trim()
      : getUploadSourceUrl(state.source.localVideoName);

  return {
    sourceType: state.source.inputMode === "youtube" ? "youtube" : "cloud",
    sourceUrl,
    transcriptMode: state.source.transcriptMode,
    outputMode: state.framing.outputMode,
    clipCount: state.source.clipCount,
    notes: state.source.notes.trim()
  };
}

export function createMockClipCandidates(
  state: ClipperWorkspaceState
): ClipperClipCandidate[] {
  const sourceLabel = getSourceDisplayName(state);
  const count = Math.max(3, Math.min(state.source.clipCount, clipBlueprints.length));

  return clipBlueprints.slice(0, count).map((blueprint, index) => {
    const endSec = blueprint.startSec + blueprint.durationSec;
    return {
      id: `clip-${index + 1}`,
      title: `${blueprint.title} / ${sourceLabel}`,
      rangeLabel: `${formatClock(blueprint.startSec)} - ${formatClock(endSec)}`,
      durationLabel: `${blueprint.durationSec}s`,
      score: 96 - index * 4,
      hook: blueprint.hook,
      tags: [...blueprint.tags]
    };
  });
}

export function createRenderQueueFromSelection(
  state: ClipperWorkspaceState
): ClipperRenderedClip[] {
  const selected = state.analyzedClips.filter((clip) =>
    state.selectedClipIds.includes(clip.id)
  );

  return selected.map((clip) => ({
    id: `render-${clip.id}`,
    title: clip.title,
    status: "draft",
    durationLabel: clip.durationLabel,
    presetLabel: `${state.output.resolution} / ${state.framing.outputMode}`
  }));
}
