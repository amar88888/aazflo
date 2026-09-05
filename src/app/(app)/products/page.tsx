import { db } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { saveProductAction } from "./actions";
import { ProductsTable } from "./products-table";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await db.product.findMany({ orderBy: { name: "asc" } });

  // SKU dari order yang belum ada padanan produk — bantu user tahu apa nak setup
  const unmatchedSkus = await db.orderItem.groupBy({
    by: ["sku", "name"],
    where: { productId: null, sku: { not: null } },
    _count: true,
  });

  return (
    <div>
      <PageHeader
        title="Produk & COGS"
        subtitle="Rekod modal seunit setiap produk — asas kiraan profit dalam P&L"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 !p-0">
          <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">
            Senarai Produk ({products.length})
          </h2>
          <ProductsTable
            products={products.map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              cogsPerUnit: p.cogsPerUnit,
              priceTiktok: p.priceTiktok,
              priceShopee: p.priceShopee,
              priceWoo: p.priceWoo,
              tiktokSku: p.tiktokSku,
              shopeeSku: p.shopeeSku,
              wooSku: p.wooSku,
            }))}
          />
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Tambah / Kemaskini Produk</h2>
            <form action={saveProductAction} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Nama produk</label>
                <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">SKU utama</label>
                  <input name="sku" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">COGS/unit (RM)</label>
                  <input name="cogsPerUnit" type="number" step="0.01" min="0" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <p className="text-xs text-slate-400">Harga jual per platform (RM, biar kosong kalau tak dijual):</p>
              <div className="grid grid-cols-3 gap-2">
                <input name="priceTiktok" type="number" step="0.01" min="0" placeholder="TikTok" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                <input name="priceShopee" type="number" step="0.01" min="0" placeholder="Shopee" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                <input name="priceWoo" type="number" step="0.01" min="0" placeholder="Website" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
              </div>
              <p className="text-xs text-slate-400">
                SKU platform (optional — isi kalau SKU berbeza antara platform):
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input name="tiktokSku" placeholder="TikTok" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                <input name="shopeeSku" placeholder="Shopee" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                <input name="wooSku" placeholder="Website" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
              </div>
              <button type="submit" className="w-full rounded-lg btn-primary py-2 text-sm font-medium">
                Simpan Produk
              </button>
            </form>
          </Card>

          {unmatchedSkus.length > 0 && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-amber-700">
                ⚠ SKU order tanpa padanan produk ({unmatchedSkus.length})
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                Item ni tak dikira dalam COGS. Tambah produk dengan SKU sama untuk auto-link.
              </p>
              <ul className="space-y-1.5 text-xs">
                {unmatchedSkus.slice(0, 10).map((u) => (
                  <li key={`${u.sku}`} className="flex justify-between">
                    <span className="font-mono text-slate-600">{u.sku}</span>
                    <span className="text-slate-400">{u.name.slice(0, 30)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
