import type { ComponentType, ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="heading-gradient text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action && <div className="min-w-0 max-w-full overflow-x-auto">{action}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass-panel rounded-2xl p-5 ${className}`}>{children}</div>;
}

export function StatCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
  tone = "violet",
  delta,
  deltaLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "neutral";
  icon?: ComponentType<{ size?: number }>;
  tone?: "violet" | "cyan" | "emerald" | "amber";
  delta?: number | null;
  deltaLabel?: string;
}) {
  const accentClass =
    accent === "green" ? "text-emerald-300" : accent === "red" ? "text-rose-300" : "text-white";
  return (
    <div className="stat-card group relative overflow-hidden rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-label text-xs font-medium uppercase tracking-wider">{label}</p>
          <p className={`stat-value text-glow mt-1.5 text-2xl font-bold tracking-tight ${accentClass}`}>{value}</p>
          {delta != null && (
            <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% <span className="t-sub font-normal">{deltaLabel ?? "vs semalam"}</span>
            </p>
          )}
          {sub && <p className="t-sub mt-1 text-xs">{sub}</p>}
        </div>
        {Icon && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-slate-100 ring-1 ring-white/10"
            style={{ boxShadow: "0 0 16px -4px rgba(var(--m2-rgb), 0.55)" }}
          >
            <Icon size={18} />
          </div>
        )}
      </div>
      <div
        className="absolute inset-x-0 bottom-0 h-0.5"
        style={{ background: "linear-gradient(90deg, rgba(var(--m2-rgb),0.12), rgb(var(--m2-rgb)) 55%, rgba(var(--m2-rgb),0.12))" }}
      />
    </div>
  );
}

export function Badge({ children, color = "slate" }: { children: ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    slate: "bg-white/10 text-slate-200 ring-1 ring-white/10",
    green: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20",
    red: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20",
    orange: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/20",
    blue: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20",
    purple: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/20",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[color] ?? colors.slate}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-14 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
