# Clipper Web Stack

Struktur repo sekarang:

- `frontend`
  - Next.js app untuk Vercel
  - route `/api/health`, `/api/jobs`, `/api/jobs/[jobId]`
  - workspace Clipper v1 dengan source panel, preview, clip list, API keys drawer, advanced settings drawer
- `worker`
  - service job berat terpisah
  - saat ini masih mock, tapi kontrak dasar sudah ada

## Boundary

Frontend hanya menangani:

- UI workspace
- submit analyze/render request
- polling status job
- settings form

Worker menangani:

- download source
- transcript fetch
- STT fallback
- analysis
- render plan
- FFmpeg render final

## Kenapa dipisah

Kode Electron Clipper sekarang masih sangat tergantung pada:

- proses native
- binary lokal
- file system intensif
- temp file besar
- render video berat

Karena itu frontend web dipisah dari worker sejak awal, supaya parity dengan Electron bisa dipindah bertahap tanpa memaksa semua logic masuk ke Vercel Functions.

## Urutan porting yang paling masuk akal

1. port `clipperFetchYoutubeVtt`
2. port `clipperAnalyzeTranscript`
3. port `clipperTranscribeAudio`
4. port `clipperBuildRenderPlan`
5. port `clipperRenderClip`
