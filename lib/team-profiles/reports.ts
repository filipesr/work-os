import {
  AlertOctagon,
  ClipboardCheck,
  FileText,
  MessageSquareWarning,
  Newspaper,
  Siren,
  Target,
  TrendingUp,
  Undo2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { ReportDestination, SensitivityLabel } from "./content";

/**
 * Modelos de relatório: a anatomia, o exemplo preenchido e o esqueleto copiável
 * de cada artefato que uma função produz.
 *
 * O padrão é POR ARTEFATO, não da casa: um clipping e um relatório de incidente
 * respondem a perguntas diferentes, para leitores diferentes, e forçá-los na
 * mesma anatomia produziria seções vazias nos dois.
 *
 * Nem todo artefato declarado nos descritivos tem modelo ainda. Os que têm
 * carregam `modelo: "<slug>"` na sua entrada de `relatorios` em
 * `teamProfiles.json`; os demais aparecem na tela marcados como sem modelo — a
 * mesma regra das equipes não documentadas.
 */

export interface ReportModel {
  /** Chave de i18n (`models.<slug>`) e segmento de URL (`/help/relatorios/<slug>`). */
  slug: string;
  /** Função dona do artefato — precisa ser um slug de `TEAM_PROFILES`. */
  profileSlug: string;
  destino: ReportDestination;
  sensibilidade: SensitivityLabel;
  icon: LucideIcon;
}

export const REPORT_MODELS: readonly ReportModel[] = [
  // — Vão para o cliente —
  {
    slug: "relatorio-de-conta",
    profileSlug: "atendimento",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: FileText,
  },
  {
    slug: "demonstrativo-de-perfis",
    profileSlug: "social-media",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: TrendingUp,
  },
  {
    slug: "relatorio-mensal-de-campanhas",
    profileSlug: "trafego",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Target,
  },
  {
    slug: "clipping",
    profileSlug: "imprensa",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Newspaper,
  },

  // — Vão para a gestão —
  {
    slug: "relatorio-de-crise",
    profileSlug: "imprensa",
    destino: "gestao",
    sensibilidade: "CONFIDENCIAL",
    icon: Siren,
  },
  {
    slug: "relatorio-de-incidente",
    profileSlug: "engenharia-de-software",
    destino: "gestao",
    sensibilidade: "INTERNO",
    icon: AlertOctagon,
  },
  {
    slug: "registro-de-ocorrencia",
    profileSlug: "community",
    destino: "gestao",
    sensibilidade: "INTERNO",
    icon: MessageSquareWarning,
  },
  {
    slug: "consolidado-de-motivos-de-retorno",
    profileSlug: "revisao",
    destino: "gestao",
    sensibilidade: "INTERNO",
    icon: Undo2,
  },
  {
    slug: "relatorio-de-fluxo",
    profileSlug: "coordenacao",
    destino: "gestao",
    sensibilidade: "INTERNO",
    icon: Workflow,
  },

  // — Ficam como documentação —
  {
    slug: "checklist-de-saida",
    profileSlug: "revisao",
    destino: "documentacao",
    sensibilidade: "INTERNO",
    icon: ClipboardCheck,
  },
] as const;

const BY_SLUG = new Map(REPORT_MODELS.map((m) => [m.slug, m]));

export function getReportModelBySlug(slug: string): ReportModel | undefined {
  return BY_SLUG.get(slug);
}

export function getReportModelsForProfile(profileSlug: string): ReportModel[] {
  return REPORT_MODELS.filter((m) => m.profileSlug === profileSlug);
}

/** Ordem de leitura do índice: primeiro o que vai para fora. */
export const REPORT_MODEL_DESTINATIONS = ["cliente", "gestao", "documentacao"] as const;

export function getReportModelsByDestination(destino: ReportDestination): ReportModel[] {
  return REPORT_MODELS.filter((m) => m.destino === destino);
}
