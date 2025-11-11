import { Navbar } from "@/components/navbar"
import { HeartbeatProvider } from "@/components/HeartbeatProvider"

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <HeartbeatProvider />
      <Navbar />
      <main className="px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
