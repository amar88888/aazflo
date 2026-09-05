import type { ComponentType, ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h1 className="heading-gradient text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/60 bg-white/85 p-5 shadow-sm shadow-violet-500/5 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

const TONES: Record<string, string> = {
  violet: "from-violet-500 to-indigo-500",
  cyan: "from-cyan-500 to-blue-500",
  emerald: "from-emerald-500 to-teal-500",
  amber: "from-amber-500 to-orange-500",
};

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
    accent === "green" ? "text-emerald-600" : accent === "red" ? "text-red-600" : "text-slate-900";
  const grad = TONES[tone] ?? TONES.violet;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/85 p-5 shadow-sm shadow-violet-500/5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-1.5 text-2xl font-bold tracking-tight ${accentClass}`}>{value}</p>
          {delta != null && (
            <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% <span className="font-normal text-slate-400">{deltaLabel ?? "vs semalam"}</span>
            </p>
          )}
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        {Icon && (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${grad} text-white shadow-md`}
          >
            <Icon size={18} />
          </div>
        )}
      </div>
      <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${grad} opacity-80`} />
    </div>
  );
}

export function Badge({ children, color = "slate" }: { children: ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    orange: "bg-orange-100 text-orange-700",
    blue: "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700",
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
