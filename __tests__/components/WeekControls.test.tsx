import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const setParam = vi.fn();
vi.mock("@/lib/hooks/useUrlFilters", () => ({ useUrlFilters: () => ({ setParam }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((k: string) => k, { raw: () => [] }),
}));
vi.mock("@/components/shared/WeekNav", () => ({
  // A navegação de semana é testada no próprio componente; aqui só precisa render dos filhos.
  WeekNav: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { WeekControls } from "@/app/[locale]/(protected)/planning/week/WeekControls";

const TIMES = [
  { id: "t-video", name: "Video" },
  { id: "t-hr", name: "HR" },
  { id: "t-trafego", name: "Traffic" },
];

function abrir(props: Partial<React.ComponentProps<typeof WeekControls>> = {}) {
  render(
    <WeekControls
      monday={new Date("2026-08-31T00:00:00Z")}
      isCurrentWeek
      teams={TIMES}
      mode="default"
      {...props}
    />
  );
  // Radix abre por pointerdown/teclado, não por click: em jsdom o `click` não chega ao gatilho.
  // O teclado é o caminho determinístico — e de quebra prova que o menu abre sem mouse.
  fireEvent.keyDown(screen.getByRole("button", { name: /teamFilter/ }), { key: "Enter" });
}

beforeEach(() => vi.clearAllMocks());

describe("WeekControls — filtro múltiplo de times", () => {
  it("no padrão, NENHUMA equipe aparece marcada", () => {
    // As caixas representam escolha explícita, não o conteúdo do padrão. Marcá-las no padrão
    // obrigaria quem quer ver duas equipes a desmarcar todas as outras uma a uma — e o atalho de
    // filtrar viraria trabalho. O que o padrão mostra está dito na dica do próprio item.
    abrir();
    for (const nome of ["Video", "HR", "Traffic"]) {
      expect(screen.getByRole("menuitemcheckbox", { name: nome })).toHaveAttribute(
        "data-state",
        "unchecked"
      );
    }
  });

  it("no modo `todos` também não marca nada — ele é um modo, não uma seleção", () => {
    abrir({ mode: "all" });
    expect(screen.getByRole("menuitemcheckbox", { name: "HR" })).toHaveAttribute(
      "data-state",
      "unchecked"
    );
  });

  it("marcar um time a partir do padrão filtra SÓ por ele", () => {
    // O gesto de quem abre o menu no padrão e clica numa equipe é "quero ver esta", não "quero o
    // padrão mais esta".
    abrir();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "HR" }));
    expect(setParam).toHaveBeenCalledWith("team", "t-hr");
  });

  it("dentro de uma seleção explícita, o clique acumula", () => {
    // Aí sim as caixas dizem o que está aplicado, e clicar ajusta esse conjunto.
    abrir({ mode: ["t-video"] });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Traffic" }));
    expect(setParam).toHaveBeenCalledWith("team", "t-video,t-trafego");
  });

  it("desmarcar o último time volta ao padrão em vez de esvaziar a grade", () => {
    // "Vazio" já significa padrão; deixar a semana inteira em branco por desmarcar tudo seria
    // esconder trabalho sem que ninguém tenha pedido.
    abrir({ mode: ["t-video"] });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Video" }));
    expect(setParam).toHaveBeenCalledWith("team", null);
  });

  it("`Todos os times` pede o modo que mostra as equipes de apoio", () => {
    abrir();
    fireEvent.click(screen.getByRole("menuitem", { name: /teamsAll/ }));
    expect(setParam).toHaveBeenCalledWith("team", "all");
  });

  it("`Times de produção` limpa o parâmetro", () => {
    abrir({ mode: "all" });
    fireEvent.click(screen.getByRole("menuitem", { name: /teamsDefault/ }));
    expect(setParam).toHaveBeenCalledWith("team", null);
  });

  it("o gatilho diz em que estado a grade está", () => {
    // Um filtro que não anuncia o próprio recorte é como o gestor conclui que alguém não tem
    // trabalho na semana quando, na verdade, a equipe dela está fora da tela.
    const { rerender } = render(
      <WeekControls
        monday={new Date("2026-08-31T00:00:00Z")}
        isCurrentWeek
        teams={TIMES}
        mode="default"
      />
    );
    expect(screen.getByRole("button", { name: /teamFilter/ })).toHaveTextContent("teamsDefault");

    rerender(
      <WeekControls
        monday={new Date("2026-08-31T00:00:00Z")}
        isCurrentWeek
        teams={TIMES}
        mode={["t-video"]}
      />
    );
    expect(screen.getByRole("button", { name: /teamFilter/ })).toHaveTextContent("teamsCount");
  });
});
