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
      selectedIds={["t-video", "t-trafego"]}
      {...props}
    />
  );
  // Radix abre por pointerdown/teclado, não por click: em jsdom o `click` não chega ao gatilho.
  // O teclado é o caminho determinístico — e de quebra prova que o menu abre sem mouse.
  fireEvent.keyDown(screen.getByRole("button", { name: /teamFilter/ }), { key: "Enter" });
}

beforeEach(() => vi.clearAllMocks());

describe("WeekControls — filtro múltiplo de times", () => {
  it("no padrão, os times de produção já aparecem marcados", () => {
    // O que está marcado é o que se está vendo. Abrir o menu com tudo desmarcado enquanto a grade
    // mostra os operacionais faria o controle contradizer a tela.
    abrir();
    expect(screen.getByRole("menuitemcheckbox", { name: "Video" })).toHaveAttribute(
      "data-state",
      "checked"
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "HR" })).toHaveAttribute(
      "data-state",
      "unchecked"
    );
  });

  it("marcar um time a partir do padrão vira seleção específica com o conjunto visível", () => {
    // O clique ajusta o que está à vista: produção + HR, e não "só HR".
    abrir();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "HR" }));
    expect(setParam).toHaveBeenCalledWith("team", "t-video,t-trafego,t-hr");
  });

  it("desmarcar o último time volta ao padrão em vez de esvaziar a grade", () => {
    // "Vazio" já significa padrão; deixar a semana inteira em branco por desmarcar tudo seria
    // esconder trabalho sem que ninguém tenha pedido.
    abrir({ mode: ["t-video"], selectedIds: ["t-video"] });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Video" }));
    expect(setParam).toHaveBeenCalledWith("team", null);
  });

  it("`Todos os times` pede o modo que mostra as equipes de apoio", () => {
    abrir();
    fireEvent.click(screen.getByRole("menuitem", { name: /teamsAll/ }));
    expect(setParam).toHaveBeenCalledWith("team", "all");
  });

  it("`Times de produção` limpa o parâmetro", () => {
    abrir({ mode: "all", selectedIds: ["t-video", "t-hr", "t-trafego"] });
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
        selectedIds={["t-video", "t-trafego"]}
      />
    );
    expect(screen.getByRole("button", { name: /teamFilter/ })).toHaveTextContent("teamsDefault");

    rerender(
      <WeekControls
        monday={new Date("2026-08-31T00:00:00Z")}
        isCurrentWeek
        teams={TIMES}
        mode={["t-video"]}
        selectedIds={["t-video"]}
      />
    );
    expect(screen.getByRole("button", { name: /teamFilter/ })).toHaveTextContent("teamsCount");
  });
});
