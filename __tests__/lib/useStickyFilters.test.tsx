import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const replace = vi.fn();
let paramsAtuais = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/planning/week",
  useSearchParams: () => paramsAtuais,
}));

import { useStickyFilters } from "@/lib/hooks/useStickyFilters";
import { storageKey } from "@/lib/planning/sticky-filters";

const CHAVES = ["team", "user"];

function Tela() {
  useStickyFilters("week", CHAVES);
  return <span>tela</span>;
}

beforeEach(() => {
  window.localStorage.clear();
  replace.mockClear();
  paramsAtuais = new URLSearchParams();
});

describe("useStickyFilters", () => {
  it("URL vazia + nada salvo: não navega", () => {
    render(<Tela />);
    expect(screen.getByText("tela")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("URL vazia + filtro salvo: restaura reescrevendo a URL", () => {
    window.localStorage.setItem(storageKey("week"), JSON.stringify({ team: "t1,t2" }));
    render(<Tela />);
    expect(replace).toHaveBeenCalledWith("/planning/week?team=t1%2Ct2", { scroll: false });
  });

  it("restaurar NÃO apaga o que foi restaurado", () => {
    // A gravação só pode começar depois que os filtros restaurados chegarem à URL. Se o hook se
    // desse por pronto no mesmo instante em que dispara a navegação, o efeito de gravação salvaria
    // o estado VAZIO por cima do que acabou de ser lido — e o filtro sobreviveria a exatamente um
    // carregamento antes de sumir sozinho.
    window.localStorage.setItem(storageKey("week"), JSON.stringify({ team: "t1,t2" }));
    render(<Tela />);
    expect(JSON.parse(window.localStorage.getItem(storageKey("week"))!)).toEqual({
      team: "t1,t2",
    });
  });

  it("a URL GANHA do salvo — link compartilhado mostra o que ele diz", () => {
    // Sem isto, o mesmo link abriria diferente para cada pessoa, conforme o que cada uma tivesse
    // filtrado antes. É o oposto do que um link serve para fazer.
    window.localStorage.setItem(storageKey("week"), JSON.stringify({ team: "t1" }));
    paramsAtuais = new URLSearchParams("user=u9");
    render(<Tela />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("o que está na URL é salvo para a próxima visita", () => {
    paramsAtuais = new URLSearchParams("team=t3&user=u9&outro=x");
    render(<Tela />);
    // `outro` não é chave desta tela e não entra no armazenamento.
    expect(JSON.parse(window.localStorage.getItem(storageKey("week"))!)).toEqual({
      team: "t3",
      user: "u9",
    });
  });

  it("abrir SEM filtro depois de limpar não ressuscita o antigo", () => {
    // A tela salva o estado vazio quando a pessoa limpa; o carregamento seguinte não tem o que
    // restaurar. Sem isto, "limpar filtros" duraria até o próximo F5.
    window.localStorage.setItem(storageKey("week"), JSON.stringify({ team: "t1" }));
    paramsAtuais = new URLSearchParams("user=u9");
    const { unmount } = render(<Tela />);
    unmount();
    expect(JSON.parse(window.localStorage.getItem(storageKey("week"))!)).toEqual({ user: "u9" });
  });
});
