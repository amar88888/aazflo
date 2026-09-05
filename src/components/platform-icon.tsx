import { PLATFORM_LABELS, type Platform } from "@/lib/constants";

// Logo mini setiap platform (chip rounded warna brand + glyph putih).
export function PlatformIcon({ platform, size = 20 }: { platform: Platform; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    xmlns: "http://www.w3.org/2000/svg",
  };

  if (platform === "tiktok") {
    return (
      <svg {...common} aria-label="TikTok">
        <rect width="24" height="24" rx="6" fill="#06b6d4" />
        <path
          d="M13.6 5h1.7c.2 1.3 1 2.4 2.2 2.85v1.95c-.8-.02-1.6-.24-2.3-.63v4.78a3.9 3.9 0 1 1-3.9-3.9c.2 0 .4.01.6.04v1.95a2 2 0 1 0 1.4 1.9V5z"
          fill="#fff"
        />
      </svg>
    );
  }

  if (platform === "shopee") {
    return (
      <svg {...common} aria-label="Shopee">
        <rect width="24" height="24" rx="6" fill="#f97316" />
        <path d="M9.8 8.6V8a2.2 2.2 0 0 1 4.4 0v.6" fill="none" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
        <path
          d="M8 8.6h8l-.5 8a1.1 1.1 0 0 1-1.1 1.05H9.6a1.1 1.1 0 0 1-1.1-1.05L8 8.6z"
          fill="#fff"
        />
        <path
          d="M13 11.7c-.4-.3-.9-.4-1.3-.4-.9 0-1.5.5-1.5 1.15 0 1.35 2.5.9 2.5 2.1 0 .6-.6 1.05-1.4 1.05-.5 0-1-.15-1.4-.45"
          fill="none"
          stroke="#f97316"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // website / woocommerce → globe
  return (
    <svg {...common} aria-label="Website">
      <rect width="24" height="24" rx="6" fill="#8b5cf6" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="#fff" strokeWidth="1.3" />
      <path d="M7 12h10" stroke="#fff" strokeWidth="1.1" />
      <path d="M12 7c1.7 1.5 1.7 8.5 0 10M12 7c-1.7 1.5-1.7 8.5 0 10" fill="none" stroke="#fff" strokeWidth="1.1" />
    </svg>
  );
}

export function PlatformBadge({ platform, size = 18 }: { platform: Platform; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
      <PlatformIcon platform={platform} size={size} />
      {PLATFORM_LABELS[platform]}
    </span>
  );
}
