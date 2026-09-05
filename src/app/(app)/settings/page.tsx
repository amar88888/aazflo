import { getWooConfigFromEnv } from "@/lib/integrations/woocommerce";
import { loadCredentials } from "@/lib/credentials";
import { getTelegramConfig } from "@/lib/telegram";
import { getPlatformFees } from "@/lib/settings";
import { PageHeader, Card, Badge } from "@/components/ui";
import { SyncWooButton } from "./sync-button";
import { TelegramSettings } from "./telegram-settings";
import { connectTikTokAction, connectShopeeAction, saveFeesAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const wooConfig = getWooConfigFromEnv();
  const tiktokCreds = await loadCredentials("tiktok");
  const shopeeCreds = await loadCredentials("shopee");
  const tiktokConfigured = !!process.env.TIKTOK_APP_KEY;
  const shopeeConfigured = !!process.env.SHOPEE_PARTNER_ID;
  const telegram = await getTelegramConfig();
  const telegramReady = !!(telegram.botToken && telegram.chatId);
  const fees = await getPlatformFees();

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Integrasi platform & konfigurasi sistem" />

      <div className="space-y-4">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Fee Platform (%)</h2>
            <Badge color="blue">Dipakai dalam P&amp;L</Badge>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Fee/komisen setiap platform berbeza. Nilai ni dipakai untuk anggar fee dalam P&amp;L bila order
            tiada fee sebenar (cth: import CSV). Bila API platform aktif, fee sebenar dari platform diguna.
          </p>
          <form action={saveFeesAction} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">TikTok Shop (%)</label>
              <input name="fee_tiktok" type="number" step="0.1" min="0" max="100" defaultValue={fees.tiktok} className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Shopee (%)</label>
              <input name="fee_shopee" type="number" step="0.1" min="0" max="100" defaultValue={fees.shopee} className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Website (%)</label>
              <input name="fee_woo" type="number" step="0.1" min="0" max="100" defaultValue={fees.woocommerce} className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <button className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">Simpan Fee</button>
          </form>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">WooCommerce (Website)</h2>
            <Badge color={wooConfig ? "green" : "red"}>{wooConfig ? "Configured" : "Belum setup"}</Badge>
          </div>
          {wooConfig ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Sambungan ke: <span className="font-mono text-xs">{wooConfig.url}</span>
              </p>
              <SyncWooButton />
            </div>
          ) : (
            <div className="text-sm text-slate-600">
              <p className="mb-2">Untuk sambung website WooCommerce ko:</p>
              <ol className="list-decimal space-y-1 pl-5 text-slate-500">
                <li>WP Admin → WooCommerce → Settings → Advanced → REST API</li>
                <li>Add key (Read permission cukup) → salin Consumer Key & Secret</li>
                <li>
                  Isi dalam fail <code className="rounded bg-slate-100 px-1">.env</code>:{" "}
                  <code className="rounded bg-slate-100 px-1">WOOCOMMERCE_URL</code>,{" "}
                  <code className="rounded bg-slate-100 px-1">WOOCOMMERCE_CONSUMER_KEY</code>,{" "}
                  <code className="rounded bg-slate-100 px-1">WOOCOMMERCE_CONSUMER_SECRET</code>
                </li>
                <li>Restart server</li>
              </ol>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">TikTok Shop Partner API</h2>
            <Badge color={tiktokCreds ? "green" : tiktokConfigured ? "blue" : "orange"}>
              {tiktokCreds ? "Connected" : tiktokConfigured ? "Sedia — belum authorize" : "Belum setup"}
            </Badge>
          </div>
          {tiktokConfigured ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {tiktokCreds
                  ? "Kedai dah di-authorize. Order sync & AWB aktif."
                  : "App key dah diset. Klik Connect untuk authorize kedai ko."}
              </p>
              <form action={connectTikTokAction}>
                <button className="rounded-lg btn-primary px-4 py-2 text-sm font-medium">
                  {tiktokCreds ? "Re-authorize" : "Connect TikTok Shop"}
                </button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Daftar app di{" "}
              <a href="https://partner.tiktokshop.com" target="_blank" className="text-blue-600 underline">
                partner.tiktokshop.com
              </a>
              , isi <code className="rounded bg-slate-100 px-1">TIKTOK_APP_KEY</code> &{" "}
              <code className="rounded bg-slate-100 px-1">TIKTOK_APP_SECRET</code> dalam{" "}
              <code className="rounded bg-slate-100 px-1">.env</code>. Rujuk{" "}
              <code className="rounded bg-slate-100 px-1">docs/pendaftaran-api.md</code>. Sementara itu guna Import CSV.
            </p>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Shopee Open Platform</h2>
            <Badge color={shopeeCreds ? "green" : shopeeConfigured ? "blue" : "orange"}>
              {shopeeCreds ? "Connected" : shopeeConfigured ? "Sedia — belum authorize" : "Belum setup"}
            </Badge>
          </div>
          {shopeeConfigured ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {shopeeCreds
                  ? "Kedai dah di-authorize. Order sync & AWB aktif."
                  : "Partner ID dah diset. Klik Connect untuk authorize kedai ko."}
              </p>
              <form action={connectShopeeAction}>
                <button className="rounded-lg btn-primary px-4 py-2 text-sm font-medium">
                  {shopeeCreds ? "Re-authorize" : "Connect Shopee"}
                </button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Daftar app di{" "}
              <a href="https://open.shopee.com" target="_blank" className="text-blue-600 underline">
                open.shopee.com
              </a>
              , isi <code className="rounded bg-slate-100 px-1">SHOPEE_PARTNER_ID</code> &{" "}
              <code className="rounded bg-slate-100 px-1">SHOPEE_PARTNER_KEY</code> dalam{" "}
              <code className="rounded bg-slate-100 px-1">.env</code>. Rujuk{" "}
              <code className="rounded bg-slate-100 px-1">docs/pendaftaran-api.md</code>. Sementara itu guna Import CSV.
            </p>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Telegram — Report Harian (@aazmsa_bot)</h2>
            <Badge color={telegramReady ? "green" : "orange"}>{telegramReady ? "Aktif" : "Belum setup"}</Badge>
          </div>
          <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            <p className="mb-1 font-medium text-slate-700">Cara setup:</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Buka <span className="font-medium">@BotFather</span> di Telegram → dapatkan <b>bot token</b> untuk @aazmsa_bot</li>
              <li>Hantar <code className="rounded bg-white px-1">/start</code> ke <span className="font-medium">@aazmsa_bot</span> dari akaun ko</li>
              <li>Paste bot token di bawah → Simpan → klik <b>Auto-detect Chat ID</b></li>
              <li>Klik <b>Hantar Report Sekarang</b> untuk test</li>
            </ol>
          </div>
          <TelegramSettings chatIdSet={!!telegram.chatId} />
          <p className="mt-4 text-xs text-slate-500">
            Report auto dihantar setiap hari <b>sebelum 11:59 malam</b>. Untuk jadual: set cron di VPS (11:30 malam) →{" "}
            <code className="rounded bg-slate-100 px-1">30 23 * * * curl -s &quot;https://app.aazflo.com/api/cron/daily-report?secret=CRON_SECRET&quot;</code>
          </p>
        </Card>
      </div>
    </div>
  );
}
