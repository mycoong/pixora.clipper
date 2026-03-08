# PIXORA Clipper Web

Repo terpisah untuk web app Clipper.

## Struktur

- `frontend/`
  - Next.js app untuk deploy ke Vercel
  - UI workspace Clipper, proxy API, dan health check
- `worker/`
  - service job berat terpisah
  - sekarang masih mock starter
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

Worker jangan dipasang ke regular Vercel Functions. Deploy terpisah ke VM, container, Railway, Render, Fly.io, atau service lain yang cocok untuk FFmpeg/yt-dlp/job panjang.

## Dampak ke Electron

Tidak ada dependency runtime dari repo ini ke aplikasi Electron lama. Folder lama di `app_unextracted` sudah tidak dipakai lagi.
