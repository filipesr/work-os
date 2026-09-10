/** Estrutura mínima de um card do Trello para classificação de natureza. */
export interface Card {
  name: string;
  idLabels?: string[];
  attachments?: Array<{ id: string }>;
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
