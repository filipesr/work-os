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
  // A parede nunca é anterior ao primeiro dia visível (pois é max(vespera, ancora)),
  // então a ordem dos dois clamps é segura: primeiro reposiciona atrasado, depois aplica parede.
  const parede = (() => {
    if (!dueDateISO) return null;
    const vespera = diaAnterior(dueDateISO);
    return vespera < ancora ? ancora : vespera;
  })();

  const porStageId = new Map(stages.map((s) => [s.stageId, s]));
  const diaDe = new Map<string, string>();
  const resultado = new Map<string, string | null>();
  const visitando = new Set<string>(); // Detecta ciclos na travessia
  const emCiclo = new Set<string>(); // Marca etapas que têm ciclo

  // Função auxiliar que posiciona uma etapa resolvendo suas dependências em profundidade.
  // Protege-se contra ciclos posicionando em falha na âncora.
  function obterDia(stageId: string, parentStageId: string | null = null): string {
    // Se já foi posicionado, retorna em cache.
    if (diaDe.has(stageId)) return diaDe.get(stageId)!;

    // Se está sendo visitado agora, há ciclo: posiciona na âncora e marca ambas como cíclicas.
    if (visitando.has(stageId)) {
      diaDe.set(stageId, ancora);
      emCiclo.add(stageId);
      if (parentStageId) emCiclo.add(parentStageId);
      return ancora;
    }

    visitando.add(stageId);

    const s = porStageId.get(stageId);
    if (!s) {
      // Dependência não está na demanda: nenhuma restrição — é como se não existisse.
      visitando.delete(stageId);
      return ancora;
    }

    let dia: string;
    let fromPlannedDate = false;
    // O piso: o dia mais tardio que alguma dependência já ocupa. A parede pode comprimir a
    // cadeia até aqui, nunca além — comprimir não é inverter uma etapa para antes daquilo de que
    // ela depende. Só a cascata (abaixo) o eleva; nos outros ramos fica na âncora, que a parede
    // sempre alcança ou ultrapassa, então não muda o comportamento deles.
    let piso = ancora;

    // Concluída: devolve o completedDay se conhecido, ou âncora se não há data (sem restrição).
    if (s.status === "COMPLETED") {
      dia = s.completedDay ?? ancora;
    } else if (s.plannedDate) {
      // Decisão humana manda: inventar por cima dela seria a tela discordando de quem a usa.
      dia = s.plannedDate;
      fromPlannedDate = true;
    } else {
      let base = ancora;
      for (const depId of s.dependsOnIds) {
        // Resolve a dependência primeiro (recursão); se houver ciclo, retorna a âncora.
        const diaDep = obterDia(depId, stageId);
        const dep = porStageId.get(depId);

        // Pré-requisito não está na demanda: nenhuma restrição.
        if (!dep) continue;
        // Pré-requisito concluído sem data conhecida: concluída sem data não empurra ninguém.
        if (dep.status === "COMPLETED" && !diaDep) continue;
        // Pré-requisito pendente sem posição resolvida: não há como restringir.
        if (!diaDep) continue;

        // A dependência nunca acontece depois de quem depende dela — nem quando a parede
        // comprime a cascata. Este é o piso que o clamp abaixo respeita.
        if (diaDep > piso) piso = diaDep;

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
    // Parede do vencimento limita o quanto a cascata pode adiar — mas não desfaz decisão humana,
    // e comprime sem inverter: nunca baixa a etapa abaixo do piso que suas dependências impuseram.
    // Quando o piso já está além da parede (uma dependência cuja própria data humana passa do
    // prazo, por exemplo), a parede simplesmente não alcança — a etapa fica ao lado de quem ela
    // depende, não antes.
    if (!fromPlannedDate && parede && dia > parede) dia = piso > parede ? piso : parede;

    diaDe.set(stageId, dia);
    visitando.delete(stageId);
    return dia;
  }

  // Processa cada etapa. A ordem por `order` é desempate entre etapas independentes,
  // garantindo resultados estáveis; obterDia() garante que dependências são resolvidas primeiro.
  for (const s of [...stages].sort((a, b) => a.order - b.order)) {
    if (s.status === "COMPLETED") {
      // Concluída não tem pendente para posicionar — ela aparece no dia em que fechou, e quem a
      // coloca lá é quem lê o apontamento.
      resultado.set(s.id, null);
      if (s.completedDay) diaDe.set(s.stageId, s.completedDay);
      continue;
    }

    const dia = obterDia(s.stageId);
    // Fora da janela (sem parede que a segure) a etapa não aparece nesta semana: empilhar no
    // sábado o trabalho que não é dele mentiria sobre a carga do dia.
    resultado.set(s.id, days.includes(dia) ? dia : null);
  }

  // Etapas em ciclo devem ser posicionadas na âncora: o ciclo é problema do modelo,
  // e mostrá-las amontoadas na âncora é melhor que deixá-las em silêncio.
  for (const stageId of emCiclo) {
    diaDe.set(stageId, ancora);
  }

  // Atualiza o resultado com as posições finais das etapas cíclicas.
  for (const s of stages) {
    if (emCiclo.has(s.stageId) && s.status !== "COMPLETED") {
      const dia = diaDe.get(s.stageId)!;
      resultado.set(s.id, days.includes(dia) ? dia : null);
    }
  }

  return resultado;
}
