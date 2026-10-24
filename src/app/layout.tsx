import type { Metadata, Viewport } from "next";
import { Michroma, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const brandFont = Michroma({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-brand",
  display: "swap",
});

// UI utama — geometrik, moden, sci-fi
const uiFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

// Nombor / data — mono gaya HUD terminal
const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "AAZFLO",
  title: { default: "AAZFLO", template: "%s · AAZFLO" },
  description: "Sistem operasi bisnes e-commerce — TikTok, Shopee, WooCommerce",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AAZFLO",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#070b16",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms" className={`${brandFont.variable} ${uiFont.variable} ${monoFont.variable}`}>
      <body className="antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
