import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getProjectTimeline } from "@/lib/actions/project-timeline";
import { PageHeader } from "@/components/ui/PageHeader";
import { auth } from "@/lib/auth";
import { TimelineFilters } from "./TimelineFilters";
import { ProjectTimeline } from "./ProjectTimeline";

interface ProjectPageProps {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<{
    mine?: string | string[];
    assignee?: string | string[];
    team?: string | string[];
    priority?: string | string[];
  }>;
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const { projectId } = await params;

  // Só o necessário para o cabeçalho — o resto do que a página buscava (stagesMap, allStagesMap,
  // templates, currentStage por tarefa) existia só para alimentar as colunas do kanban, que saiu.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, client: { select: { name: true } } },
  });

  if (!project) {
    notFound();
  }

  const sp = await searchParams;
  const filtros = {
    mine: sp.mine === "1",
    assigneeId: typeof sp.assignee === "string" ? sp.assignee : undefined,
    teamId: typeof sp.team === "string" ? sp.team : undefined,
    priority: typeof sp.priority === "string" ? sp.priority : undefined,
  };

  // As opções dos filtros de responsável/equipe vêm só de quem de fato aparece nas etapas deste
  // projeto — listar a empresa inteira faria o dropdown crescer com o número de funcionários, não
  // com o tamanho do projeto.
  const etapasDoProjeto = await prisma.taskActiveStage.findMany({
    where: { task: { projectId } },
    select: {
      assignee: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      stage: { select: { defaultTeam: { select: { id: true, name: true } } } },
    },
  });

  const pessoasMap = new Map<string, string>();
  const timesMap = new Map<string, string>();
  for (const e of etapasDoProjeto) {
    if (e.assignee) {
      pessoasMap.set(e.assignee.id, e.assignee.name ?? e.assignee.email ?? e.assignee.id);
    }
    const time = e.team ?? e.stage.defaultTeam;
    if (time) timesMap.set(time.id, time.name);
  }
  const people = [...pessoasMap]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const teams = [...timesMap]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const [data, tp] = await Promise.all([
    getProjectTimeline(projectId, filtros),
    getTranslations("projects"),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={tp("boardKicker")}
        title={project.name}
        subtitle={`${tp("client")}: ${project.client.name}`}
        backHref="/projects"
        backLabel={tp("backToProjects")}
      />

      <div className="mb-4">
        <TimelineFilters
          mine={filtros.mine}
          assigneeId={filtros.assigneeId}
          teamId={filtros.teamId}
          priority={filtros.priority}
          people={people}
          teams={teams}
        />
      </div>

      {/* ProjectTimeline monta seu próprio card ao redor só da tabela — legenda e futureHint
          ficam fora dele, no mesmo container com padding da página, igual à carga por cliente. */}
      <ProjectTimeline data={data} />
    </div>
  );
}
