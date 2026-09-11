import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { NavigationProgress } from "@/components/NavigationProgress";
import { navegacaoIniciou, navegacaoTerminou, resetarNavegacao } from "@/lib/navigation-busy";

beforeEach(() => {
  vi.useFakeTimers();
  resetarNavegacao();
});
afterEach(() => vi.useRealTimers());

/** Avança o relógio dentro de `act`, senão o efeito do atraso não é processado. */
const avancar = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("NavigationProgress", () => {
  it("parada, não mostra nada", () => {
    render(<NavigationProgress />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("navegação CURTA não pisca a barra", () => {
    // Uma navegação servida do cache do roteador termina em poucas dezenas de ms. Acender e apagar
    // nesse intervalo registra como "alguma coisa piscou", não como "está carregando" — e piscada
    // faz a interface parecer menos estável, não mais.
    render(<NavigationProgress />);
    act(() => navegacaoIniciou());
    avancar(100);
    // A asserção que importa é ESTA, no meio: sem ela o teste passa mesmo com atraso zero, porque
    // a barra acenderia e apagaria antes do fim do caso — exatamente a piscada que se quer evitar.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => navegacaoTerminou());
    avancar(500);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("navegação LONGA acende a barra", () => {
    render(<NavigationProgress />);
    act(() => navegacaoIniciou());
    avancar(200);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("apaga quando a navegação termina", () => {
    render(<NavigationProgress />);
    act(() => navegacaoIniciou());
    avancar(200);
    act(() => navegacaoTerminou());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("com duas navegações sobrepostas, a barra fica até a ÚLTIMA terminar", () => {
    render(<NavigationProgress />);
    act(() => navegacaoIniciou());
    avancar(200);
    act(() => navegacaoIniciou());
    act(() => navegacaoTerminou());
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => navegacaoTerminou());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
