import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let pendente = true;
vi.mock("react", async () => {
  const real = await vi.importActual<typeof import("react")>("react");
  return { ...real, useTransition: () => [pendente, (fn: () => void) => fn()] as const };
});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("team=tm1&user=u9"),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "pt-BR",
}));

import { WeekControls } from "@/app/[locale]/(protected)/planning/week/WeekControls";
import { ClientLoadControls } from "@/app/[locale]/(protected)/planning/client-load/ClientLoadControls";

const SEGUNDA = new Date(Date.UTC(2026, 8, 7));

beforeEach(() => {
  push.mockClear();
  pendente = true;
});

/**
 * As duas telas usam o MESMO controle do calendário. O que se prova aqui não é o desenho — é que
 * elas herdaram a mecânica inteira, e não uma cópia que vai divergir: o rótulo entre as setas, o
 * destino durante a carga e a preservação dos outros filtros ao trocar de semana.
 */
describe.each([
  ["mesa do gestor", WeekControls],
  ["carga por cliente", ClientLoadControls],
])("%s — navegação de período", (_nome, Controle) => {
  const montar = () =>
    render(<Controle monday={SEGUNDA} isCurrentWeek={false} label="07 de set. – 13 de set." />);

  it("mostra o período ENTRE as setas", () => {
    montar();
    expect(screen.getByRole("button", { name: /07 de set/ })).toBeInTheDocument();
  });

  it("ao avançar, o rótulo já mostra a semana de DESTINO", () => {
    montar();
    return userEvent.click(screen.getByLabelText("next.week")).then(() => {
      expect(screen.getByRole("button", { name: /14 de set/ })).toBeInTheDocument();
    });
  });

  it("trocar de semana preserva os outros filtros", async () => {
    montar();
    await userEvent.click(screen.getByLabelText("next.week"));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("team=tm1"), { scroll: false });
    expect(push).toHaveBeenCalledWith(expect.stringContaining("user=u9"), { scroll: false });
  });

  it("`hoje` só aparece quando leva a algum lugar", () => {
    montar();
    expect(screen.getByText("today")).toBeInTheDocument();
  });
});
