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
import { buildImportPlan, type ImportPlan } from "@/lib/trello/plan";
import {
  applyImportPlan,
  type ApplyImportPlanOptions,
  type ImportReport,
} from "@/lib/trello/writer";
import { formatReport, formatWriteResult } from "@/lib/trello/report";
import type { TrelloBoardExport, WorkOSUser } from "@/lib/trello/types";

/**
 * Casamentos declarados à mão, `{ apelido no Trello: e-mail no WorkOS }`.
 *
 * As três chaves automáticas de `matchMembers` (prefixo de e-mail, nome completo, nome+sobrenome)
 * não alcançam quem tem o cadastro fora do padrão. `@saragoon1` é o caso do quadro real: o e-mail
 * dela no WorkOS é `saragoonmmkt@gmail.com`, com dois `m`, então nem o prefixo `saragoonmkt` casa
 * nem "Sara Goon" bate com "Sara Rufina Maldonado Morel". Ela é declarada em 33 demandas.
 *
 * Fica aqui, no script, e não em `lib/`: é uma decisão de quem roda a importação sobre ESTE quadro
 * e ESTE cadastro, não uma regra do mapeamento. Um e-mail errado aqui não vira casamento errado —
 * vira "continua na repescagem", e a repescagem é impressa no relatório.
 */
const MANUAL_MATCHES: Record<string, string> = {
  saragoon1: "saragoonmmkt@gmail.com",
};

/**
 * Quem responde por um nome de lista de design que não é nome de pessoa,
 * `{ nome na lista: e-mail no WorkOS }`.
 *
 * `DISEÑO - SUPERVISIÓN` é o único caso do quadro: a lista existe, tem cards, e nenhum usuário se
 * chama "Supervisión". Sem declaração ela fica sem dono — adivinhar quem supervisiona seria
 * inventar. Os outros sete nomes (MARTIN, HENRIQUE, MATHIAS, VINICIUS, FABRICIO, DIEGO, JORGE)
 * casam sozinhos com um usuário do WorkOS e não precisam de linha aqui.
 */
/**
 * As listas de CONCLUÍDO do quadro.
 *
 * Quando o mês vira, `Concluido` é RENOMEADA para o mês e uma nova nasce. O export de 2026-09-11
 * mostra a prática acontecendo: `Concluido` com 17 cards (16 de setembro), `Agosto` com 39 (34 de
 * agosto) e `Julio` com 35 (33 de julho) — a lista `Agosto` não existia no export da véspera.
 *
 * **Cada mês novo renomeado precisa de uma linha aqui antes da próxima importação.** Sem ela, as
 * demandas ENTREGUES daquele mês entram como "em andamento" — foi o que aconteceu com julho, que
 * aparecia com 23% de conclusão em vez de 95%.
 *
 * Fica declarado, e não adivinhado por nome de mês: o quadro tem `ABRIL ATL` e `concluido` como
 * listas arquivadas e vazias, então a convenção não é estável, e uma lista mal identificada viraria
 * conclusão inventada.
 */
const COMPLETED_LIST_NAMES = ["Concluido", "Agosto", "Julio"];

const DESIGNER_ALIASES: Record<string, string> = {
  SUPERVISIÓN: "dalbiranmktgoon@gmail.com",
};

export interface Args {
  file: string;
  clientId: string;
  commit: boolean;
  importedById?: string;
}

export function parseArgs(argv: string[]): Args {
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

/**
 * A ÚNICA linha que decide se algo é gravado: sem `--commit`, `applyImportPlan` nunca é chamado
 * (devolve `null`); com `--commit`, é chamado com `commit: true`. É a única salvaguarda entre
 * digitar o comando e gravar no banco — por isso é uma função à parte, exportada, chamável de teste
 * com um `applyFn` espionado, em vez de uma decisão perdida no meio de `main()`.
 *
 * `applyFn` é parametrizado (com o `applyImportPlan` real como padrão) exatamente para isso: o
 * teste da fiação (`__tests__/scripts/import-trello/run.test.ts`) passa um `vi.fn()` no lugar e
 * afirma como e se ele foi chamado, sem precisar de banco de verdade.
 */
export async function applyIfRequested(
  args: Args,
  plan: ImportPlan,
  prisma: PrismaClient,
  applyFn: (
    prisma: PrismaClient,
    plan: ImportPlan,
    opts: ApplyImportPlanOptions
  ) => Promise<ImportReport> = applyImportPlan
): Promise<ImportReport | null> {
  if (!args.commit) return null;
  return applyFn(prisma, plan, { commit: true, importedById: args.importedById! });
}

/**
 * O código de saída do processo: zero só quando NENHUM mês falhou.
 *
 * `applyImportPlan` não lança quando uma transação mensal quebra — ela registra o mês em
 * `failedMonths` e segue para o próximo (garantia 3, writer.ts), o que é o comportamento certo
 * para a gravação, mas fazia o script sair com 0 mesmo com meses perdidos. Quem automatizar a
 * chamada leria sucesso; a falha do prazo de transação (P2028), se reaparecer, passaria
 * despercebida. `null` é o ENSAIO — não gravou nada, não há o que falhar.
 */
export function exitCodeFor(result: ImportReport | null): number {
  return result && result.failedMonths.length > 0 ? 1 : 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  const board = readBoard(args.file);
  const totalCards = board.cards.length;

  const prisma = new PrismaClient();
  try {
    const dbUsers = await prisma.user.findMany({
      // As EQUIPES vêm junto: é o que permite recusar um dono declarado no card que não pertence
      // ao time da etapa. Sem isso, o membro do card virava responsável por qualquer etapa — e foi
      // assim que um designer constou como quem fez o controle de qualidade da peça que ele mesmo
      // desenhou.
      select: { id: true, name: true, email: true, teams: { select: { id: true } } },
    });
    const workosUsers: WorkOSUser[] = dbUsers.map((u) => ({
      id: u.id,
      name: u.name ?? "",
      email: u.email ?? "",
      teamIds: u.teams.map((t) => t.id),
    }));

    // `{ nome da etapa: id do time padrão }`, lido do banco. Etapa sem time padrão fica FORA do
    // mapa de propósito — são as coringas (`Aprovação`, `Relatório`, `Briefing`), que podem ser
    // executadas por vários times, e `defaultTeamId` guarda um só. Validar ali inventaria uma
    // regra que o modelo não tem como expressar.
    const dbStages = await prisma.templateStage.findMany({
      where: { defaultTeamId: { not: null } },
      select: { name: true, defaultTeamId: true },
    });
    const stageTeams: Record<string, string> = {};
    for (const st of dbStages) stageTeams[st.name] = st.defaultTeamId!;

    const plan = buildImportPlan(board, workosUsers, {
      clientId: args.clientId,
      manualMatches: MANUAL_MATCHES,
      designerAliases: DESIGNER_ALIASES,
      completedListNames: COMPLETED_LIST_NAMES,
      stageTeams,
    });

    // O --commit imprime o MESMO relatório do ensaio antes de gravar — quem manda gravar precisa
    // ver o que vai acontecer, na mesma execução (brief da Task 10). Por isso este console.log é
    // incondicional, e a decisão de gravar vem só depois dele.
    console.log(args.commit ? "=== GRAVANDO ===" : "=== ENSAIO (nada será gravado) ===");
    console.log(formatReport(plan, totalCards));

    const result = await applyIfRequested(args, plan, prisma);
    if (!result) {
      console.log("");
      console.log("Ensaio concluído. Nada foi gravado. Rode de novo com --commit para gravar.");
      return exitCodeFor(null);
    }

    console.log("");
    console.log(formatWriteResult(result));

    const code = exitCodeFor(result);
    if (code !== 0) {
      console.error("");
      console.error(
        `FALHA: ${result.failedMonths.length} mês(es) não foram gravados — saindo com código ` +
          `${code}. Os meses que falharam sofreram rollback e podem ser reimportados: a ` +
          `idempotência pela URL do card pula o que já entrou.`
      );
    }
    return code;
  } finally {
    await prisma.$disconnect();
  }
}

// Só roda `main()` quando o arquivo é o ponto de entrada (`npx tsx scripts/import-trello/run.ts
// ...`), nunca quando é IMPORTADO — é o que permite o teste da fiação
// (`__tests__/scripts/import-trello/run.test.ts`) importar `parseArgs`/`applyIfRequested` sem
// disparar `main()` (que leria `process.argv` do test runner e chamaria `process.exit`).
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main()
    .then((code) => {
      if (code !== 0) process.exit(code);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
