import type { MetadataRoute } from "next";

// Manifest PWA — buat Aazflo boleh "Add to Home Screen" jadi app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aazflo — Sistem Operasi Bisnes",
    short_name: "Aazflo",
    description: "Dashboard jualan & untung TikTok, Shopee, WooCommerce dalam satu app.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#4f46e5",
    lang: "ms",
    categories: ["business", "productivity", "finance"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
