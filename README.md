# BizOps — Sistem Operasi Bisnes E-Commerce

Dashboard tergabung untuk founder e-commerce yang jual di **TikTok Shop, Shopee & WooCommerce**:
sales overview, Profit & Loss, urus order & AWB, dan jadual TikTok Live session.

## Jalankan (development)

```bash
npm install
npx prisma migrate dev   # setup database (SQLite)
npm run db:seed          # data sample (optional)
npm run dev              # buka http://localhost:3000
```

**Login default (dev):** `admin@bizops.local` / `bizops123` — tukar dalam `.env`.

## Modul

| Halaman | Fungsi |
|---|---|
| Dashboard | Revenue/order/AOV 30 hari, trend harian, perbandingan platform, best sellers |
| Orders & AWB | Senarai order semua platform, filter, tanda printed (individu/batch), import CSV |
| Live Sessions | Jadual slot live 3 jam, library video recording, log prestasi sesi |
| Profit & Loss | Penyata bulanan: revenue − fee − COGS − ads − kos tetap; rekod kos |
| Produk & COGS | Modal seunit per produk, SKU mapping antara platform |
| Settings | Status integrasi & sync WooCommerce |

## Sumber data order

1. **CSV import** (guna sekarang) — export order dari TikTok Seller Center / Shopee Seller Centre, upload di Orders → Import CSV. Parser support header English & Melayu.
2. **WooCommerce API** (guna sekarang) — isi `WOOCOMMERCE_*` dalam `.env`, klik Sync di Settings.
3. **Shopee / TikTok Shop API** (Fasa 3) — selepas app approval di [open.shopee.com](https://open.shopee.com) & [partner.tiktokshop.com](https://partner.tiktokshop.com): auto-sync + batch AWB PDF + reminder Telegram 10:00/14:00.

## Deploy ke VPS (production)

Dev guna SQLite. Untuk production, tukar ke PostgreSQL:

1. Dalam `prisma/schema.prisma`, tukar `provider = "sqlite"` → `provider = "postgresql"`
2. Set `DATABASE_URL` PostgreSQL dalam `.env`, buang folder `prisma/migrations`, jalankan `npx prisma migrate dev --name init`
3. `docker compose up -d --build` (lihat `docker-compose.yml` — servis `app` + `db`)
4. Tukar `NEXTAUTH_SECRET`, `ADMIN_PASSWORD` dan `NEXTAUTH_URL` ke domain sebenar!

## Struktur

```
prisma/schema.prisma          # DB schema (tanpa enum — portable SQLite ↔ Postgres)
src/lib/queries.ts            # Aggregation dashboard & P&L
src/lib/csv.ts                # Parser CSV TikTok/Shopee (alias header EN/BM)
src/lib/integrations/         # woocommerce.ts (Fasa 3: shopee.ts, tiktok.ts)
src/app/(app)/                # Halaman app (dashboard, orders, live, pnl, products, settings)
```

Rujuk `PRD.md` untuk spesifikasi penuh & roadmap fasa.
