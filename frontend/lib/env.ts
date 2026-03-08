export const clipperEnv = {
  workerUrl: (process.env.CLIPPER_WORKER_URL || "").trim(),
  workerToken: (process.env.CLIPPER_WORKER_TOKEN || "").trim()
};

export function isWorkerConfigured() {
  return clipperEnv.workerUrl.length > 0;
}
