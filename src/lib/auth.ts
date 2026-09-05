import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;
        const staffEmail = process.env.STAFF_EMAIL;
        const staffPassword = process.env.STAFF_PASSWORD;

        if (adminEmail && credentials?.email === adminEmail && credentials?.password === adminPassword) {
          return { id: "admin", email: adminEmail, name: "Founder", role: "admin" };
        }
        if (
          staffEmail &&
          staffPassword &&
          credentials?.email === staffEmail &&
          credentials?.password === staffPassword
        ) {
          return { id: "staff", email: staffEmail, name: "Staff", role: "staff" };
        }
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
