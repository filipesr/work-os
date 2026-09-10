import type { ArtifactMediaType, Prisma, PrismaClient } from "@prisma/client";
import { createTaskCore } from "@/lib/task-create-core";
import type { ReworkEvent } from "@/lib/trello/map-rework";
import type { StageName } from "@/lib/trello/map-stages";
import type { ImportPlan, PlannedStage, PlannedTask } from "@/lib/trello/plan";
import type { ExportCard } from "@/lib/trello/types";

// Aplica o ImportPlan (lib/trello/plan.ts) no banco, reusando `createTaskCore` (lib/task-create-core.ts)
// — o mesmo caminho que o produto usa para criar demanda — mas com o carimbo histórico correto e as
// três garantias que o brief (task-9-brief.md) pede, em ordem de custo se erradas:
//
// 1. Idempotência pela URL do card (`TaskArtifact.url`) — sem coluna nova, ver "Idempotência sem
//    coluna nova" na spec de design.
// 2. ENSAIO (commit: false) não toca o banco. Nenhuma chamada de prisma é feita nesse ramo — não é
//    "não deu erro", é NENHUMA escrita acontecendo, o que os testes provam contando chamadas.
// 3. Uma `$transaction` por projeto mensal — um mês que falha não derruba os outros.

const TEMPLATE_NAME = "Demanda GoOn";

export type ApplyImportPlanOptions =
  | { commit: false }
  | {
      commit: true;
      /**
       * Quem está rodando a importação — vira `createdById` da demanda, `userId` de cada
       * `TaskStageLog` sem responsável conhecido e `byUserId` de cada `ReworkEvent` (auditoria,
       * nunca métrica de pessoa — comentário do schema). Obrigatório só quando `commit` é `true`:
       * o ENSAIO não grava nada, então não precisa de autor; a gravação real precisa de um usuário
       * de verdade, porque essas três colunas são FK não-nulas no schema. Não existe "usuário de
       * sistema" neste código (nenhum precedente encontrado em scripts/seeds existentes) — inventar
       * um placeholder seria pior do que exigir que quem roda o script informe quem é.
       */
      importedById: string;
    };

export interface ImportReport {
  commit: boolean;
  /** Projetos mensais criados nesta rodada. No ENSAIO, é a projeção: quantos o plano tem. */
  projectsCreated: number;
  /** Projetos mensais já existentes (achados pelo nome) e reaproveitados. Sempre 0 no ENSAIO. */
  projectsReused: number;
  /** Demandas criadas nesta rodada. No ENSAIO, é a projeção: quantas o plano tem. */
  tasksCreated: number;
  /** Demandas puladas porque já existe um artefato com a URL do card — a chave de idempotência.
   * Sempre 0 no ENSAIO: sem tocar o banco, não há como saber o que já foi importado. */
  skippedAlreadyImported: number;
  artifactsCreated: number;
  reworkEventsCreated: number;
  /** Um item por mês cuja transação lançou — os outros meses continuam de pé (garantia 3). */
  failedMonths: { monthKey: string; error: string }[];
}

/** Contexto resolvido uma vez, compartilhado por todos os meses. */
interface WriteContext {
  templateId: string;
  stageIdByName: Map<StageName, string>;
  importedById: string;
}

export async function applyImportPlan(
  prisma: PrismaClient,
  plan: ImportPlan,
  opts: ApplyImportPlanOptions
): Promise<ImportReport> {
  if (!opts.commit) {
    // ENSAIO: nenhuma chamada a `prisma` acontece neste ramo — é a garantia 2, e é por isso que
    // não há nada além de aritmética sobre `plan` daqui até o `return`.
    return projectPlanCounts(plan);
  }

  const ctx = await resolveWriteContext(prisma, plan, opts.importedById);

  const report: ImportReport = {
    commit: true,
    projectsCreated: 0,
    projectsReused: 0,
    tasksCreated: 0,
    skippedAlreadyImported: 0,
    artifactsCreated: 0,
    reworkEventsCreated: 0,
    failedMonths: [],
  };

  for (const proj of plan.projects) {
    const tasksOfMonth = plan.tasks.filter((t) => t.monthKey === proj.monthKey);
    try {
      // Garantia 3: uma transação por PROJETO MENSAL, não uma para o plano inteiro.
      await prisma.$transaction(async (tx) => {
        const projectId = await resolveProjectId(tx, proj, report);
        for (const task of tasksOfMonth) {
          await writeTask(tx, task, projectId, ctx, report);
        }
      });
    } catch (error) {
      report.failedMonths.push({ monthKey: proj.monthKey, error: String(error) });
    }
  }

  return report;
}

/**
 * Resolve o template "Demanda GoOn" e valida, ANTES de abrir qualquer transação, que ele tem toda
 * etapa que o plano precisa. Falhar aqui (fail fast) é melhor que descobrir no meio do mês 9 de 18
 * — e essa falha não é "um mês quebrado", é a importação inteira mal configurada.
 */
async function resolveWriteContext(
  prisma: PrismaClient,
  plan: ImportPlan,
  importedById: string
): Promise<WriteContext> {
  const template = await prisma.workflowTemplate.findFirst({
    where: { name: TEMPLATE_NAME },
    select: { id: true, stages: { select: { id: true, name: true } } },
  });

  const stageIdByName = new Map<StageName, string>();
  for (const s of template?.stages ?? []) stageIdByName.set(s.name as StageName, s.id);

  const requiredNames = new Set(plan.tasks.flatMap((t) => t.stages.map((s) => s.stageName)));
  for (const name of requiredNames) {
    if (!stageIdByName.has(name)) {
      throw new Error(
        `Template "${TEMPLATE_NAME}" não tem a etapa "${name}" que o plano precisa — abortando ` +
          `antes de escrever qualquer coisa (nenhum mês foi tocado).`
      );
    }
  }

  return { templateId: template?.id ?? "", stageIdByName, importedById };
}

/** Acha o projeto mensal pelo nome (idempotência do projeto) ou cria, contra o Client já existente. */
async function resolveProjectId(
  tx: Prisma.TransactionClient,
  proj: { monthKey: string; name: string },
  report: ImportReport
): Promise<string> {
  const existing = await tx.project.findFirst({ where: { name: proj.name }, select: { id: true } });
  if (existing) {
    report.projectsReused += 1;
    return existing.id;
  }

  // O nome do projeto é "<clientName> <monthKey>" (plan.ts) — tirar o sufixo " <monthKey>" devolve
  // o clientName sem duplicar a regra de nomeação aqui.
  const clientName = proj.name.slice(0, proj.name.length - proj.monthKey.length - 1);
  const client = await tx.client.findFirst({ where: { name: clientName }, select: { id: true } });
  if (!client) {
    throw new Error(
      `Cliente "${clientName}" não encontrado — a importação espera que ele já exista.`
    );
  }

  const created = await tx.project.create({ data: { name: proj.name, clientId: client.id } });
  report.projectsCreated += 1;
  return created.id;
}

async function writeTask(
  tx: Prisma.TransactionClient,
  task: PlannedTask,
  projectId: string,
  ctx: WriteContext,
  report: ImportReport
): Promise<void> {
  const cardUrl = task.card.shortUrl;

  // Garantia 1: idempotência pela URL do card, gravada no artefato de link — ver writeArtifacts.
  if (cardUrl) {
    const existing = await tx.taskArtifact.findFirst({
      where: { url: cardUrl },
      select: { id: true },
    });
    if (existing) {
      report.skippedAlreadyImported += 1;
      return;
    }
  }

  const historicalAt = earliestKnownDate(task);
  const selectedStageIds = new Set(task.stages.map((s) => ctx.stageIdByName.get(s.stageName)!));

  // De propósito SEM `assignments`: createTaskStages só atribui quem pertence ao time EFETIVO da
  // etapa hoje, e faria a promoção automática para IN_PROGRESS quando a etapa de entrada ganha
  // responsável — sobrescrevendo o `status` histórico que acabamos de passar (ex.: uma demanda
  // COMPLETED viraria IN_PROGRESS). A atribuição histórica é um FATO passado, não um roteamento
  // novo sujeito à composição de time de hoje — ela é escrita direto no fixup (fixupStage), abaixo.
  const { id: taskId } = await createTaskCore(tx, {
    title: task.title,
    description: task.description || null,
    priority: task.priority,
    dueDate: task.dueDate,
    projectId,
    templateId: ctx.templateId,
    userId: ctx.importedById,
    status: task.status,
    completedAt: task.status === "COMPLETED" ? task.completedAt : undefined,
    createdAt: historicalAt,
    selectedStageIds,
    at: historicalAt,
  });

  for (const stage of task.stages) {
    await fixupStage(tx, taskId, stage, ctx.stageIdByName, historicalAt);
  }

  // O log que createTaskStages abriu sozinho (só para a etapa de ENTRADA, com `at` genérico) não
  // reflete a jornada real — reconstruímos do zero, um TaskStageLog por segmento de cada etapa.
  // Sem restrição de unicidade em TaskStageLog (ao contrário de TaskActiveStage): é assim que uma
  // etapa revisitada duas vezes vira duas linhas de log e permanece UMA linha de TaskActiveStage.
  await tx.taskStageLog.deleteMany({ where: { taskId } });
  const reworkTimes = new Set(task.rework.map((r) => r.at.getTime()));
  for (const stage of task.stages) {
    await writeStageLogs(
      tx,
      taskId,
      stage,
      ctx.stageIdByName,
      ctx.importedById,
      reworkTimes,
      historicalAt
    );
  }

  for (const rework of task.rework) {
    await writeReworkEvent(tx, taskId, rework, task.stages, ctx.stageIdByName, ctx.importedById);
    report.reworkEventsCreated += 1;
  }

  report.artifactsCreated += await writeArtifacts(tx, taskId, task.card, ctx.importedById);
  report.tasksCreated += 1;
}

/**
 * Corrige o `TaskActiveStage` que `createTaskCore` criou com o padrão de demanda NOVA (entrada
 * ACTIVE, demais INACTIVE) para o que a evidência do Trello mostra:
 *   - último segmento com saída → COMPLETED, com `completedAt` na data da saída;
 *   - último segmento SEM saída (o trabalho parou ali) → ACTIVE.
 * `activatedAt`/`assignedAt` recebem a data do PRIMEIRO segmento quando conhecida — é quando a
 * etapa realmente começou — e caem para `historicalAt` (a mesma âncora do resto da demanda) quando
 * não há data (nível 3: só a lista de origem, sem movimentação nem anexo).
 */
async function fixupStage(
  tx: Prisma.TransactionClient,
  taskId: string,
  stage: PlannedStage,
  stageIdByName: Map<StageName, string>,
  historicalAt: Date
): Promise<void> {
  const stageId = stageIdByName.get(stage.stageName)!;
  const first = stage.segments[0];
  const last = stage.segments[stage.segments.length - 1];
  const activatedAt = first?.enteredAt ?? historicalAt;

  await tx.taskActiveStage.update({
    where: { taskId_stageId: { taskId, stageId } },
    data: {
      status: stage.completed ? "COMPLETED" : "ACTIVE",
      completedAt: stage.completed ? (last.exitedAt ?? null) : null,
      activatedAt,
      assigneeId: stage.assigneeUserId ?? null,
      assignedAt: stage.assigneeUserId ? activatedAt : null,
    },
  });
}

/**
 * Um `TaskStageLog` por segmento (por visita à etapa). `status`:
 *   - segmento ainda sem saída → `null` (em curso, mesma semântica do produto vivo);
 *   - segmento de "Quality Control" cuja saída bate com o instante de um retrabalho → `REVERTED`
 *     — é o que liga o log ao `ReworkEvent` (mesmo carimbo `at`/`exitedAt`, ver map-rework.ts);
 *   - qualquer outro segmento com saída → `COMPLETED`.
 * `userId`: o responsável pela etapa quando conhecido (é quem de fato moveu a tarefa), senão quem
 * rodou a importação.
 */
async function writeStageLogs(
  tx: Prisma.TransactionClient,
  taskId: string,
  stage: PlannedStage,
  stageIdByName: Map<StageName, string>,
  importedById: string,
  reworkTimes: Set<number>,
  historicalAt: Date
): Promise<void> {
  const stageId = stageIdByName.get(stage.stageName)!;
  const userId = stage.assigneeUserId ?? importedById;

  for (const seg of stage.segments) {
    let status: "COMPLETED" | "REVERTED" | null = null;
    if (seg.exitedAt) {
      status =
        stage.stageName === "Quality Control" && reworkTimes.has(seg.exitedAt.getTime())
          ? "REVERTED"
          : "COMPLETED";
    }

    await tx.taskStageLog.create({
      data: {
        taskId,
        stageId,
        userId,
        enteredAt: seg.enteredAt ?? historicalAt,
        exitedAt: seg.exitedAt ?? null,
        status,
      },
    });
  }
}

/**
 * `sourceAssigneeId` (nullable) é quem de fato executou a etapa-origem — vem do `assigneeUserId`
 * daquela etapa no plano, quando conhecido. `byUserId` (obrigatório) é só auditoria de quem
 * registrou o evento; como a movimentação do Trello não carrega o autor da devolução (só
 * `fromListName`/`toListName`/`at` — ver CardMovement em types.ts), é sempre quem rodou a
 * importação, nunca inventado.
 */
async function writeReworkEvent(
  tx: Prisma.TransactionClient,
  taskId: string,
  rework: ReworkEvent,
  stages: PlannedStage[],
  stageIdByName: Map<StageName, string>,
  importedById: string
): Promise<void> {
  const sourceStageId = stageIdByName.get(rework.sourceStageName)!;
  const sourceStage = stages.find((s) => s.stageName === rework.sourceStageName);

  await tx.reworkEvent.create({
    data: {
      taskId,
      sourceStageId,
      at: rework.at,
      kind: rework.kind,
      reason: rework.reason,
      byUserId: importedById,
      sourceAssigneeId: sourceStage?.assigneeUserId ?? null,
    },
  });
}

/** O card original vira um artefato de link; cada anexo COM url vira outro (sem url, não há nada
 * a linkar — nível 2/3 pode ter anexo só como evidência de data/autor, sem essa garantia). */
async function writeArtifacts(
  tx: Prisma.TransactionClient,
  taskId: string,
  card: ExportCard,
  importedById: string
): Promise<number> {
  let count = 0;

  if (card.shortUrl) {
    await tx.taskArtifact.create({
      data: {
        title: "Card original no Trello",
        url: card.shortUrl,
        scope: "TASK",
        storageKind: "LINK",
        uploadStatus: "READY",
        sensitivity: "INTERNO",
        taskId,
        userId: importedById,
      },
    });
    count += 1;
  }

  for (const att of card.attachments ?? []) {
    if (!att.url) continue;
    await tx.taskArtifact.create({
      data: {
        title: att.name ?? "Anexo do Trello",
        url: att.url,
        scope: "TASK",
        storageKind: "LINK",
        uploadStatus: "READY",
        mediaType: deriveAttachmentMediaType(att.mimeType),
        sensitivity: "INTERNO",
        taskId,
        userId: importedById,
      },
    });
    count += 1;
  }

  return count;
}

function deriveAttachmentMediaType(mimeType?: string | null): ArtifactMediaType {
  if (mimeType?.startsWith("video/")) return "VIDEOS";
  if (mimeType?.startsWith("image/")) return "FOTOS";
  if (mimeType === "application/pdf") return "DOCUMENTOS";
  return "OUTROS";
}

/**
 * A âncora de data histórica da demanda: a mais antiga entre `enteredAt`/`exitedAt` de qualquer
 * segmento de qualquer etapa planejada. Sem isso, `createTaskCore` cairia no padrão (`new Date()`)
 * e a importação inteira nasceria datada de hoje — o oposto do objetivo (ver spec, "O obstáculo
 * maior é o tempo").
 *
 * Quando nenhum segmento tem data (nível 3: só a lista de origem), cai para `dueDate` e depois
 * `dateLastActivity` — a MESMA ordem de precedência que `mapCardToTask` já usa para achar o mês do
 * card (map-task.ts: due, senão dateLastActivity). Por construção de `buildImportPlan` (plan.ts),
 * todo `PlannedTask` tem due OU dateLastActivity — um card sem os dois vai para `skipped` com o
 * motivo "sem mês" antes de virar PlannedTask — então este fallback nunca deveria cair no `new
 * Date()` final contra o export real; ele existe só como rede de segurança, não como caminho
 * esperado.
 */
function earliestKnownDate(task: PlannedTask): Date {
  let earliest: Date | undefined;
  for (const stage of task.stages) {
    for (const seg of stage.segments) {
      for (const d of [seg.enteredAt, seg.exitedAt]) {
        if (d && (!earliest || d < earliest)) earliest = d;
      }
    }
  }
  if (earliest) return earliest;
  if (task.dueDate) return task.dueDate;
  if (task.card.dateLastActivity) return new Date(task.card.dateLastActivity);
  return new Date();
}

/** ENSAIO: conta o que o plano TEM, sem checar o que já existe no banco (não pode — não escreve
 * nada). `skippedAlreadyImported`/`projectsReused` ficam em 0 porque isso só se sabe consultando. */
function projectPlanCounts(plan: ImportPlan): ImportReport {
  const artifactsCreated = plan.tasks.reduce((sum, t) => {
    const attachmentCount = (t.card.attachments ?? []).filter((a) => a.url).length;
    return sum + (t.card.shortUrl ? 1 : 0) + attachmentCount;
  }, 0);
  const reworkEventsCreated = plan.tasks.reduce((sum, t) => sum + t.rework.length, 0);

  return {
    commit: false,
    projectsCreated: plan.projects.length,
    projectsReused: 0,
    tasksCreated: plan.tasks.length,
    skippedAlreadyImported: 0,
    artifactsCreated,
    reworkEventsCreated,
    failedMonths: [],
  };
}
