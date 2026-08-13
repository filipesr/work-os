import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const logOneOnOne = vi.fn(async (_userId: string, _notes?: string) => undefined);
vi.mock("@/lib/actions/one-on-one", () => ({
  logOneOnOne: (userId: string, notes?: string) => logOneOnOne(userId, notes),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));

import RegisterOneOnOneButton from "@/components/admin/RegisterOneOnOneButton";

/**
 * O caminho que este componente representa é curto e fácil de quebrar em
 * silêncio: a coluna `OneOnOneLog.notes` e a server action já aceitavam texto
 * havia tempo, e a interface simplesmente nunca o enviava. Nada falhava — o 1:1
 * era gravado, a pessoa saía da fila de atrasados, e a anotação não existia.
 *
 * Por isso o teste central aqui é sobre o ARGUMENTO chegar na action.
 */
describe("RegisterOneOnOneButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia a anotação digitada para a action", async () => {
    const user = userEvent.setup();
    render(<RegisterOneOnOneButton userId="u1" name="Ana" />);

    await user.click(screen.getByRole("button", { name: "logButton" }));
    await user.type(screen.getByLabelText("notesLabel"), "quer assumir motion");
    await user.click(screen.getByRole("button", { name: "confirmYes" }));

    expect(logOneOnOne).toHaveBeenCalledWith("u1", "quer assumir motion");
  });

  it("registra sem anotação — o campo é opcional", async () => {
    // Obrigar a escrever empurraria para o texto de fachada ("tudo certo") só
    // para destravar o botão. Nota vazia é mais honesta que nota falsa.
    const user = userEvent.setup();
    render(<RegisterOneOnOneButton userId="u1" name="Ana" />);

    await user.click(screen.getByRole("button", { name: "logButton" }));
    await user.click(screen.getByRole("button", { name: "confirmYes" }));

    expect(logOneOnOne).toHaveBeenCalledWith("u1", "");
  });

  it("atualiza a rota no sucesso, para o atrasado sair da fila", async () => {
    const user = userEvent.setup();
    render(<RegisterOneOnOneButton userId="u1" name="Ana" />);

    await user.click(screen.getByRole("button", { name: "logButton" }));
    await user.click(screen.getByRole("button", { name: "confirmYes" }));

    expect(refresh).toHaveBeenCalled();
  });

  it("descarta o rascunho ao fechar sem salvar", async () => {
    // Senão a anotação de uma pessoa reaparece no diálogo da próxima — que é
    // pior do que perder o rascunho: registra na pessoa errada.
    const user = userEvent.setup();
    render(<RegisterOneOnOneButton userId="u1" name="Ana" />);

    await user.click(screen.getByRole("button", { name: "logButton" }));
    await user.type(screen.getByLabelText("notesLabel"), "rascunho");
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "logButton" }));
    expect(screen.getByLabelText("notesLabel")).toHaveValue("");
  });
});
