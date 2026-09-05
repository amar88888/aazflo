# Panduan Pendaftaran API — TikTok Shop & Shopee

Panduan copy-paste untuk daftar app developer. Isi ikut nilai di bawah — dah disediakan untuk sistem BizOps / brand **Aazflo**.

> **Nota domain:** semua callback URL guna `https://app.aazflo.com`. Ko tak perlu tunggu domain live untuk daftar — platform cuma simpan URL ni sebagai teks. Ia hanya perlu berfungsi bila kita test OAuth sebenar (selepas deploy ke VPS). Kalau nanti ko guna domain/subdomain lain, edit je dalam app settings platform + fail `.env`.

---

## A. TikTok Shop Partner

**Portal:** https://partner.tiktokshop.com → Log in → **Manage apps** → **Create app**

| Medan | Nilai untuk diisi |
|---|---|
| App name | `Aazflo` |
| App type / usage | **App developer** → **Seller in-house developer** (app untuk kedai sendiri) |
| App description | `Internal tool to sync orders and print shipping labels (AWB) for our own shops.` |
| Region / market | Pilih semua region ko jual (MY / SG / ID / dll.) |
| Callback / Redirect URL | `https://app.aazflo.com/api/auth/tiktok/callback` |
| Scopes / Permissions | **Order** (read), **Fulfillment / Logistics** (read + shipping document), **Product** (read) |

**Selepas app dicipta, salin nilai ni** (kita akan letak dalam `.env`):
- **App Key** → `TIKTOK_APP_KEY`
- **App Secret** → `TIKTOK_APP_SECRET`

**Authorize app ke kedai ko:** dalam app, cari **"Authorization" / "Test / authorize"** → pilih kedai ko → benarkan. Ini yang jana `auth_code` → sistem tukar jadi access token automatik melalui callback.

---

## B. Shopee Open Platform

> **⏰ Langkah bila bangun (0730) — ikut turutan ni, aku standby co-pilot:**
> 1. Buka Chrome (yang extension Claude dah connect), pergi **https://open.shopee.com**
> 2. **Log in** guna akaun Seller Shopee ko — bahagian login + OTP ni **ko sendiri buat** (aku tak boleh)
> 3. Bila diminta pilih region masa login, guna region kedai ko (MY)
> 4. Bila dah masuk dashboard Open Platform, **benarkan izin extension Claude untuk `open.shopee.com`** (klik icon Claude → Allow on this site)
> 5. Roger aku "dah masuk shopee" — aku terus pandu isi borang Create App guna nilai bawah
> 6. Bila ada OTP/verification, aku berhenti, ko bagi kod, aku sambung — sama macam TikTok tadi

**Portal:** https://open.shopee.com → Log in → **App Management** → **Create App**

| Medan | Nilai untuk diisi |
|---|---|
| App name | `Aazflo` |
| App description | `Internal tool to sync orders and print shipping documents (AWB) for our own shops.` |
| App type | **Standard / ERP** (app untuk kedai sendiri) |
| API categories | **Order**, **Logistics** |
| Redirect / Callback URL | `https://app.aazflo.com/api/auth/shopee/callback` |
| Region | Pilih region ko jual (kedai boleh di-authorize per region) |

**Selepas app dicipta, salin nilai ni:**
- **Partner ID** → `SHOPEE_PARTNER_ID`
- **Partner Key** → `SHOPEE_PARTNER_KEY`
- **Live vs Test/Sandbox** → mula dengan **Test** dulu untuk cuba, tukar ke **Live** bila dah ok

**Authorize app ke kedai ko:** buka **"Authorization" link** dalam Shopee console (atau sistem BizOps akan jana link `shop/auth_partner`), pilih kedai → benarkan → Shopee redirect balik ke callback dengan `code` + `shop_id` → sistem simpan token automatik.

---

## C. Selepas dapat semua kunci

Isi dalam fail `.env` (production di VPS), pastu restart:

```
APP_BASE_URL=https://app.aazflo.com
APP_ENCRYPTION_KEY=<jana: openssl rand -hex 32>

TIKTOK_APP_KEY=...
TIKTOK_APP_SECRET=...

SHOPEE_PARTNER_ID=...
SHOPEE_PARTNER_KEY=...
SHOPEE_REGION=MY          # atau SG / ID
```

Kemudian di **Settings → TikTok / Shopee → Connect**, klik authorize untuk setiap kedai. Lepas connect, order sync + batch AWB PDF + reminder Telegram (10 pagi / 2 petang) akan aktif.

---

## Checklist ringkas

- [ ] Beli domain `aazflo.com` (Cloudflare/Namecheap) — **tindakan sendiri**
- [ ] Daftar & login Partner Center TikTok — **tindakan sendiri**
- [ ] Create app TikTok `Aazflo`, salin App Key + Secret
- [ ] Daftar & login Shopee Open Platform — **tindakan sendiri**
- [ ] Create app Shopee `Aazflo`, salin Partner ID + Key
- [ ] Isi `.env`, deploy ke VPS, authorize setiap kedai
