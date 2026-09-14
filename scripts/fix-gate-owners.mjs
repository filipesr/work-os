// Tira o dono das etapas de PORTÃO que a importação do Trello atribuiu por chute.
//
// POR QUÊ. A importação precisava de um responsável e, onde o quadro não nomeava ninguém, caía no
// "membro declarado no card" — que é quem EXECUTOU a peça, não quem a revisou. O resultado mais
// claro: Luis (Designers) consta como quem fez o controle de qualidade de 8 flyers que ele mesmo
// desenhou. Um portão assinado por quem ele deveria fiscalizar não é um portão.
//
// A lista `REVISIÓN` do Trello não nomeia ninguém. Então o quadro NÃO DIZ quem revisou, e qualquer
// dono ali é palpite promovido a dado — inclusive os que não são de equipe criativa. Sem dono é o
// estado honesto, e já é o de 25 das 52 etapas de Quality Control: esta correção iguala o resto.
//
// PRESERVADO de propósito: quem pertence ao time de QUALIDADE (Norma) continua dona das suas, e
// as etapas de Audio Visual ficam sem produtor pelo mesmo motivo que `Desenho` já fica — o autor
// do anexo é quem SUBIU o arquivo, com frequência o atendimento.
//
// Uso:
//   node --env-file=.env scripts/fix-gate-owners.mjs            # ensaio (não escreve)
//   node --env-file=.env scripts/fix-gate-owners.mjs --commit   # aplica, com backup

import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

/** Times cujo pertencimento JUSTIFICA ser dono de um portão. */
const TIMES_DE_PORTAO = new Set(["Quality Control", "Proofreading"]);

/** Os alvos, por nome de etapa. */
const ALVOS = ["Quality Control", "Audio Visual"];

async function main() {
  const linhas = await prisma.taskActiveStage.findMany({
    where: { assigneeId: { not: null }, stage: { name: { in: ALVOS } } },
    select: {
      id: true,
      status: true,
      assigneeId: true,
      assignedAt: true,
      assignee: { select: { name: true, teams: { select: { name: true } } } },
      stage: { select: { name: true } },
      task: { select: { title: true } },
    },
  });

  const limpar = [];
  const manter = [];
  for (const l of linhas) {
    const times = l.assignee.teams.map((t) => t.name);
    // Audio Visual: o dono só se justifica se ele for de Video-makers — quem produz vídeo.
    const justificado =
      l.stage.name === "Audio Visual"
        ? times.includes("Video-makers")
        : times.some((t) => TIMES_DE_PORTAO.has(t));
    (justificado ? manter : limpar).push(l);
  }

  console.log(`\n${COMMIT ? "APLICANDO" : "ENSAIO (nada será escrito)"}\n`);
  console.log(`  etapas ${ALVOS.join("/")} com dono: ${linhas.length}`);
  console.log(`  a limpar: ${limpar.length}   a manter: ${manter.length}\n`);

  console.log("  MANTIDAS (dono pertence ao time que justifica a etapa):");
  for (const m of manter) {
    console.log(`    ${m.stage.name.padEnd(16)} ${m.assignee.name} [${m.assignee.teams.map((t) => t.name).join(", ")}]`);
  }
  console.log("\n  A LIMPAR:");
  for (const l of limpar) {
    console.log(
      `    ${l.stage.name.padEnd(16)} ${l.status.padEnd(10)} ${l.assignee.name.split(" ")[0].padEnd(9)} [${l.assignee.teams.map((t) => t.name).join(", ") || "sem equipe"}] | ${l.task.title.slice(0, 38)}`
    );
  }

  if (!COMMIT) {
    console.log(`\n  Ensaio. Rode com --commit para aplicar.\n`);
    return;
  }

  // Backup ANTES de escrever: sem TimeLog nem ActivityLog no sistema, o vínculo mora só nestas
  // colunas — e um arquivo é o que permite desfazer sem adivinhar.
  const backup = limpar.map((l) => ({
    id: l.id,
    assigneeId: l.assigneeId,
    assignedAt: l.assignedAt,
    assigneeName: l.assignee.name,
    stage: l.stage.name,
    task: l.task.title,
  }));
  const arquivo = `scripts/fix-gate-owners.backup.json`;
  writeFileSync(arquivo, JSON.stringify(backup, null, 2));
  console.log(`\n  backup → ${arquivo} (${backup.length} linhas)`);

  // `assignedAt` cai junto: ele carimba QUANDO o dono atual foi definido, e sobreviver a um dono
  // nulo deixaria "atribuído em 11/set" sem ninguém atribuído.
  const r = await prisma.taskActiveStage.updateMany({
    where: { id: { in: limpar.map((l) => l.id) } },
    data: { assigneeId: null, assignedAt: null },
  });
  console.log(`  atualizadas: ${r.count}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
