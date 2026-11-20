# Aazflo (bizops) — pusat monitoring EVIOR

Dashboard tunggal: order semua kedai Woo, AWB/tracking NinjaVan, P&L, kos iklan Meta, cashflow, COD.

## Stack
- Next.js (App Router, SSR) + Prisma + **SQLite** (`file:./prod.db`, WAL mode)
- Repo: GitHub `amar88888/aazflo` (branch `main`) → auto-deploy Cloudways **Velocity** → https://aazflo.com
- Env: `.env` (dev, termasuk `EXTRA_WOO_STORES` JSON), `.env.production` (prod, `CRON_SECRET`, `WOOCOMMERCE_*`). Kedua-dua gitignored.

## Arahan
- `npm run dev` · `npm run build` (postbuild: `prisma/migrate-safe.mjs` + `prisma/seed-prod.mjs`)
- Cron: `https://aazflo.com/api/cron/<nama>?secret=CRON_SECRET` (cth `dedupe-orders`, `woo-webhook`, maintenance)

## Peraturan deploy
1. Push ke main **tak bermakna live**. Sahkan di Cloudways → Velocity → aazflo → Deployment Management, dan hit endpoint yang berubah.
2. Auto-deploy kadang tak trigger → tekan Redeploy.
3. Migration baru: app live pegang lock SQLite → mungkin perlu stop PM2 dulu; lepas berjaya, tambah nama folder ke `prisma/migrations-applied.txt`.
4. Jangan commit/push tanpa Amar minta. Jangan merge berturut-turut.

@MEMORY.md
