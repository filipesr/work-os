import "server-only";
import prisma from "@/lib/prisma";

export type ReorderProblem = "stageNotFound" | "notYours" | "scheduledStage" | "reorderFailed";

/**
 * Sobe ou desce um item dentro do dia. Serve à mesa do gestor e à tela da pessoa: as regras de
 * ordenação são as mesmas nas duas, e duas cópias divergiriam — a divergência apareceria como "a
 * seta funciona na tela dele e não na minha".
 *
 * Devolve CHAVE de problema, não mensagem: quem traduz é a ação, que sabe em qual namespace a
 * mensagem daquela tela mora.
 *
 * `ownerId` é a diferença entre os dois chamadores. A mesa não passa (o gestor reordena o dia de
 * quem quiser); a tela da pessoa passa o próprio id, e é o que impede alguém de reordenar o dia
 * do colega mandando o id da etapa dele.
 *
 * Dois caminhos, porque um só não dá conta:
 *
 *   - Vizinhos com números DIFERENTES: troca os dois valores. Duas escritas em vez de N, e a ordem
 *     dos outros não muda por tabela.
 *   - Vizinhos EMPATADOS (mesmo número, ou os dois sem número): trocar escreveria o mesmo valor nos
 *     dois e a seta viraria um no-op silencioso. Aí o dia é renumerado — N escritas, e os números
 *     dos outros mudam, mas a ORDEM em que aparecem é preservada exatamente.
 */
export async function applyDayReorder(
  activeStageId: string,
  direction: "up" | "down",
  ownerId?: string
): Promise<{ ok: true } | { problem: ReorderProblem }> {
  const alvo = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      assigneeId: true,
      plannedDate: true,
      plannedOrder: true,
      scheduledStart: true,
    },
  });
  if (!alvo || !alvo.assigneeId || !alvo.plannedDate) return { problem: "stageNotFound" };
  if (ownerId && alvo.assigneeId !== ownerId) return { problem: "notYours" };
  // Item com horário marcado não entra na ordenação manual — ele acontece na hora dele, não na vez
  // dele. Ordenar um compromisso marcado seria fingir que ele espera a vez.
  if (alvo.scheduledStart) return { problem: "scheduledStage" };

  // O dia INTEIRO, agendados inclusive. Eles não entram na ordenação (ninguém os move, e não são
  // vizinhos de ninguém), mas precisam estar aqui: `buildDayQueue` ordena TODOS os slots por
  // `plannedOrder`, então renumerar só os movíveis deixaria o agendado com o número velho e ele
  // saltaria de posição sozinho.
  const doDia = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: alvo.assigneeId,
      plannedDate: alvo.plannedDate,
      status: { not: "COMPLETED" },
    },
    select: { id: true, plannedOrder: true, scheduledStart: true },
    // Mesmo desempate da leitura da tela (e de `buildDayQueue`): a seta precisa agir sobre a mesma
    // ordem que a pessoa está vendo.
    orderBy: [{ plannedOrder: "asc" }, { id: "asc" }],
  });

  // O vizinho é o próximo item MOVÍVEL: um agendado no meio do caminho não é um degrau da fila.
  const movaveis = doDia.filter((x) => !x.scheduledStart);
  const i = movaveis.findIndex((x) => x.id === activeStageId);
  const j = direction === "up" ? i - 1 : i + 1;
  // Fora da lista não é erro: a seta simplesmente não tem para onde ir.
  if (i < 0 || j < 0 || j >= movaveis.length) return { ok: true };
  const [origem, destino] = [movaveis[i], movaveis[j]];

  try {
    if (origem.plannedOrder !== destino.plannedOrder) {
      await prisma.taskActiveStage.update({
        where: { id: origem.id },
        data: { plannedOrder: destino.plannedOrder },
      });
      await prisma.taskActiveStage.update({
        where: { id: destino.id },
        data: { plannedOrder: origem.plannedOrder },
      });
    } else {
      // Empate: não há valor a trocar (a ordem só existe pelo desempate por `id`), então o dia é
      // renumerado a partir da ordem que a tela já mostra, com os dois trocados de lugar. A
      // renumeração é sobre a lista INTEIRA: o agendado ganha número novo mas continua exatamente
      // onde estava em relação aos vizinhos.
      const nova = [...doDia];
      const posOrigem = nova.findIndex((x) => x.id === origem.id);
      const posDestino = nova.findIndex((x) => x.id === destino.id);
      [nova[posOrigem], nova[posDestino]] = [nova[posDestino], nova[posOrigem]];
      for (const [pos, item] of nova.entries()) {
        if (item.plannedOrder === pos + 1) continue;
        await prisma.taskActiveStage.update({
          where: { id: item.id },
          data: { plannedOrder: pos + 1 },
        });
      }
    }
  } catch (error) {
    console.error("applyDayReorder error:", error);
    return { problem: "reorderFailed" };
  }

  return { ok: true };
}
