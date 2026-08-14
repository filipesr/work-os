import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("team=tm1&plan=1"),
}));

import { PeriodPicker } from "@/app/[locale]/(protected)/planning/calendar/PeriodPicker";

const abrirSeletor = async (user: ReturnType<typeof userEvent.setup>, rotulo: string) =>
  user.click(screen.getByRole("button", { name: rotulo }));

/**
 * O rótulo da data virou o alvo do seletor. A navegação de setas resolve "o
 * período vizinho"; não resolve "novembro", que a três cliques vira contagem.
 */
describe("PeriodPicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("na visão de mês, oferece os 12 meses e navega mantendo os filtros", async () => {
    const user = userEvent.setup();
    render(
      <PeriodPicker view="month" anchor={new Date("2026-08-01T00:00:00Z")} label="ago/2026" />
    );

    await abrirSeletor(user, "ago/2026");
    await user.click(screen.getByRole("button", { name: /^nov/ }));

    // O filtro de time sobrevive à escolha; só a âncora de período muda. Perder
    // o filtro ao trocar de mês foi um bug real desta tela no passado.
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain("month=2026-11");
    expect(url).toContain("team=tm1");
    expect(url).toContain("plan=1");
  });

  it("na visão de semana, oferece INTERVALOS, não números de semana", async () => {
    // "Semana 33" não diz nada a ninguém. Quem procura a semana do dia 12
    // procura por "10 – 16 de ago.".
    const user = userEvent.setup();
    render(
      <PeriodPicker view="week" anchor={new Date("2026-08-10T00:00:00Z")} label="10 – 16 de ago." />
    );

    await abrirSeletor(user, "10 – 16 de ago.");
    expect(screen.getByRole("button", { name: /10 de ago\..*16 de ago\./ })).toBeInTheDocument();
  });

  it("escolher a semana troca só a âncora de semana", async () => {
    const user = userEvent.setup();
    render(
      <PeriodPicker view="week" anchor={new Date("2026-08-10T00:00:00Z")} label="10 – 16 de ago." />
    );

    await abrirSeletor(user, "10 – 16 de ago.");
    await user.click(screen.getByRole("button", { name: /17 de ago\./ }));

    const url = push.mock.calls[0][0] as string;
    expect(url).toContain("week=2026-08-17");
    expect(url).not.toContain("month=");
  });

  it("marca o período atual como selecionado", async () => {
    const user = userEvent.setup();
    render(
      <PeriodPicker view="month" anchor={new Date("2026-08-01T00:00:00Z")} label="ago/2026" />
    );

    await abrirSeletor(user, "ago/2026");
    expect(screen.getByRole("button", { name: /^ago/ })).toHaveAttribute("aria-current", "true");
  });

  it("navegar DENTRO do seletor não muda a tela por trás", async () => {
    // Explorar meses para escolher não deveria já mover o calendário; só o
    // clique numa opção navega.
    const user = userEvent.setup();
    render(
      <PeriodPicker view="month" anchor={new Date("2026-08-01T00:00:00Z")} label="ago/2026" />
    );

    await abrirSeletor(user, "ago/2026");
    await user.click(screen.getByRole("button", { name: "next.month" }));
    expect(push).not.toHaveBeenCalled();
  });
});
