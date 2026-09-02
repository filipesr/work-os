import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStageView } from "@/lib/actions/stage-view";

interface StagePageProps {
  params: Promise<{ taskId: string; activeStageId: string }>;
}

export default async function StagePage({ params }: StagePageProps) {
  // Mesmo padrão de /tasks/{id}: sem sessão, a tela nem tenta montar.
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const { taskId, activeStageId } = await params;
  const view = await getStageView(activeStageId, taskId);
  // Nulo cobre os dois casos, e de propósito: etapa que não existe e etapa de OUTRA demanda são o
  // mesmo 404 para quem está do lado de fora — distinguir os dois contaria o que existe no banco.
  if (!view) notFound();

  // Placeholder até a próxima tarefa trazer o StageWorkView de verdade: só o essencial para a
  // rota compilar e o guarda de pertencimento (getStageView) ser exercitado fim a fim.
  return (
    <div data-testid="stage-work-view">
      <h1>{view.stage.name}</h1>
      <p>{view.task.title}</p>
    </div>
  );
}
