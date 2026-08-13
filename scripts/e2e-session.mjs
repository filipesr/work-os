// Cria uma sessão autenticada para os testes e2e e grava o storageState do
// Playwright — sem navegador, sem login manual, sem exportar cookie.
//
// Só é possível porque o app usa sessões EM BANCO (PrismaAdapter): o cookie
// guarda um token opaco que aponta para uma linha de `Session`. Inserir a linha
// e entregar o token ao navegador equivale a ter feito login.
//
// Uso:
//   node --env-file=.env scripts/e2e-session.mjs
//   E2E_USER_EMAIL=alguem@x.com node --env-file=.env scripts/e2e-session.mjs

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mesmo nome definido em auth.config.ts. Em http (dev) não há prefixo
// `__Secure-`; em https teria, e o cookie exigiria secure: true.
const COOKIE_NAME = "workos.session-token";
const OUT = path.join("e2e", ".auth", "state.json");
const DAYS = 7;

async function main() {
  const email = process.env.E2E_USER_EMAIL;

  const user = email
    ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true } })
    : await prisma.user.findFirst({
        where: { role: "ADMIN" },
        select: { id: true, email: true, role: true },
        orderBy: { email: "asc" },
      });

  if (!user) {
    console.error(
      email
        ? `Usuário ${email} não encontrado.`
        : "Nenhum ADMIN encontrado. Faça login uma vez pelo app ou informe E2E_USER_EMAIL."
    );
    process.exit(1);
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  const state = {
    cookies: [
      {
        name: COOKIE_NAME,
        value: sessionToken,
        // Sem porta de propósito: cookie não distingue porta, e o dev roda em
        // 3100 enquanto outra instância poderia usar outra.
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
        expires: Math.floor(expires.getTime() / 1000),
      },
    ],
    origins: [],
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(state, null, 2) + "\n");

  console.log(`Sessão criada para ${user.email} (${user.role}).`);
  console.log(`storageState → ${OUT}  ·  expira em ${expires.toISOString().slice(0, 10)}`);
  console.log("Este arquivo é uma CREDENCIAL real — está no .gitignore, não commite.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
