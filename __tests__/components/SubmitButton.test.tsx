import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let statusAtual = { pending: false };
vi.mock("react-dom", async () => {
  const real = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...real, useFormStatus: () => statusAtual };
});

import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * O defeito que este botão existe para impedir: `CreateTaskForm` usava `<form action={createTask}>`
 * com o botão bloqueado apenas por falta de projeto ou template. Com o banco a ~300ms de ida e
 * volta, a criação leva mais de um segundo sem nenhuma mudança visível — e o segundo clique CRIA
 * UMA DEMANDA DUPLICADA.
 */
describe("SubmitButton", () => {
  it("em repouso, aceita o clique", () => {
    statusAtual = { pending: false };
    render(<SubmitButton>Criar</SubmitButton>);
    expect(screen.getByRole("button", { name: "Criar" })).toBeEnabled();
  });

  it("enviando, o botão BLOQUEIA — é o que impede a duplicata", () => {
    statusAtual = { pending: true };
    render(<SubmitButton>Criar</SubmitButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("enviando, anuncia isso a quem usa leitor de tela", () => {
    statusAtual = { pending: true };
    render(<SubmitButton>Criar</SubmitButton>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("enviando, troca o texto quando a tela oferece um", () => {
    statusAtual = { pending: true };
    render(<SubmitButton pendingLabel="Criando…">Criar</SubmitButton>);
    expect(screen.getByRole("button", { name: "Criando…" })).toBeInTheDocument();
  });

  it("o bloqueio da TELA continua valendo em repouso", () => {
    // Formulário incompleto: as duas razões de bloquear somam-se, nenhuma substitui a outra.
    statusAtual = { pending: false };
    render(<SubmitButton disabled>Criar</SubmitButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
