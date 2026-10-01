// Skeleton loading — muncul serta-merta bila tukar page (elak blank/hang).
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 w-48 rounded-lg bg-slate-200" />
        <div className="mt-2 h-4 w-72 max-w-full rounded bg-slate-100" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/60 bg-white/70 p-5">
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="mt-3 h-6 w-24 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Content blocks */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-56 rounded-2xl border border-white/60 bg-white/70 lg:col-span-2" />
        <div className="h-56 rounded-2xl border border-white/60 bg-white/70" />
      </div>
    </div>
  );
}
