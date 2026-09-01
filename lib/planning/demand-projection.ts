/**
 * Em que dia o trabalho PENDENTE de cada etapa de uma demanda vai acontecer.
 *
 * Existe porque a leitura anterior ancorava toda etapa sem data no primeiro dia da demanda — uma
 * âncora que não descreve o fluxo: a segunda etapa não acontece junto da primeira, acontece depois
 * dela. O gestor via um amontoado onde deveria ver uma demanda andando pela semana.
 *
 * É PROJEÇÃO, não promessa: ninguém se compromete com estes dias, e nada é gravado. A tela mostra
 * onde o trabalho cai se nada mudar — e é lendo isso que se descobre que não cabe.
 *
 * Duas coisas que ela deliberadamente NÃO faz:
 *
 *   - Não fatia etapa entre dias. Uma etapa de 12h aparece inteira no dia projetado, mesmo
 *     estourando a régua. Quem fatia é a realidade: o realizado se divide sozinho pelos
 *     apontamentos de cada dia.
 *   - Não simula capacidade. Não pergunta se a pessoa tem 8h livres naquele dia — isso seria a
 *     grade de horários que o P7 proíbe, e exigiria decidir por alguém que ainda nem é dono da
 *     etapa.
 */

const DIA_MS = 86_400_000;

/** Um dia ISO adiante. Dias ISO comparam-se como string, o que mantém a função sem fuso. */
function diaSeguinte(diaISO: string): string {
  return new Date(Date.parse(`${diaISO}T00:00:00Z`) + DIA_MS).toISOString().slice(0, 10);
}

function diaAnterior(diaISO: string): string {
  return new Date(Date.parse(`${diaISO}T00:00:00Z`) - DIA_MS).toISOString().slice(0, 10);
}

export type ProjectionStage = {
  /** Id da linha da etapa na demanda (`TaskActiveStage.id`) — a chave do resultado. */
  id: string;
  /** Id da etapa do MODELO (`TemplateStage.id`) — é por ele que a cadeia se liga. */
  stageId: string;
  order: number;
  /** Pré-requisitos, em ids de etapa do modelo. Quem não estiver na demanda é ignorado. */
  dependsOnIds: string[];
  status: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED";
  /** Decisão humana: o gestor pôs a etapa neste dia. */
  plannedDate: string | null;
  /** Dia em que fechou, para as concluídas — é daí que as seguintes partem. */
  completedDay: string | null;
  /** `max(0, referência − realizado)`. Zero não empurra ninguém. */
  pendingHours: number;
};

export function projectDemandDays(input: {
  stages: ProjectionStage[];
  days: string[];
  todayISO: string | null;
  dueDateISO: string | null;
}): Map<string, string | null> {
  const { stages, days, todayISO, dueDateISO } = input;
  const primeiro = days[0];
  // Fora da semana corrente não existe "hoje" na janela: a cascata parte do primeiro dia visível,
  // que é a semana que se está planejando.
  const ancora = todayISO ?? primeiro;

  // A parede do vencimento. O prazo é a data de ENTREGA, então o trabalho precisa estar pronto na
  // VÉSPERA. Demanda vencida (ou que vence hoje) não tem para onde adiar: o último dia é hoje.
  const parede = (() => {
    if (!dueDateISO) return null;
    const vespera = diaAnterior(dueDateISO);
    return vespera < ancora ? ancora : vespera;
  })();

  const porStageId = new Map(stages.map((s) => [s.stageId, s]));
  const diaDe = new Map<string, string>();
  const resultado = new Map<string, string | null>();

  // A ordem do fluxo já é topológica nesta base: uma etapa nunca depende de outra de ordem maior.
  // Percorrer por `order` garante que os pré-requisitos já foram posicionados quando chega a vez.
  for (const s of [...stages].sort((a, b) => a.order - b.order)) {
    if (s.status === "COMPLETED") {
      // Concluída não tem pendente para posicionar — ela aparece no dia em que fechou, e quem a
      // coloca lá é quem lê o apontamento.
      resultado.set(s.id, null);
      if (s.completedDay) diaDe.set(s.stageId, s.completedDay);
      continue;
    }

    let dia: string;
    if (s.plannedDate) {
      // Decisão humana manda: inventar por cima dela seria a tela discordando de quem a usa.
      dia = s.plannedDate;
    } else {
      let base = ancora;
      for (const depId of s.dependsOnIds) {
        const dep = porStageId.get(depId);
        // Etapa desmarcada na criação não tem linha na demanda: tratá-la como pendência travaria
        // a cadeia inteira num pré-requisito que não existe.
        if (!dep) continue;
        const diaDep = dep.status === "COMPLETED" ? dep.completedDay : diaDe.get(depId);
        if (!diaDep) continue;
        // Anterior concluída libera o mesmo dia — quem terminou de manhã não impede a seguinte de
        // acontecer à tarde. Anterior ainda pendente ocupa o dia dela, e a seguinte vai para o
        // próximo; a de 0h é a exceção, porque sem duração conhecida ela não consome dia nenhum.
        const candidato =
          dep.status === "COMPLETED" || dep.pendingHours <= 0 ? diaDep : diaSeguinte(diaDep);
        if (candidato > base) base = candidato;
      }
      dia = base;
    }

    // Atrasado entra no primeiro dia visível, como em toda tela deste sistema.
    if (dia < primeiro) dia = primeiro;
    if (parede && dia > parede) dia = parede;

    diaDe.set(s.stageId, dia);
    // Fora da janela (sem parede que a segure) a etapa não aparece nesta semana: empilhar no
    // sábado o trabalho que não é dele mentiria sobre a carga do dia.
    resultado.set(s.id, days.includes(dia) ? dia : null);
  }

  return resultado;
}
