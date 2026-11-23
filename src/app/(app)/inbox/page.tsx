import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { isWhatsAppReady } from "@/lib/whatsapp";
import { getMetaInbox } from "@/lib/meta-inbox";
import { listConversations } from "./actions";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const ready = (await isWhatsAppReady()) || (await getMetaInbox()).pages.length > 0;

  if (!ready) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Inbox WhatsApp" subtitle="Balas semua reply blast WhatsApp di satu tempat" />
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">WhatsApp belum disambung</h2>
          <p className="mb-3 text-sm text-slate-600">
            Inbox ni guna <b>WhatsApp Cloud API (rasmi Meta)</b>. Setup token & webhook dulu di{" "}
            <Link href="/settings" className="text-blue-600 underline">
              Settings → WhatsApp
            </Link>
            .
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-500">
            <li>Isi Access Token + Phone Number ID di Settings.</li>
            <li>Salin Webhook URL + Verify Token → masukkan dalam Meta App (WhatsApp → Configuration).</li>
            <li>Subscribe field <code className="rounded bg-slate-100 px-1">messages</code>.</li>
          </ol>
        </Card>
      </div>
    );
  }

  const initial = await listConversations();
  return (
    <div>
      <PageHeader title="Inbox" subtitle="WhatsApp, Messenger & Instagram dalam satu tempat — bot AI jawab, staff ambil alih bila perlu" />
      <InboxClient initial={initial} />
    </div>
  );
}
