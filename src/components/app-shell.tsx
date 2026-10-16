"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Logo } from "@/components/logo";

export function AppShell({ role, children }: { role: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} open={open} onClose={() => setOpen(false)} />

      {/* Backdrop bila drawer buka (mobile) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar — mobile sahaja. Safe-area supaya tak terlindung jam/notch iPhone */}
        <header
          className="flex items-center gap-3 border-b border-indigo-500/20 bg-[#070a14]/85 px-4 pb-3 backdrop-blur-md lg:hidden"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          <button
            onClick={() => setOpen(true)}
            aria-label="Buka menu"
            className="rounded-lg p-1.5 text-indigo-200 hover:bg-white/10"
          >
            <Menu size={22} />
          </button>
          <Logo />
        </header>

        <main className="app-bg flex-1 overflow-y-auto px-4 py-5 lg:px-8 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
