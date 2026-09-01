import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { PanelTop, ChevronRight, GanttChart } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { computeProjectCompletion } from "@/lib/project-status";
import { projectStatusTone, projectCompletionTone } from "@/lib/status-tone";
import { parseSearchTerm } from "@/lib/search-param";
import { CrudSearchBox } from "@/components/admin/CrudSearchBox";
import { ProjectClientFilter } from "./ProjectClientFilter";

export const metadata: Metadata = { title: "Projetos" };

/**
 * Índice de projetos (§3: rota que faltava — antes só alcançável via cliente).
 *
 * Busca e filtro de cliente rodam no BANCO (`?q=` / `?client=`), não sobre a
 * lista já carregada, então funcionam igual com 5 ou 500 projetos.
 *
 * A % de conclusão é **derivada** das tarefas (`computeProjectCompletion`) — não
 * existe coluna persistida, e a regra mora num lugar só. Por isso a query traz
 * o status de cada tarefa: é o mínimo necessário para calcular, e mais barato
 * que um `_count` por status.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // MANAGER+ como as demais telas de gestão de entregas. A linha do tempo do projeto
  // (`/projects/[id]`) segue aberta a quem executa — é o índice que é de gestão.
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const search = parseSearchTerm(sp.q);
  const clientId = typeof sp.client === "string" && sp.client ? sp.client : undefined;

  const [t, projects, clients] = await Promise.all([
    getTranslations("common.projectsList"),
    prisma.project.findMany({
      where: {
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
        ...(clientId ? { clientId } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        client: { select: { name: true } },
        tasks: { select: { status: true } },
      },
    }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const hasFilters = Boolean(search || clientId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <ProjectClientFilter clients={clients} selected={clientId} />
        <div className="ml-auto">
          <CrudSearchBox
            initialValue={search ?? ""}
            placeholder={t("searchPlaceholder")}
            clearLabel={t("searchClear")}
          />
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          variant="card"
          icon={PanelTop}
          title={t("title")}
          // "Nada encontrado" ≠ "não há projetos": confundir os dois faz o
          // usuário achar que a base sumiu.
          description={hasFilters ? t("noResults") : t("empty")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const completion = computeProjectCompletion(p.tasks);
            return (
              <div
                key={p.id}
                className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <Link href={`/admin/projects/${p.id}`} className="group flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <PanelTop className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">
                      {p.name}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">{p.client.name}</div>
                  </div>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge tone={projectStatusTone(p.status)} label={t(`status.${p.status}`)} />
                  <StatusBadge
                    tone={projectCompletionTone(completion.state)}
                    label={t("completionPct", { pct: completion.pct })}
                  />
                  <span className="text-xs text-muted-foreground">
                    {t("tasksCount", { count: completion.total })}
                  </span>
                </div>

                {/* Barra de conclusão: a leitura de relance que o número sozinho
                    não dá quando são 12 cards lado a lado. */}
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={t("completionPct", { pct: completion.pct })}
                >
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${completion.pct}%` }}
                  />
                </div>

                <Link
                  href={`/projects/${p.id}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  <GanttChart className="h-4 w-4" aria-hidden="true" />
                  {t("openTimeline")}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
