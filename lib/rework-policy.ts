// Quem pode reclassificar um retorno (defeito vs mudança legítima). Puro e
// testável de propósito: é uma salvaguarda da exceção 3b (FTR por pessoa), não
// um detalhe de layout, e enterrá-la num JSX de página a tornaria invisível.

import type { UserRole } from "@prisma/client";

// Derivado do enum do schema (import de TIPO, apagado no build — o módulo segue
// puro). Listar os papéis à mão deixaria um papel novo passar batido como
// autorizado ou negado por acidente.
export type ViewerRole = UserRole | null;

/**
 * Reclassificar é ato de GESTOR sobre OUTRA pessoa.
 *
 * Duas condições, ambas necessárias:
 *  - papel gestor/admin — salvaguarda (4): a pessoa vê a classificação, não a
 *    edita, senão o FTR vira um número autoeditável;
 *  - alvo diferente do observador — um gestor reclassificando os próprios
 *    retornos estaria corrigindo a própria nota, que é o mesmo gaming pela
 *    porta dos fundos. SUPERVISOR não entra: a exceção 3b nomeia gestor/admin.
 */
export function canReclassifyRework(input: {
  viewerId: string;
  subjectId: string;
  role: ViewerRole;
}): boolean {
  if (input.viewerId === input.subjectId) return false;
  return input.role === "ADMIN" || input.role === "MANAGER";
}
