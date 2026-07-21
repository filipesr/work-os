import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";
import Link from "next/link";
import { storageByClient } from "@/lib/nas/storage-stats";
import { StorageBreakdown } from "@/components/nas/StorageBreakdown";
import { AdminHealthSection } from "@/components/admin/AdminHealthSection";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Administração",
};

// StatCard Component
function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 hover:shadow-xl transition-shadow duration-200">
      <div className="flex flex-col items-center justify-center">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          {title}
        </h3>
        <p className="text-4xl font-bold text-primary">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

// Compact navigation item for the right-hand menu
function NavItem({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-transparent px-3 py-2 transition-colors hover:bg-accent hover:border-border"
    >
      <span className="block text-sm font-semibold text-foreground">{title}</span>
      <span className="block text-xs text-muted-foreground">{description}</span>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  const t = await getTranslations("admin.dashboard");

  // Fetch system statistics in parallel
  const [userCount, clientCount, projectCount, templateCount, activeTaskCount, clientStorage] =
    await Promise.all([
      prisma.user.count(),
      prisma.client.count(),
      prisma.project.count(),
      prisma.workflowTemplate.count(),
      prisma.task.count({
        where: {
          status: { in: [TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS, TaskStatus.PAUSED] },
        },
      }),
      storageByClient(),
    ]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
        {/* Main column: counters + team-health cockpit */}
        <div className="min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            <StatCard title={t("stats.users")} value={userCount} />
            <StatCard title={t("stats.clients")} value={clientCount} />
            <StatCard title={t("stats.projects")} value={projectCount} />
            <StatCard title={t("stats.activeTasks")} value={activeTaskCount} />
            <StatCard title={t("stats.templates")} value={templateCount} />
          </div>

          <AdminHealthSection />
        </div>

        {/* Right menu (sticky): navigation + storage */}
        <aside className="space-y-6 lg:sticky lg:top-6">
          <nav className="bg-card shadow-lg rounded-xl border-2 border-border p-4">
            <h2 className="px-3 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("nav.title")}
            </h2>
            <div className="flex flex-col gap-1">
              <NavItem
                href="/admin/users"
                title={t("nav.users.title")}
                description={t("nav.users.description")}
              />
              <NavItem
                href="/admin/teams"
                title={t("nav.teams.title")}
                description={t("nav.teams.description")}
              />
              <NavItem
                href="/admin/clients"
                title={t("nav.clients.title")}
                description={t("nav.clients.description")}
              />
              <NavItem
                href="/admin/templates"
                title={t("nav.templates.title")}
                description={t("nav.templates.description")}
              />
              <NavItem
                href="/admin/tasks"
                title={t("nav.tasks.title")}
                description={t("nav.tasks.description")}
              />
            </div>
          </nav>

          <StorageBreakdown title="Armazenamento no NAS — por cliente" stats={clientStorage} />
        </aside>
      </div>
    </div>
  );
}
