// Backfill Client.folderName para clientes legados (criados antes da derivação automática).
// Espelha lib/nas/path.ts:toAsciiSafe. Desambigua colisões do @unique com sufixo numérico.
// Uso: node --env-file=.env scripts/backfill-client-foldernames.mjs
import { PrismaClient } from "@prisma/client";

function toAsciiSafe(input) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const prisma = new PrismaClient();
try {
  const clients = await prisma.client.findMany({
    where: { folderName: null },
    select: { id: true, name: true },
  });
  console.log(`Clientes sem folderName: ${clients.length}`);
  for (const c of clients) {
    const base = toAsciiSafe(c.name) || `cliente-${c.id.slice(0, 6)}`;
    let candidate = base;
    let n = 1;
    while (
      await prisma.client.findFirst({
        where: { folderName: candidate, NOT: { id: c.id } },
        select: { id: true },
      })
    ) {
      n += 1;
      candidate = `${base} ${n}`;
    }
    await prisma.client.update({ where: { id: c.id }, data: { folderName: candidate } });
    console.log(`✔ ${c.name} -> ${candidate}`);
  }
  console.log("Concluído.");
} finally {
  await prisma.$disconnect();
}
