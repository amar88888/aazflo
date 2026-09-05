import { db } from "@/lib/db";
import { formatRM, formatDateTime, formatDate } from "@/lib/format";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { addRecordingAction, addSlotAction, deleteSlotAction } from "./actions";
import { LogResultForm } from "./log-form";
import { Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const recordings = await db.recording.findMany({
    include: { slots: { orderBy: { startAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
  const slots = await db.liveSlot.findMany({
    include: { recording: true },
    orderBy: { startAt: "desc" },
    take: 30,
  });

  const now = new Date();
  const upcoming = slots.filter((s) => s.endAt > now);
  const past = slots.filter((s) => s.endAt <= now);

  return (
    <div>
      <PageHeader
        title="Live Sessions"
        subtitle="Jadual slot live 3 jam & library video recording untuk TikTok Live Studio"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Slot akan datang */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Slot Akan Datang ({upcoming.length})</h2>
            {upcoming.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Tiada slot dijadualkan — tambah di sebelah</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {formatDateTime(s.startAt)} — {formatDateTime(s.endAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Recording: {s.recording?.title ?? <span className="text-red-500">belum pilih!</span>}
                      </p>
                    </div>
                    <form action={deleteSlotAction.bind(null, s.id)}>
                      <button type="submit" className="text-slate-400 hover:text-red-600" title="Padam slot">
                        <Trash2 size={15} />
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Sejarah slot + log prestasi */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Sejarah Slot & Prestasi</h2>
            {past.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Belum ada sesi live selesai</p>
            ) : (
              <div className="space-y-3">
                {past.map((s) => (
                  <div key={s.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{formatDateTime(s.startAt)}</p>
                        <p className="text-xs text-slate-500">{s.recording?.title ?? "Tiada recording"}</p>
                      </div>
                      <div className="text-right text-sm">
                        {s.salesTotal != null ? (
                          <>
                            <p className="font-semibold text-emerald-600">{formatRM(s.salesTotal)}</p>
                            <p className="text-xs text-slate-400">{s.peakViewers ?? "-"} peak viewers</p>
                          </>
                        ) : (
                          <Badge color="orange">Belum log hasil</Badge>
                        )}
                      </div>
                    </div>
                    {s.salesTotal == null && <LogResultForm slotId={s.id} />}
                    {s.notes && <p className="mt-2 text-xs text-slate-500">Nota: {s.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/* Tambah slot */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Jadualkan Slot Baru</h2>
            <form action={addSlotAction} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Masa mula (slot = 3 jam)</label>
                <input name="startAt" type="datetime-local" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Video recording</label>
                <select name="recordingId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">— Pilih nanti —</option>
                  {recordings.map((r) => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full rounded-lg btn-primary py-2 text-sm font-medium">
                Tambah Slot
              </button>
            </form>
          </Card>

          {/* Library recording */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Library Recording ({recordings.length})</h2>
            <form action={addRecordingAction} className="mb-4 space-y-2">
              <input name="title" required placeholder="Tajuk video (cth: Live Skincare Set A)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input name="fileRef" placeholder="Lokasi fail (optional, cth: D:\Live\setA.mp4)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="btn-secondary w-full rounded-lg py-2 text-sm font-medium">
                + Tambah Recording
              </button>
            </form>
            <ul className="space-y-2">
              {recordings.map((r) => (
                <li key={r.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-sm font-medium text-slate-800">{r.title}</p>
                  <p className="text-xs text-slate-400">
                    {r.slots[0] ? `Terakhir guna: ${formatDate(r.slots[0].startAt)}` : "Belum pernah guna"}
                  </p>
                </li>
              ))}
            </ul>
            {recordings.length === 0 && (
              <EmptyState title="Belum ada recording" hint="Tambah video recording live ko untuk mula jadualkan slot." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
