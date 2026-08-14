import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key}:${JSON.stringify(vals)}` : key,
  useLocale: () => "pt-BR",
}));

const setParam = vi.fn();
const setParams = vi.fn();
vi.mock("@/lib/hooks/useUrlFilters", () => ({
  useUrlFilters: () => ({ setParam, setParams }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/planning/calendar/week",
}));

import { CalendarToolbar } from "@/app/[locale]/(protected)/planning/calendar/CalendarToolbar";

const TEAMS = [{ id: "tm1", name: "Criação" }];
const PROJECTS = [{ id: "p1", name: "Social Acme" }];
const USERS = [{ id: "u1", name: "Ana" }];

function abrir(selected: Parameters<typeof CalendarToolbar>[0]["selected"]) {
  return render(
    <CalendarToolbar
      view="week"
      anchor={new Date("2026-08-10T00:00:00Z")}
      periodLabel="10 de ago. – 16 de ago."
      isCurrentPeriod={false}
      planning={false}
      teams={TEAMS}
      projects={PROJECTS}
      users={USERS}
      selected={selected}
    />
  );
}

const SEM_FILTRO = { showCompleted: false };

/**
 * Os filtros foram para um diálogo, o que resolve o amontoado da barra mas cria
 * um risco novo: esconder que HÁ filtro ativo. Olhar uma semana recortada
 * achando que é a semana inteira é o erro caro aqui — e ele é silencioso, porque
 * a tela parece normal.
 *
 * Por isso o que estes testes protegem não é o diálogo abrir; é o filtro ligado
 * continuar visível fora dele.
 */
describe("CalendarToolbar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem filtro, nenhuma tag e nenhuma contagem", () => {
    abrir(SEM_FILTRO);
    expect(screen.getByRole("button", { name: /^title/ }).textContent).not.toMatch(/\d/);
  });

  it("filtro ativo vira tag com o NOME, não com o id", () => {
    // O id não diz nada a quem lê. A tag existe para responder "o que estou
    // vendo a menos?" de relance.
    abrir({ teamId: "tm1", showCompleted: false });
    expect(screen.getByRole("button", { name: /Criação/ })).toBeInTheDocument();
  });

  it("conta os filtros ativos no botão", () => {
    abrir({ teamId: "tm1", projectId: "p1", userId: "u1", showCompleted: true });
    expect(screen.getByRole("button", { name: /^title/ }).textContent).toContain("4");
  });

  it("clicar na tag remove aquele filtro", () => {
    abrir({ projectId: "p1", showCompleted: false });
    screen.getByRole("button", { name: /Social Acme/ }).click();
    expect(setParam).toHaveBeenCalledWith("project", null);
  });

  it('"mostrar concluídas" também é filtro e também vira tag', () => {
    // É botão, não select — e por isso passava despercebido como recorte. Ele
    // muda o que a grade mostra igual aos outros.
    abrir({ showCompleted: true });
    // O nome acessível da tag é o aria-label de remoção, que embute o rótulo.
    expect(screen.getByRole("button", { name: /clearOne.*showCompleted/ })).toBeInTheDocument();
  });

  it("trocar o time limpa a pessoa junto", async () => {
    // A pessoa selecionada pode não pertencer ao novo time; mantê-la filtraria
    // por alguém que nem aparece no seletor.
    const user = userEvent.setup();
    abrir(SEM_FILTRO);
    await user.click(screen.getByRole("button", { name: /^title/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: /^team/ }), "tm1");
    expect(setParams).toHaveBeenCalledWith({ team: "tm1", user: null });
  });
});
