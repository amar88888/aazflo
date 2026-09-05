import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? "admin";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} />
      <main className="app-bg flex-1 overflow-y-auto px-8 py-6">{children}</main>
    </div>
  );
}
