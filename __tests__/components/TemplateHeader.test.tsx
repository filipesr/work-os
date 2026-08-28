import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

vi.mock("@/lib/actions/template", () => ({
  updateWorkflowTemplate: vi.fn(),
  deleteWorkflowTemplate: vi.fn(),
}));

import { TemplateHeader } from "@/components/admin/TemplateHeader";

/**
 * A trava recíproca entre "fluxo rápido" e a quantidade de etapas (lib/template-invariants.ts) tem
 * DOIS consumidores: o servidor GARANTE a regra, a tela EXPLICA. Sem teste aqui, nada detecta se o
 * componente parasse de ler `canEnableQuickEntry` e voltasse a deixar a caixa sempre clicável —
 * exatamente o "aprender a regra depois de preencher o formulário" que a spec proíbe.
 */
async function abrirEdicao(stageCount: number, quickEntry: boolean) {
  const user = userEvent.setup();
  render(
    <TemplateHeader
      template={{ id: "tpl1", name: "Story de loja", description: null, quickEntry }}
      stageCount={stageCount}
    />
  );
  await user.click(screen.getByRole("button", { name: "editButton" }));
  return screen.getByRole("checkbox");
}

describe("TemplateHeader — trava de marcar como fluxo rápido", () => {
  it("1 etapa, ainda não é rápido: caixa habilitada", async () => {
    const checkbox = await abrirEdicao(1, false);
    expect(checkbox).toBeEnabled();
    expect(screen.queryByText("quickEntry.blockedByStages")).not.toBeInTheDocument();
  });

  it("1 etapa, já é rápido: caixa habilitada — desmarcar é a saída para crescer o fluxo", async () => {
    const checkbox = await abrirEdicao(1, true);
    expect(checkbox).toBeEnabled();
  });

  it("2+ etapas: caixa desabilitada, com o motivo visível ao lado", async () => {
    const checkbox = await abrirEdicao(2, false);
    expect(checkbox).toBeDisabled();
    expect(screen.getByText("quickEntry.blockedByStages")).toBeInTheDocument();
  });
});
