// Bahagian Fake Hunter yang selamat diimport oleh client component (tiada DB).

export const FAKE_STATUSES = ["disyaki", "dah_adu", "dibuang", "abaikan"] as const;
export type FakeStatus = (typeof FAKE_STATUSES)[number];
export const FAKE_STATUS_LABEL: Record<FakeStatus, string> = {
  disyaki: "Disyaki",
  dah_adu: "Dah adu",
  dibuang: "Dah dibuang ✅",
  abaikan: "Abaikan (sah)",
};

export type FakeListing = {
  id: string;
  platform: string; // Shopee | Lazada | TikTok | Facebook | Lain
  shop: string;
  shopId: string;
  title: string;
  price: number | null;
  sold: number | null;
  location: string;
  url: string;
  risk: "TINGGI" | "SEDERHANA" | "SEMAK" | string;
  reason: string;
  status: FakeStatus;
  note: string;
  foundAt: string;
  updatedAt: string;
};

// Cap dagangan berdaftar — bukti hak milik untuk aduan IP.
export const TRADEMARK = {
  mark: "EVIOR",
  number: "TM2026029122",
  klass: "Kelas 3 (kosmetik)",
  filed: "19 Ogos 2026",
  validUntil: "19 Ogos 2036",
  agent: "Teraju IP Sdn Bhd (admin@terajuip.com)",
  proof: "PDF notis pendaftaran — emel Teraju IP 25 Nov 2026 (equties8@gmail.com)",
};

// Pautan carian portal aduan (alamat rasmi portal kadang bertukar — guna carian supaya tak patah).
export const PORTALS: Record<string, { name: string; url: string }> = {
  Shopee: { name: "Shopee Brand IP Portal", url: "https://brandipp.shopee.com/" },
  Lazada: { name: "Lazada IPP (Alibaba IP Protection)", url: "https://ipp.alibabagroup.com/" },
  TikTok: { name: "TikTok Shop IP Protection Center", url: "https://www.google.com/search?q=TikTok+Shop+Intellectual+Property+Protection+Center+IPPC" },
  Facebook: { name: "Meta IP Report (trademark)", url: "https://www.facebook.com/help/contact/1057530731007541" },
};

export function newId(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 10);
}

export function guessPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("shopee")) return "Shopee";
  if (u.includes("lazada")) return "Lazada";
  if (u.includes("tiktok")) return "TikTok";
  if (u.includes("facebook") || u.includes("fb.com")) return "Facebook";
  if (u.includes("instagram")) return "Instagram";
  return "Lain";
}

// Ayat aduan sedia salin (BM + EN ringkas) untuk portal IP.
export function complaintText(l: FakeListing): string {
  return [
    `Listing: ${l.url}`,
    `Kedai: ${l.shop}${l.shopId ? ` (ID ${l.shopId})` : ""}`,
    "",
    `This listing uses our registered trademark "EVIOR" (Malaysia ${TRADEMARK.number}, Class 3) and our product names "Facelim" / "Maxlim" without authorisation.`,
    `We (EVIOR / RICH MARZ GLOBAL) have NO agents, distributors or resellers on this platform other than our official store. This seller is not authorised to sell or use our brand.`,
    l.price != null ? `The listing price (RM${l.price.toFixed(2)}) is far from our official price (RM49), indicating counterfeit or unauthorised goods.` : "",
    `We request immediate removal of this listing and action against the seller.`,
    "",
    `Senarai ini menggunakan cap dagangan berdaftar "EVIOR" (${TRADEMARK.number}) tanpa kebenaran. Kami tiada ejen/pengedar selain kedai rasmi. Mohon listing ini dibuang.`,
  ]
    .filter((x) => x !== "")
    .join("\n");
}
