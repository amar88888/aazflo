# PRD — BizOps: Sistem Operasi Bisnes E-Commerce

## Latar Belakang

Founder jual di TikTok Shop, Shopee & website WooCommerce. Kerja harian repetitif:

1. Print AWB TikTok di Seller Center setiap hari jam **10 pagi & 2 petang**
2. Print AWB Shopee
3. Jalankan TikTok Live Studio dengan video recording — 1 recording = 1 slot 3 jam
4. Tiada dashboard tergabung untuk sales & Profit/Loss

**Matlamat:** satu sistem web yang automate & simplify semua kerja ni.

## Keputusan Utama

- Integrasi AWB: **Official API** (Shopee Open Platform + TikTok Shop Partner API) — approval 1–4 minggu, CSV import jadi fallback sementara
- Website: WooCommerce REST API
- Deployment: cloud VPS (Docker Compose); dev guna SQLite di PC Windows
- P&L: sistem ni jadi tempat rekod kos pertama (COGS, ads, kos tetap)

## Modul

### 1. Order & AWB Center ✅ (CSV & WooCommerce) / 🔜 Fasa 3 (API)
- Senarai order semua platform, filter platform/status
- Status: pending → printed → shipped → completed
- Batch "tanda printed" per platform (rekod AwbBatch)
- **Fasa 3:** auto-sync order via API, download AWB PDF batch (Shopee `v2.logistics.download_shipping_document`, TikTok Fulfillment `Get Package Shipping Document`), merge PDF (pdf-lib), reminder Telegram jam 10:00 & 14:00 MYT bila ada pending

### 2. Live Session Manager ✅ (asas)
- Jadual slot 3 jam, library recording, "terakhir guna" untuk elak ulang video sama
- Log prestasi per sesi: sales, peak viewers, nota
- **Fasa 5:** local agent auto-start Live Studio (tak boleh dari cloud)

### 3. Founder Dashboard & P&L ✅
- Revenue/order/AOV 30 hari, trend harian stacked per platform, best sellers
- P&L bulanan: Revenue − Fee Platform − COGS = Gross Profit; − Ads − Kos Tetap − Lain = Net Profit; margin %
- COGS auto-kira dari SKU mapping produk; amaran bila ada item tak berpadanan

## Tech Stack

Next.js 15 (App Router) + TypeScript · Prisma (SQLite dev / PostgreSQL prod) · Tailwind v4 · Recharts · NextAuth (credentials, single admin via env) · papaparse · pdf-lib · Telegram Bot API (Fasa 3)

## Roadmap

| Fasa | Skop | Status |
|---|---|---|
| 0 | User daftar app Shopee Open Platform & TikTok Partner Center | ⏳ tindakan user |
| 1 | Foundation: scaffold, DB, auth, shell | ✅ siap |
| 2 | Dashboard MVP + WooCommerce + CSV import + P&L | ✅ siap |
| 3 | API Shopee/TikTok: OAuth, order sync, batch AWB PDF, reminder Telegram | 🔜 tunggu approval |
| 4 | Live manager penuh (kalendar view, checklist pre-live) | 🔜 |
| 5 | Local print agent, auto-pull ads spend, PWA mobile | 🔜 |
