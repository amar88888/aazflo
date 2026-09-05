import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Staff hanya boleh akses Orders & AWB (print AWB, tracking, return).
// Semua route lain (dashboard, P&L, produk, live, settings) dihadkan ke admin.
const STAFF_ALLOWED = ["/orders", "/ops", "/api/receipts", "/api/awb"];

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role;
    const path = req.nextUrl.pathname;
    if (role === "staff") {
      const allowed = STAFF_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`));
      if (!allowed) {
        return NextResponse.redirect(new URL("/orders", req.url));
      }
    }
    return NextResponse.next();
  },
  { callbacks: { authorized: ({ token }) => !!token } }
);

export const config = {
  matcher: [
    // Kecualikan: login, auth, cron, aset _next, favicon, aset PWA (manifest & service worker), dan fail imej/font.
    "/((?!login|api/auth|api/cron|manifest.webmanifest|sw.js|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)).*)",
  ],
};
