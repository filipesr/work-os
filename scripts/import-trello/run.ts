// Importação ÚNICA do quadro do Trello (AtlanticoShop) para o WorkOS. Ensaio por padrão — nada é
// gravado sem `--commit`. Reusa `buildImportPlan` (lib/trello/plan.ts) e `applyImportPlan`
// (lib/trello/writer.ts), já testados; este script só lê o arquivo, monta o contexto (usuários e
// cliente) e imprime o relatório (lib/trello/report.ts).
//
//   Ensaio:   npx tsx scripts/import-trello/run.ts --file "<export.json>" --client <clientId>
//   Gravando: npx tsx scripts/import-trello/run.ts --file "<export.json>" --client <clientId> --commit --imported-by <userId>
//
// `--file` é obrigatório: o export é dado de cliente e vive fora do repositório — nunca um caminho
// embutido no código. `--client` é obrigatório pela mesma razão: o clientId se descobre consultando
// o banco (`prisma.client.findFirst`), nunca embutido aqui. `--imported-by` só é exigido com
// `--commit` — o ENSAIO não grava nada, então não precisa de autor (ver ApplyImportPlanOptions em
// writer.ts).

import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { buildImportPlan } from "@/lib/trello/plan";
import { applyImportPlan, type ImportReport } from "@/lib/trello/writer";
import { formatReport } from "@/lib/trello/report";
import type { TrelloBoardExport, WorkOSUser } from "@/lib/trello/types";

interface Args {
  file: string;
  clientId: string;
  commit: boolean;
  importedById?: string;
}

function parseArgs(argv: string[]): Args {
  let file: string | undefined;
  let clientId: string | undefined;
  let commit = false;
  let importedById: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") {
      file = argv[++i];
    } else if (arg === "--client") {
      clientId = argv[++i];
    } else if (arg === "--commit") {
      commit = true;
    } else if (arg === "--imported-by") {
      importedById = argv[++i];
    }
  }

  if (!file) {
    throw new Error(
      "--file é obrigatório — passe o caminho do export do Trello (JSON). Não há caminho embutido " +
        "no código: o export é dado de cliente e vive fora do repositório."
    );
  }
  if (!clientId) {
    throw new Error(
      "--client é obrigatório — o id do Client (WorkOS) dono dos projetos mensais. Descubra-o " +
        'consultando o banco (ex.: prisma.client.findFirst({ where: { name: "AtlanticoShop" } })).'
    );
  }
  if (commit && !importedById) {
    throw new Error(
      "--imported-by é obrigatório com --commit — quem está rodando a importação vira o autor " +
        "(createdById/userId/byUserId) de tudo que for gravado. O ENSAIO não precisa dele."
    );
  }

  return { file, clientId, commit, importedById };
}

function readBoard(file: string): TrelloBoardExport {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as TrelloBoardExport;
}

function formatWriteResult(report: ImportReport): string {
  const lines: string[] = [];
  lines.push("");
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const board = readBoard(args.file);
  const totalCards = board.cards.length;

  const prisma = new PrismaClient();
  try {
    const dbUsers = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
    const workosUsers: WorkOSUser[] = dbUsers.map((u) => ({
      id: u.id,
      name: u.name ?? "",
      email: u.email ?? "",
    }));

    const plan = buildImportPlan(board, workosUsers, { clientId: args.clientId });

    // O --commit imprime o MESMO relatório do ensaio antes de gravar — quem manda gravar precisa
    // ver o que vai acontecer, na mesma execução (brief da Task 10). Por isso este console.log é
    // incondicional, e a decisão de gravar vem só depois dele.
    console.log(args.commit ? "=== GRAVANDO ===" : "=== ENSAIO (nada será gravado) ===");
    console.log(formatReport(plan, totalCards));

    if (!args.commit) {
      console.log("");
      console.log("Ensaio concluído. Nada foi gravado. Rode de novo com --commit para gravar.");
      return;
    }

    const result = await applyImportPlan(prisma, plan, {
      commit: true,
      importedById: args.importedById!,
    });
    console.log(formatWriteResult(result));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
