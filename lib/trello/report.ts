import type { ImportPlan, SkipReason } from "./plan";
import type { ImportReport } from "./writer";

// Formata o relatório do ensaio/gravação da importação do Trello — lógica pura (só string a partir
// de `ImportPlan`), por isso testável sem tocar o banco nem ler o export real. O executável
// (scripts/import-trello/run.ts) só chama esta função duas vezes com o MESMO `plan`: uma no ensaio,
// outra logo antes de `--commit` gravar — é assim que "o --commit imprime o mesmo relatório antes de
// gravar" (brief) se cumpre, sem duplicar a formatação em dois lugares.

/** Ordem fixa de exibição dos motivos de descarte — separa "por natureza do card" (classify.ts) de
 * "por falta de evidência" (decisão do joiner, buildImportPlan) porque são categorias de origem
 * diferente, e misturá-las esconderia a proporção que mais importa: quanto foi perdido por a
 * evidência não sustentar uma demanda, contra quanto nunca foi demanda para começo de conversa. */
const REASONS_POR_NATUREZA: SkipReason[] = ["arquivado", "separador", "ausencia", "referencia"];
const REASONS_POR_EVIDENCIA: SkipReason[] = ["sem mês", "sem etapa mapeável"];

/**
 * Monta o relatório textual do plano de importação.
 *
 * `totalCards` é o total de cards do export tal como o CHAMADOR leu (`board.cards.length`), não
 * derivado do próprio `plan` — por construção de `buildImportPlan`, `tasks.length + skipped.length`
 * já bate com o total de cards que ele processou, então comparar contra o `plan` de novo seria uma
 * tautologia. Comparar contra o número que o chamador leu do arquivo é a checagem de verdade: pegou
 * o bug desta entrega quando as parcelas pareciam certas e não fechavam (ver brief da Task 10).
 */
export function formatReport(plan: ImportPlan, totalCards: number): string {
  const lines: string[] = [];

  lines.push("Importação do quadro Trello — relatório");
  lines.push("");
  lines.push(
    `${plan.tasks.length} demandas a importar, em ${plan.projects.length} projetos mensais:`
  );
  for (const proj of plan.projects) {
    lines.push(`  - ${proj.name}`);
  }
  lines.push("");

  lines.push(`${plan.skipped.length} cards descartados:`);
  lines.push("  por natureza:");
  for (const reason of REASONS_POR_NATUREZA) {
    lines.push(`    ${reason}: ${countByReason(plan, reason)}`);
  }
  lines.push("  por falta de evidência:");
  for (const reason of REASONS_POR_EVIDENCIA) {
    lines.push(`    ${reason}: ${countByReason(plan, reason)}`);
  }
  lines.push("");

  const soma = plan.tasks.length + plan.skipped.length;
  lines.push(
    `Conferência: ${plan.tasks.length} + ${plan.skipped.length} = ${soma} cards, contra ${totalCards} no export.`
  );
  if (soma !== totalCards) {
    lines.push(
      `ATENÇÃO — DIVERGÊNCIA: a soma (${soma}) não bate com o total de cards do export ` +
        `(${totalCards}). Não confie neste plano — algo ficou de fora ou foi contado duas vezes.`
    );
  } else {
    lines.push("A soma bate com o total de cards do export.");
  }
  lines.push("");

  lines.push(`repescagem manual — membros do Trello sem usuário casado no WorkOS:`);
  if (plan.unmatchedPeople.length === 0) {
    lines.push("  nenhum — todos os membros do Trello casaram com um usuário do WorkOS.");
  } else {
    for (const person of plan.unmatchedPeople) {
      lines.push(`  - ${person.fullName} (@${person.username})`);
    }
  }

  return lines.join("\n");
}

function countByReason(plan: ImportPlan, reason: SkipReason): number {
  return plan.skipped.filter((s) => s.reason === reason).length;
}

/**
 * Formata o resumo pós-gravação (`ImportReport` que `applyImportPlan(commit:true)` devolve) — o
 * texto que quem rodou `--commit` lê DEPOIS de uma operação irreversível. Mesmo padrão de
 * `formatReport`: lógica pura, testável, sem o executável precisar formatar nada sozinho.
 */
export function formatWriteResult(report: ImportReport): string {
  const lines: string[] = [];
  lines.push("Resultado da gravação:");
  lines.push(`  projetos criados: ${report.projectsCreated}`);
  lines.push(`  projetos reaproveitados (já existiam): ${report.projectsReused}`);
  lines.push(`  demandas criadas: ${report.tasksCreated}`);
  lines.push(
    `  demandas puladas (já importadas antes, mesma URL de card): ${report.skippedAlreadyImported}`
  );
  lines.push(`  artefatos criados: ${report.artifactsCreated}`);
  lines.push(`  eventos de retrabalho criados: ${report.reworkEventsCreated}`);
  if (report.failedMonths.length > 0) {
    lines.push(`  meses com falha (transação revertida, outros meses não afetados):`);
    for (const f of report.failedMonths) {
      lines.push(`    - ${f.monthKey}: ${f.error}`);
    }
  } else {
    lines.push("  nenhum mês falhou.");
  }
  return lines.join("\n");
}
