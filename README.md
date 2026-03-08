# PIXORA Clipper Web

Repo terpisah untuk web app Clipper.

## Struktur

- `frontend/`
  - Next.js app untuk deploy ke Vercel
  - UI workspace Clipper, proxy API, dan health check
- `worker/`
  - service job berat terpisah (yt-dlp + ffmpeg)
  - source code + Dockerfile + config Render/Railway
- `STACK.md`
  - boundary migrasi dari Electron ke web
- `package.json`
  - script root untuk jalanin frontend/worker dari satu repo

## Local

Frontend:

```powershell
cd C:\pixora web
npm.cmd run dev:frontend
```

Worker:

```powershell
cd C:\pixora web
npm.cmd run dev:worker
```

Build worker image lokal:

```powershell
cd C:\pixora web
docker build -t pixora-clipper-worker:local .\worker
```

## Vercel

Deploy frontend saja ke Vercel.

Setting yang dipakai:

1. Import repo ini ke Vercel
2. Set `Root Directory` ke `frontend`
3. Biarkan framework `Next.js`
4. Env yang wajib:
   - `CLIPPER_WORKER_URL`
   - `CLIPPER_WORKER_TOKEN` jika worker pakai token

Config Vercel yang dicommit ada di `frontend/vercel.json`.

Nilai env yang perlu diisi di Vercel:

- `CLIPPER_WORKER_URL`
  - isi dengan base URL worker kamu
  - contoh: `https://pixora-worker.example.com`
- `CLIPPER_WORKER_TOKEN`
  - opsional
  - isi hanya jika worker dijaga shared token

Saya sarankan dua env itu diisi untuk:

- `Production`
- `Preview`
- `Development`

Urutan connect di dashboard Vercel:

1. Add New Project
2. Import repo `mycoong/pixora.clipper`
3. Saat project settings muncul, set `Root Directory` ke `frontend`
4. Confirm framework `Next.js`
5. Tambahkan env di atas
6. Deploy

Referensi resmi:

- GitHub integration: https://vercel.com/docs/git/vercel-for-github
- Root Directory: https://vercel.com/docs/builds/configure-a-build#root-directory
- Environment Variables: https://vercel.com/docs/environment-variables

Worker jangan dipasang ke regular Vercel Functions. Deploy terpisah ke VM/container service yang always-on.

## Deploy Worker (Always-On)

File yang sudah disiapkan:

- `worker/Dockerfile`
- `render.yaml` (Render Blueprint)
- `worker/railway.toml`

Setelah worker punya URL publik, isi ke Vercel frontend:

- `CLIPPER_WORKER_URL=https://<worker-host>`
- `CLIPPER_WORKER_TOKEN=<token-yang-sama-dengan-worker>` (opsional)

## Dampak ke Electron

Tidak ada dependency runtime dari repo ini ke aplikasi Electron lama. Folder lama di `app_unextracted` sudah tidak dipakai lagi.
