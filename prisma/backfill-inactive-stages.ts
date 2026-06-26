// Backfill: para cada tarefa não concluída, garante uma TaskActiveStage para
// TODA etapa do template, criando como INACTIVE as que ainda não existem.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    select: {
      id: true,
      project: { select: { id: true } },
      activeStages: { select: { stageId: true } },
      // template é derivado das etapas existentes; buscamos pelo template das stages atuais
    },
  });

  let created = 0;
  for (const task of tasks) {
    const existing = new Set(task.activeStages.map((s) => s.stageId));
    // Descobrir o template a partir de uma etapa existente
    const anyStage = task.activeStages[0];
    if (!anyStage) continue;
    const stage = await prisma.templateStage.findUnique({
      where: { id: anyStage.stageId },
      select: { templateId: true },
    });
    if (!stage) continue;

    const allStages = await prisma.templateStage.findMany({
      where: { templateId: stage.templateId },
      select: { id: true },
    });

    for (const s of allStages) {
      if (existing.has(s.id)) continue;
      await prisma.taskActiveStage.create({
        data: { taskId: task.id, stageId: s.id, status: "INACTIVE", assigneeId: null },
      });
      created++;
    }
  }
  console.log(`Backfill concluído: ${created} etapas INACTIVE criadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
