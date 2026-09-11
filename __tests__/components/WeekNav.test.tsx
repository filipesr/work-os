import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("team=tm1"),
}));

import { WeekNav } from "@/components/shared/WeekNav";
import { navegacoesEmVoo, resetarNavegacao } from "@/lib/navigation-busy";

const LABELS = { previous: "Semana anterior", next: "Próxima semana", current: "Semana atual" };

function montar(isCurrentWeek = false) {
  return render(
    <WeekNav
      monday={new Date("2026-09-07T00:00:00Z")}
      isCurrentWeek={isCurrentWeek}
      labels={LABELS}
    />
  );
}

beforeEach(() => {
  push.mockClear();
  resetarNavegacao();
});

/**
 * Trocar de semana muda só o PARÂMETRO, não a rota: o `loading.tsx` não dispara, e sem transição a
 * tela antiga fica intacta por um a dois segundos (o banco está a ~300ms de ida e volta). Quem
 * clicou conclui que o clique não pegou — e clica de novo.
 */
describe("WeekNav", () => {
  it("o link continua sendo um link de verdade, com a semana no href", () => {
    // É o que permite abrir a próxima semana em outra aba, e o que dá o `prefetch` do Next.
    montar();
    expect(screen.getByLabelText("Próxima semana")).toHaveAttribute(
      "href",
      expect.stringContaining("week=2026-09-14")
    );
  });

  it("preserva os outros filtros ao trocar de semana", () => {
    montar();
    expect(screen.getByLabelText("Próxima semana")).toHaveAttribute(
      "href",
      expect.stringContaining("team=tm1")
    );
  });

  it("clique simples navega por transição, não pelo navegador", async () => {
    montar();
    await userEvent.click(screen.getByLabelText("Próxima semana"));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("week=2026-09-14"), {
      scroll: false,
    });
  });

  it("clique com Ctrl NÃO é interceptado — a aba nova continua funcionando", async () => {
    // A MESMA instância de `userEvent` precisa segurar a tecla e clicar: cada chamada solta do
    // `userEvent.*` cria uma sessão nova, e o modificador não atravessa de uma para outra.
    const u = userEvent.setup();
    montar();
    await u.keyboard("{Control>}");
    await u.click(screen.getByLabelText("Próxima semana"));
    await u.keyboard("{/Control}");
    expect(push).not.toHaveBeenCalled();
  });

  it("`Semana atual` só aparece quando leva a algum lugar", () => {
    const { unmount } = montar(true);
    expect(screen.queryByText("Semana atual")).not.toBeInTheDocument();
    unmount();
    montar(false);
    expect(screen.getByText("Semana atual")).toBeInTheDocument();
  });

  it("parado, nada em voo", () => {
    montar();
    expect(navegacoesEmVoo()).toBe(0);
  });
});
