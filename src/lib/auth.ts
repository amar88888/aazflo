import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

// ── Rate-limit login (anti brute-force) ──
// Simpan dalam memori (app standalone long-running). Lepas 5 cubaan gagal
// dalam 15 min, lock IP tu 15 min.
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; first: number; blockedUntil: number }>();

function clientKey(req?: { headers?: Record<string, string | string[] | undefined> }): string {
  const xff = req?.headers?.["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  return (raw?.split(",")[0] || "").trim() || "unknown";
}

function isBlocked(key: string): boolean {
  const r = attempts.get(key);
  return !!r && r.blockedUntil > Date.now();
}

function recordFail(key: string): void {
  const now = Date.now();
  const r = attempts.get(key);
  if (!r || now - r.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now, blockedUntil: 0 });
    return;
  }
  r.count += 1;
  if (r.count >= MAX_FAILS) r.blockedUntil = now + BLOCK_MS;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const key = clientKey(req as { headers?: Record<string, string | string[] | undefined> });
        if (isBlocked(key)) {
          throw new Error("Terlalu banyak cubaan. Cuba lagi dalam 15 minit.");
        }

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;
        const staffEmail = process.env.STAFF_EMAIL;
        const staffPassword = process.env.STAFF_PASSWORD;

        if (adminEmail && credentials?.email === adminEmail && credentials?.password === adminPassword) {
          attempts.delete(key);
          return { id: "admin", email: adminEmail, name: "Founder", role: "admin" };
        }
        if (
          staffEmail &&
          staffPassword &&
          credentials?.email === staffEmail &&
          credentials?.password === staffPassword
        ) {
          attempts.delete(key);
          return { id: "staff", email: staffEmail, name: "Staff", role: "staff" };
        }
        recordFail(key);
        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = user.role;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.role = token.role;
      return session;
    },
  },
};
