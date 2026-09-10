import type { ArtifactMediaType, Prisma, PrismaClient } from "@prisma/client";
import { recordStageTransition } from "@/lib/stage-transitions";
import { createTaskCore } from "@/lib/task-create-core";
import { markTaskStarted } from "@/lib/task-start";
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

/**
 * O padrão do Prisma para `$transaction` interativa é `timeout: 5000ms` — e não serve aqui.
 *
 * Cada mês faz CENTENAS de consultas SEQUENCIAIS (uma demanda são ~10: artefato de idempotência,
 * task, etapas, logs, transições, retrabalho, artefatos), contra um banco REMOTO (Neon em
 * sa-east-1, via pooler), onde cada consulta é uma ida-e-volta de rede. Contadas no plano real:
 * 1011 consultas em 2026-08, 717 em 2026-07, 658 em 2026-09 — a 10-30 ms por ida-e-volta, de 15 s
 * a 1 min só nesses meses. Com o padrão, o Prisma fecha a transação no meio e a gravação falha com
 * `P2028 — Transaction already closed`, de forma determinística e reproduzível: reexecutar dá o
 * mesmo erro.
 *
 * `maxWait` é a espera por uma conexão livre do pool antes de a transação começar (o padrão de 2 s
 * é apertado para um pooler remoto); `timeout` é o tempo que a transação pode ficar aberta.
 */
const TRANSACTION_OPTIONS = { timeout: 600_000, maxWait: 30_000 } as const;

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

/**
 * Os contadores de um mês, acumulados LOCALMENTE enquanto a transação daquele mês roda.
 *
 * Somar direto no `ImportReport` de dentro da transação mente quando ela falha: o rollback desfaz
 * as LINHAS, não os números já somados — quem rodasse leria "demandas criadas: 204" logo acima de
 * "meses com falha: 2026-08". Estes números só entram no relatório depois que o
 * `await prisma.$transaction(...)` daquele mês retornar sem lançar (ver `applyImportPlan`).
 */
type MonthCounts = Pick<
  ImportReport,
  | "projectsCreated"
  | "projectsReused"
  | "tasksCreated"
  | "skippedAlreadyImported"
  | "artifactsCreated"
  | "reworkEventsCreated"
>;

const MONTH_COUNT_KEYS = [
  "projectsCreated",
  "projectsReused",
  "tasksCreated",
  "skippedAlreadyImported",
  "artifactsCreated",
  "reworkEventsCreated",
] as const satisfies readonly (keyof MonthCounts)[];

function zeroCounts(): MonthCounts {
  return {
    projectsCreated: 0,
    projectsReused: 0,
    tasksCreated: 0,
    skippedAlreadyImported: 0,
    artifactsCreated: 0,
    reworkEventsCreated: 0,
  };
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
    const counts = zeroCounts();
    try {
      // Garantia 3: uma transação por PROJETO MENSAL, não uma para o plano inteiro.
      await prisma.$transaction(async (tx) => {
        const projectId = await resolveProjectId(tx, proj, counts);
        for (const task of tasksOfMonth) {
          await writeTask(tx, task, projectId, ctx, counts);
        }
      }, TRANSACTION_OPTIONS);
      // Só aqui, DEPOIS de a transação retornar sem lançar: o que ela escreveu sobreviveu, então
      // conta. Um mês que lança pula esta linha e não soma NADA — o relatório fica coerente com o
      // banco, em vez de anunciar demandas que o rollback desfez.
      for (const key of MONTH_COUNT_KEYS) report[key] += counts[key];
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

  // Rodada de conserto 1: `clientId` é DADO (plan.ts), não texto derivado do nome do projeto — ver
  // BuildImportPlanOptions.clientId. Checar aqui, antes de abrir a primeira transação, é a mesma
  // lógica do template acima: um plano sem cliente é a importação inteira mal configurada, não "um
  // mês quebrado" — nenhum mês deveria ser tocado.
  const monthWithoutClient = plan.projects.find((p) => !p.clientId);
  if (monthWithoutClient) {
    throw new Error(
      `Projeto "${monthWithoutClient.name}" sem clientId — quem monta o plano precisa passar ` +
        `opts.clientId em buildImportPlan (lib/trello/plan.ts). Abortando antes de escrever ` +
        `qualquer coisa.`
    );
  }

  return { templateId: template?.id ?? "", stageIdByName, importedById };
}

/** Acha o projeto mensal pelo nome (idempotência do projeto) ou cria contra `proj.clientId` — o
 * dado que o plano já carrega, não mais derivado cortando o sufixo " <monthKey>" do nome (rodada
 * de conserto 1: essa derivação amarrava a identidade do Client a uma convenção de texto de outro
 * módulo — um projeto renomeado, ou uma mudança no formato de `plan.ts`, faria procurar o cliente
 * errado, ou nenhum). Se `proj.clientId` apontar para um Client inexistente, o `project.create`
 * abaixo lança por violação de FK — falha alta e clara, não um cliente adivinhado. */
async function resolveProjectId(
  tx: Prisma.TransactionClient,
  proj: { monthKey: string; name: string; clientId: string },
  counts: MonthCounts
): Promise<string> {
  const existing = await tx.project.findFirst({ where: { name: proj.name }, select: { id: true } });
  if (existing) {
    counts.projectsReused += 1;
    return existing.id;
  }

  const created = await tx.project.create({ data: { name: proj.name, clientId: proj.clientId } });
  counts.projectsCreated += 1;
  return created.id;
}

async function writeTask(
  tx: Prisma.TransactionClient,
  task: PlannedTask,
  projectId: string,
  ctx: WriteContext,
  counts: MonthCounts
): Promise<void> {
  const cardUrl = task.card.shortUrl;

  // Garantia 1: idempotência pela URL do card, gravada no artefato de link — ver writeArtifacts.
  if (cardUrl) {
    const existing = await tx.taskArtifact.findFirst({
      where: { url: cardUrl },
      select: { id: true },
    });
    if (existing) {
      counts.skippedAlreadyImported += 1;
      return;
    }
  }

  const measuredStartedAt = earliestMeasuredDate(task);
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

  // `createTaskCore` só carimba `startedAt` quando a etapa de entrada nasce com responsável
  // (`initialAssigned`), e o escritor não passa `assignments` de propósito — ver o comentário
  // acima. O carimbo é feito aqui, e SÓ quando existe data MEDIDA: `startedAt` afirma "esta
  // demanda começou em tal instante", e a âncora inferida (`dueDate`/`dateLastActivity`, ver
  // `earliestKnownDate`) não é medição de início nenhuma. Sem data medida, `startedAt` fica nulo,
  // que é a verdade — `getCycleTimePercentiles` (lib/actions/reporting.ts) prefere não ver a
  // demanda a ver um cycle time forjado.
  if (measuredStartedAt) {
    await markTaskStarted(tx, taskId, measuredStartedAt);
  }

  for (const stage of task.stages) {
    await fixupStage(tx, taskId, stage, task.status, ctx.stageIdByName, historicalAt);
  }

  // O log e as transições que createTaskCore→createTaskStages abriram sozinhos (só para a etapa de
  // ENTRADA, num único instante genérico) não refletem a jornada real — reconstruímos os dois do
  // zero, um TaskStageLog E um par de StageTransition (entrada/saída) por SEGMENTO de cada etapa.
  // Sem restrição de unicidade em TaskStageLog nem em StageTransition (ao contrário de
  // TaskActiveStage): é assim que uma etapa revisitada duas vezes vira duas linhas de log,
  // transições datadas nos dois instantes reais, e permanece UMA linha de TaskActiveStage.
  await tx.taskStageLog.deleteMany({ where: { taskId } });
  await tx.stageTransition.deleteMany({ where: { taskId } });
  const reworkTimes = new Set(task.rework.map((r) => r.at.getTime()));
  for (const stage of task.stages) {
    await writeStageHistory(tx, taskId, stage, ctx.stageIdByName, ctx.importedById, reworkTimes);
  }

  for (const rework of task.rework) {
    await writeReworkEvent(tx, taskId, rework, task.stages, ctx.stageIdByName, ctx.importedById);
    counts.reworkEventsCreated += 1;
  }

  counts.artifactsCreated += await writeArtifacts(tx, taskId, task.card, ctx.importedById);
  counts.tasksCreated += 1;
}

/**
 * Corrige o `TaskActiveStage` que `createTaskCore` criou com o padrão de demanda NOVA (entrada
 * ACTIVE, demais INACTIVE) para o que a evidência do Trello mostra:
 *   - último segmento com saída → COMPLETED, com `completedAt` na data da saída;
 *   - último segmento SEM saída (o trabalho parou ali) → ACTIVE **só se a demanda ainda estiver
 *     viva**; numa demanda COMPLETED ou OBSOLETE, → INACTIVE (ver `stageStatusFor`).
 * `activatedAt`/`assignedAt` recebem a data do PRIMEIRO segmento quando conhecida — é quando a
 * etapa realmente começou — e caem para `historicalAt` (a mesma âncora do resto da demanda) quando
 * não há data (nível 3: só a lista de origem, sem movimentação nem anexo).
 */
async function fixupStage(
  tx: Prisma.TransactionClient,
  taskId: string,
  stage: PlannedStage,
  taskStatus: PlannedTask["status"],
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
      status: stageStatusFor(taskStatus, stage.completed),
      completedAt: stage.completed ? (last.exitedAt ?? null) : null,
      activatedAt,
      assigneeId: stage.assigneeUserId ?? null,
      assignedAt: stage.assigneeUserId ? activatedAt : null,
    },
  });
}

/**
 * O status do `TaskActiveStage` de uma etapa importada, cruzando o que aconteceu com a ETAPA e o
 * que aconteceu com a DEMANDA.
 *
 * Uma etapa não concluída de demanda que não está mais viva não é trabalho de ninguém — e ACTIVE
 * afirmaria que é. `availableStageWhere` (lib/task-availability.ts) protege as telas de execução,
 * mas os painéis de gestão não usam esse fragmento e filtram só pelo status da ETAPA:
 * `getTeamCurrentLoad` (lib/actions/reporting.ts), lib/actions/team-health.ts e
 * lib/actions/person-metrics.ts — este último calculando aging sobre `activatedAt`, que a
 * importação carimba em 2025, o que faria toda etapa importada estourar o SLA. Medido antes deste
 * conserto: 163 etapas ACTIVE, 101 em demandas OBSOLETE e 11 em COMPLETED, 72 delas com
 * responsável.
 *
 * `INACTIVE` é o valor que `revertTaskStage` (lib/actions/task.ts) já grava para "etapa a ser
 * reconquistada" — nenhuma máquina de estados nova entra no sistema — e, ao contrário de
 * `COMPLETED`, não afirma um trabalho que não aconteceu.
 *
 * `mapCardToTask` (map-task.ts) só produz IN_PROGRESS, COMPLETED e OBSOLETE; qualquer outro status
 * cai no lado conservador (INACTIVE), que nunca inventa trabalho vivo.
 */
function stageStatusFor(
  taskStatus: PlannedTask["status"],
  stageCompleted: boolean
): "COMPLETED" | "ACTIVE" | "INACTIVE" {
  if (stageCompleted) return "COMPLETED";
  return taskStatus === "IN_PROGRESS" ? "ACTIVE" : "INACTIVE";
}

/**
 * Um `TaskStageLog` E um par de `StageTransition` (entrada/saída) por segmento (por visita à
 * etapa) — as duas tabelas que reconstroem a jornada real, escritas juntas porque compartilham a
 * mesma pergunta ("este segmento fechou como quê?").
 *
 * **Cada metade do segmento é escrita só se estiver MEDIDA.** A visita de ORIGEM da primeira
 * movimentação não tem `enteredAt` — ninguém sabe quando o card entrou na primeira lista, só
 * quando saiu (map-stages.ts). Datar essa entrada com a âncora da demanda fabricava permanência:
 * `historicalAt` é, por construção de `earliestKnownDate`, o `exitedAt` DESSA MESMA visita, então
 * o log nascia com `enteredAt == exitedAt` e as duas transições no mesmo instante — 46 segmentos
 * do plano real, 27 deles em Desenho, gravando "0 h em Desenho" como MEDIÇÃO. É a mesma falta que
 * a Ruling 11 já consertou uma vez (fundir visitas fabrica duração), reaparecendo na primeira
 * visita. Sem entrada medida: nenhum `TaskStageLog` (o campo `enteredAt` é obrigatório no schema e
 * não há valor honesto para ele) e nenhuma transição `ACTIVE` — só a transição de SAÍDA, que
 * aconteceu e está datada. Sem entrada nem saída medidas: nada.
 *
 * `fixupStage` continua usando `historicalAt` como `activatedAt` — aquilo é o carimbo de criação
 * da LINHA, não uma medição de permanência.
 *
 * `TaskStageLog.status`:
 *   - segmento ainda sem saída → `null` (em curso, mesma semântica do produto vivo);
 *   - segmento de "Quality Control" cuja saída bate com o instante de um retrabalho → `REVERTED`
 *     — é o que liga o log ao `ReworkEvent` (mesmo carimbo `at`/`exitedAt`, ver map-rework.ts);
 *   - qualquer outro segmento com saída → `COMPLETED`.
 * `userId`: o responsável pela etapa quando conhecido (é quem de fato moveu a tarefa), senão quem
 * rodou a importação.
 *
 * `StageTransition` (rodada de conserto 1 — Task 1 desta entrega deu `at` a `recordStageTransition`
 * exatamente para isto, e não estava sendo usado): toda entrada de segmento grava `ACTIVE` na data
 * de entrada — é o que `lib/actions/project-timeline.ts`/`reporting.ts`/`client-load.ts` leem para
 * a linha do tempo e os relatórios de fluxo, e sem isto as 204 demandas históricas apareceriam com
 * transições datadas do momento da importação, não do Trello. Toda SAÍDA de segmento grava:
 *   - `INACTIVE` na data da saída, quando REVERTED — NÃO um "REVERTED" inventado (o enum
 *     `ActiveStageStatus` não tem esse valor): é o status exato que `revertTaskStage`
 *     (lib/actions/task.ts) já grava para a etapa de onde se reverte (reset — "a ser reconquistada",
 *     via `recordStageTransitions(..., "INACTIVE")` sobre as etapas de order maior que o alvo).
 *     Reusar o mesmo valor em vez de inventar um novo mantém `statusDurations`
 *     (lib/stage-transitions.ts) lendo a mesma máquina de estados nos dois caminhos.
 *   - `COMPLETED` na data da saída, nos demais casos.
 */
async function writeStageHistory(
  tx: Prisma.TransactionClient,
  taskId: string,
  stage: PlannedStage,
  stageIdByName: Map<StageName, string>,
  importedById: string,
  reworkTimes: Set<number>
): Promise<void> {
  const stageId = stageIdByName.get(stage.stageName)!;
  const userId = stage.assigneeUserId ?? importedById;

  for (const seg of stage.segments) {
    let logStatus: "COMPLETED" | "REVERTED" | null = null;
    if (seg.exitedAt) {
      logStatus =
        stage.stageName === "Quality Control" && reworkTimes.has(seg.exitedAt.getTime())
          ? "REVERTED"
          : "COMPLETED";
    }

    // Só a ENTRADA medida gera o log e a transição de entrada. Um segmento sem `enteredAt` (e sem
    // `exitedAt`) não gera nada: as duas condições abaixo simplesmente não disparam.
    if (seg.enteredAt) {
      await tx.taskStageLog.create({
        data: {
          taskId,
          stageId,
          userId,
          enteredAt: seg.enteredAt,
          exitedAt: seg.exitedAt ?? null,
          status: logStatus,
        },
      });

      await recordStageTransition(tx, taskId, stageId, "ACTIVE", seg.enteredAt);
    }

    if (seg.exitedAt) {
      const exitStatus = logStatus === "REVERTED" ? "INACTIVE" : "COMPLETED";
      await recordStageTransition(tx, taskId, stageId, exitStatus, seg.exitedAt);
    }
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
 * A mais antiga data MEDIDA da demanda: a menor entre `enteredAt`/`exitedAt` de qualquer segmento
 * de qualquer etapa planejada, ou `undefined` quando nenhum segmento tem data (nível 3 de
 * evidência: só a lista onde o card parou).
 *
 * É a função irmã de `earliestKnownDate`, e existe para separar o que aquela mistura: ela SEMPRE
 * devolve uma data, caindo em `dueDate`/`dateLastActivity` quando não há segmento datado. Essa
 * queda serve para `createdAt` (a linha precisa de um carimbo de criação, e o mês do card é a
 * melhor aproximação honesta), mas NÃO serve para `startedAt`, que afirma um evento medido — daí
 * a distinção entre âncora MEDIDA e âncora INFERIDA.
 */
function earliestMeasuredDate(task: PlannedTask): Date | undefined {
  let earliest: Date | undefined;
  for (const stage of task.stages) {
    for (const seg of stage.segments) {
      for (const d of [seg.enteredAt, seg.exitedAt]) {
        if (d && (!earliest || d < earliest)) earliest = d;
      }
    }
  }
  return earliest;
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
  const measured = earliestMeasuredDate(task);
  if (measured) return measured;
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
