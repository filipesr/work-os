import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key}:${JSON.stringify(vals)}` : key,
  useLocale: () => "pt-BR",
}));

let paramsAtuais = new URLSearchParams();
const setParam = vi.fn();
const setParams = vi.fn();
vi.mock("@/lib/hooks/useUrlFilters", () => ({
  useUrlFilters: () => ({ setParam, setParams }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => paramsAtuais,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/planning/calendar/week",
}));

import { CalendarToolbar } from "@/app/[locale]/(protected)/planning/calendar/CalendarToolbar";

const props = {
  anchor: new Date("2026-09-07T00:00:00Z"),
  periodLabel: "Semana",
  isCurrentPeriod: true,
  planning: false,
  teams: [{ id: "tm1", name: "Criação" }],
  projects: [{ id: "p1", name: "Social Acme" }],
  users: [{ id: "u1", name: "Ana" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  paramsAtuais = new URLSearchParams();
});

/**
 * A visão SEMANAL compartilha a barra com a mensal, e é justamente por isso que ela precisa de
 * teste próprio: o que vale para as duas é fácil de assumir e difícil de perceber quando deixa de
 * valer. O que se prova aqui é o que DIFERE ou o que poderia se perder num ajuste feito pensando
 * só no mês.
 */
describe("CalendarToolbar — visão semanal", () => {
  it("também só aplica no Aplicar, como a mensal", async () => {
    const u = userEvent.setup();
    render(<CalendarToolbar view="week" {...props} selected={{ showCompleted: false }} />);
    await u.click(screen.getByRole("button", { name: /^filtersTitle/ }));
    await u.selectOptions(screen.getByRole("combobox", { name: /^team/ }), "tm1");
    expect(setParams).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "apply" }));
    expect(setParams).toHaveBeenCalledWith(expect.objectContaining({ team: "tm1" }));
  });

  it("não oferece tipo de data nem país — a semana não desenha datas", async () => {
    const u = userEvent.setup();
    render(<CalendarToolbar view="week" {...props} selected={{ showCompleted: false }} />);
    await u.click(screen.getByRole("button", { name: /^filtersTitle/ }));
    expect(screen.queryByRole("combobox", { name: /^dateKind/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /^country/ })).not.toBeInTheDocument();
  });

  it("guarda o filtro numa chave PRÓPRIA, sem herdar a do mês", async () => {
    paramsAtuais = new URLSearchParams("team=tm1");
    render(
      <CalendarToolbar view="week" {...props} selected={{ teamId: "tm1", showCompleted: false }} />
    );
    expect(window.localStorage.getItem("workos:planning:filters:calendar-week")).toBeTruthy();
    expect(window.localStorage.getItem("workos:planning:filters:calendar-month")).toBeNull();
  });
});
