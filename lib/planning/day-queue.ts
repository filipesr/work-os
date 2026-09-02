/**
 * Monta a fila de UM dia de UMA pessoa a partir dos itens que ela tem programados.
 *
 * Função pura, separada da consulta, porque é aqui que mora a regra e é aqui que o erro é
 * silencioso: nenhuma tela quebra se a ordem sair errada — só a pessoa trabalha na coisa errada, ou
 * o gestor deixa de ver um agendamento que não vai acontecer.
 *
 * As três regras da spec, e só elas:
 *   1. Item com janela fixa não é reordenado nem pulado.
 *   2. Item liberado respeita a ordem manual da pessoa.
 *   3. Item não liberado fica VISÍVEL na posição escolhida e é pulado — a próxima liberada é a que
 *      se faz agora. Não some: sumir perderia a intenção de quem o pôs ali.
 */

export type QueueItemInput = {
  id: string;
  /** A etapa está liberada para execução (status ACTIVE). Programar não libera. */
  available: boolean;
  plannedOrder: number;
  referenceHours: number;
  /** Preenchido só nos itens com compromisso marcado. */
  scheduledStart: Date | null;
  /** `"declared"` = SLA cadastrado (ou nem isso — pode vir com `referenceHours: 0`), não medição
   *  real. Opcional e sem papel nenhum na fila: só atravessa até a tela, que é quem precisa avisar
   *  que o número é estimativa. Ver `lib/planning/stage-reference.ts`. */
  referenceSource?: "observed" | "declared";
  /** Rótulos de exibição — passthrough puro, como `referenceSource`: sem papel na classificação
   *  nem na soma de horas, só atravessam até a tela (ex.: a lista de conflitos, que precisa dizer
   *  QUAL trabalho está em risco e por quê). Preenchidos só onde a consulta os tem à mão. */
  taskTitle?: string;
  stageName?: string;
  stageStatus?: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED";
  /** Desde quando a etapa está em execução (entrada do log ainda aberto). Passthrough como os
   *  rótulos: a tela usa para mostrar o envelhecimento DESTA etapa ao lado da referência quando
   *  passa dela. Nunca agregado por pessoa — ver a spec. */
  activeSince?: Date | null;
  /** Etapa REIVINDICADA e sem dia marcado. Ela entra na fila de agora sem que nada seja gravado —
   *  `plannedDate` continua vazio. É a mesma escolha da rolagem: leitura, não algoritmo. Vem
   *  sempre DEPOIS do que tem dia, porque quem chega depois não fura a ordem já montada. */
  semDia?: boolean;
  /** Quando a etapa foi reivindicada (`assignedAt`). Ordena os `semDia` entre si: quem pegou
   *  primeiro faz primeiro. */
  claimedAt?: Date | null;
};

export type QueueKind =
  | "scheduled" // agendado e liberado: acontece na hora dele
  | "runnable" // liberado, entra na vez pela ordem manual
  | "waiting" // não liberado: visível, pulado, não consome capacidade
  | "conflict"; // agendado E não liberado: problema do gestor, nunca pulado em silêncio

export type QueueSlot = { kind: QueueKind; item: QueueItemInput };

export function buildDayQueue(items: QueueItemInput[]): {
  slots: QueueSlot[];
  usedHours: number;
  nextRunnableId: string | null;
  conflicts: QueueItemInput[];
} {
  // Três camadas de prioridade no dia, nesta ordem:
  //   1. o que tem DIA — compromisso marcado e programação do gestor, na ordem manual da pessoa;
  //   2. o que foi REIVINDICADO sem dia, na ordem em que foi pego.
  //
  // `id` desempata as duas. Sem ele, dois itens com o mesmo `plannedOrder` sairiam na ordem em que
  // o banco devolveu as linhas — que o Postgres não garante — e a mesma célula podia listar coisas
  // em ordens diferentes entre dois carregamentos, sem nada ter mudado.
  const porId = (a: QueueItemInput, b: QueueItemInput) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ordenados = [...items].sort((a, b) => {
    if (!!a.semDia !== !!b.semDia) return a.semDia ? 1 : -1;
    if (a.semDia) {
      const ta = a.claimedAt?.getTime() ?? 0;
      const tb = b.claimedAt?.getTime() ?? 0;
      return ta - tb || porId(a, b);
    }
    // Entre DOIS compromissos, quem manda é o relógio — a ordem manual não tem o que dizer sobre
    // qual das duas locações acontece primeiro. Só entre eles: um agendado não fura a fila de quem
    // não tem hora, senão a fila ordenada viraria grade de horários.
    if (a.scheduledStart && b.scheduledStart) {
      return a.scheduledStart.getTime() - b.scheduledStart.getTime() || porId(a, b);
    }
    return a.plannedOrder - b.plannedOrder || porId(a, b);
  });

  const slots: QueueSlot[] = ordenados.map((item) => {
    const agendado = item.scheduledStart !== null;
    if (agendado && !item.available) return { kind: "conflict", item };
    if (agendado) return { kind: "scheduled", item };
    return { kind: item.available ? "runnable" : "waiting", item };
  });

  // Só o que pode ser executado ocupa o dia. Deixar `waiting` e `conflict` somarem encheria a
  // agenda de alguém com trabalho que ninguém consegue começar.
  const executavel = slots.filter((s) => s.kind === "scheduled" || s.kind === "runnable");
  const usedHours = executavel.reduce((soma, s) => soma + s.item.referenceHours, 0);

  // Compromisso marcado vem antes da ordem manual: é o que "interrompe o concorrente" significa
  // para quem olha a fila e quer saber o que fazer agora.
  const proximo =
    executavel.find((s) => s.kind === "scheduled") ?? executavel.find((s) => s.kind === "runnable");

  return {
    slots,
    usedHours,
    nextRunnableId: proximo?.item.id ?? null,
    conflicts: slots.filter((s) => s.kind === "conflict").map((s) => s.item),
  };
}
