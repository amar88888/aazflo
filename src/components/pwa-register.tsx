"use client";

import { useEffect } from "react";

// Daftar service worker supaya Aazflo installable sebagai PWA.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* senyap — SW gagal daftar tak patut rosakkan app */
      });
    };
    // Component mount selepas hydrate; event "load" mungkin dah lepas.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
