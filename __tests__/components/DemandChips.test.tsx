import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

import { DemandChips } from "@/app/[locale]/(protected)/planning/coverage/DemandChips";
import type { OccurrenceTask } from "@/lib/actions/weekly-coverage";
import type { DemandState } from "@/lib/calendar/demand-state";

function tarefa(state: DemandState, over: Partial<OccurrenceTask> = {}): OccurrenceTask {
  return {
    id: `t-${state}`,
    title: "Post de Natal",
    clientName: "Acme",
    projectName: "Social",
    status: "IN_PROGRESS",
    dueDateIso: "2026-12-08",
    assigneeNames: ["Ana"],
    state,
    ...over,
  };
}

const chip = (state: DemandState) =>
  screen.getByRole("button", { name: new RegExp(`state\\.${state}`) });

/**
 * A tela existe para responder "cada cliente tem demanda em execução ou
 * executada para esta data?". Antes, a demanda concluída lia como ausência — o
 * cliente parecia descoberto justamente porque o trabalho tinha terminado.
 */
describe("DemandChips — a cor conta o desfecho", () => {
  it("entregue lê como boa notícia", () => {
    render(<DemandChips tasks={[tarefa("delivered")]} onPick={vi.fn()} />);
    expect(chip("delivered").className).toContain("text-success");
  });

  it("atrasada e em risco se distinguem entre si", () => {
    // Uma pede socorro, a outra pede atenção. Mesmo tom apagaria a diferença
    // entre "o prazo passou" e "ainda dá tempo, mas ninguém pegou".
    render(<DemandChips tasks={[tarefa("late"), tarefa("atRisk")]} onPick={vi.fn()} />);
    expect(chip("late").className).toContain("text-danger");
    expect(chip("atRisk").className).toContain("text-warning");
  });

  it("marca com ponto quem pede ação — cor sozinha não basta", () => {
    // ~8% dos homens não distingue vermelho de verde, e é exatamente esse par
    // que separa "entregue" de "atrasada" aqui.
    render(<DemandChips tasks={[tarefa("late"), tarefa("delivered")]} onPick={vi.fn()} />);
    expect(chip("late").textContent).toContain("●");
    expect(chip("delivered").textContent).not.toContain("●");
  });

  it("o estado é lido por leitor de tela, não só visto", () => {
    render(<DemandChips tasks={[tarefa("atRisk")]} onPick={vi.fn()} />);
    // O nome acessível do botão inclui o estado (via texto sr-only).
    expect(screen.getByRole("button", { name: /state\.atRisk/ })).toBeInTheDocument();
  });

  it("planejada fica no repouso do contexto", () => {
    // Sem desfecho a relatar, a tag volta a distinguir campanha de operação —
    // que é a informação útil quando não há nada de errado.
    const { rerender } = render(
      <DemandChips tasks={[tarefa("planned")]} onPick={vi.fn()} tone="primary" />
    );
    expect(chip("planned").className).toContain("text-primary");

    rerender(<DemandChips tasks={[tarefa("planned")]} onPick={vi.fn()} tone="muted" />);
    expect(chip("planned").className).toContain("text-muted-foreground");
  });
});
