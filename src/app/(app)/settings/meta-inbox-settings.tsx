"use client";

import { useState, useTransition } from "react";
import { connectMetaPagesAction } from "./actions";
import { Link2 } from "lucide-react";

export function MetaInboxSettings({
  pages,
  webhookUrl,
}: {
  pages: { pageId: string; name: string; igUsername?: string }[];
  webhookUrl: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {pages.length > 0 ? (
        <ul className="space-y-1 text-sm text-slate-700">
          {pages.map((p) => (
            <li key={p.pageId} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> {p.name}
              {p.igUsername && (
                <>
                  <span className="ml-2 h-2 w-2 rounded-full bg-pink-500" /> @{p.igUsername}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Belum ada Page disambung.</p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await connectMetaPagesAction();
            setMsg({ ok: r.ok, text: r.message });
          })
        }
        className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        <Link2 size={15} /> {pages.length ? "Sambung semula / kemaskini Page" : "Sambung Page Facebook + IG"}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
      <p className="text-xs text-slate-500">
        Webhook: <code className="rounded bg-slate-100 px-1">{webhookUrl}</code>. Untuk balas pelanggan sebenar, app Aazflo
        perlu lulus <b>App Review</b> Meta (pages_messaging, instagram_manage_messages).
      </p>
    </div>
  );
}
