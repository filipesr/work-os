import {
  Clapperboard,
  Code2,
  Compass,
  Handshake,
  ListChecks,
  Megaphone,
  MessagesSquare,
  Newspaper,
  Palette,
  PenLine,
  Search,
  Server,
  SpellCheck,
  Target,
  type LucideIcon,
} from "lucide-react";

/**
 * Espinha do catálogo de descritivos de equipe. SÓ estrutura — a prosa vive em
 * `locales/{pt-BR,es-ES}/teamProfiles.json` (P8: nada de string hardcoded).
 *
 * O descritivo é 1:1 com a EQUIPE (`Team`), não com um cargo separado: a equipe
 * é a função exercida (Designers, Tráfego); `UserRole` é o papel de ACESSO.
 * Ver docs/descritivos-de-equipe.md §1.
 *
 * Fase 2 (banco + CRUD para o RH) reaproveita este contrato: `slug` vira a
 * chave estável e `teamNames` vira a relação com `Team`.
 */

export const TEAM_PROFILE_FAMILIES = ["criacao", "conteudo", "midia", "cliente", "tech"] as const;

export type TeamProfileFamily = (typeof TEAM_PROFILE_FAMILIES)[number];

export interface TeamProfile {
  /** Chave de i18n (`profiles.<slug>`) e segmento de URL (`/help/equipes/<slug>`). */
  slug: string;
  /** Valores de `Team.name` cobertos por este descritivo. Casados sem distinção de caixa. */
  teamNames: readonly string[];
  family: TeamProfileFamily;
  icon: LucideIcon;
}

export const TEAM_PROFILES: readonly TeamProfile[] = [
  // — Criação —
  { slug: "design", teamNames: ["Designers"], family: "criacao", icon: Palette },
  { slug: "video", teamNames: ["Video-makers"], family: "criacao", icon: Clapperboard },
  // As duas equipes exercem a mesma função (último gate antes de sair):
  // `Proofreading` veio do roster real (*corrección*), `Quality Control` do seed.
  {
    slug: "revisao",
    teamNames: ["Proofreading", "Quality Control"],
    family: "criacao",
    icon: SpellCheck,
  },

  // — Conteúdo —
  { slug: "social-media", teamNames: ["Social Media"], family: "conteudo", icon: Megaphone },
  { slug: "community", teamNames: ["Community"], family: "conteudo", icon: MessagesSquare },
  {
    slug: "comunicacao",
    teamNames: ["Communicators", "Copywriting"],
    family: "conteudo",
    icon: PenLine,
  },
  { slug: "imprensa", teamNames: ["Press Office"], family: "conteudo", icon: Newspaper },

  // — Mídia e performance —
  { slug: "trafego", teamNames: ["Traffic Manager"], family: "midia", icon: Target },
  { slug: "seo", teamNames: ["SEO"], family: "midia", icon: Search },

  // — Cliente —
  { slug: "atendimento", teamNames: ["Customer Service"], family: "cliente", icon: Handshake },
  { slug: "estrategia", teamNames: ["Strategy"], family: "cliente", icon: Compass },
  { slug: "coordenacao", teamNames: ["Coordination"], family: "cliente", icon: ListChecks },

  // — Tecnologia —
  { slug: "engenharia-de-software", teamNames: ["Software Engineer"], family: "tech", icon: Code2 },
  { slug: "ti", teamNames: ["IT"], family: "tech", icon: Server },
] as const;

/**
 * Equipes conhecidas (seed + roster real) que AINDA NÃO têm descritivo escrito.
 *
 * Estão aqui de propósito: a UI mostra "ainda não documentado" em vez de omitir
 * a equipe — função invisível é função sem expectativa escrita. Ao documentar
 * uma delas, adicione a entrada em TEAM_PROFILES e remova o nome desta lista.
 *
 * `Manager`, `Supervisor` e `Management` não são funções — são níveis, que já
 * vivem em `UserRole`. Existem como equipe por herança do seed e do roster; a
 * decisão certa é discutir se devem continuar sendo `Team`.
 * Ver docs/descritivos-de-equipe.md §6.
 */
export const UNDOCUMENTED_TEAM_NAMES: readonly string[] = [
  "Call Center",
  "Commercial",
  "Events",
  "Finance",
  "General Services",
  "HR",
  "Interns",
  "Management",
  "Manager",
  "POS",
  "Receptive Guides",
  "Reception",
  "Supervisor",
  "Supervisor Receptive Guides",
] as const;

const BY_SLUG = new Map(TEAM_PROFILES.map((p) => [p.slug, p]));

const BY_TEAM_NAME = new Map(
  TEAM_PROFILES.flatMap((p) => p.teamNames.map((name) => [name.toLowerCase(), p] as const))
);

export function getProfileBySlug(slug: string): TeamProfile | undefined {
  return BY_SLUG.get(slug);
}

export function getProfileForTeamName(name: string): TeamProfile | undefined {
  return BY_TEAM_NAME.get(name.trim().toLowerCase());
}

export function getProfilesByFamily(family: TeamProfileFamily): TeamProfile[] {
  return TEAM_PROFILES.filter((p) => p.family === family);
}

/** Uma linha por equipe do usuário, na ordem recebida. `profile` ausente = ainda não documentada. */
export interface TeamProfileLink {
  teamName: string;
  profile?: TeamProfile;
}

/**
 * Resolve as equipes de uma pessoa para links de descritivo. A equipe NUNCA some
 * da lista — sem descritivo, ela volta com `profile: undefined` para a UI
 * marcá-la como não documentada.
 */
export function getProfilesForTeamNames(names: readonly string[]): TeamProfileLink[] {
  return names.map((teamName) => ({ teamName, profile: getProfileForTeamName(teamName) }));
}
