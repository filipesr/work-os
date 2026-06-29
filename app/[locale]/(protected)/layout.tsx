import { Navbar } from "@/components/navbar";
import { HeartbeatProvider } from "@/components/HeartbeatProvider";
import { RefreshOnFocus } from "@/components/RefreshOnFocus";

// Every protected route reads the session and live data, so opt the whole
// segment out of static rendering explicitly (rather than relying on Next
// inferring it from dynamic API usage). Applies to all nested pages:
// dashboard, tasks, reports/*, admin/*, account.
export const dynamic = "force-dynamic";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <HeartbeatProvider />
      <RefreshOnFocus />
      <Navbar />
      <main className="px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
