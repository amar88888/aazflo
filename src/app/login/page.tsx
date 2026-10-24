"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Email atau password salah.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4">
      {/* Glow gradient background */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-violet-600/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-600/40 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white/95 p-8 shadow-2xl backdrop-blur">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoMark size={52} />
          <h1
            className="brand-text mt-3 text-2xl uppercase tracking-[0.16em]"
            style={{ fontFamily: "var(--font-brand)" }}
          >
            Aazflo
          </h1>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">
            Smart Flow · Smart Growth
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">ID</label>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              placeholder="aazflo"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full rounded-lg py-2.5 text-sm font-semibold"
          >
            {loading ? "Sedang masuk..." : "Log Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
