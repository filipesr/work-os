import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

vi.mock("@/lib/actions/stage", () => ({
  createTemplateStage: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));

import { CreateStageForm } from "@/components/admin/CreateStageForm";

function renderForm(stageCount: number, quickEntry: boolean) {
  return render(
    <CreateStageForm
      templateId="tpl1"
      teams={[]}
      existingStages={[]}
      quickEntry={quickEntry}
      stageCount={stageCount}
    />
  );
}

/**
 * Mesma trava de TemplateHeader.test.tsx, vista do outro lado: aqui é "adicionar etapa" que fica
 * indisponível quando o fluxo já é rápido e tem sua etapa única. `canAddStage`
 * (lib/template-invariants.ts) é a ÚNICA definição da regra — a tela só precisa continuar
 * consultando-a.
 */
describe("CreateStageForm — trava de adicionar etapa", () => {
  it("1 etapa, não é rápido: botão habilitado", () => {
    renderForm(1, false);
    expect(screen.getByRole("button", { name: "addButton" })).toBeEnabled();
    expect(screen.queryByText("blockedByQuick")).not.toBeInTheDocument();
  });

  it("1 etapa, é rápido: botão desabilitado, com o motivo ao lado", () => {
    renderForm(1, true);
    expect(screen.getByRole("button", { name: "addButton" })).toBeDisabled();
    expect(screen.getByText("blockedByQuick")).toBeInTheDocument();
  });

  it("2+ etapas: botão habilitado — a trava só existe para fluxo rápido", () => {
    renderForm(2, false);
    expect(screen.getByRole("button", { name: "addButton" })).toBeEnabled();
    expect(screen.queryByText("blockedByQuick")).not.toBeInTheDocument();
  });
});
