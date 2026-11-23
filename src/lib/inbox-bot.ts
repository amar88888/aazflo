import { db } from "@/lib/db";
import { loadCredentials } from "@/lib/credentials";
import { getWooStores, type WooStore } from "@/lib/integrations/woocommerce";
import { sendTelegram } from "@/lib/telegram";
import { sendToContact, isCommentChannel } from "@/lib/inbox-send";
import { replyToComment, privateReplyToComment } from "@/lib/meta-inbox";

// ── Bot auto-reply AI (Gemini) untuk Inbox (WhatsApp / Messenger / IG) ──
// Prinsip:
//  • Fakta HANYA dari katalog Woo sebenar + FAQ Amar + pesanan pelanggan — tiada harga rekaan.
//  • Compliance brand.md: tiada claim lemak/kg/jaminan/rawat penyakit.
//  • Tak pasti / komplen / refund / perubatan → serah manusia (needsHuman + Telegram).
//  • Manusia balas dari inbox → bot berhenti untuk kontak tu (botPaused).

export type BotConfig = {
  enabled: boolean;
  geminiKey?: string;
  model?: string; // default gemini-2.5-flash
  faq?: string; // maklumat kedai tambahan yang Amar tulis (COD, tempoh pos, waktu operasi, dll)
};

const DEFAULT_MODEL = "gemini-flash-latest";
const DEBOUNCE_MS = 8000; // tunggu pelanggan habis taip (mesej berturut-turut → satu balasan)
const MAX_BOT_REPLIES_PER_HOUR = 10;

export async function getBotConfig(): Promise<BotConfig> {
  const c = await loadCredentials<BotConfig>("inbox_bot");
  return {
    enabled: !!c?.enabled,
    geminiKey: c?.geminiKey || process.env.GEMINI_API_KEY || undefined,
    model: c?.model || DEFAULT_MODEL,
    faq: c?.faq || "",
  };
}

// ── Katalog produk (harga sebenar dari Woo, cache 30 minit) ──
type Product = { store: string; name: string; price: string; regular: string; url: string; desc: string };
const g = globalThis as unknown as { __botCatalog?: { at: number; items: Product[] } };

function stripHtml(s: string) {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchProducts(store: WooStore): Promise<Product[]> {
  const auth = Buffer.from(`${store.user}:${store.pass}`).toString("base64");
  const res = await fetch(`${store.url}/wp-json/wc/v3/products?status=publish&per_page=50`, {
    headers: { Authorization: `Basic ${auth}`, "User-Agent": "Aazflo/1.0 (+https://aazflo.com)" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const list = (await res.json()) as {
    name: string;
    price: string;
    regular_price: string;
    permalink: string;
    short_description: string;
  }[];
  return list.map((p) => ({
    store: store.name,
    name: p.name,
    price: p.price,
    regular: p.regular_price,
    url: p.permalink,
    desc: stripHtml(p.short_description).slice(0, 200),
  }));
}

export async function getCatalog(): Promise<Product[]> {
  if (g.__botCatalog && Date.now() - g.__botCatalog.at < 30 * 60_000) return g.__botCatalog.items;
  // Nombor EVIOR (+60) layan pelanggan Malaysia — kedai SG tak dimasukkan.
  const stores = (await getWooStores()).filter((s) => !/sg/i.test(s.key) && !/sg\./i.test(s.url) && !/sg\b/i.test(s.name));
  const items = (await Promise.all(stores.map((s) => fetchProducts(s).catch(() => [])))).flat();
  g.__botCatalog = { at: Date.now(), items };
  return items;
}

// ── Pesanan pelanggan (cari ikut nombor telefon WhatsApp) ──
const STATUS_BM: Record<string, string> = {
  pending: "menunggu bayaran",
  processing: "sedang diproses (belum diposkan)",
  "on-hold": "ditahan sementara",
  completed: "selesai / telah diterima",
  cancelled: "dibatalkan",
  refunded: "dipulangkan wang",
  failed: "bayaran gagal",
  "nv-pending-pickup": "AWB siap, menunggu kurier ambil",
  "nv-picked-up": "telah diambil kurier, dalam perjalanan",
  "nv-returned": "dipulangkan oleh kurier",
};

async function findOrdersByPhone(waId: string): Promise<string[]> {
  const local = waId.startsWith("60") ? "0" + waId.slice(2) : waId;
  const stores = (await getWooStores()).filter((s) => !/sg/i.test(s.key));
  const lines: string[] = [];
  for (const s of stores) {
    try {
      const auth = Buffer.from(`${s.user}:${s.pass}`).toString("base64");
      const res = await fetch(`${s.url}/wp-json/wc/v3/orders?search=${encodeURIComponent(local)}&per_page=3`, {
        headers: { Authorization: `Basic ${auth}`, "User-Agent": "Aazflo/1.0 (+https://aazflo.com)" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const orders = (await res.json()) as {
        id: number;
        status: string;
        total: string;
        date_created: string;
        payment_method: string;
        billing?: { phone?: string };
        line_items: { name: string; quantity: number }[];
        meta_data?: { key: string; value: unknown }[];
      }[];
      for (const o of orders) {
        // Pastikan betul-betul nombor sama (search Woo longgar)
        const ph = (o.billing?.phone || "").replace(/\D/g, "");
        if (!ph.endsWith(local.slice(-9))) continue;
        const trk = String(o.meta_data?.find((m) => m.key === "ninja_van_tracking_number")?.value ?? "");
        lines.push(
          `#${o.id} (${s.name}) ${o.date_created.slice(0, 10)} — ${o.line_items.map((i) => `${i.name} x${i.quantity}`).join(", ")} — RM${o.total} ${o.payment_method === "cod" ? "COD" : ""} — status: ${STATUS_BM[o.status] ?? o.status}${trk ? ` — tracking NinjaVan ${trk} (https://www.ninjavan.co/en-my/tracking?id=${trk})` : ""}`,
        );
      }
    } catch {
      /* abaikan kedai yang gagal */
    }
  }
  return lines;
}

// ── Prompt ──
function systemPrompt(catalog: Product[], faq: string, orders: string[], name: string | null, isComment = false) {
  const now = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  const cat = catalog.length
    ? catalog
        // Tiada link produk: slug facelim.com tertulis "maxlim-…" (tinggalan clone) — keliru pelanggan.
        .map((p) => `- [${p.store}] ${p.name}: RM${p.price}${p.regular && p.regular !== p.price ? ` (asal RM${p.regular})` : ""}${p.desc ? ` — ${p.desc}` : ""}`)
        .join("\n")
    : "(katalog tak dapat dimuat — JANGAN sebut harga, serahkan kepada staff jika ditanya harga)";
  return `Anda pembantu khidmat pelanggan EVIOR (WhatsApp/Messenger/Instagram).
Jenama: MAXLIM (botol pink, untuk BADAN — kecuali muka) dan FACELIM (botol biru, untuk MUKA). Website: maxlim.shop, facelim.com.
Masa sekarang (Malaysia): ${now}. Nama pelanggan: ${name || "(tidak diketahui)"}.

GAYA: Bahasa Melayu santai & sopan (ikut bahasa pelanggan jika English). Ringkas: 1–4 ayat. Mesra, emoji sedikit sahaja. Jangan ulang salam setiap mesej.

FAKTA: Guna HANYA maklumat dalam KATALOG, MAKLUMAT KEDAI dan PESANAN di bawah. JANGAN reka harga, promosi, diskaun, stok, tempoh penghantaran, polisi, atau maklumat yang tiada.
LINK ORDER (guna ini sahaja, jangan reka link lain): Facelim → https://facelim.com/ · Maxlim → https://maxlim.shop/

COMPLIANCE (WAJIB): Boleh kata produk membantu kulit/badan NAMPAK lebih tirus, firm, kencang dan membantu rutin penjagaan. DILARANG: kata bakar/cairkan lemak sebagai fakta, "turun X kg", jaminan hasil, rawat/sembuh penyakit, banding dengan ubat. Bila bincang hasil, sebut "hasil berbeza bagi setiap individu". Tiada nasihat perubatan.

SERAH KEPADA STAFF (handoff=true) jika: komplen, produk rosak/salah/tak sampai, minta refund/tukar/batal pesanan, pelanggan marah, isu bayaran, soalan kesihatan/mengandung/menyusu/alahan/penyakit, minta cakap dengan orang, soalan yang jawapannya TIADA dalam maklumat, atau mesej tidak jelas. Bila handoff, "reply" = ayat sopan bahawa staff akan bantu sebentar lagi (jangan janji masa tepat).
JANGAN minta atau terima nombor kad/akaun bank/kata laluan.

KATALOG (harga semasa dari website):
${cat}

MAKLUMAT KEDAI (dari pemilik):
${faq?.trim() || "(tiada — jika ditanya polisi/tempoh pos/COD yang tiada di sini, serahkan kepada staff)"}

PESANAN PELANGGAN INI (ikut nombor telefon):
${orders.length ? orders.join("\n") : "(tiada pesanan dijumpai untuk nombor ini)"}

${isComment ? `
INI KOMEN AWAM pada post/iklan Facebook/Instagram (bukan chat). "reply" akan dihantar sebagai MESEJ PERIBADI (DM) kepada orang yang komen — tulis jawapan penuh di situ.
Jawab HANYA komen yang penting & positif. skip=true (JANGAN balas langsung) jika komen: merapu/tak jelas, kata kesat/carut/sindir, kutuk atau kecam produk/jenama, tuduh penipu/scam TANPA sebut pesanan sendiri, gaduh dengan orang lain, tag kawan sahaja, emoji/sticker/"👍", ucapan tanpa soalan, spam/promosi orang lain, atau tak berkaitan produk.
skip=false dan jawab jika ada minat/soalan (cth "berapa", "nak", "pm", "cod?", "sesuai untuk…", "cara guna").
Jika pelanggan sebenar sebut masalah PESANAN SENDIRI (order tak sampai, barang rosak/salah, nak refund) → skip=false, handoff=true, reply = ayat sopan & ringkas bahawa staff akan semak dan bantu melalui mesej (jangan berdebat, jangan nafi).
` : ""}
Balas dalam JSON: {"reply": string, "handoff": boolean, "reason": string${isComment ? ', "skip": boolean' : ""}}`;
}

type GeminiOut = { reply: string; handoff: boolean; reason?: string; skip?: boolean };

async function callGemini(cfg: BotConfig, system: string, history: { role: "user" | "model"; text: string }[]): Promise<GeminiOut> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model || DEFAULT_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": cfg.geminiKey || "" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 700,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              reply: { type: "STRING" },
              handoff: { type: "BOOLEAN" },
              reason: { type: "STRING" },
              skip: { type: "BOOLEAN" },
            },
            required: ["reply", "handoff"],
          },
        },
      }),
    },
  );
  const j = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };
  if (!res.ok || j.error) throw new Error(j.error?.message || `Gemini HTTP ${res.status}`);
  const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  const out = JSON.parse(txt) as GeminiOut;
  if (out.skip) return { reply: out.reply ?? "", handoff: false, reason: out.reason, skip: true };
  if (typeof out.reply !== "string" || !out.reply.trim()) throw new Error("Gemini balas kosong");
  return out;
}

// Ujian dari Settings (tanpa hantar ke pelanggan)
export async function previewBotReply(question: string): Promise<GeminiOut & { error?: string }> {
  const cfg = await getBotConfig();
  if (!cfg.geminiKey) return { reply: "", handoff: true, error: "Gemini key belum diset." };
  try {
    const catalog = await getCatalog();
    return await callGemini(cfg, systemPrompt(catalog, cfg.faq || "", [], null), [{ role: "user", text: question }]);
  } catch (e) {
    return { reply: "", handoff: true, error: e instanceof Error ? e.message : String(e) };
  }
}

async function alertHuman(name: string, ident: string, reason: string, lastMsg: string) {
  const gq = globalThis as unknown as { __botAlert?: Map<string, number> };
  const m = (gq.__botAlert ??= new Map());
  if (Date.now() - (m.get(ident) ?? 0) < 30 * 60_000) return; // maks sekali 30 min / kontak
  m.set(ident, Date.now());
  const esc = (s: string) => s.replace(/</g, "&lt;").slice(0, 200);
  await sendTelegram(
    `🙋 <b>Inbox: perlu manusia</b>\n👤 ${esc(name)}\n💬 "${esc(lastMsg)}"\n📝 ${esc(reason)}\n➡️ https://aazflo.com/inbox`,
  ).catch(() => {});
}

// Butang template COD (deterministik — tak perlu AI)
const BTN_CONFIRM = /^ya,?\s*sahkan$/i;
const BTN_CANCEL = /^batalkan pesanan$/i;

// ── Jalankan bot untuk satu kontak selepas mesej masuk ──
export async function runBotForContact(contactId: string, triggerMsgId: string): Promise<void> {
  const cfg = await getBotConfig();
  if (!cfg.enabled || !cfg.geminiKey) return;

  await new Promise((r) => setTimeout(r, DEBOUNCE_MS));

  const contact = await db.waContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.botPaused || contact.needsHuman) return;

  // Hanya balas mesej MASUK terkini (mesej baru masuk masa debounce → giliran handler dia)
  const latestIn = await db.waMessage.findFirst({
    where: { contactId, direction: "in" },
    orderBy: { timestamp: "desc" },
    select: { id: true, body: true, type: true },
  });
  if (!latestIn || latestIn.id !== triggerMsgId) return;

  // Had keselamatan
  const recentBot = await db.waMessage.count({
    where: { contactId, bot: true, timestamp: { gt: new Date(Date.now() - 3600_000) } },
  });
  if (recentBot >= MAX_BOT_REPLIES_PER_HOUR) return;

  const name = contact.name || contact.waId;
  const body = (latestIn.body || "").trim();
  let reply = "";
  let handoff = false;
  let reason = "";

  if (BTN_CONFIRM.test(body)) {
    reply = `Terima kasih${contact.name ? " " + contact.name : ""}! ✅ Pesanan COD anda telah disahkan. Kami akan poskan secepat mungkin dan maklumkan nombor tracking nanti.`;
    await db.waContact.update({ where: { id: contactId }, data: { tag: "cod_sah" } });
    await sendTelegram(`✅ <b>COD disahkan pelanggan</b>\n👤 ${name}`).catch(() => {});
  } else if (BTN_CANCEL.test(body)) {
    reply = "Baik, permintaan batal pesanan telah kami terima. Staff kami akan uruskan sebentar lagi ya.";
    handoff = true;
    reason = "Pelanggan tekan Batalkan Pesanan (COD)";
    await db.waContact.update({ where: { id: contactId }, data: { tag: "cod_batal" } });
  } else if (!["text", "button", "interactive", "comment"].includes(latestIn.type)) {
    // Gambar / audio / dokumen — biar manusia tengok
    reply = "Terima kasih! Kami dah terima kiriman anda, staff kami akan semak dan balas sebentar lagi ya.";
    handoff = true;
    reason = `Pelanggan hantar ${latestIn.type}`;
  } else {
    try {
      const [catalog, orders, hist] = await Promise.all([
        getCatalog(),
        contact.channel === "whatsapp" ? findOrdersByPhone(contact.waId) : Promise.resolve([]),
        db.waMessage.findMany({ where: { contactId }, orderBy: { timestamp: "desc" }, take: 12 }),
      ]);
      // Gabung giliran berturut-turut pihak sama; mula & tamat dengan giliran pelanggan
      // (Gemini tolak request yang berakhir dengan giliran model).
      const history: { role: "user" | "model"; text: string }[] = [];
      for (const m of hist.reverse()) {
        if (!m.body) continue;
        const role = m.direction === "in" ? "user" : "model";
        const last = history[history.length - 1];
        if (last && last.role === role) last.text += "\n" + m.body;
        else history.push({ role, text: m.body });
      }
      while (history.length && history[0].role !== "user") history.shift();
      while (history.length && history[history.length - 1].role !== "user") history.pop();
      if (!history.length) return;
      const out = await callGemini(
        cfg,
        systemPrompt(catalog, cfg.faq || "", orders, contact.name, isCommentChannel(contact.channel)),
        history,
      );
      if (out.skip) {
        // Komen tag kawan / emoji / spam — tak perlu balas; tanda Selesai supaya inbox kemas
        await db.waContact.update({ where: { id: contactId }, data: { archived: true, unread: 0 } });
        return;
      }
      reply = out.reply.trim();
      handoff = !!out.handoff;
      reason = out.reason || "";
    } catch (e) {
      console.error("[inbox-bot] Gemini gagal:", e);
      // AI gagal — jangan diam: serah manusia
      await db.waContact.update({ where: { id: contactId }, data: { needsHuman: true } });
      await alertHuman(name, contact.waId, `Bot gagal: ${e instanceof Error ? e.message : String(e)}`, body);
      return;
    }
  }

  // Pelanggan hantar mesej baru masa bot berfikir? Batal — handler mesej baru jawab dgn konteks penuh.
  const stillLatest = await db.waMessage.findFirst({
    where: { contactId, direction: "in" },
    orderBy: { timestamp: "desc" },
    select: { id: true },
  });
  if (stillLatest?.id !== triggerMsgId) return;
  // Staff ambil alih masa bot berfikir? Batal.
  const fresh = await db.waContact.findUnique({ where: { id: contactId }, select: { botPaused: true } });
  if (fresh?.botPaused) return;

  if (isCommentChannel(contact.channel)) {
    await replyOnComment(contact, latestIn.id, reply, handoff);
    await db.waContact.update({
      where: { id: contactId },
      data: { lastMessageAt: new Date(), ...(handoff ? { needsHuman: true } : {}) },
    });
    if (handoff) await alertHuman(name, contact.waId, reason || "Bot serahkan (komen)", body);
    return;
  }

  const r = await sendToContact(contact, reply);
  const now = new Date();
  await db.waMessage.create({
    data: {
      contactId,
      waMsgId: r.msgId ?? null,
      direction: "out",
      type: "text",
      body: reply,
      bot: true,
      status: r.ok ? "sent" : "failed",
      error: r.ok ? null : r.error ?? "Gagal hantar",
      timestamp: now,
    },
  });
  await db.waContact.update({
    where: { id: contactId },
    data: { lastMessageAt: now, ...(handoff ? { needsHuman: true } : {}) },
  });
  if (handoff) await alertHuman(name, contact.waId, reason || "Bot serahkan", body);
}

// Komen: balas awam pendek (selamat compliance) + jawapan penuh melalui DM (private reply).
// DM gagal (tiada permission / >7 hari) → jawapan penuh dibalas awam sahaja.
async function replyOnComment(
  contact: { id: string; channel: string; pageId: string | null; name: string | null },
  inboundMsgId: string,
  answer: string,
  handoff = false,
) {
  const inbound = await db.waMessage.findUnique({ where: { id: inboundMsgId }, select: { waMsgId: true } });
  const commentId = inbound?.waMsgId;
  if (!commentId) return;
  const ch = contact.channel as "fb_comment" | "ig_comment";
  const first = (contact.name || "").replace(/^@/, "").split(" ")[0];
  const save = (body: string, r: { ok: boolean; msgId?: string; error?: string }, type: string) =>
    db.waMessage.create({
      data: {
        contactId: contact.id,
        waMsgId: r.msgId ?? null,
        direction: "out",
        type,
        body,
        bot: true,
        status: r.ok ? "sent" : "failed",
        error: r.ok ? null : r.error ?? "Gagal hantar",
        timestamp: new Date(),
      },
    });

  const dm = await privateReplyToComment(contact.pageId, commentId, answer);
  await save(answer, dm, "dm");
  // Masalah pesanan → DM sahaja; jangan balas awam (elak drama depan orang ramai).
  if (handoff) return;
  const pub = dm.ok ? `Hi${first ? " " + first : ""}! Kami dah PM ya, semak inbox 😊` : answer;
  const r = await replyToComment(ch, contact.pageId, commentId, pub);
  await save(pub, r, "text");
}
