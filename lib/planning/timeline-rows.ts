/**
 * As linhas do eixo do tempo, com os vãos comprimidos.
 *
 * Sem compressão, um projeto de um ano seriam trezentas e sessenta e cinco linhas e a tela morreria
 * de própria mão. Mas a compressão não é economia de espaço: o vão É a informação. Doze dias parados
 * no meio de um projeto é exatamente o que hoje ninguém enxerga, e costuma ser a explicação do
 * atraso que todo mundo procura depois.
 *
 * A ordem é do mais recente para o mais antigo — futuro em cima, hoje no meio, passado abaixo —,
 * como se lê um extrato.
 *
 * Pura, e sem data do sistema: "hoje" chega por parâmetro. Dias ISO comparam-se como texto, o que
 * mantém a função livre de fuso.
 */

const DIA_MS = 86_400_000;

/** Abaixo disto, o vão não vira faixa: uma faixa de "1 dia sem movimento" ocupa mais espaço do que
 *  a linha que ela substitui, e não conta nada que a ausência da linha já não conte. */
export const MIN_GAP_DAYS = 2;

export type TimelineRow =
  | { kind: "day"; dayISO: string }
  | { kind: "gap"; fromISO: string; toISO: string; days: number };

function diaAnterior(diaISO: string): string {
  return new Date(Date.parse(`${diaISO}T00:00:00Z`) - DIA_MS).toISOString().slice(0, 10);
}

export function buildTimelineRows(args: {
  firstISO: string;
  lastISO: string;
  todayISO: string;
  movedDays: ReadonlySet<string>;
}): TimelineRow[] {
  const { firstISO, lastISO, todayISO, movedDays } = args;
  if (lastISO < firstISO) return [];

  // Hoje é sempre linha: é ela que separa o que aconteceu do que é projeção, e o resto da tela se
  // orienta por ela. Comprimi-la apagaria a referência.
  const ehLinha = (dia: string) => dia === todayISO || movedDays.has(dia);

  const linhas: TimelineRow[] = [];
  let vao: { fromISO: string; toISO: string; days: number } | null = null;

  const fecharVao = () => {
    if (!vao) return;
    // Vão curto demais volta a ser linha comum: comprimir um dia só não ganha nada.
    if (vao.days >= MIN_GAP_DAYS) linhas.push({ kind: "gap", ...vao });
    else {
      for (let d = vao.toISO; d >= vao.fromISO; d = diaAnterior(d)) {
        linhas.push({ kind: "day", dayISO: d });
      }
    }
    vao = null;
  };

  for (let dia = lastISO; dia >= firstISO; dia = diaAnterior(dia)) {
    if (ehLinha(dia)) {
      fecharVao();
      linhas.push({ kind: "day", dayISO: dia });
    } else if (vao) {
      // Percorrendo para trás, o começo do vão é sempre o dia mais antigo visto até agora.
      vao.fromISO = dia;
      vao.days += 1;
    } else {
      vao = { fromISO: dia, toISO: dia, days: 1 };
    }
  }
  fecharVao();

  return linhas;
}
