import { db } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { isHiggsfieldReady } from "@/lib/integrations/higgsfield";
import { ContentForm } from "./content-form";
import { Sparkles, KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const ready = await isHiggsfieldReady();
  const products = await db.product.findMany({ select: { name: true }, orderBy: { name: "asc" } });

  return (
    <div>
      <PageHeader
        title="Content AI"
        subtitle="Jana video iklan produk guna AI (Higgsfield) → terus ke Telegram"
      />

      {!ready ? (
        <Card>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white">
              <KeyRound size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Setup Higgsfield dulu</h2>
              <p className="mt-1 text-sm text-slate-600">
                Untuk jana video, sistem perlu API key Higgsfield. Dapatkan di{" "}
                <a href="https://cloud.higgsfield.ai" target="_blank" rel="noreferrer" className="font-medium text-violet-600 hover:underline">
                  cloud.higgsfield.ai
                </a>{" "}
                (bahagian API Keys), copy <b>Key ID</b> + <b>Key Secret</b>, lepas tu set env var{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">HIGGSFIELD_CREDENTIALS = KEY_ID:KEY_SECRET</code>{" "}
                dan redeploy.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Bagi Key ID + Secret pada Claude, dia akan setup untuk ko.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
            <Sparkles size={16} className="text-violet-500" />
            Pilih produk, letak gambar & prompt, tekan Jana. Video siap terus dihantar ke Telegram ko.
          </div>
          <ContentForm products={products} />
        </Card>
      )}
    </div>
  );
}
