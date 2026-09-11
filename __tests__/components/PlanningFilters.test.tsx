import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
let paramsAtuais = new URLSearchParams();

// As mensagens saem do próprio componente (`useTranslations`), e não de propriedades: função não
// atravessa a fronteira do servidor para o cliente, e passar `clearOne` como prop quebrava a tela
// em execução sem quebrar o build nem este teste. O dublê imita o formatador do next-intl.
const MENSAGENS: Record<string, string> = {
  filtersTitle: "Filtros",
  filtersSubtitle: "Recorte o que a grade mostra.",
  clearAll: "Limpar todos os filtros",
  clearOne: "Remover filtro {filter}",
  selectedCount: "{label}: {count}",
  apply: "Aplicar",
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) => {
    const bruto = MENSAGENS[key] ?? key;
    return Object.entries(vals ?? {}).reduce(
      (txt, [k, v]) => txt.replace(`{${k}}`, String(v)),
      bruto
    );
  },
}));

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

function montar(fields: PlanningFilterField[]) {
  return render(<PlanningFilters scope="teste" namespace="planning.teste" fields={fields} />);
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

  it("clicar na tag remove só aquele filtro, na hora", async () => {
    // A tag é ação direta, não rascunho: quem clica no X já confirmou ao clicar.
    paramsAtuais = new URLSearchParams("user=u1&showCompleted=1");
    montar([pessoas(["u1"]), concluidas(true)]);
    await userEvent.click(screen.getByRole("button", { name: "Remover filtro Ana" }));
    expect(replace).toHaveBeenCalledWith("/planning/week?showCompleted=1", { scroll: false });
  });

  it("mexer no diálogo NÃO recarrega a tela — só o Aplicar dispara", async () => {
    // Sem isto, escolher quatro pessoas recarregava a grade quatro vezes, e as três primeiras
    // mostravam um recorte que ninguém pediu.
    paramsAtuais = new URLSearchParams("user=u1");
    montar([pessoas(["u1"]), concluidas(false)]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByLabelText("Carla"));
    await userEvent.click(screen.getByLabelText("Mostrar concluídas"));
    expect(replace).not.toHaveBeenCalled();
  });

  it("Aplicar manda tudo de uma vez", async () => {
    paramsAtuais = new URLSearchParams("user=u1");
    montar([pessoas(["u1"]), concluidas(false)]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByLabelText("Carla"));
    await userEvent.click(screen.getByLabelText("Mostrar concluídas"));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/planning/week?user=u1%2Cu3&showCompleted=1", {
      scroll: false,
    });
  });

  it("fechar sem aplicar descarta o rascunho", async () => {
    paramsAtuais = new URLSearchParams("user=u1");
    const { rerender } = montar([pessoas(["u1"])]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByLabelText("Carla"));
    await userEvent.keyboard("{Escape}");
    expect(replace).not.toHaveBeenCalled();

    // Reabrir mostra o que está APLICADO, não o que foi abandonado.
    rerender(
      <PlanningFilters scope="teste" namespace="planning.teste" fields={[pessoas(["u1"])]} />
    );
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    expect(screen.getByLabelText("Carla")).not.toBeChecked();
    expect(screen.getByLabelText("Ana")).toBeChecked();
  });

  it("desmarcar a última pessoa e aplicar TIRA o parâmetro — vazio é todos, não nenhum", async () => {
    paramsAtuais = new URLSearchParams("user=u1");
    montar([pessoas(["u1"])]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByLabelText("Ana"));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(replace).toHaveBeenCalledWith("/planning/week", { scroll: false });
  });

  it("o botão de limpar tudo só existe quando há o que limpar", async () => {
    montar([pessoas([])]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    expect(screen.queryByText("Limpar todos os filtros")).not.toBeInTheDocument();
  });

  it("limpar tudo também é rascunho — some das caixas, e só o Aplicar grava", async () => {
    paramsAtuais = new URLSearchParams("user=u1&showCompleted=1&week=2026-09-07");
    montar([pessoas(["u1"]), concluidas(true)]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByText("Limpar todos os filtros"));
    expect(screen.getByLabelText("Ana")).not.toBeChecked();
    expect(replace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    // `week` é navegação, não filtro: limpar filtros não pode jogar a pessoa para outra semana.
    expect(replace).toHaveBeenCalledWith("/planning/week?week=2026-09-07", { scroll: false });
  });

  it("um campo pode LIMPAR outro ao mudar", async () => {
    // A dependência real: trocar a equipe limpa a pessoa, que pode não pertencer à nova. Mantê-la
    // filtraria por alguém que nem aparece no seletor, e a grade viria vazia sem explicar por quê.
    paramsAtuais = new URLSearchParams("user=u1");
    montar([
      {
        kind: "single",
        param: "team",
        label: "Equipe",
        allLabel: "Todas",
        options: [{ id: "tm1", name: "Criação" }],
        selected: undefined,
        clears: ["user"],
      },
      pessoas(["u1"]),
    ]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Equipe/ }), "tm1");
    expect(screen.getByLabelText("Ana")).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(replace).toHaveBeenCalledWith("/planning/week?team=tm1", { scroll: false });
  });

  it("a escolha é guardada para a próxima visita", () => {
    paramsAtuais = new URLSearchParams("user=u1,u2");
    montar([pessoas(["u1", "u2"])]);
    expect(window.localStorage.getItem("workos:planning:filters:teste")).toContain("u1,u2");
  });
});

// O filtro de equipes da mesa não é seleção múltipla comum: ele tem TRÊS estados, e o padrão (sem
// parâmetro) esconde as equipes de apoio. Ver lib/planning/team-filter.ts.
describe("PlanningFilters — campo de modos", () => {
  const TIMES = [
    { id: "t1", name: "Criação" },
    { id: "t2", name: "Vídeo" },
  ];

  const equipes = (selected: string[], activeMode: string): PlanningFilterField => ({
    kind: "modes",
    param: "team",
    label: "Equipes",
    modes: [
      { value: "", label: "Times de produção", hint: "sem os times de apoio" },
      { value: "all", label: "Todos os times" },
    ],
    options: TIMES,
    selected,
    activeMode,
  });

  it("no padrão não há tag — o padrão não é um recorte que alguém pediu", () => {
    montar([equipes([], "")]);
    expect(screen.queryByRole("button", { name: /Remover filtro/ })).not.toBeInTheDocument();
  });

  it("o modo 'todos' vira tag, porque é escolha explícita", () => {
    montar([equipes([], "all")]);
    expect(
      screen.getByRole("button", { name: "Remover filtro Todos os times" })
    ).toBeInTheDocument();
  });

  it("no padrão, NENHUMA equipe aparece marcada", async () => {
    // Marcá-las obrigaria quem quer ver duas equipes a desmarcar todas as outras uma a uma, e o
    // atalho de filtrar viraria trabalho.
    montar([equipes([], "")]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    expect(screen.getByLabelText("Criação")).not.toBeChecked();
    expect(screen.getByLabelText("Vídeo")).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Times de produção/ })).toBeChecked();
  });

  it("no modo `todos` também não marca nada — ele é um modo, não uma seleção", async () => {
    montar([equipes([], "all")]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    expect(screen.getByLabelText("Criação")).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Todos os times" })).toBeChecked();
  });

  it("dentro de uma seleção explícita, o clique ACUMULA", async () => {
    paramsAtuais = new URLSearchParams("team=t1");
    montar([equipes(["t1"], "")]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByLabelText("Vídeo"));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(replace).toHaveBeenCalledWith("/planning/week?team=t1%2Ct2", { scroll: false });
  });

  it("escolher um modo é rascunho; aplicar é que grava", async () => {
    montar([equipes([], "")]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Todos os times" }));
    expect(replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(replace).toHaveBeenCalledWith("/planning/week?team=all", { scroll: false });
  });

  it("marcar uma equipe sai do modo e vira lista", async () => {
    montar([equipes([], "all")]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByLabelText("Vídeo"));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(replace).toHaveBeenCalledWith("/planning/week?team=t2", { scroll: false });
  });

  it("voltar ao padrão TIRA o parâmetro, em vez de gravar vazio", async () => {
    paramsAtuais = new URLSearchParams("team=t1");
    montar([equipes(["t1"], "")]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    // O rótulo do padrão inclui a dica ("sem os times de apoio"), então a busca é por papel.
    await userEvent.click(screen.getByRole("radio", { name: /Times de produção/ }));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(replace).toHaveBeenCalledWith("/planning/week", { scroll: false });
  });

  it("desmarcar a última equipe volta ao PADRÃO, não a uma grade vazia", async () => {
    paramsAtuais = new URLSearchParams("team=t1");
    montar([equipes(["t1"], "")]);
    await userEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    await userEvent.click(screen.getByLabelText("Criação"));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(replace).toHaveBeenCalledWith("/planning/week", { scroll: false });
  });
});
