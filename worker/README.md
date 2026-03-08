# PIXORA Clipper Worker

Worker untuk job berat Clipper.

## Status

Versi ini sudah live untuk pipeline dasar:

- `analyze` source YouTube via `yt-dlp`
- probe durasi source via `ffprobe`
- generate kandidat clip dari timeline source nyata
- `render` ke MP4 via `ffmpeg`
- expose artifact download URL

Yang belum dipindahkan dari Electron:

- crop/face-tracking mode `single/split/stacked/wide`
- subtitle burn + template style
- pipeline transcript AI lengkap
- queue/distributed storage

## Endpoints

- `GET /health`
- `POST /jobs/analyze`
- `POST /jobs/render`
- `GET /jobs/:id`
- `GET /artifacts/:jobId/:fileName`

`POST /jobs` masih diterima sebagai alias analyze.

## Local run

```powershell
cd C:\pixora web\worker
npm run dev
```

Opsional `.env`:

```bash
PORT=4010
CLIPPER_WORKER_TOKEN=
FFMPEG_PATH=
FFPROBE_PATH=
YTDLP_PATH=
CLIPPER_WORKER_DATA_DIR=
```

Catatan:

- Jika `yt-dlp` tidak ada di PATH, worker akan coba auto-download ke data dir worker.
- Source `upload://` dari browser belum didukung di worker ini, gunakan YouTube URL dulu.
