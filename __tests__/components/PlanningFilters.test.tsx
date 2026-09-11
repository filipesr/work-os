import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
let paramsAtuais = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/planning/week",
  useSearchParams: () => paramsAtuais,
}));

import { PlanningFilters, type PlanningFilterField } from "@/components/planning/PlanningFilters";

const PESSOAS = [
  { id: "u1", name: "Ana" },
  { id: "u2", name: "Bruno" },
  { id: "u3", name: "Carla" },
];

const LABELS = {
  title: "Filtros",
  subtitle: "Recorte o que a grade mostra.",
  clearAll: "Limpar todos os filtros",
  clearOne: (f: string) => `Remover filtro ${f}`,
  count: (campo: string, n: number) => `${campo}: ${n}`,
};

function montar(fields: PlanningFilterField[]) {
  return render(<PlanningFilters scope="teste" fields={fields} labels={LABELS} />);
}

const pessoas = (selected: string[]): PlanningFilterField => ({
  kind: "multi",
  param: "user",
  label: "Pessoas",
  options: PESSOAS,
  selected,
});

const concluidas = (checked: boolean): PlanningFilterField => ({
  kind: "check",
  param: "showCompleted",
  label: "Mostrar concluídas",
  checked,
});

beforeEach(() => {
  window.localStorage.clear();
  replace.mockClear();
  paramsAtuais = new URLSearchParams();
});

describe("PlanningFilters", () => {
  it("sem filtro ativo, o botão não mostra contagem", () => {
    montar([pessoas([]), concluidas(false)]);
    expect(screen.getByRole("button", { name: /Filtros/ })).toHaveTextContent(/^Filtros$/);
  });

  it("uma pessoa escolhida vira tag com o NOME dela", () => {
    montar([pessoas(["u2"])]);
    expect(screen.getByRole("button", { name: "Remover filtro Bruno" })).toBeInTheDocument();
  });

  it("várias viram contagem — quatro nomes não cabem numa tag", () => {
    montar([pessoas(["u1", "u2", "u3"])]);
    expect(screen.getByRole("button", { name: "Remover filtro Pessoas: 3" })).toBeInTheDocument();
  });

  it("a tag aparece FORA do diálogo, sem precisar abrir nada", () => {
    // É o que impede o pior caso do filtro persistido: abrir a tela recortada por uma escolha
    // antiga e achar que o trabalho sumiu.
    montar([pessoas(["u1"])]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("clicar na tag remove só aquele filtro", async () => {
    paramsAtuais = new URLSearchParams("user=u1&showCompleted=1");
    montar([pessoas(["u1"]), concluidas(true)]);
    await userEvent.click(screen.getByRole("button", { name: "Remover filtro Ana" }));
    expect(replace).toHaveBeenCalledWith("/planning/week?showCompleted=1", { scroll: false });
  });

  it("marcar uma pessoa ACRESCENTA à seleção, não substitui", async () => {
    paramsAtuais = new URLSearchParams("user=u1");
    montar([pessoas(["u1"])]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByLabelText("Carla"));
    expect(replace).toHaveBeenCalledWith("/planning/week?user=u1%2Cu3", { scroll: false });
  });

  it("desmarcar a última pessoa TIRA o parâmetro — vazio é todos, não nenhum", async () => {
    paramsAtuais = new URLSearchParams("user=u1");
    montar([pessoas(["u1"])]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByLabelText("Ana"));
    expect(replace).toHaveBeenCalledWith("/planning/week", { scroll: false });
  });

  it("o botão de limpar tudo só existe quando há o que limpar", async () => {
    montar([pessoas([])]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    expect(screen.queryByText("Limpar todos os filtros")).not.toBeInTheDocument();
  });

  it("limpar tudo remove todos os parâmetros da tela de uma vez", async () => {
    paramsAtuais = new URLSearchParams("user=u1&showCompleted=1&week=2026-09-07");
    montar([pessoas(["u1"]), concluidas(true)]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByText("Limpar todos os filtros"));
    // `week` é navegação, não filtro: limpar filtros não pode jogar a pessoa para outra semana.
    expect(replace).toHaveBeenCalledWith("/planning/week?week=2026-09-07", { scroll: false });
  });

  it("a escolha é guardada para a próxima visita", () => {
    paramsAtuais = new URLSearchParams("user=u1,u2");
    montar([pessoas(["u1", "u2"])]);
    expect(window.localStorage.getItem("workos:planning:filters:teste")).toContain("u1,u2");
  });
});
