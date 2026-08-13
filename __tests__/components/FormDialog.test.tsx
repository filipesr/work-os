import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";

// next-intl: ecoa a chave, então "common.dialog.cancel" vira "cancel".
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

/**
 * O FormDialog é usado em CINCO lugares (editar usuário, gerir membros,
 * cadastrar data, parar cronômetro, trocar de tarefa). Nenhum deles foi visto
 * funcionando; estes testes cobrem a moldura uma vez para os cinco herdarem.
 *
 * O que importa aqui é justamente o que compila e pode não funcionar: o botão
 * do rodapé alcançar um `<form>` que vive no corpo via `form={formId}`, e o
 * Radix entregar ESC/foco.
 */
function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<button type="button">abrir</button>}
      title="Título do diálogo"
      description="Descrição do diálogo"
      formId="harness-form"
      submitLabel="salvar-agora"
    >
      <form
        id="harness-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="campo">campo</label>
        <input id="campo" name="campo" />
      </form>
    </FormDialog>
  );
}

describe("FormDialog", () => {
  it("começa fechado e abre pelo gatilho", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "abrir" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("anuncia título e descrição (o que o leitor de tela lê)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "abrir" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Título do diálogo");
    expect(dialog).toHaveAccessibleDescription("Descrição do diálogo");
  });

  it("o botão do rodapé SUBMETE o form do corpo via formId", async () => {
    // O caso que mais me preocupava: botão e <form> são irmãos dentro do
    // portal, ligados só pelo atributo `form`. Se a associação falhasse, o
    // diálogo abriria bonito e o salvar não faria nada.
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "abrir" }));
    await user.click(await screen.findByRole("button", { name: "salvar-agora" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("fecha com ESC — o que o modal artesanal não fazia", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "abrir" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("o botão cancelar fecha o diálogo", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "abrir" }));
    await user.click(await screen.findByRole("button", { name: "cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("move o foco para dentro do diálogo ao abrir", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "abrir" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("isPending desabilita salvar e cancelar (sem duplo envio)", async () => {
    const user = userEvent.setup();
    render(
      <FormDialog
        open
        onOpenChange={vi.fn()}
        trigger={<button type="button">abrir</button>}
        title="t"
        formId="f"
        isPending
      >
        <form id="f" />
      </FormDialog>
    );

    // Com isPending o rótulo vira "saving" (chave ecoada pelo mock).
    expect(await screen.findByRole("button", { name: "saving" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "saving" }));
  });

  it("aceita rodapé customizado no lugar do padrão", async () => {
    render(
      <FormDialog
        open
        onOpenChange={vi.fn()}
        trigger={<button type="button">abrir</button>}
        title="t"
        footer={<button type="button">rodapé-proprio</button>}
      >
        <p>corpo</p>
      </FormDialog>
    );

    expect(await screen.findByRole("button", { name: "rodapé-proprio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "cancel" })).not.toBeInTheDocument();
  });
});
