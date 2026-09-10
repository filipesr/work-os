/** Estrutura mínima de um card do Trello para classificação de natureza. */
export interface Card {
  name: string;
  idLabels?: string[];
  attachments?: Array<{ id: string }>;
  /** ID da lista: usado para determinar se card está em "Concluido" */
  idList?: string;
  /** Timestamp do fechamento do card (quando foi arquivado). */
  dateClosed?: string | null;
  /** Data da última atividade no card. */
  dateLastActivity?: string | null;
  /** Indica se o card foi arquivado. */
  closed?: boolean;
  /** Descrição do card. */
  desc?: string;
  /** Data de vencimento do card. */
  due?: string | null;
}

/** Natureza de um card: demanda real, separador visual, ausência/evento ou referência. */
export type CardNature = "demanda" | "separador" | "ausencia" | "referencia";

/** Mapa de ID de rótulo para seu nome (ex: { "L1": "MODELO", "L2": "URGENTE" }). */
export type LabelsById = Record<string, string>;
