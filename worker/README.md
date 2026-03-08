# PIXORA Clipper Worker

Starter worker untuk job berat Clipper.

## Status

Service ini masih mock orchestration layer. Belum menjalankan:

- `ffmpeg`
- `yt-dlp`
- subtitle burn
- render output
- object storage upload

Tapi kontrak endpoint-nya sudah disiapkan supaya frontend web bisa mulai jalan sekarang.

## Endpoints

- `GET /health`
- `POST /jobs`
- `GET /jobs/:id`

## Local run

```bash
cd services/clipper-worker
npm run dev
```

Opsional `.env`:

```bash
PORT=4010
CLIPPER_WORKER_TOKEN=
```

## Next porting target dari Electron

- pindahkan `clipper-download-youtube`
- pindahkan `clipper-fetch-youtube-vtt`
- pindahkan `clipper-analyze-transcript`
- pindahkan `clipper-build-render-plan`
- pindahkan `clipper-render-clip`
