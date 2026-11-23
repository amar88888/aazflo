import { loadCredentials, saveCredentials } from "@/lib/credentials";

// ── Messenger (Facebook Page) + Instagram DM untuk Inbox ──
// Nota: untuk balas PELANGGAN SEBENAR, Meta wajibkan App Review (Advanced Access)
// untuk pages_messaging & instagram_manage_messages. Sebelum lulus, API cuma boleh
// berbalas dengan orang yang ada role dalam app Aazflo.

const GRAPH = "https://graph.facebook.com/v22.0";

export type MetaPage = {
  pageId: string;
  name: string;
  accessToken: string; // page access token (long-lived dari user token long-lived)
  igId?: string; // Instagram professional account yang link ke page
  igUsername?: string;
};
export type MetaInboxCreds = { pages: MetaPage[]; verifyToken?: string };

export async function getMetaInbox(): Promise<MetaInboxCreds> {
  const c = await loadCredentials<MetaInboxCreds>("meta_inbox");
  return { pages: c?.pages ?? [], verifyToken: c?.verifyToken };
}

export async function saveMetaInbox(c: MetaInboxCreds) {
  await saveCredentials("meta_inbox", c);
}

function pageFor(creds: MetaInboxCreds, id: string | null | undefined): MetaPage | undefined {
  if (!id) return undefined;
  return creds.pages.find((p) => p.pageId === id || p.igId === id);
}

// Hantar teks ke Messenger / IG (dalam tetingkap 24 jam selepas mesej pelanggan).
export async function sendMetaMessage(
  pageOrIgId: string | null,
  recipientId: string,
  text: string,
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  const creds = await getMetaInbox();
  const page = pageFor(creds, pageOrIgId);
  if (!page) return { ok: false, error: "Page/IG belum disambung di Settings." };
  try {
    const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(page.accessToken)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } }),
    });
    const j = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
    if (!res.ok || j.error) return { ok: false, error: j.error?.message || `HTTP ${res.status}` };
    return { ok: true, msgId: j.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ralat rangkaian." };
  }
}

// ── Komen FB / IG ──
// Balas awam pada komen: FB → POST /{comment-id}/comments, IG → POST /{comment-id}/replies
export async function replyToComment(
  channel: "fb_comment" | "ig_comment",
  pageOrIgId: string | null,
  commentId: string,
  text: string,
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  const creds = await getMetaInbox();
  const page = pageFor(creds, pageOrIgId);
  if (!page) return { ok: false, error: "Page/IG belum disambung di Settings." };
  const edge = channel === "ig_comment" ? "replies" : "comments";
  try {
    const res = await fetch(`${GRAPH}/${commentId}/${edge}`, {
      method: "POST",
      body: new URLSearchParams({ message: text, access_token: page.accessToken }),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || j.error) return { ok: false, error: j.error?.message || `HTTP ${res.status}` };
    return { ok: true, msgId: j.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ralat rangkaian." };
  }
}

// Sembunyi komen (BUKAN padam): orang ramai tak nampak; penulis & kawan dia masih nampak.
// FB → POST /{comment-id} is_hidden=true · IG → POST /{comment-id} hide=true
export async function hideComment(
  channel: "fb_comment" | "ig_comment",
  pageOrIgId: string | null,
  commentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await getMetaInbox();
  const page = pageFor(creds, pageOrIgId);
  if (!page) return { ok: false, error: "Page/IG belum disambung di Settings." };
  try {
    const res = await fetch(`${GRAPH}/${commentId}`, {
      method: "POST",
      body: new URLSearchParams({
        [channel === "ig_comment" ? "hide" : "is_hidden"]: "true",
        access_token: page.accessToken,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || j.error) return { ok: false, error: j.error?.message || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ralat rangkaian." };
  }
}

// Private reply: DM kepada orang yang komen (sekali per komen, dalam 7 hari).
export async function privateReplyToComment(
  pageOrIgId: string | null,
  commentId: string,
  text: string,
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  const creds = await getMetaInbox();
  const page = pageFor(creds, pageOrIgId);
  if (!page) return { ok: false, error: "Page/IG belum disambung di Settings." };
  try {
    const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(page.accessToken)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    });
    const j = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
    if (!res.ok || j.error) return { ok: false, error: j.error?.message || `HTTP ${res.status}` };
    return { ok: true, msgId: j.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ralat rangkaian." };
  }
}

// Nama profil pelanggan (sekali, masa kontak baru)
export async function fetchMetaProfileName(
  channel: "messenger" | "instagram",
  pageOrIgId: string,
  userId: string,
): Promise<string | null> {
  const creds = await getMetaInbox();
  const page = pageFor(creds, pageOrIgId);
  if (!page) return null;
  const fields = channel === "instagram" ? "name,username" : "first_name,last_name";
  try {
    const res = await fetch(`${GRAPH}/${userId}?fields=${fields}&access_token=${encodeURIComponent(page.accessToken)}`);
    const j = (await res.json()) as { name?: string; username?: string; first_name?: string; last_name?: string };
    if (channel === "instagram") return j.name || (j.username ? "@" + j.username : null);
    return [j.first_name, j.last_name].filter(Boolean).join(" ") || null;
  } catch {
    return null;
  }
}

// Ambil semua Page (+ IG yang link) dari user token, langgan app ke setiap page.
export async function connectPagesFromUserToken(userToken: string): Promise<{ ok: boolean; pages: MetaPage[]; notes: string[] }> {
  const notes: string[] = [];
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=50&access_token=${encodeURIComponent(userToken)}`,
  );
  const j = (await res.json().catch(() => ({}))) as {
    data?: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[];
    error?: { message?: string };
  };
  if (j.error) return { ok: false, pages: [], notes: [j.error.message ?? "Gagal baca page"] };
  // Hanya page jenama EVIOR — bot jawab produk Maxlim/Facelim, jangan sentuh page lain
  // (token Amar nampak juga Maajun Raja Dhab, Mekar Spa, dll).
  const isEvior = (n: string) => /evior|maxlim|facelim/i.test(n);
  for (const p of j.data ?? []) if (!isEvior(p.name)) notes.push(`– ${p.name}: dilangkau (bukan page EVIOR)`);
  const pages: MetaPage[] = (j.data ?? []).filter((p) => isEvior(p.name)).map((p) => ({
    pageId: p.id,
    name: p.name,
    accessToken: p.access_token,
    igId: p.instagram_business_account?.id,
    igUsername: p.instagram_business_account?.username,
  }));
  for (const p of pages) {
    const s = await fetch(`${GRAPH}/${p.pageId}/subscribed_apps`, {
      method: "POST",
      body: new URLSearchParams({
        subscribed_fields: "messages,messaging_postbacks,feed",
        access_token: p.accessToken,
      }),
    });
    const sj = (await s.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    notes.push(sj.success ? `✓ ${p.name}${p.igUsername ? ` + IG @${p.igUsername}` : ""}` : `✗ ${p.name}: ${sj.error?.message ?? "gagal langgan"}`);
  }
  return { ok: pages.length > 0, pages, notes };
}

// Daftar webhook app untuk object page + instagram (sekali).
export async function registerMetaWebhooks(appId: string, appSecret: string, callbackUrl: string, verifyToken: string) {
  const out: string[] = [];
  for (const [object, fields] of [
    ["page", "messages,messaging_postbacks,feed"],
    ["instagram", "messages,comments"],
  ] as const) {
    const r = await fetch(`${GRAPH}/${appId}/subscriptions`, {
      method: "POST",
      body: new URLSearchParams({
        object,
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields,
        access_token: `${appId}|${appSecret}`,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    out.push(j.success ? `✓ webhook ${object}` : `✗ webhook ${object}: ${j.error?.message ?? "gagal"}`);
  }
  return out;
}
