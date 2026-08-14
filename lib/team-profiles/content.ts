import { getLocale } from "next-intl/server";
import { defaultLocale, locales, type LocaleType } from "@/lib/i18n";

/**
 * Contrato do CONTEÚDO dos descritivos de equipe.
 *
 * A prosa vive em `locales/{pt-BR,es-ES}/teamProfiles.json` e é carregada por
 * import dinâmico — o arquivo NÃO entra em `getMessages` porque é grande e só
 * duas rotas o usam; carregá-lo em toda requisição seria desperdício.
 *
 * O guard de paridade (`__tests__/i18n/locale-parity.test.ts`) varre todos os
 * `.json` de `locales/`, então o arquivo continua coberto — mas ele NÃO entra
 * em arrays, e aqui quase tudo é array. Por isso `__tests__/content/
 * team-profiles.test.ts` faz a checagem estrutural profunda e a de vazamento
 * de português no es-ES.
 */

export const CADENCES = ["diarias", "semanais", "mensais", "anuais"] as const;
export type Cadence = (typeof CADENCES)[number];

export const TOOL_GROUPS = ["obrigatorias", "apoio", "internas"] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

export const REPORT_DESTINATIONS = ["cliente", "gestao", "documentacao"] as const;
export type ReportDestination = (typeof REPORT_DESTINATIONS)[number];

/** Espelha `SensitivityLevel` de `lib/nas/sensitivity.ts`. */
export const SENSITIVITY_LEVELS = ["CLIENTE", "INTERNO", "CONFIDENCIAL"] as const;
export type SensitivityLabel = (typeof SENSITIVITY_LEVELS)[number];

export interface ToolEntry {
  nome: string;
  para: string;
  /** Ausente quando a ferramenta é uma referência interna (pasta, manual, modelo). */
  url?: string;
}

export interface ReportEntry {
  nome: string;
  conteudo: string;
  quando: string;
  destino: ReportDestination;
  sensibilidade: SensitivityLabel;
  ondeEntregar: string;
}

export interface TeamProfileContent {
  title: string;
  summary: string;
  occupationRef: string;
  missao: string;
  entregaveis: string[];
  interfaces: { recebeDe: string[]; entregaPara: string[] };
  ferramentas: Record<ToolGroup, ToolEntry[]>;
  obrigacoes: Record<Cadence, string[]>;
  relatorios: ReportEntry[];
  competencias: { tecnicas: string[]; comportamentais: string[] };
  contratacao: { requisitos: string[]; diferenciais: string[]; perguntas: string[] };
  avaliacao: { oQueOlhamos: string[]; comoLemos: string[]; oQueNuncaFazemos: string[] };
  fontes: string[];
}

export interface TeamProfileUi {
  backToIndex: string;
  backToHelp: string;
  notDocumented: string;
  notDocumentedHint: string;
  coveredTeams: string;
  occupationRef: string;
  openProfile: string;
  sectionLabels: Record<
    | "missao"
    | "entregaveis"
    | "interfaces"
    | "ferramentas"
    | "obrigacoes"
    | "relatorios"
    | "competencias"
    | "contratacao"
    | "avaliacao"
    | "fontes",
    string
  >;
  cadence: Record<Cadence, string>;
  toolGroups: Record<ToolGroup, string>;
  destino: Record<ReportDestination, string>;
  sensitivity: Record<SensitivityLabel, string>;
  reportFields: Record<
    "conteudo" | "quando" | "destino" | "ondeEntregar" | "sensibilidade",
    string
  >;
  interfaceFields: Record<"recebeDe" | "entregaPara", string>;
  competenciaFields: Record<"tecnicas" | "comportamentais", string>;
  contratacaoFields: Record<"requisitos" | "diferenciais" | "perguntas", string>;
  avaliacaoFields: Record<"oQueOlhamos" | "comoLemos" | "oQueNuncaFazemos", string>;
  avaliacaoCallout: { label: string; text: string };
}

export interface TeamProfileIndexContent {
  title: string;
  intro: string;
  hrNote: { label: string; text: string };
  families: Record<string, { title: string; subtitle: string }>;
  undocumented: { title: string; subtitle: string };
}

export interface TeamProfileMessages {
  ui: TeamProfileUi;
  index: TeamProfileIndexContent;
  profiles: Record<string, TeamProfileContent>;
}

/** Carrega o conteúdo no idioma da requisição, com fallback para o locale padrão. */
export async function loadTeamProfileMessages(): Promise<TeamProfileMessages> {
  const locale = await getLocale();
  const safe = locales.includes(locale as LocaleType) ? (locale as LocaleType) : defaultLocale;
  return (await import(`@/locales/${safe}/teamProfiles.json`)).default as TeamProfileMessages;
}
