import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import tasksPtBR from "@/locales/pt-BR/tasks.json";
import commonPtBR from "@/locales/pt-BR/common.json";

const retry = vi.fn().mockResolvedValue({ success: true });
const refresh = vi.fn();

vi.mock("@/lib/actions/artifact-import", () => ({
  retryArtifactImport: (...args: unknown[]) => retry(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));

import { EditFailedImportDialog } from "@/components/artifacts/EditFailedImportDialog";
import type { UnifiedArtifactRow } from "@/lib/artifacts/unify";

// Radix Select depende de APIs de ponteiro que o jsdom não implementa — mesmo polyfill do
// AddArtifactForm.test.tsx (Task 5), sem inventar infraestrutura nova.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

// O artefato: uma importação de VÍDEO que falhou por ser grande demais, marcada CONFIDENCIAL.
// Sensibilidade e tipo de mídia propositalmente diferentes dos padrões do formulário
// (FOTOS/INTERNO) — é o único jeito de um teste pegar alguém que troque o valor inicial do
// `useState` por uma constante fixa (a mutação que este arquivo existe para barrar).
const artifact: UnifiedArtifactRow = {
  id: "a1",
  origin: "TASK",
  title: "Vídeo do evento",
  url: "https://exemplo.com/video-velho.mp4",
  storageKind: "NAS_UPLOAD",
  uploadStatus: "FAILED",
  failedReason: "TOO_LARGE",
  type: null,
  mediaType: "VIDEOS",
  sensitivity: "CONFIDENCIAL",
  fileName: null,
  version: 1,
  createdAt: "2026-08-01T00:00:00Z",
  taskId: "t1",
  taskTitle: "Campanha X",
  userName: "Fabi",
};

function renderDialog(overrides: Partial<UnifiedArtifactRow> = {}, onClose: () => void = vi.fn()) {
  const art: UnifiedArtifactRow = { ...artifact, ...overrides };
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={{ tasks: tasksPtBR, common: commonPtBR }}>
      <EditFailedImportDialog artifact={art} onClose={onClose} />
    </NextIntlClientProvider>
  );
}

describe("EditFailedImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retry.mockResolvedValue({ success: true });
  });

  it("pré-preenche nome e URL com os valores atuais do artefato", () => {
    renderDialog();
    expect(screen.getByLabelText(/^nome$/i)).toHaveValue("Vídeo do evento");
    expect(screen.getByLabelText(/^url$/i)).toHaveValue("https://exemplo.com/video-velho.mp4");
  });

  it("pré-preenche tipo de mídia e sensibilidade com os valores ATUAIS — não com os padrões do formulário", () => {
    renderDialog();
    // Padrão do formulário de link é FOTOS/INTERNO (AddArtifactForm) — este artefato é
    // VIDEOS/CONFIDENCIAL, e é isso que precisa aparecer, não o padrão.
    expect(screen.getByLabelText(/tipo de mídia/i)).toHaveTextContent("Vídeos");
    expect(screen.getByLabelText(/tipo de mídia/i)).not.toHaveTextContent("Fotos");
    expect(screen.getByLabelText(/sensibilidade/i)).toHaveTextContent("Confidencial");
    expect(screen.getByLabelText(/sensibilidade/i)).not.toHaveTextContent("Interno");
  });

  it("mostra o motivo da falha, traduzido", () => {
    renderDialog({ failedReason: "TOO_LARGE" });
    expect(screen.getByText(/maior que o limite/i)).toBeInTheDocument();
  });

  it("motivo desconhecido cai no texto cru em vez de sumir", () => {
    renderDialog({ failedReason: "MOTIVO_NOVO_DO_AGENTE" });
    expect(screen.getByText("MOTIVO_NOVO_DO_AGENTE")).toBeInTheDocument();
  });

  it("sem motivo (nunca deveria acontecer, mas não quebra), não mostra parágrafo de motivo", () => {
    renderDialog({ failedReason: null });
    expect(screen.queryByText(/maior que o limite/i)).toBeNull();
  });

  it("salvar sem tocar em nada chama retryArtifactImport com os valores pré-preenchidos — inclusive a sensibilidade que não foi tocada", async () => {
    const onClose = vi.fn();
    renderDialog({}, onClose);
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith("a1", {
        title: "Vídeo do evento",
        url: "https://exemplo.com/video-velho.mp4",
        mediaType: "VIDEOS",
        sensitivity: "CONFIDENCIAL",
      })
    );
    // Este é o caso que fecha o buraco: se o `useState` da sensibilidade fosse fixado em
    // "INTERNO" em vez de partir de `artifact.sensitivity`, esta chamada teria enviado
    // "INTERNO" para um artefato CONFIDENCIAL — e esta asserção falharia.
    expect(retry).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ sensitivity: "CONFIDENCIAL" })
    );
    expect(onClose).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("submete os valores editados quando a pessoa corrige nome e URL", async () => {
    renderDialog();
    const user = userEvent.setup();
    const nameInput = screen.getByLabelText(/^nome$/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Vídeo certo");
    const urlInput = screen.getByLabelText(/^url$/i);
    await user.clear(urlInput);
    await user.type(urlInput, "https://exemplo.com/video-novo.mp4");
    await user.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith(
        "a1",
        expect.objectContaining({
          title: "Vídeo certo",
          url: "https://exemplo.com/video-novo.mp4",
        })
      )
    );
  });

  it("erro do servidor não fecha o diálogo", async () => {
    retry.mockResolvedValueOnce({ error: "algo deu errado" });
    const onClose = vi.fn();
    renderDialog({}, onClose);
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(retry).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
