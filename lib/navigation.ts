import {
  LayoutDashboard,
  Gauge,
  ClipboardList,
  Handshake,
  PanelTop,
  UsersRound,
  Workflow,
  TrendingUp,
  Clock,
  CalendarRange,
  CalendarDays,
  CalendarClock,
  Target,
  Activity,
  Building2,
  type LucideIcon,
} from "lucide-react";

// Fonte única da navegação primária, por papel (persona-aware). Centraliza o
// "gating" que antes vivia inline em navbar.tsx + user-menu.tsx. Cada item
// carrega uma `labelKey` (namespace common.nav) resolvida por t() no cliente.
// Ver docs/arquitetura-de-informacao.md §1.3.

export interface NavLink {
  id: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: string;
  labelKey: string;
  children: NavLink[];
}

export type NavItem = NavLink | NavGroup;

export function isNavGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

// Colaborador (MEMBER/SUPERVISOR): sua fila. "Minha Evolução" (pessoal) vive no
// menu de avatar, acessível a todos os papéis.
const memberItems: NavItem[] = [
  { id: "inicio", labelKey: "inicio", href: "/dashboard", icon: LayoutDashboard },
  { id: "meu-trabalho", labelKey: "meuTrabalho", href: "/tasks", icon: ClipboardList },
  { id: "minha-semana", labelKey: "minhaSemana", href: "/planning/my-week", icon: CalendarRange },
];

// Gestor (MANAGER/ADMIN): dashboard pessoal, demandas, entregas, relatórios.
const managerItems: NavItem[] = [
  { id: "dashboard", labelKey: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { id: "demandas", labelKey: "demandas", href: "/admin/tasks", icon: ClipboardList },
  // Fora do grupo "Planejamento" (que é de gestor): o gestor também executa a própria semana, e
  // escondida lá dentro não seria encontrada por quem ela serve.
  { id: "minha-semana", labelKey: "minhaSemana", href: "/planning/my-week", icon: CalendarRange },
  {
    id: "entregas",
    labelKey: "entregas",
    children: [
      { id: "clientes", labelKey: "clients", href: "/admin/clients", icon: Handshake },
      { id: "projetos", labelKey: "projetos", href: "/projects", icon: PanelTop },
    ],
  },
  // Planejamento = ferramentas OPERACIONAIS (escrevem: reagendam, criam demanda).
  // O calendário morava em "Relatórios", o que o fazia parecer leitura
  // retrospectiva — é o oposto do que ele faz.
  {
    id: "planejamento",
    labelKey: "planejamento",
    children: [
      // Duas entradas, não uma com alternador embutido: a semana é execução
      // (quem está com o quê, arrastar para reagendar) e o mês é contexto
      // (datas comemorativas, aniversários, densidade de demanda). Perguntas
      // diferentes, então cada uma tem endereço próprio.
      {
        id: "calendario",
        labelKey: "calendar",
        href: "/planning/calendar/week",
        icon: CalendarDays,
      },
      {
        id: "calendario-mes",
        labelKey: "calendarMonthly",
        href: "/planning/calendar/month",
        icon: CalendarRange,
      },
      { id: "programacao", labelKey: "programacao", href: "/planning/week", icon: CalendarClock },
      {
        id: "carga-cliente",
        labelKey: "cargaCliente",
        href: "/planning/client-load",
        icon: Building2,
      },
      { id: "cobertura", labelKey: "cobertura", href: "/planning/coverage", icon: Target },
      { id: "datas", labelKey: "datas", href: "/planning/dates", icon: CalendarDays },
    ],
  },
  {
    id: "relatorios",
    labelKey: "reports",
    // Telas de relatório (§3.3 aplicado): "Fluxo & Entrega" absorveu
    // team-productivity. Aqui só entra LEITURA — nada que escreva.
    children: [
      {
        id: "fluxo-entrega",
        labelKey: "fluxoEntrega",
        href: "/reports/performance",
        icon: TrendingUp,
      },
      { id: "horas", labelKey: "horasUtilizacao", href: "/reports/productivity", icon: Clock },
      { id: "pessoas", labelKey: "pessoas", href: "/reports", icon: UsersRound },
      { id: "presenca", labelKey: "presenca", href: "/reports/live-activity", icon: Activity },
    ],
  },
];

// Menu "Administração". O Cockpit de saúde do time (/admin) mora aqui e é visível
// a MANAGER e ADMIN; os demais itens (usuários/equipes/fluxos) são só de ADMIN.
const geralLink: NavLink = { id: "geral", labelKey: "geral", href: "/admin", icon: Gauge };
const adminOnlyLinks: NavLink[] = [
  { id: "usuarios", labelKey: "usuarios", href: "/admin/users", icon: UsersRound },
  { id: "equipes", labelKey: "equipes", href: "/admin/teams", icon: UsersRound },
  { id: "fluxos", labelKey: "fluxos", href: "/admin/templates", icon: Workflow },
];

export type AppRole = "ADMIN" | "MANAGER" | "SUPERVISOR" | "MEMBER";

/** Itens de navegação para o papel. MEMBER/SUPERVISOR veem a visão de colaborador;
 * MANAGER a de gestor + Administração(Cockpit); ADMIN + usuários/equipes/fluxos. */
export function getNavItems(role: AppRole): NavItem[] {
  if (role === "MANAGER" || role === "ADMIN") {
    const children = role === "ADMIN" ? [geralLink, ...adminOnlyLinks] : [geralLink];
    return [...managerItems, { id: "administracao", labelKey: "admin", children }];
  }
  return memberItems;
}

/** Chave i18n do rótulo de papel exibido no menu de avatar. */
export function roleLabelKey(role: AppRole): string {
  if (role === "ADMIN") return "roleAdmin";
  if (role === "MANAGER") return "roleManager";
  if (role === "SUPERVISOR") return "roleSupervisor";
  return "roleMember";
}

/** Home (destino do logo) = dashboard pessoal para todos os papéis. */
export function homeHref(_role: AppRole): string {
  return "/dashboard";
}
