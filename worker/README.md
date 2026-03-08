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

## Docker run (local)

```powershell
cd C:\pixora web
docker build -t pixora-clipper-worker:local .\worker
docker run --rm -p 4010:4010 `
  -e CLIPPER_WORKER_TOKEN=your-token `
  pixora-clipper-worker:local
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

## Deploy config

- Render Blueprint: `../render.yaml`
- Railway config: `./railway.toml`
