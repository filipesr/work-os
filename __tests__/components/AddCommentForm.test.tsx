import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));

const addComment = vi.fn(async () => ({ success: true }));

vi.mock("@/lib/actions/task", () => ({
  addComment: (...args: unknown[]) => addComment(...(args as [])),
}));

import { AddCommentForm } from "@/components/tasks/AddCommentForm";

describe("AddCommentForm", () => {
  it("sem etapa informada, o formulário manda nulo", () => {
    // É o que dá sentido a `activeStageId` ser opcional: "o cliente adiou tudo" não é de etapa
    // nenhuma, e quem coordena escreve isso no admin.
    render(<AddCommentForm taskId="t1" userId="u1" activeStageId={null} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "cliente adiou" } });
    fireEvent.submit(screen.getByTestId("add-comment"));
    expect(addComment).toHaveBeenCalledWith("t1", "cliente adiou", null);
  });
});
