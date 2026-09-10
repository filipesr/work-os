/** Estrutura mínima de um card do Trello para classificação de natureza. */
export interface Card {
  name: string;
  idLabels?: string[];
  attachments?: Array<{
    id: string;
    /** ID do membro do Trello que anexou o arquivo. Usado por planStages (map-stages.ts) para atribuir responsável na etapa de produção quando não há movimentação registrada (nível 2 de evidência). */
    idMember?: string;
    /** Data do anexo (ISO 8601). Usado por planStages (map-stages.ts) para datar a entrada na etapa de produção quando não há movimentação (nível 2 de evidência). */
    date?: string | null;
    /** Tipo MIME do arquivo anexado (ex.: "video/mp4", "image/png", "application/pdf"). Usado por
     * planStages (map-stages.ts) para derivar a etapa de produção (Desenho ou Audio Visual) quando a
     * lista onde o card parou não é de produção — é evidência do que foi de fato produzido, não uma
     * suposição sobre por onde o card andou. */
    mimeType?: string | null;
    /** Nome do arquivo anexado. Usado por writer.ts (Task 9) como título do artefato de link do
     * anexo — sem ele, o artefato ficaria sem nome legível na tela. */
    name?: string;
    /** URL do anexo no Trello (`trello.com/1/cards/.../download/...`). Usado por writer.ts (Task 9)
     * para gravar o artefato de link do anexo — ver "Por que os anexos ficam como link" na spec. */
    url?: string;
  }>;
  /** ID da lista. Usado por mapCardToTask para determinar status (COMPLETED se em "Concluido"). */
  idList?: string;
  /** IDs dos membros do Trello declarados no card. Usado por buildImportPlan (plan.ts) para dar
   * dono às etapas que a evidência de execução (nome na lista, autor do anexo) deixou sem
   * responsável — 127 cards do export real declaram alguém. */
  idMembers?: string[];
  /** Timestamp do ARQUIVAMENTO do card. NÃO serve para datar `completedAt`: medido no export real,
   * é nulo nos 52 cards da lista `Concluido` (nenhum está arquivado), e card arquivado FORA de
   * `Concluido` vira OBSOLETE, status em que a data é descartada de propósito. Fica declarado
   * porque existe no export e é o que `closed` data — nenhum mapeamento o lê. */
  dateClosed?: string | null;
  /** Data de conclusão marcada no próprio Trello (casada com `dueComplete`). Usado por
   * mapCardToTask como SEGUNDA evidência de `completedAt`, atrás da movimentação para a lista
   * `Concluido` — presente em 38 dos 52 cards concluídos do export real. */
  dateCompleted?: string | null;
  /** Data da última atividade no card. Usado por mapCardToTask para extrair monthKey quando due não existe. */
  dateLastActivity?: string | null;
  /** Indica se o card foi arquivado. Usado por mapCardToTask para determinar status (OBSOLETE se arquivado). */
  closed?: boolean;
  /** Descrição do card. Usado por mapCardToTask para preencher description. */
  desc?: string;
  /** Data de vencimento do card. Usado por mapCardToTask para preencher dueDate e extrair monthKey. */
  due?: string | null;
}

/** Natureza de um card: demanda real, separador visual, ausência/evento ou referência. */
export type CardNature = "demanda" | "separador" | "ausencia" | "referencia";

/** Mapa de ID de rótulo para seu nome (ex: { "L1": "MODELO", "L2": "URGENTE" }). */
export type LabelsById = Record<string, string>;

/** Membro do Trello. Usado por matchMembers para mapear para usuários do WorkOS. */
export interface TrelloMember {
  id: string;
  username: string;
  fullName: string;
}

/** Usuário do WorkOS. Usado por matchMembers para receber matching. */
export interface WorkOSUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Movimentação de um card entre listas, derivada da ação "updateCard" do Trello
 * (`action.data.listBefore.name` / `action.data.listAfter.name` / `action.date`).
 * Usado por planStages (map-stages.ts) para reconstruir a jornada de nível 1, com data por etapa.
 */
export interface CardMovement {
  fromListName: string;
  toListName: string;
  /** Data ISO 8601 da movimentação (`action.date`). */
  at: string;
}

/**
 * Um card tal como aparece em `board.cards` no export do Trello — o `Card` de classificação e
 * mapeamento, mais os campos que só o joiner (buildImportPlan, plan.ts) precisa: o ID para casar o
 * card com suas movimentações (derivadas de `board.actions`) e referenciá-lo nos itens do plano
 * (tarefas planejadas e descartes), e a URL curta que a Task 9 (o escritor) vai usar como chave de
 * idempotência.
 */
export interface ExportCard extends Card {
  /** ID do card no Trello. Usado por buildImportPlan para agrupar `board.actions` por card. */
  id: string;
  /** URL curta e estável do card (ex.: `https://trello.com/c/abc123`). Carregada no plano para a
   * Task 9 montar o artefato "card original no Trello"; buildImportPlan não a usa. */
  shortUrl?: string;
}

/** Rótulo do quadro, como aparece em `board.labels`. Usado por buildImportPlan para montar `LabelsById`. */
export interface TrelloLabel {
  id: string;
  name: string;
}

/** Lista do quadro, como aparece em `board.lists`. Usado por buildImportPlan para montar
 * `listNamesById` (contexto de planStages/planRework) e para achar a lista "Concluido". */
export interface TrelloList {
  id: string;
  name: string;
}

/**
 * Ação do Trello, como aparece em `board.actions`. Usado por buildImportPlan para reconstruir as
 * `CardMovement[]` de cada card — só os campos de `updateCard` com troca de lista importam; ações de
 * outro tipo (comentário, anexo, etc.) são ignoradas por não terem `listBefore`/`listAfter`.
 */
export interface TrelloAction {
  type: string;
  /** Data ISO 8601 da ação. */
  date: string;
  data: {
    card?: { id: string };
    listBefore?: { name: string };
    listAfter?: { name: string };
  };
}

/**
 * O export do quadro do Trello, na forma mínima que buildImportPlan (plan.ts) consome — o `board`
 * do contrato `buildImportPlan(board, workosUsers, opts)`.
 */
export interface TrelloBoardExport {
  cards: ExportCard[];
  labels: TrelloLabel[];
  lists: TrelloList[];
  members: TrelloMember[];
  actions: TrelloAction[];
}
