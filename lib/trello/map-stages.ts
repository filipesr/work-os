import type { Card, CardMovement } from "./types";
import type { MappedTask } from "./map-task";

/** Nomes de etapa possíveis — precisam bater EXATAMENTE com o template "Demanda GoOn" do banco. */
export type StageName = "Desenho" | "Audio Visual" | "Quality Control" | "Aprovação" | "Relatório";

/**
 * A ordem das etapas dentro do template "Demanda GoOn", espelhada aqui porque este módulo é puro —
 * ele não lê o banco. `Desenho` e `Audio Visual` dividem a mesma ordem de propósito: são paralelas
 * no template (uma peça pode ser arte, vídeo, ou as duas).
 *
 * Serve para uma coisa só: saber o que ainda está PELA FRENTE de uma demanda aberta. Se o template
 * for reordenado no banco, `resolveWriteContext` (writer.ts) continua validando que toda etapa
 * existe, mas a noção de "adiante" aqui envelheceria — daí o espelho estar num lugar só.
 */
export const STAGE_ORDER: Record<StageName, number> = {
  Desenho: 2,
  "Audio Visual": 2,
  "Quality Control": 3,
  Aprovação: 4,
  Relatório: 6,
};

/**
 * O que uma demanda AINDA ABERTA tem pela frente, na ordem do template.
 *
 * As etapas de uma demanda fechada são registro do que aconteceu — e a regra desta importação é
 * que etapa sem evidência não entra. Numa demanda aberta elas são outra coisa: o trabalho que
 * falta. Sem isto, concluir o Desenho de uma demanda importada não ativaria revisão nem aprovação,
 * e ela terminaria pulando o portão de qualidade que reprova 37% das peças.
 *
 * `Briefing` fica de fora porque acontece fora do Trello e já aconteceu; as opcionais de ordem 5
 * (`Trafego Pago`, `Imprensa`, `Gráfica`) ficam de fora porque nada no card diz que se aplicam.
 */
const FORWARD_STAGES: StageName[] = ["Quality Control", "Aprovação", "Relatório"];

/**
 * As etapas do template que vêm DEPOIS da etapa mais avançada com evidência.
 *
 * Devolve vazio quando a demanda não está aberta: numa concluída ou abandonada, uma etapa pendente
 * seria trabalho que ninguém vai fazer.
 */
export function futureStagesFor(status: MappedTask["status"], evidenced: StageName[]): StageName[] {
  if (status !== "IN_PROGRESS") return [];
  const furthest = Math.max(...evidenced.map((n) => STAGE_ORDER[n]));
  return FORWARD_STAGES.filter((n) => STAGE_ORDER[n] > furthest);
}

/**
 * Uma visita a uma etapa: quando entrou e quando saiu. `exitedAt: undefined` significa que não há
 * evidência de saída (a etapa pode ainda estar em curso, ou simplesmente não sabemos).
 *
 * Uma etapa revisitada (devolução da revisão, por exemplo) gera um segmento por visita — nunca um
 * único intervalo fundido, que fabricaria duração incluindo tempo em que o card não estava na etapa.
 */
export interface StageSegment {
  enteredAt?: Date;
  exitedAt?: Date;
}

/**
 * Uma etapa planejada para a demanda, com o nível de detalhe que a evidência sustenta.
 *
 * `segments` tem um item por visita à etapa — normalmente um só, mas dois ou mais quando há
 * devolução. Isso espelha o schema: uma etapa gera um `TaskActiveStage` (linha única, por
 * `@@unique([taskId, stageId])`) e um `TaskStageLog` por segmento (log, sem restrição de
 * unicidade — várias linhas por etapa são o jeito natural de registrar ida-e-volta).
 */
export interface StagePlan {
  stageName: StageName;
  assigneeTrelloId?: string;
  /** O nome que a lista de design carrega (`DISEÑO - MARTIN` → `"MARTIN"`), em caixa alta, quando
   * houver. Viaja mesmo sem `assigneeTrelloId`: três designers do quadro real (FABRICIO, DIEGO,
   * JORGE) não são membros do Trello mas existem no WorkOS, e é plan.ts quem faz essa ponte. */
  designerName?: string;
  segments: StageSegment[];
  /** true quando o ÚLTIMO segmento tem saída conhecida (a etapa foi encerrada, não só visitada). */
  completed: boolean;
}

/** Contexto necessário para planejar as etapas de um card. */
export interface MapStagesContext {
  /** Nome da lista do Trello por ID — resolve `card.idList` para o nome usado no mapeamento. */
  listNamesById: Record<string, string>;
  /**
   * ID do membro do Trello por pessoa extraída da lista "DISEÑO - <pessoa>" (chave em MAIÚSCULAS,
   * ex.: "MARTIN"). Opcional: sem entrada correspondente, a etapa Desenho fica sem responsável —
   * nunca adivinhada.
   */
  trelloIdByDesignerName?: Record<string, string>;
}

/** Resultado do planejamento: as etapas incluídas e o nível de evidência usado. */
export interface PlanStagesResult {
  stages: StagePlan[];
  tier: 1 | 2 | 3;
}

type ProductionStageName = Extract<StageName, "Desenho" | "Audio Visual">;

/** Uma lista mapeada para etapa, com o nome do designer quando a lista for "DISEÑO - <pessoa>". */
interface MappedList {
  stageName: StageName;
  designerName?: string;
}

const DESENHO_LIST_PATTERN = /^DISE[ÑN]O\s*-\s*(.+)$/i;

/**
 * Planeja as etapas de uma demanda importada do Trello, seguindo a regra mestra: etapa sem
 * evidência é etapa NÃO-INCLUÍDA, nunca inferida.
 *
 * Três níveis de evidência, do mais forte ao mais fraco:
 * 1. Movimentação entre listas registrada — reconstrói a jornada inteira, com um segmento por
 *    visita a cada etapa (mais de um quando há devolução).
 * 2. Sem movimentação, mas com anexo (autor + data) — marca a etapa de produção (Desenho ou
 *    Audio Visual) como percorrida, com responsável e data. Nada é afirmado sobre revisão/aprovação.
 * 3. Só a lista onde o card parou — a etapa de produção entra pela lista de origem, sem data.
 *
 * Estar em "Concluido" NUNCA basta para incluir Quality Control ou Aprovação: essas etapas só
 * entram quando uma movimentação de/para REVISIÓN ou LIBERADO for observada (nível 1).
 */
export function planStages(
  card: Card,
  movements: CardMovement[],
  ctx: MapStagesContext
): PlanStagesResult {
  if (movements.length > 0) {
    return { stages: planFromMovements(movements, ctx), tier: 1 };
  }

  const attachment = bestAttachmentEvidence(card.attachments);
  if (attachment) {
    return { stages: planFromAttachment(card, ctx, attachment), tier: 2 };
  }

  return { stages: planFromOriginList(card, ctx), tier: 3 };
}

/** Mapeia o nome de uma lista do Trello para a etapa correspondente, se houver. */
export function mapListToStage(listName: string): MappedList | null {
  const trimmed = listName.trim();

  if (trimmed === "AUDIOVISUAL") return { stageName: "Audio Visual" };
  if (trimmed === "REVISIÓN") return { stageName: "Quality Control" };
  if (trimmed === "LIBERADO") return { stageName: "Aprovação" };

  const desenhoMatch = DESENHO_LIST_PATTERN.exec(trimmed);
  if (desenhoMatch) {
    return { stageName: "Desenho", designerName: desenhoMatch[1].trim() };
  }

  return null;
}

/** Resolve o responsável de "Desenho" a partir do nome extraído da lista, via ctx. Nunca adivinha. */
function resolveDesignerAssignee(
  designerName: string | undefined,
  ctx: MapStagesContext
): string | undefined {
  if (!designerName) return undefined;
  return ctx.trelloIdByDesignerName?.[designerName.toUpperCase()];
}

/** Resolve a etapa de PRODUÇÃO (Desenho ou Audio Visual) a partir da lista onde o card está agora. */
function resolveOriginProductionStage(
  card: Card,
  ctx: MapStagesContext
): { stageName: ProductionStageName; assigneeTrelloId?: string; designerName?: string } | null {
  if (!card.idList) return null;

  const listName = ctx.listNamesById[card.idList];
  if (!listName) return null;

  const mapped = mapListToStage(listName);
  if (!mapped) return null;
  if (mapped.stageName !== "Desenho" && mapped.stageName !== "Audio Visual") return null;

  return {
    stageName: mapped.stageName,
    assigneeTrelloId: resolveDesignerAssignee(mapped.designerName, ctx),
    designerName: mapped.designerName?.toUpperCase(),
  };
}

/**
 * Nível 3: só a lista de origem. Nenhuma data é afirmada — não há evidência de quando a etapa
 * começou ou terminou, só de que o card passou por ela.
 */
function planFromOriginList(card: Card, ctx: MapStagesContext): StagePlan[] {
  const origin = resolveOriginProductionStage(card, ctx);
  if (!origin) return [];

  return [
    {
      stageName: origin.stageName,
      assigneeTrelloId: origin.assigneeTrelloId,
      designerName: origin.designerName,
      segments: [{}],
      completed: false,
    },
  ];
}

/** Evidência de anexo já resolvida: quando entrou e quem é o responsável — pode ser undefined. */
interface AttachmentEvidence {
  enteredAt?: string;
  assigneeTrelloId?: string;
}

/**
 * Nível 2: sem movimentação, mas com anexo. O anexo diz quem produziu (autor) e quando (data) —
 * nada sobre revisão ou aprovação, então a etapa continua sendo só a de produção.
 *
 * QUAL etapa de produção (Desenho ou Audio Visual) vem, em ordem: primeiro a lista de origem do
 * nível 3 (resolveOriginProductionStage) — se o card parou numa lista de produção, ela decide, como
 * sempre decidiu. Só quando a lista NÃO decide (parado numa lista organizacional — "Julio",
 * "ANOTACIONES", "Concluido" sem movimentação — o achado real da revisão desta importação) o
 * mimeType do anexo entra como segunda evidência: ver deriveStageFromMimeTypes. Se nem a lista nem o
 * mimeType decidirem, não há etapa nível 2 (cai para descarte no plano — plan.ts).
 *
 * O responsável vem SÓ do anexo — nunca herda o da lista (resolveOriginProductionStage), mesmo
 * quando o anexo não tem autor. Nível 2 existe porque o anexo fala; se ele não disser quem, a
 * etapa fica sem responsável, não com um adivinhado pela lista.
 */
function planFromAttachment(
  card: Card,
  ctx: MapStagesContext,
  attachment: AttachmentEvidence
): StagePlan[] {
  const origin = resolveOriginProductionStage(card, ctx);
  const stageName = origin?.stageName ?? deriveStageFromMimeTypes(card.attachments);
  if (!stageName) return [];

  // O NOME DA LISTA MANDA sobre o autor do anexo. `DISEÑO - MARTIN` é a afirmação de quem desenhou
  // a peça; o autor do anexo diz só quem subiu o arquivo, e no quadro real isso é com frequência o
  // supervisor ou alguém que já saiu. Quando a lista nomeia alguém, é dele a etapa — e o nome viaja
  // junto mesmo sem id do Trello, porque FABRICIO, DIEGO e JORGE não são membros do quadro e é
  // plan.ts quem os alcança nos usuários do WorkOS. Sem nome na lista (AUDIOVISUAL, ou lista que
  // não decide), o autor do anexo continua sendo a evidência disponível.
  const daLista = origin?.designerName !== undefined;

  return [
    {
      stageName,
      assigneeTrelloId: daLista ? origin!.assigneeTrelloId : attachment.assigneeTrelloId,
      designerName: origin?.designerName,
      segments: [{ enteredAt: attachment.enteredAt ? new Date(attachment.enteredAt) : undefined }],
      completed: false,
    },
  ];
}

const VIDEO_MIME_PATTERN = /^video\//i;
const IMAGEM_OU_PDF_MIME_PATTERN = /^(image\/|application\/pdf$)/i;

/**
 * Deriva a etapa de produção a partir do mimeType dos anexos, quando a lista onde o card parou não
 * decide (não é `DISEÑO -*`/`AUDIOVISUAL`). É evidência, não inferência: um anexo de vídeo é prova de
 * que houve produção audiovisual; um anexo de imagem ou PDF é prova de arte/design — não estamos
 * deduzindo por onde o card andou, estamos lendo o que foi de fato produzido e anexado. Achado real
 * da revisão desta importação: 57 demandas do export ficavam sem etapa nenhuma só porque a lista
 * onde pararam (`Julio`, `ANOTACIONES`, `Concluido`, `LIBERADO`, `COMUNICADOR`) não é de produção,
 * mesmo tendo anexo datado — o tipo do arquivo resolve isso sem inventar nada.
 *
 * Anexo misto (imagem E vídeo no mesmo card): vídeo vence. Produzir um vídeo normalmente implica ter
 * produzido as artes que entram nele (capas, thumbnails, roteiro visual) — o vídeo é o entregável
 * mais avançado no funil de produção deste quadro, então ele é a etapa mais defensável para o card
 * inteiro. (Decisão registrada aqui porque não há como medir esse caso no export: é escolha, não
 * contagem.)
 *
 * Só considera anexos com data — a mesma evidência mínima que bestAttachmentEvidence exige para o
 * nível 2 existir; anexo sem data não sustenta nada, tipo de arquivo ou não. Tipo não reconhecido
 * (nem vídeo, nem imagem, nem PDF) devolve `undefined` — fica indeterminado, não vira etapa nenhuma.
 */
function deriveStageFromMimeTypes(
  attachments: Card["attachments"]
): ProductionStageName | undefined {
  if (!attachments) return undefined;
  const comData = attachments.filter((a) => a.date);

  const hasVideo = comData.some((a) => a.mimeType && VIDEO_MIME_PATTERN.test(a.mimeType));
  if (hasVideo) return "Audio Visual";

  const hasImagemOuPdf = comData.some(
    (a) => a.mimeType && IMAGEM_OU_PDF_MIME_PATTERN.test(a.mimeType)
  );
  if (hasImagemOuPdf) return "Desenho";

  return undefined;
}

/**
 * Melhor evidência de anexo, em duas perguntas separadas:
 *
 * "Quando": o anexo mais antigo com data conhecida — data é exigida para o nível 2 existir.
 *
 * "Quem": o autor com MAIS anexos nesta evidência; empate, o autor cujo anexo mais antigo vence.
 * Não é "quem anexou primeiro" — um card pode ter um anexo de rascunho de outra pessoa seguido de
 * dez do autor de fato. Quem produziu o grosso do material é o responsável mais defensável; "quem
 * chegou primeiro" não tem defesa nenhuma diante de uma contagem 10 a 1.
 */
function bestAttachmentEvidence(attachments: Card["attachments"]): AttachmentEvidence | undefined {
  if (!attachments || attachments.length === 0) return undefined;

  const comData = attachments.filter((a) => a.date);
  if (comData.length === 0) return undefined;

  const maisAntigo = [...comData].sort(
    (a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime()
  )[0];

  const porAutor = new Map<string, { count: number; earliestAt: number }>();
  for (const a of comData) {
    if (!a.idMember) continue;
    const at = new Date(a.date as string).getTime();
    const atual = porAutor.get(a.idMember);
    if (!atual) {
      porAutor.set(a.idMember, { count: 1, earliestAt: at });
    } else {
      atual.count += 1;
      atual.earliestAt = Math.min(atual.earliestAt, at);
    }
  }

  let assigneeTrelloId: string | undefined;
  let melhor: { count: number; earliestAt: number } | undefined;
  for (const [idMember, stats] of porAutor) {
    const vence =
      !melhor ||
      stats.count > melhor.count ||
      (stats.count === melhor.count && stats.earliestAt < melhor.earliestAt);
    if (vence) {
      melhor = stats;
      assigneeTrelloId = idMember;
    }
  }

  return { enteredAt: maisAntigo.date ?? undefined, assigneeTrelloId };
}

/** Uma visita a uma lista, com quando entrou e quando saiu (undefined = desconhecido). */
interface ListVisit {
  listName: string;
  enteredAt?: string;
  exitedAt?: string;
}

/**
 * Nível 1: reconstrói a sequência de listas visitadas a partir das movimentações, e agrupa por
 * etapa (uma StagePlan por nome de etapa, na ordem da primeira visita) — mas cada visita vira o SEU
 * PRÓPRIO segmento dentro da etapa, nunca fundida com uma visita anterior. Listas que não mapeiam
 * para etapa nenhuma (ex.: "COMUNICADOR", "Concluido") são ignoradas — não produzem segmento.
 */
function planFromMovements(movements: CardMovement[], ctx: MapStagesContext): StagePlan[] {
  const sorted = [...movements].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const visits: ListVisit[] = [];
  sorted.forEach((m, i) => {
    if (i === 0) {
      visits.push({ listName: m.fromListName, enteredAt: undefined, exitedAt: m.at });
    } else {
      visits[visits.length - 1].exitedAt = m.at;
    }
    // exitedAt fica undefined até a próxima iteração fechar esta visita (ou permanece undefined
    // se esta for a lista atual do card — ainda não há evidência de saída).
    visits.push({ listName: m.toListName, enteredAt: m.at, exitedAt: undefined });
  });

  const order: StageName[] = [];
  const segmentsByStage = new Map<StageName, StageSegment[]>();
  const assigneeByStage = new Map<StageName, string | undefined>();
  const designerByStage = new Map<StageName, string | undefined>();

  for (const visit of visits) {
    const mapped = mapListToStage(visit.listName);
    if (!mapped) continue;

    if (!segmentsByStage.has(mapped.stageName)) {
      order.push(mapped.stageName);
      segmentsByStage.set(mapped.stageName, []);
    }

    // O dono da etapa é quem está com ela AGORA — a última lista de designer por onde o card
    // passou, não a primeira. Um card devolvido de `DISEÑO - SUPERVISIÓN` para `DISEÑO - HENRIQUE`
    // é do Henrique; a passagem anterior continua no histórico de segmentos, que é onde ela cabe.
    // Visita sem nome de designer (REVISIÓN, LIBERADO) não escreve nada: ela não afirma um dono
    // novo nem apaga o conhecido — os dois mapas devolvem `undefined` para chave que nunca entrou.
    if (mapped.designerName) {
      assigneeByStage.set(mapped.stageName, resolveDesignerAssignee(mapped.designerName, ctx));
      designerByStage.set(mapped.stageName, mapped.designerName.toUpperCase());
    }

    segmentsByStage.get(mapped.stageName)!.push({
      enteredAt: visit.enteredAt ? new Date(visit.enteredAt) : undefined,
      exitedAt: visit.exitedAt ? new Date(visit.exitedAt) : undefined,
    });
  }

  return order.map((name) => {
    const segments = segmentsByStage.get(name)!;
    const lastSegment = segments[segments.length - 1];
    return {
      stageName: name,
      assigneeTrelloId: assigneeByStage.get(name),
      designerName: designerByStage.get(name),
      segments,
      completed: lastSegment.exitedAt !== undefined,
    };
  });
}
