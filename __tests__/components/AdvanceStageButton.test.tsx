import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((k: string) => k, { rich: (k: string) => k }),
  useLocale: () => "pt-BR",
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));

const completeStageAndAdvance = vi.fn(async () => ({
  success: true,
  activated: [],
  blocked: [],
}));
// Etapa sem hora nenhuma apontada e com régua de 4h: digitar 9 cai acima da referência e o motivo
// passa a ser exigido — que é o estado em que o campo de motivo existe para ser inspecionado.
const getStageCompletionContext = vi.fn(async () => ({ loggedHours: 0, referenceHours: 4 }));

vi.mock("@/lib/actions/task", () => ({
  completeStageAndAdvance: (...args: unknown[]) => completeStageAndAdvance(...(args as [])),
  getStageCompletionContext: (...args: unknown[]) => getStageCompletionContext(...(args as [])),
}));

vi.mock("@/lib/actions/stage-assignment", () => ({
  previewNextStages: vi.fn(async () => ({ activated: [], blocked: [] })),
  getTeamMembers: vi.fn(async () => []),
}));

import { AdvanceStageButton } from "@/components/tasks/AdvanceStageButton";

/**
 * O diálogo de concluir etapa não tinha teste de componente nenhum — e foi por isso que o motivo
 * sobrevivendo ao fechamento atravessou as revisões: nada no servidor pode ver esse defeito, e
 * nada na tela reclama. A corrupção é silenciosa e cai justamente na tabela cujo propósito é
 * deixar o padrão visível.
 */
describe("AdvanceStageButton — o motivo não sobrevive ao fechamento do diálogo", () => {
  beforeEach(() => vi.clearAllMocks());

  async function abrirEExigirMotivo(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /completeStageButton/ }));
    const horas = await screen.findByLabelText(/hoursLabel/);
    await user.clear(horas);
    await user.type(horas, "9");
    return screen.findByLabelText(/reasonLabel/);
  }

  it("reabrir o diálogo devolve o campo de motivo vazio", async () => {
    const user = userEvent.setup();
    render(<AdvanceStageButton taskId="t1" currentStageId="s1" />);

    // Primeira conclusão: escolhe "Retrabalho" e conclui.
    const motivo = await abrirEExigirMotivo(user);
    await user.selectOptions(motivo, "REWORK");
    await user.click(screen.getByRole("button", { name: /confirmComplete/ }));
    await waitFor(() => expect(completeStageAndAdvance).toHaveBeenCalled());

    // O sucesso fecha o diálogo.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Segunda conclusão, outra etapa, mesmo componente montado: o bloco NÃO pode reaparecer
    // preenchido. Preenchido, um clique gravaria uma categoria que ninguém escolheu.
    const motivoDeNovo = await abrirEExigirMotivo(user);
    expect((motivoDeNovo as HTMLSelectElement).value).toBe("");
  });

  it("com o motivo limpo, concluir fica bloqueado até alguém escolher de novo", async () => {
    // A contraprova do teste acima: se o campo voltasse preenchido, o botão estaria liberado — e é
    // exatamente esse "um clique e pronto" que gravava a categoria errada.
    const user = userEvent.setup();
    render(<AdvanceStageButton taskId="t1" currentStageId="s1" />);

    const motivo = await abrirEExigirMotivo(user);
    await user.selectOptions(motivo, "REWORK");
    await user.click(screen.getByRole("button", { name: /confirmComplete/ }));
    await waitFor(() => expect(completeStageAndAdvance).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await abrirEExigirMotivo(user);
    expect(screen.getByRole("button", { name: /confirmComplete/ })).toBeDisabled();
  });
});
