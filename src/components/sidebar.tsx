"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Package,
  RotateCcw,
  ClipboardList,
  Radio,
  Calculator,
  Tag,
  Sparkles,
  Megaphone,
  Settings,
  LogOut,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, staff: false },
  { href: "/orders", label: "Orders & AWB", icon: Package, staff: true },
  { href: "/returns", label: "Pulangan & Batal", icon: RotateCcw, staff: true },
  { href: "/ops", label: "Operasi Office", icon: ClipboardList, staff: true },
  { href: "/live", label: "Live Sessions", icon: Radio, staff: false },
  { href: "/content", label: "Content AI", icon: Sparkles, staff: false },
  { href: "/ads", label: "Meta Ads", icon: Megaphone, staff: false },
  { href: "/pnl", label: "Profit & Loss", icon: Calculator, staff: false },
  { href: "/products", label: "Produk & COGS", icon: Tag, staff: false },
  { href: "/settings", label: "Settings", icon: Settings, staff: false },
];

export function Sidebar({
  role = "admin",
  open = false,
  onClose,
}: {
  role?: string;
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const nav = role === "staff" ? NAV.filter((n) => n.staff) : NAV;

  return (
    <aside
      className={`sidebar-grad fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col text-white transition-transform duration-200 lg:static lg:z-auto lg:w-60 lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}
    >
      <div className="flex items-center justify-between px-5 py-5">
        <div>
          <Logo dark />
          {role === "staff" && (
            <span className="mt-2 inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-indigo-100">
              Akaun Staff · akses terhad
            </span>
          )}
        </div>
        {/* Butang tutup (mobile sahaja) */}
        <button
          onClick={onClose}
          aria-label="Tutup menu"
          className="rounded-lg p-1.5 text-indigo-200/80 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X size={20} />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10"
                  : "text-indigo-200/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-violet-300 to-cyan-300" />
              )}
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-indigo-200/80 hover:bg-white/10 hover:text-white"
        >
          <LogOut size={17} />
          Log Keluar
        </button>
      </div>
    </aside>
  );
}
