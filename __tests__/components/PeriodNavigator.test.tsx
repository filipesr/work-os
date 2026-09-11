import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// A transição fica PENDENTE à força. Com o roteador simulado, `router.push` retorna na hora e o
// React encerra a transição no mesmo instante — a janela em que o rótulo mostra o destino não
// chega a existir no teste, embora seja o segundo e meio inteiro em produção.
let pendente = true;
vi.mock("react", async () => {
  const real = await vi.importActual<typeof import("react")>("react");
  return {
    ...real,
    useTransition: () => [pendente, (fn: () => void) => fn()] as const,
  };
});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "pt-BR",
}));

import { PeriodNavigator } from "@/components/planning/period/PeriodNavigator";

beforeEach(() => {
  push.mockClear();
  pendente = true;
});

/**
 * O rótulo entre as setas precisa dizer para ONDE está indo, e não ficar no período de onde saiu.
 * Apagar "janeiro", girar, e só então mostrar "fevereiro" faz a espera inteira passar sem informar
 * o destino — sendo que o destino é conhecido no instante do clique.
 */
describe("PeriodNavigator — o rótulo durante a navegação", () => {
  const props = {
    view: "month" as const,
    anchor: new Date(Date.UTC(2026, 0, 1)),
    label: "janeiro de 2026",
    isCurrent: false,
  };

  it("parado, mostra o período em tela", () => {
    render(<PeriodNavigator {...props} />);
    expect(screen.getByRole("button", { name: /janeiro de 2026/ })).toBeInTheDocument();
  });

  it("ao avançar, o rótulo troca para FEVEREIRO na hora do clique", async () => {
    render(<PeriodNavigator {...props} />);
    await userEvent.click(screen.getByLabelText("next.month"));
    expect(screen.getByRole("button", { name: /fevereiro de 2026/ })).toBeInTheDocument();
  });

  it("ao voltar, troca para DEZEMBRO do ano anterior", async () => {
    render(<PeriodNavigator {...props} />);
    await userEvent.click(screen.getByLabelText("previous.month"));
    expect(screen.getByRole("button", { name: /dezembro de 2025/ })).toBeInTheDocument();
  });

  it("na semana, o destino é o intervalo da semana vizinha", async () => {
    render(
      <PeriodNavigator
        view="week"
        anchor={new Date(Date.UTC(2026, 8, 7))}
        label="07 de set. – 13 de set."
        isCurrent={false}
      />
    );
    await userEvent.click(screen.getByLabelText("next.week"));
    expect(screen.getByRole("button", { name: /14 de set/ })).toBeInTheDocument();
  });

  it("terminada a navegação, o rótulo volta a ser o do servidor", async () => {
    // O destino é um palpite local com prazo de validade: quando a resposta chega, quem manda é o
    // rótulo que o servidor mandou, senão um destino antigo ficaria colado sobre o período real.
    pendente = false;
    render(<PeriodNavigator {...props} />);
    await userEvent.click(screen.getByLabelText("next.month"));
    expect(screen.getByRole("button", { name: /janeiro de 2026/ })).toBeInTheDocument();
  });

  it("em `hoje` o rótulo NÃO muda — qual é o período atual é pergunta do servidor", async () => {
    // Calcular `new Date()` aqui divergiria do servidor perto da virada do dia, e o rótulo
    // afirmaria um período que a grade não vai mostrar. Menos informação, nunca errada.
    render(<PeriodNavigator {...props} />);
    await userEvent.click(screen.getByText("today"));
    expect(screen.getByRole("button", { name: /janeiro de 2026/ })).toBeInTheDocument();
  });
});
