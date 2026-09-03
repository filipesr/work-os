import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import tasksPtBR from "@/locales/pt-BR/tasks.json";
import commonPtBR from "@/locales/pt-BR/common.json";

const addLink = vi.fn().mockResolvedValue({ success: true });
const enqueue = vi.fn().mockResolvedValue({ success: true, artifact: { id: "a1" } });

vi.mock("@/lib/actions/task", () => ({
  addLinkArtifact: (...args: unknown[]) => addLink(...args),
}));
vi.mock("@/lib/actions/artifact", () => ({ addScopedLinkArtifact: vi.fn() }));
vi.mock("@/lib/actions/artifact-import", () => ({
  enqueueArtifactImport: (...args: unknown[]) => enqueue(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/tasks/UploadArtifactForm", () => ({
  UploadArtifactForm: () => <div>upload</div>,
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));

import { AddArtifactForm } from "@/components/artifacts/AddArtifactForm";

// Radix Select depende de APIs de ponteiro que o jsdom não implementa — sem isto, abrir o dropdown
// (necessário para escolher "Figma") derruba o teste com um TypeError antes de qualquer asserção.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function renderForm() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={{ tasks: tasksPtBR, common: commonPtBR }}>
      <AddArtifactForm
        scope="TASK"
        ownerIds={{ taskId: "t1" }}
        isPending={false}
        startTransition={(cb) => cb()}
      />
    </NextIntlClientProvider>
  );
}

async function preencher({ nome, url }: { nome: string; url: string }) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^nome$/i), nome);
  await user.type(screen.getByLabelText(/^url$/i), url);
}

async function escolherTipo(nome: string) {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(/tipo de mídia/i));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByText(nome));
}

describe("AddArtifactForm — aba de link", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tem nome, tipo de mídia e sensibilidade, com os rótulos da aba de upload", () => {
    renderForm();
    expect(screen.getByLabelText(/tipo de mídia/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sensibilidade/i)).toBeInTheDocument();
  });

  it("adicionar manda mediaType e sensibilidade", async () => {
    renderForm();
    await preencher({ nome: "Foto", url: "https://exemplo.com/foto.jpg" });
    // /^adicionar$/i, não /adicionar/i: a aba "Adicionar link" também casa com o regex solto.
    await userEvent.click(screen.getByRole("button", { name: /^adicionar$/i }));
    await waitFor(() =>
      expect(addLink).toHaveBeenCalledWith(
        "t1",
        "Foto",
        "https://exemplo.com/foto.jpg",
        expect.any(String),
        expect.any(String)
      )
    );
  });

  it("importar para o NAS usa a mesma resposta do formulário", async () => {
    renderForm();
    await preencher({ nome: "Foto", url: "https://exemplo.com/foto.jpg" });
    await userEvent.click(screen.getByRole("button", { name: /importar para o nas/i }));
    await waitFor(() =>
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "TASK",
          taskId: "t1",
          title: "Foto",
          url: "https://exemplo.com/foto.jpg",
        })
      )
    );
    expect(addLink).not.toHaveBeenCalled();
  });

  it("importar fica desabilitado quando o tipo só existe como link", async () => {
    renderForm();
    await preencher({ nome: "Tela", url: "https://figma.com/file/abc" });
    await escolherTipo("Figma");
    expect(screen.getByRole("button", { name: /importar para o nas/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^adicionar$/i })).toBeEnabled();
    expect(screen.getByText(/só como link/i)).toBeInTheDocument();
  });

  it("os dois botões ficam desabilitados sem nome ou sem URL", async () => {
    renderForm();
    expect(screen.getByRole("button", { name: /^adicionar$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /importar para o nas/i })).toBeDisabled();
  });
});
