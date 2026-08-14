import {
  AlertOctagon,
  BookOpen,
  CalendarDays,
  Camera,
  ClipboardCheck,
  Compass,
  FileText,
  Film,
  History,
  KeyRound,
  Lightbulb,
  LineChart,
  Megaphone,
  MessageSquareWarning,
  MessagesSquare,
  Newspaper,
  NotebookPen,
  Package,
  PieChart,
  Quote,
  Receipt,
  Repeat,
  Scale,
  Search,
  SearchCheck,
  Server,
  ShieldAlert,
  Siren,
  Sparkles,
  Speech,
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

/**
 * Ordenado por função, na ordem do catálogo de descritivos — é assim que o
 * índice agrupa. Quem procura um modelo sabe a própria função antes de saber
 * para quem o artefato vai.
 */
export const REPORT_MODELS: readonly ReportModel[] = [
  // — Design —
  {
    slug: "apresentacao-de-conceito",
    profileSlug: "design",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Lightbulb,
  },
  {
    slug: "pacote-de-entrega-design",
    profileSlug: "design",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Package,
  },

  // — Vídeo —
  {
    slug: "pacote-de-entrega-video",
    profileSlug: "video",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Film,
  },
  {
    slug: "registro-de-captacao",
    profileSlug: "video",
    destino: "documentacao",
    sensibilidade: "INTERNO",
    icon: Camera,
  },

  // — Revisão —
  {
    slug: "consolidado-de-motivos-de-retorno",
    profileSlug: "revisao",
    destino: "gestao",
    sensibilidade: "INTERNO",
    icon: Undo2,
  },
  {
    slug: "checklist-de-saida",
    profileSlug: "revisao",
    destino: "documentacao",
    sensibilidade: "INTERNO",
    icon: ClipboardCheck,
  },

  // — Social Media —
  {
    slug: "calendario-de-publicacao",
    profileSlug: "social-media",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: CalendarDays,
  },
  {
    slug: "demonstrativo-de-perfis",
    profileSlug: "social-media",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: TrendingUp,
  },
  {
    slug: "retrospectiva-de-campanha",
    profileSlug: "social-media",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: History,
  },

  // — Community —
  {
    slug: "resumo-da-audiencia",
    profileSlug: "community",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: MessagesSquare,
  },
  {
    slug: "registro-de-ocorrencia",
    profileSlug: "community",
    destino: "gestao",
    sensibilidade: "INTERNO",
    icon: MessageSquareWarning,
  },

  // — Comunicação e Copy —
  {
    slug: "manual-de-tom-de-voz",
    profileSlug: "comunicacao",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Speech,
  },
  {
    slug: "mensagem-de-campanha",
    profileSlug: "comunicacao",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Megaphone,
  },

  // — Assessoria de Imprensa —
  {
    slug: "clipping",
    profileSlug: "imprensa",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Newspaper,
  },
  {
    slug: "posicionamento-oficial",
    profileSlug: "imprensa",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Quote,
  },
  {
    slug: "relatorio-de-crise",
    profileSlug: "imprensa",
    destino: "gestao",
    sensibilidade: "CONFIDENCIAL",
    icon: Siren,
  },

  // — Tráfego Pago —
  {
    slug: "plano-de-midia",
    profileSlug: "trafego",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: PieChart,
  },
  {
    slug: "relatorio-mensal-de-campanhas",
    profileSlug: "trafego",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Target,
  },
  {
    slug: "conciliacao-de-investimento",
    profileSlug: "trafego",
    destino: "gestao",
    sensibilidade: "CONFIDENCIAL",
    icon: Receipt,
  },

  // — SEO —
  {
    slug: "desempenho-organico",
    profileSlug: "seo",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Search,
  },
  {
    slug: "auditoria-tecnica",
    profileSlug: "seo",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: SearchCheck,
  },

  // — Atendimento —
  {
    slug: "relatorio-de-conta",
    profileSlug: "atendimento",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: FileText,
  },
  {
    slug: "ata-de-reuniao",
    profileSlug: "atendimento",
    destino: "documentacao",
    sensibilidade: "INTERNO",
    icon: NotebookPen,
  },
  {
    slug: "controle-de-escopo",
    profileSlug: "atendimento",
    destino: "gestao",
    sensibilidade: "CONFIDENCIAL",
    icon: Scale,
  },

  // — Estratégia —
  {
    slug: "plano-estrategico-da-conta",
    profileSlug: "estrategia",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Compass,
  },
  {
    slug: "conceito-de-campanha",
    profileSlug: "estrategia",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: Sparkles,
  },
  {
    slug: "leitura-consolidada-de-resultado",
    profileSlug: "estrategia",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: LineChart,
  },

  // — Coordenação —
  {
    slug: "relatorio-de-fluxo",
    profileSlug: "coordenacao",
    destino: "gestao",
    sensibilidade: "INTERNO",
    icon: Workflow,
  },
  {
    slug: "ata-de-retrospectiva",
    profileSlug: "coordenacao",
    destino: "documentacao",
    sensibilidade: "INTERNO",
    icon: Repeat,
  },

  // — Engenharia de Software —
  {
    slug: "documentacao-de-entrega",
    profileSlug: "engenharia-de-software",
    destino: "cliente",
    sensibilidade: "CLIENTE",
    icon: BookOpen,
  },
  {
    slug: "relatorio-de-incidente",
    profileSlug: "engenharia-de-software",
    destino: "gestao",
    sensibilidade: "INTERNO",
    icon: AlertOctagon,
  },

  // — TI e Infraestrutura —
  {
    slug: "relatorio-de-infraestrutura",
    profileSlug: "ti",
    destino: "gestao",
    sensibilidade: "INTERNO",
    icon: Server,
  },
  {
    slug: "registro-de-incidente-ti",
    profileSlug: "ti",
    destino: "gestao",
    sensibilidade: "CONFIDENCIAL",
    icon: ShieldAlert,
  },
  {
    slug: "inventario-e-acessos",
    profileSlug: "ti",
    destino: "gestao",
    sensibilidade: "CONFIDENCIAL",
    icon: KeyRound,
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
