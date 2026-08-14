import { describe, expect, it } from "vitest";

import {
  daysBetweenIso,
  horasParaDiasUteis,
  mondaysTouchingMonth,
  bufferDiasUteis,
  planningChain,
  startForWorkingDays,
  subtractBusinessDays,
  subtractDays,
  suggestedStartIso,
} from "@/lib/calendar/planning-dates";

describe("subtractDays", () => {
  it("faz a conta do exemplo do Natal", () => {
    // 25/12 menos 2 semanas de veiculação = material pronto em 11/12.
    expect(subtractDays("2026-12-25", 14)).toBe("2026-12-11");
  });

  it("atravessa a virada de mês e de ano", () => {
    // O erro clássico desta conta. Feita em Date local em vez de UTC, um destes
    // volta um dia errado dependendo do fuso de quem roda.
    expect(subtractDays("2026-03-01", 1)).toBe("2026-02-28");
    expect(subtractDays("2027-01-05", 10)).toBe("2026-12-26");
    expect(subtractDays("2028-03-01", 1)).toBe("2028-02-29"); // bissexto
  });

  it("aceita o valor de um input de número, que é string", () => {
    expect(subtractDays("2026-12-25", "14")).toBe("2026-12-11");
    expect(subtractDays("2026-12-25", "0")).toBe("2026-12-25");
  });

  it("devolve vazio enquanto não dá para calcular", () => {
    // O estado do formulário antes de o gestor informar a antecedência. Vazio é
    // "ainda não sei", e o caller desabilita o envio — bem diferente de zero,
    // que significa "pronto no próprio dia".
    expect(subtractDays("2026-12-25", "")).toBe("");
    expect(subtractDays("2026-12-25", "  ")).toBe("");
    expect(subtractDays("", 14)).toBe("");
    expect(subtractDays("25/12/2026", 14)).toBe("");
    expect(subtractDays("2026-12-25", "abc")).toBe("");
  });

  it("recusa antecedência negativa", () => {
    // Seria concluir DEPOIS do uso — o oposto do conceito da tela.
    expect(subtractDays("2026-12-25", -3)).toBe("");
  });
});

describe("daysBetweenIso", () => {
  it("mede a antecedência efetiva de uma demanda já criada", () => {
    expect(daysBetweenIso("2026-12-11", "2026-12-25")).toBe(14);
  });

  it("é negativo quando o prazo passou da data de uso", () => {
    expect(daysBetweenIso("2026-12-26", "2026-12-25")).toBe(-1);
  });

  it("null em entrada inválida", () => {
    expect(daysBetweenIso("", "2026-12-25")).toBeNull();
  });
});

describe("horasParaDiasUteis", () => {
  it("converte a 8h por dia", () => {
    expect(horasParaDiasUteis(8)).toBe(1);
    expect(horasParaDiasUteis(40)).toBe(5);
    expect(horasParaDiasUteis(120)).toBe(15); // 3 semanas de trabalho
  });

  it("arredonda para CIMA", () => {
    // 9h não cabem num dia de 8h. Para baixo espremeria o cronograma
    // exatamente onde ele já não cabe.
    expect(horasParaDiasUteis(9)).toBe(2);
    expect(horasParaDiasUteis(1)).toBe(1);
    expect(horasParaDiasUteis(41)).toBe(6);
  });
});

describe("startForWorkingDays", () => {
  // Referência de calendário usada abaixo (todas de 2026):
  //   07/12 seg · 08 ter · 09 qua · 10 qui · 11 sex · 12 sáb · 13 dom · 14 seg
  it("conta INCLUSIVO: um dia útil começa e termina no mesmo dia", () => {
    // A borda que a intuição erra. "Subtrair 1 dia" daria sexta 04/12 e
    // inventaria um dia de folga que não existe.
    expect(startForWorkingDays("2026-12-07", 1)).toBe("2026-12-07");
  });

  it("dois dias úteis com entrega na segunda começam na sexta", () => {
    expect(startForWorkingDays("2026-12-07", 2)).toBe("2026-12-04");
  });

  it("pula o fim de semana ao recuar", () => {
    // Entrega sexta 11/12, 5 dias úteis → segunda 07/12 (não 06/12, domingo).
    expect(startForWorkingDays("2026-12-11", 5)).toBe("2026-12-07");
    // 10 dias úteis → segunda da semana anterior, 30/11.
    expect(startForWorkingDays("2026-12-11", 10)).toBe("2026-11-30");
  });

  it("prazo no fim de semana recua para a sexta anterior", () => {
    // Ninguém entrega no sábado. Contar a partir dele daria um início mais tarde
    // do que o real, que é o erro perigoso — sugere folga inexistente.
    expect(startForWorkingDays("2026-12-12", 1)).toBe("2026-12-11"); // sáb → sex
    expect(startForWorkingDays("2026-12-13", 1)).toBe("2026-12-11"); // dom → sex
    expect(startForWorkingDays("2026-12-12", 5)).toBe("2026-12-07");
  });

  it("o resultado é sempre um dia útil", () => {
    for (let n = 1; n <= 40; n++) {
      const iso = startForWorkingDays("2026-12-11", n);
      const dia = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
      expect(dia, `${n} dias úteis caiu em fim de semana (${iso})`).not.toBe(0);
      expect(dia, `${n} dias úteis caiu em fim de semana (${iso})`).not.toBe(6);
    }
  });

  it("cada dia útil a mais recua exatamente um dia útil", () => {
    // Guarda contra erro de acumulação: a diferença entre N e N+1 nunca pode
    // pular ou repetir um dia útil.
    let anterior = startForWorkingDays("2026-12-11", 1);
    for (let n = 2; n <= 30; n++) {
      const atual = startForWorkingDays("2026-12-11", n);
      const gap = daysBetweenIso(atual, anterior)!;
      // 1 dia normal, ou 3 quando atravessa o fim de semana (sex → seg).
      expect([1, 3], `salto inesperado de ${gap} dias em N=${n}`).toContain(gap);
      anterior = atual;
    }
  });

  it("recusa entrada inválida", () => {
    expect(startForWorkingDays("", 5)).toBe("");
    expect(startForWorkingDays("2026-12-11", 0)).toBe("");
    expect(startForWorkingDays("2026-12-11", -1)).toBe("");
  });
});

describe("suggestedStartIso", () => {
  it("faz a conta completa do exemplo real", () => {
    // 3 semanas de trabalho = 120h = 15 dias úteis. Prazo sex 11/12 →
    // começar em 23/11 (segunda), com os dois fins de semana pulados.
    expect(suggestedStartIso("2026-12-11", 120)).toBe("2026-11-23");
  });

  it("converte horas em dias úteis, não corridos", () => {
    // A mudança desta rodada. Em dias CORRIDOS, 40h dariam 2 dias (40/24) e o
    // início cairia em 09/12 — quase uma semana mais tarde do que a execução
    // aguenta, errando contra quem confiou na sugestão.
    expect(suggestedStartIso("2026-12-11", 40)).toBe("2026-12-07");
  });

  it("cala quando o fluxo não tem duração configurada", () => {
    // As 14 etapas do sistema estão hoje sem `expectedDurationHours`. Sem esta
    // guarda, todo fluxo não configurado sugeriria "comece hoje" — uma resposta
    // errada com cara de resposta, pior do que não responder.
    expect(suggestedStartIso("2026-12-11", null)).toBe("");
    expect(suggestedStartIso("2026-12-11", 0)).toBe("");
  });

  it("nunca sugere um início depois do prazo", () => {
    // Invariante do conceito inteiro: a demanda começa antes de vencer.
    for (const horas of [1, 8, 9, 40, 120, 500, 2000]) {
      const inicio = suggestedStartIso("2026-12-11", horas);
      expect(daysBetweenIso(inicio, "2026-12-11")!, `${horas}h`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("bufferDiasUteis — a gordura", () => {
  it("reserva 20% do tempo de execução", () => {
    // O exemplo dado: 40h de trabalho trazem outras 8h de folga = 1 dia.
    expect(bufferDiasUteis(40)).toBe(1);
    expect(bufferDiasUteis(120)).toBe(3); // 24h = 3 dias
    expect(bufferDiasUteis(200)).toBe(5); // 40h = 5 dias
  });

  it("nunca menos de um dia", () => {
    // Demanda que termina no mesmo dia em que é usada não tem para onde
    // escorregar — e é a que menos aguenta surpresa.
    expect(bufferDiasUteis(8)).toBe(1); // 20% de 8h = 1,6h → 1 dia
    expect(bufferDiasUteis(1)).toBe(1);
  });

  it("é proporcional: fluxo maior, folga maior", () => {
    // Risco cresce com duração. Um número fixo daria folga demais ao curto e de
    // menos ao longo, que é o que mais precisa.
    let anterior = 0;
    for (const h of [8, 40, 120, 200, 400]) {
      const atual = bufferDiasUteis(h);
      expect(atual).toBeGreaterThanOrEqual(anterior);
      anterior = atual;
    }
  });

  it("zero quando não há previsão", () => {
    expect(bufferDiasUteis(null)).toBe(0);
    expect(bufferDiasUteis(0)).toBe(0);
  });
});

describe("planningChain — a cadeia completa", () => {
  it("encadeia evento → entrega → conclusão → início", () => {
    // Natal sex 25/12, 14 dias de veiculação, fluxo de 120h (15 d.ú., gordura 3 d.ú.)
    const r = planningChain({
      eventoIso: "2026-12-25",
      antecedenciaDias: 14,
      totalHoras: 120,
    });
    expect(r.entrega).toBe("2026-12-11"); // sex — evento − 14 dias corridos
    expect(r.gorduraDias).toBe(3);
    expect(r.conclusao).toBe("2026-12-08"); // ter — 3 dias úteis antes
    expect(r.execDias).toBe(15);
    expect(r.inicio).toBe("2026-11-18"); // qua — 15 dias úteis, inclusivo
  });

  it("a conclusão vem antes da entrega sempre que há previsão", () => {
    // A razão de existir da gordura. Se as duas coincidirem, não há folga —
    // e isso só é aceitável no caso sem previsão, coberto acima.
    for (const horas of [1, 8, 40, 120, 500]) {
      const r = planningChain({ eventoIso: "2026-12-25", antecedenciaDias: 14, totalHoras: horas });
      expect(daysBetweenIso(r.conclusao, r.entrega)!, `${horas}h`).toBeGreaterThan(0);
    }
  });

  it("o início vem sempre antes da conclusão", () => {
    for (const horas of [8, 40, 120, 500]) {
      const r = planningChain({ eventoIso: "2026-12-25", antecedenciaDias: 14, totalHoras: horas });
      expect(daysBetweenIso(r.inicio, r.conclusao)!, `${horas}h`).toBeGreaterThanOrEqual(0);
    }
  });

  it("sem antecedência não há cadeia", () => {
    const r = planningChain({ eventoIso: "2026-12-25", antecedenciaDias: "", totalHoras: 120 });
    expect(r).toMatchObject({ entrega: "", conclusao: "", inicio: "" });
  });

  it("sem previsão nas etapas, degrada em vez de bloquear", () => {
    // Bloquear a cadeia inteira travaria a criação de demanda em todo fluxo ainda
    // não configurado — o gestor pararia no meio de uma tarefa por causa de um
    // cadastro que não é dele. A conclusão cai na entrega (sem gordura, porque não
    // há de quanto), e só o início sugerido some.
    const r = planningChain({ eventoIso: "2026-12-25", antecedenciaDias: 14, totalHoras: null });
    expect(r.entrega).toBe("2026-12-11");
    expect(r.conclusao).toBe("2026-12-11");
    expect(r.inicio).toBe("");
    expect(r.gorduraDias).toBe(0);
  });

  it("antecedência zero: usa no próprio dia do evento", () => {
    const r = planningChain({ eventoIso: "2026-12-25", antecedenciaDias: 0, totalHoras: 40 });
    expect(r.entrega).toBe("2026-12-25");
    expect(r.conclusao).toBe("2026-12-24"); // qui — 1 dia útil de gordura
  });
});

describe("mondaysTouchingMonth", () => {
  it("lista as segundas das semanas que tocam o mês", () => {
    // Agosto/2026: 01/08 é sábado, então a primeira semana começa em 27/07.
    const m = mondaysTouchingMonth(2026, 7);
    expect(m[0]).toBe("2026-07-27");
    expect(m).toContain("2026-08-31"); // semana que vaza para setembro
  });

  it("inclui a semana que atravessa a virada, nos DOIS meses", () => {
    // Sem isso a semana de 31/08–06/09 sumiria de um dos seletores e ficaria
    // inalcançável para quem a procurasse pelo mês "errado".
    expect(mondaysTouchingMonth(2026, 7)).toContain("2026-08-31");
    expect(mondaysTouchingMonth(2026, 8)).toContain("2026-08-31");
  });

  it("devolve só segundas-feiras", () => {
    for (const mes of [0, 1, 5, 11]) {
      for (const iso of mondaysTouchingMonth(2026, mes)) {
        expect(new Date(`${iso}T00:00:00.000Z`).getUTCDay(), iso).toBe(1);
      }
    }
  });

  it("as segundas são consecutivas, de 7 em 7 dias", () => {
    const m = mondaysTouchingMonth(2026, 7);
    for (let i = 1; i < m.length; i++) {
      expect(daysBetweenIso(m[i - 1], m[i])).toBe(7);
    }
  });

  it("cobre fevereiro bissexto sem furo", () => {
    const m = mondaysTouchingMonth(2028, 1);
    expect(m.length).toBeGreaterThanOrEqual(4);
    expect(m[0] <= "2028-02-01").toBe(true);
  });
});
