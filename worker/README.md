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
- `POST /jobs/analyze`
- `POST /jobs/render`
- `GET /jobs/:id`

`POST /jobs` masih diterima sebagai alias analyze untuk backward compatibility.

## Local run

```powershell
cd C:\pixora web\worker
npm run dev
```

Opsional `.env`:

```bash
PORT=4010
CLIPPER_WORKER_TOKEN=
```

## Kontrak saat ini

Analyze payload:

```json
{
  "sourceType": "youtube",
  "sourceUrl": "https://youtube.com/watch?v=...",
  "transcriptMode": "youtube",
  "outputMode": "standard",
  "clipCount": 6,
  "notes": ""
}
```

Render payload:

```json
{
  "sourceJobId": "job_ab12cd34",
  "clipIds": ["clip-1", "clip-2"],
  "outputMode": "standard",
  "resolution": "1080x1920",
  "titleVoEnabled": false,
  "gamingEnabled": false,
  "notes": ""
}
```

## Next porting target dari Electron

- pindahkan `clipper-download-youtube`
- pindahkan `clipper-fetch-youtube-vtt`
- pindahkan `clipper-analyze-transcript`
- pindahkan `clipper-build-render-plan`
- pindahkan `clipper-render-clip`
