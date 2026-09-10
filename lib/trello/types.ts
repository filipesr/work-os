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
  }>;
  /** ID da lista. Usado por mapCardToTask para determinar status (COMPLETED se em "Concluido"). */
  idList?: string;
  /** Timestamp do fechamento do card. Usado por mapCardToTask para datar completedAt quando status é COMPLETED. */
  dateClosed?: string | null;
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
