import { type TrelloMember, type WorkOSUser } from "./types";

export { type TrelloMember, type WorkOSUser };

export interface MatchResult {
  byTrelloId: Map<string, string>;
  unmatched: TrelloMember[];
}

/**
 * Mapeia membros do Trello para usuários do WorkOS usando três estratégias:
 * 1. Prefixo de e-mail: username do Trello é prefixo (sem @domain) do e-mail do WorkOS
 * 2. Nome completo idêntico
 * 3. Nome e sobrenome contidos no nome completo do WorkOS
 *
 * Requisitos:
 * - Quem não casa vai para repescagem (NUNCA para o mais parecido)
 * - Um usuário do WorkOS não pode ser atribuído a dois membros do Trello
 *   Se ambíguo, ambos vão para repescagem
 */
export function matchMembers(
  trelloMembers: TrelloMember[],
  workosUsers: WorkOSUser[],
  /**
   * Casamentos declarados à mão: `{ apelido no Trello: e-mail no WorkOS }`. Existem para a pessoa
   * cujo cadastro foge do padrão que as três chaves reconhecem — no quadro real, `@saragoon1`
   * corresponde a `saragoonmmkt@gmail.com`, com dois `m`, e nem o prefixo nem o nome casam.
   *
   * Um casamento manual DISPENSA as três chaves para aquele membro (é uma decisão de quem roda a
   * importação, não um palpite), mas não escapa da regra de ambiguidade: dois membros apontados
   * para o mesmo usuário continuam indo os dois para a repescagem. E-mail que não existe entre os
   * usuários simplesmente não casa — o membro aparece na repescagem do relatório, que é onde um
   * erro de digitação fica visível em vez de virar silêncio.
   */
  manualMatches: Record<string, string> = {}
): MatchResult {
  const userIdByEmail = new Map(workosUsers.map((u) => [u.email.toLowerCase(), u.id]));

  // Mapa temporário: cada membro do Trello para seu(s) possível(is) usuário(s) do WorkOS
  const candidates = new Map<string, string[]>();

  for (const member of trelloMembers) {
    const matches: string[] = [];

    const declaredEmail = manualMatches[member.username];
    if (declaredEmail) {
      const userId = userIdByEmail.get(declaredEmail.toLowerCase());
      if (userId) matches.push(userId);
      if (matches.length > 0) {
        candidates.set(member.id, matches);
      }
      continue;
    }

    for (const user of workosUsers) {
      if (
        matchesByEmailPrefix(member, user) ||
        matchesByFullName(member, user) ||
        matchesByNameParts(member, user)
      ) {
        matches.push(user.id);
      }
    }

    if (matches.length > 0) {
      candidates.set(member.id, matches);
    }
  }

  // Agora detectar ambiguidades: se um usuário do WorkOS é atribuído a múltiplos membros do Trello
  const userToMembers = new Map<string, string[]>();
  for (const [trelloId, userIds] of candidates) {
    // Se o membro do Trello tem múltiplas opções, já é ambíguo (tratado no laço final)
    if (userIds.length > 1) {
      continue;
    }

    const userId = userIds[0];
    if (!userToMembers.has(userId)) {
      userToMembers.set(userId, []);
    }
    userToMembers.get(userId)!.push(trelloId);
  }

  // Construir resultado final
  const byTrelloId = new Map<string, string>();
  const unmatched: TrelloMember[] = [];

  for (const member of trelloMembers) {
    const matches = candidates.get(member.id);

    if (!matches) {
      // Sem casamento
      unmatched.push(member);
      continue;
    }

    if (matches.length > 1) {
      // Ambíguo (múltiplos usuários casam com este membro)
      unmatched.push(member);
      continue;
    }

    const userId = matches[0];
    const membersForUser = userToMembers.get(userId) || [];

    if (membersForUser.length > 1) {
      // Múltiplos membros casam com o mesmo usuário
      unmatched.push(member);
      continue;
    }

    // Casamento único e válido
    byTrelloId.set(member.id, userId);
  }

  return {
    byTrelloId,
    unmatched,
  };
}

/** Normaliza uma string removendo acentos e convertendo para minúsculas. */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Estratégia 1: Prefixo de e-mail.
 * O username do Trello (normalizado) é prefixo (sem @domain) do e-mail do WorkOS.
 */
function matchesByEmailPrefix(member: TrelloMember, user: WorkOSUser): boolean {
  const normalizedUsername = normalize(member.username);
  const emailPrefix = user.email.split("@")[0];
  const normalizedEmailPrefix = normalize(emailPrefix);

  return normalizedUsername !== "" && normalizedEmailPrefix.startsWith(normalizedUsername);
}

/**
 * Estratégia 2: Nome completo idêntico.
 */
function matchesByFullName(member: TrelloMember, user: WorkOSUser): boolean {
  return normalize(member.fullName) === normalize(user.name);
}

/**
 * Estratégia 3: Nome e sobrenome contidos no nome completo do WorkOS.
 * Quebra o fullName em palavras e verifica se cada palavra é um elemento exato
 * do array de palavras do nome do usuário. Não usa substring matching.
 */
function matchesByNameParts(member: TrelloMember, user: WorkOSUser): boolean {
  const memberParts = normalize(member.fullName)
    .split(/\s+/)
    .filter((p) => p.length > 0);

  if (memberParts.length === 0) {
    return false;
  }

  const userParts = normalize(user.name)
    .split(/\s+/)
    .filter((p) => p.length > 0);

  return memberParts.every((part) => userParts.includes(part));
}
