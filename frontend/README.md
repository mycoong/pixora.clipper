# PIXORA Clipper Web

Frontend scaffold untuk versi web dari Tab Clipper.

## Tujuan

- Deploy UI ke Vercel tanpa memaksa pipeline FFmpeg masuk ke regular Vercel Functions.
- Pisahkan boundary worker sejak awal supaya logic berat dari Electron bisa dipindahkan bertahap.
- Sediakan proxy API minimal untuk `health`, `analyze job`, `render job`, dan `get job`.

## Struktur

- `app/` = Next.js App Router.
- `app/api/` = proxy route dari frontend ke worker.
- `components/` = UI shell Clipper web.
- `lib/` = env dan worker client.
- `types/` = kontrak payload/status.

## Local run

```powershell
cd C:\pixora web\frontend
npm install
npm run dev
```

Isi `.env.local`:

```bash
CLIPPER_WORKER_URL=http://localhost:4010
CLIPPER_WORKER_TOKEN=
```

## Deploy

- Frontend ini cocok dideploy ke Vercel.
- Set `Root Directory` project Vercel ke `frontend`.
- Env yang perlu diisi di Vercel:
  - `CLIPPER_WORKER_URL`
  - `CLIPPER_WORKER_TOKEN` jika worker pakai token
- Worker berat jangan dipaksa ke regular Vercel Functions.
- Jika ingin tetap di ekosistem Vercel, arah yang lebih masuk akal nanti adalah Vercel + Sandbox untuk job berat.
