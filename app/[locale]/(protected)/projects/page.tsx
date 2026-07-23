import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { PanelTop, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Projetos" };

// Lista de projetos (§3: rota que faltava — antes só alcançável via cliente).
export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user) return notFound();
  const t = await getTranslations("common.projectsList");
  const tp = await getTranslations("projects");

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      client: { select: { name: true } },
      _count: { select: { tasks: true } },
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader kicker={tp("listKicker")} title={t("title")} subtitle={t("subtitle")} />

      {projects.length === 0 ? (
        <EmptyState variant="card" icon={PanelTop} title={t("title")} description={t("empty")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <PanelTop className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-foreground">{p.name}</div>
                <div className="truncate text-sm text-muted-foreground">{p.client.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("tasksCount", { count: p._count.tasks })}
                </div>
              </div>
              <ChevronRight
                className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
