// Logo Aazflo — peak mark (vektor crisp) + wordmark Michroma. Konsep #3.

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="azPeak" x1="5" y1="36" x2="35" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="0.5" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d="M20 4 L33 36 L26 36 L20 21 L14 36 L7 36 Z" fill="url(#azPeak)" />
    </svg>
  );
}

export function Logo({ size = 30, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span
        className={`text-[15px] uppercase tracking-[0.16em] ${dark ? "text-white" : "brand-text"}`}
        style={{ fontFamily: "var(--font-brand)" }}
      >
        Aazflo
      </span>
    </div>
  );
}
