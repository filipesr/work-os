import { describe, expect, it } from "vitest";
import { periodLabel } from "@/lib/calendar/period-label";

const SEGUNDA = new Date(Date.UTC(2026, 8, 7)); // 07/09/2026, segunda-feira
const PRIMEIRO_DE_SETEMBRO = new Date(Date.UTC(2026, 8, 1));

describe("periodLabel", () => {
  it("mês: nome do mês e ano", () => {
    expect(periodLabel("month", PRIMEIRO_DE_SETEMBRO, "pt-BR")).toBe("setembro de 2026");
  });

  it("mês: segue o idioma", () => {
    expect(periodLabel("month", PRIMEIRO_DE_SETEMBRO, "es-ES")).toBe("septiembre de 2026");
  });

  it("semana: intervalo do primeiro ao último dia", () => {
    // O início é a PRÓPRIA segunda. Sem `timeZone: UTC` a tela mostrava "06 de set." para quem abre
    // no Brasil — meia-noite UTC lida no fuso local cai no domingo anterior, e a semana inteira
    // parecia começar um dia antes.
    expect(periodLabel("week", SEGUNDA, "pt-BR")).toBe("07 de set. – 13 de set.");
  });

  it("semana: o mesmo rótulo em qualquer fuso — não depende da máquina", () => {
    const antes = process.env.TZ;
    try {
      process.env.TZ = "America/Sao_Paulo";
      const spo = periodLabel("week", SEGUNDA, "pt-BR");
      process.env.TZ = "Asia/Tokyo";
      const tyo = periodLabel("week", SEGUNDA, "pt-BR");
      expect(spo).toBe(tyo);
    } finally {
      process.env.TZ = antes;
    }
  });

  it("semana que atravessa o mês mostra os dois meses", () => {
    // 28/09 é segunda; a semana termina em 04/10.
    expect(periodLabel("week", new Date(Date.UTC(2026, 8, 28)), "pt-BR")).toBe(
      "28 de set. – 04 de out."
    );
  });
});
