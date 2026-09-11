import type { Prisma } from "@prisma/client";

/**
 * Quem aparece nas telas de planejamento: **quem executa**.
 *
 * Conta de portal (`CLIENT`) e ex-colaborador desativado ganhariam linha na grade — cada uma com o
 * próprio aviso de capacidade — e virariam alvo de atribuição no diálogo de programar.
 *
 * Mora aqui, e não dentro da consulta, porque a mesma regra decide DUAS coisas que precisam
 * concordar: quem entra na grade e quem aparece no seletor de pessoas da barra. Se divergirem, o
 * seletor oferece alguém que a grade nunca vai mostrar — um filtro que devolve tela vazia sem
 * explicar por quê.
 */
export const EXECUTOR_WHERE = {
  role: { not: "CLIENT" },
  disabledAt: null,
} satisfies Prisma.UserWhereInput;
