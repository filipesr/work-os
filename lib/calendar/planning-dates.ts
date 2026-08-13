/**
 * Aritmética de datas do PLANEJAMENTO PARA TRÁS.
 *
 * O conceito: uma demanda de campanha não vence no dia do evento — ela precisa
 * estar pronta antes, para o material ser veiculado, instalado ou apresentado.
 * E para estar pronta na data certa, precisa ter começado antes disso.
 *
 *   data de uso        25/12  (Natal — a ocorrência do calendário)
 *   − antecedência     14 dias (julgamento do gestor: 2 semanas rodando)
 *   = prazo (dueDate)  11/12
 *   − duração do fluxo 21 dias (soma das etapas do template)
 *   = início sugerido  20/11
 *
 * Puro e sem fuso: opera sobre strings `yyyy-mm-dd`, que é como as datas
 * trafegam nos formulários e no `CalendarOccurrence.date` (meia-noite UTC
 * representando o dia em São Paulo — convenção de lib/dates.ts). Fazer a conta
 * em `Date` local reintroduziria o erro de um dia perto da virada.
 */

const DIA_MS = 8.64e7;

/** `yyyy-mm-dd` → Date em UTC. Null se a string não for uma data válida. */
function parseIso(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * `iso` menos `dias`. Devolve "" quando qualquer entrada é inválida ou vazia —
 * o caller trata isso como "ainda não dá para calcular", que é o estado do
 * formulário antes de o gestor informar a antecedência.
 *
 * Aceita `dias` como string porque vem de `<input type="number">`, onde o valor
 * é sempre texto e pode estar vazio.
 */
export function subtractDays(iso: string, dias: string | number): string {
  const base = parseIso(iso);
  if (!base) return "";

  const n = typeof dias === "number" ? dias : dias.trim() === "" ? NaN : Number(dias);
  if (!Number.isFinite(n) || n < 0) return "";

  return toIso(new Date(base.getTime() - Math.floor(n) * DIA_MS));
}

/** Diferença em dias inteiros entre duas datas ISO (`ate` − `de`). Null se inválidas. */
export function daysBetweenIso(de: string, ate: string): number | null {
  const a = parseIso(de);
  const b = parseIso(ate);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DIA_MS);
}

/** Horas de trabalho por dia. A previsão das etapas é em horas; a agenda é em dias. */
export const HORAS_POR_DIA_UTIL = 8;

/** Sábado ou domingo. `getUTCDay()`: 0 = domingo, 6 = sábado. */
function isFimDeSemana(d: Date): boolean {
  const dia = d.getUTCDay();
  return dia === 0 || dia === 6;
}

/**
 * Horas de previsão → dias ÚTEIS de trabalho, arredondando para cima.
 *
 * Para cima porque 9h não cabem num dia de 8h: exigem dois. Arredondar para
 * baixo espremeria o cronograma exatamente onde ele já não cabe.
 */
export function horasParaDiasUteis(horas: number): number {
  return Math.ceil(horas / HORAS_POR_DIA_UTIL);
}

/** Recua `n` dias ÚTEIS a partir de `iso`, pousando sempre num dia útil. */
export function subtractBusinessDays(iso: string, n: number): string {
  const base = parseIso(iso);
  if (!base || !Number.isFinite(n) || n < 0) return "";

  const cursor = new Date(base.getTime());
  // Ponto de partida em fim de semana não é dia de trabalho: recua até a sexta.
  while (isFimDeSemana(cursor)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let restantes = Math.floor(n);
  while (restantes > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!isFimDeSemana(cursor)) restantes--;
  }
  return toIso(cursor);
}

/** Percentual do tempo de execução reservado como folga. Padrão da casa. */
export const GORDURA_PADRAO = 0.2;

/**
 * Folga, em dias úteis, para absorver imprevisto entre concluir e usar.
 *
 * Proporcional ao tamanho do trabalho — 20% de um fluxo de 40h são 8h, ou seja um
 * dia — porque risco cresce com duração: quanto mais longo o caminho, mais chance
 * de algo atravessar. Um número fixo daria folga demais ao curto e de menos ao
 * longo, que é o que mais precisa.
 *
 * Mínimo de UM dia: uma demanda que termina no mesmo dia em que é usada não tem
 * para onde escorregar, e é justamente a que menos aguenta surpresa.
 */
export function bufferDiasUteis(totalHoras: number | null): number {
  if (!totalHoras || totalHoras <= 0) return 0;
  return Math.max(1, Math.ceil((totalHoras * GORDURA_PADRAO) / HORAS_POR_DIA_UTIL));
}

/**
 * O dia útil em que o trabalho precisa COMEÇAR para terminar em `fimIso`,
 * dispondo de `diasUteis` dias de trabalho.
 *
 * A contagem é INCLUSIVA nas duas pontas: 1 dia útil com entrega na segunda
 * significa começar e terminar na segunda — não na sexta anterior. Foi a decisão
 * que exigiu mais cuidado aqui, porque a intuição de "subtrair N dias" dá sempre
 * um dia a mais de folga do que existe.
 *
 * Quando `fimIso` cai no fim de semana, o último dia de trabalho vira a sexta
 * anterior: ninguém entrega no sábado, e contar a partir dele daria um início
 * mais tarde do que o real.
 */
export function startForWorkingDays(fimIso: string, diasUteis: number): string {
  if (!Number.isFinite(diasUteis) || diasUteis < 1) return "";
  // O próprio dia final já conta como o primeiro dos dias úteis (inclusivo),
  // então recuar `diasUteis - 1` deixa exatamente `diasUteis` dias disponíveis.
  return subtractBusinessDays(fimIso, diasUteis - 1);
}

/**
 * A cadeia inteira do planejamento para trás, num lugar só.
 *
 * Cada data responde a uma pergunta diferente, e o formulário mostra todas —
 * esconder os passos intermediários faria o gestor julgar um resultado sem ver
 * de onde ele veio.
 *
 *   evento      a que data a demanda atende (rastreabilidade; não é prazo)
 *   entrega     quando o material é usado — evento menos a antecedência informada
 *   conclusão   quando o trabalho precisa estar pronto — entrega menos a gordura
 *   início      quando começar — conclusão menos a duração do fluxo
 *
 * A antecedência é em dias CORRIDOS (campanha roda no sábado); gordura e duração
 * são em dias ÚTEIS (trabalho não acontece no fim de semana).
 *
 * Campos vazios quando não há como calcular: sem antecedência não há entrega, e
 * sem previsão nas etapas não há gordura nem início. Devolver vazio deixa o
 * formulário dizer o que falta, em vez de exibir uma data inventada.
 */
export function planningChain(input: {
  eventoIso: string;
  antecedenciaDias: string | number;
  totalHoras: number | null;
}): { entrega: string; conclusao: string; inicio: string; gorduraDias: number; execDias: number } {
  const entrega = subtractDays(input.eventoIso, input.antecedenciaDias);
  const gorduraDias = bufferDiasUteis(input.totalHoras);
  const execDias = input.totalHoras ? horasParaDiasUteis(input.totalHoras) : 0;

  if (!entrega) return { entrega: "", conclusao: "", inicio: "", gorduraDias, execDias };

  // Sem previsão nas etapas não há gordura a descontar, e a conclusão cai na
  // própria entrega. É degradação deliberada: BLOQUEAR a criação até o fluxo
  // estar configurado deixaria o gestor travado no meio de uma tarefa por causa
  // de um cadastro que não é dele. A ausência é dita na tela; o trabalho segue.
  const conclusao = gorduraDias > 0 ? subtractBusinessDays(entrega, gorduraDias) : entrega;
  const inicio = execDias > 0 ? startForWorkingDays(conclusao, execDias) : "";

  return { entrega, conclusao, inicio, gorduraDias, execDias };
}

/**
 * Início sugerido: o prazo recuado pelo tempo que o fluxo inteiro consome.
 *
 * `totalHoras` é a soma de `expectedDurationHours` das etapas do template — o
 * mesmo número que serve de SLA por etapa, agora somado para responder "quando
 * isto precisa começar?".
 *
 * A conversão é 8h por dia, de segunda a sexta. Feriado NÃO é descontado: o app
 * conhece feriados de três países (AR/BR/PY) via `CalendarOccurrence`, e qual
 * deles se aplica depende do cliente — descontar o feriado errado erraria a data
 * com ares de precisão. O sábado e o domingo são universais; o feriado não.
 *
 * Devolve "" quando não há duração configurada — sem isso a conta produziria
 * "comece hoje" para todo fluxo não configurado, que é pior que não responder.
 */
export function suggestedStartIso(dueIso: string, totalHoras: number | null): string {
  if (!totalHoras || totalHoras <= 0) return "";
  return startForWorkingDays(dueIso, horasParaDiasUteis(totalHoras));
}
