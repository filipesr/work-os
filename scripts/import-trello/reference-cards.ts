// Traz os cards de REFERÊNCIA do quadro do Trello para o WorkOS como artefatos de CLIENTE.
//
// POR QUÊ. A importação de demandas descarta esses cards de propósito — eles não são trabalho, são
// instrução: tamanhos de peça, modelos de solicitação, checklists. Mas descartá-los da importação
// não os torna descartáveis: descrevem como se pede e como se entrega em TODOS os projetos daquele
// cliente. O escopo `CLIENT` do artefato existe exatamente para isso, e até aqui nunca foi usado —
// os 550 artefatos do sistema são todos de TASK.
//
// Quem decide o que é referência é `cardNature` (lib/trello/classify.ts), a MESMA função que a
// importação usa para descartá-los. Duas listas do que é instrução divergiriam, e a segunda estaria
// errada.
//
// ⚠️ ESTES ARTEFATOS SÃO LINK PARA O TRELLO, E ISSO TEM CONSEQUÊNCIA. O conteúdo desses cards é
// TEXTO (o corpo do card), e `TaskArtifact` não tem campo de corpo — guarda título, URL e arquivo.
// Então o que entra aqui é o PONTEIRO, não a instrução:
//
//   · abrir exige login no Trello (medido: `curl` no link devolve 401);
//   · se o quadro for apagado ou a conta encerrada, a instrução morre junto.
//
// É a mesma consequência aceita para os 454 anexos (ver docs/pendencias.md). Escolha explícita do
// dono do projeto, tomada sabendo disso — e o caminho que preserva de verdade seria dar um corpo de
// texto ao artefato, ou subir cada card como arquivo no NAS.
//
// Uso:
//   npx tsx scripts/import-trello/reference-cards.ts --file "<export.json>" --client <clientId>
//   npx tsx scripts/import-trello/reference-cards.ts --file "<export.json>" --client <clientId> \
//     --commit --imported-by <userId>

import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { cardNature } from "@/lib/trello/classify";
import type { TrelloBoardExport, LabelsById } from "@/lib/trello/types";

interface Args {
  file: string;
  clientId: string;
  commit: boolean;
  importedById?: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const file = get("--file");
  const clientId = get("--client");
  const commit = argv.includes("--commit");
  const importedById = get("--imported-by");

  if (!file) throw new Error("--file é obrigatório (o export vive fora do repositório)");
  if (!clientId) throw new Error("--client é obrigatório (descubra o id consultando o banco)");
  if (commit && !importedById) {
    throw new Error("--imported-by é obrigatório com --commit: todo artefato tem um autor");
  }
  return { file, clientId, commit, importedById };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const board = JSON.parse(fs.readFileSync(args.file, "utf8")) as TrelloBoardExport;

  const labelsById: LabelsById = {};
  for (const l of board.labels ?? []) labelsById[l.id] = l.name ?? "";

  const referencias = board.cards.filter(
    (c) => !c.closed && cardNature(c, labelsById) === "referencia"
  );

  console.log(`\n${args.commit ? "APLICANDO" : "ENSAIO (nada será escrito)"}\n`);
  console.log(`  cards no export: ${board.cards.length}`);
  console.log(`  de REFERÊNCIA (não arquivados): ${referencias.length}\n`);

  const prisma = new PrismaClient();
  try {
    const client = await prisma.client.findUnique({
      where: { id: args.clientId },
      select: { id: true, name: true },
    });
    if (!client) throw new Error(`cliente ${args.clientId} não existe`);
    console.log(`  cliente: ${client.name}\n`);

    // Já importados antes: a URL do card é a identidade. Rodar duas vezes não duplica.
    const existentes = new Set(
      (
        await prisma.taskArtifact.findMany({
          where: { scope: "CLIENT", clientId: client.id, url: { not: null } },
          select: { url: true },
        })
      ).map((a) => a.url!)
    );

    let novos = 0;
    let repetidos = 0;
    for (const c of referencias) {
      const url = c.shortUrl ?? "";
      const jaTem = url && existentes.has(url);
      if (jaTem) repetidos++;
      else novos++;
      const corpo = (c.desc ?? "").trim();
      console.log(
        `  ${jaTem ? "=" : "+"} ${(c.name || "(sem nome)").slice(0, 48).padEnd(50)} ${corpo ? `${corpo.length} chars de descrição` : "SEM descrição"}`
      );
      if (!url) console.log(`      ⚠ sem shortUrl no export — não dá para linkar`);
    }
    console.log(`\n  novos: ${novos}   já importados: ${repetidos}\n`);

    if (!args.commit) {
      console.log("  Ensaio. Rode com --commit --imported-by <userId> para gravar.\n");
      return;
    }

    const criar = referencias.filter((c) => c.shortUrl && !existentes.has(c.shortUrl));
    if (criar.length === 0) {
      console.log("  Nada novo a criar.\n");
      return;
    }
    const r = await prisma.taskArtifact.createMany({
      data: criar.map((c) => ({
        title: c.name || "(sem nome)",
        url: c.shortUrl!,
        scope: "CLIENT" as const,
        clientId: client.id,
        userId: args.importedById!,
        storageKind: "LINK" as const,
        uploadStatus: "READY" as const,
        // INTERNO é o padrão do schema e o certo aqui: instrução de processo é material de
        // trabalho, não entrega ao cliente. Quem quiser expor alguma, remarca na aba.
        sensitivity: "INTERNO" as const,
      })),
    });
    console.log(`  criados: ${r.count}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
