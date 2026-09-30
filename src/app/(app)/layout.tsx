import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? "admin";

  return <AppShell role={role}>{children}</AppShell>;
}
