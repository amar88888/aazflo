// Logo AAZFLO — minimal: huruf "A" (font Sora) dalam jubin. Atas app guna ikon je; nama ditulis sekali di login.

export function LogoMark({ size = 32, inverted = false }: { size?: number; inverted?: boolean }) {
  // Default: jubin putih + A hitam (atas latar gelap app). inverted: jubin hitam + A putih (atas kad putih login).
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-bold leading-none ${
        inverted ? "bg-black text-white" : "bg-white text-black"
      }`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        fontSize: size * 0.6,
        fontFamily: "var(--font-brand)",
      }}
      aria-label="AAZFLO"
    >
      A
    </span>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return <LogoMark size={size} />;
}
