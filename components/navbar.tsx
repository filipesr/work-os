import { auth } from "@/auth";
import { PrimaryNav } from "@/components/PrimaryNav";
import type { AppRole } from "@/lib/navigation";

// Casca server: resolve a sessão e delega a navegação primária persona-aware ao
// PrimaryNav (client). O agrupamento por papel vive em lib/navigation.ts.
export async function Navbar() {
  const session = await auth();
  if (!session?.user) return null;

  const role = (session.user.role ?? "MEMBER") as AppRole;
  return <PrimaryNav role={role} userName={session.user.name ?? null} />;
}
