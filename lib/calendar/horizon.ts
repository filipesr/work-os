import { todayInSaoPaulo } from "@/lib/dates";

// Módulo separado (e não dentro de lib/actions/calendar-occurrence.ts) porque
// aquele arquivo tem "use server", que só permite exportar funções async —
// exportar um helper síncrono de lá quebra o build de produção. Mesmo motivo de
// lib/reporting-constants.ts existir.

/**
 * Janela de planejamento de datas: de HOJE ao fim do ano que vem.
 *
 * É a mesma janela que a tela lista **e** que a criação aceita. Quando as duas
 * divergiam, cadastrar uma data fora do intervalo devolvia "Data criada" e a
 * linha sumia — criada de verdade, invisível para sempre, sem nem como excluir
 * pela interface. Aceitar e esconder é pior que recusar.
 *
 * Passado fica de fora de propósito: esta é uma tela de planejamento, e não há
 * o que planejar para uma data que já passou.
 */
export function planningHorizon(today: Date = todayInSaoPaulo()) {
  return {
    start: today,
    end: new Date(Date.UTC(today.getUTCFullYear() + 1, 11, 31)),
  };
}
