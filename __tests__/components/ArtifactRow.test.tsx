import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import tasksPtBR from "@/locales/pt-BR/tasks.json";
import commonPtBR from "@/locales/pt-BR/common.json";

vi.mock("@/components/tasks/DownloadArtifactButton", () => ({
  DownloadArtifactButton: () => <button type="button">baixar</button>,
}));

import { ArtifactRow } from "@/components/artifacts/ArtifactRow";
import type { UnifiedArtifactRow } from "@/lib/artifacts/unify";

const baseRow: UnifiedArtifactRow = {
  id: "a1",
  origin: "TASK",
  title: "Arte final",
  url: null,
  storageKind: "NAS_UPLOAD",
  uploadStatus: "READY",
  failedReason: null,
  type: null,
  mediaType: "FOTOS",
  sensitivity: "INTERNO",
  fileName: "arte_v01.jpg",
  version: 1,
  createdAt: "2026-08-01T00:00:00Z",
  taskId: "t1",
  taskTitle: "Campanha X",
  userName: "Fabi",
};

function renderRow(overrides: Partial<UnifiedArtifactRow> = {}) {
  const row: UnifiedArtifactRow = { ...baseRow, ...overrides };
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={{ tasks: tasksPtBR, common: commonPtBR }}>
      <ArtifactRow
        row={row}
        scope="TASK"
        canAdd={false}
        canRemove={false}
        isPending={false}
        verId={null}
        onSetVerId={vi.fn()}
        verUrl=""
        onSetVerUrl={vi.fn()}
        historyFor={null}
        history={[]}
        onNewVersion={vi.fn()}
        onToggleHistory={vi.fn()}
        reenviarBusy={null}
        onReenviar={vi.fn()}
        onRemoveFailed={vi.fn()}
        onEditImport={vi.fn()}
        onRemove={vi.fn()}
      />
    </NextIntlClientProvider>
  );
}

describe("ArtifactRow — reedição de importação que falhou", () => {
  it("importação que falhou mostra o motivo e o botão de editar", () => {
    renderRow({
      storageKind: "NAS_UPLOAD",
      uploadStatus: "FAILED",
      url: "https://x/a.jpg",
      failedReason: "TOO_LARGE",
    });
    expect(screen.getByText(/maior que o limite/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /editar e tentar de novo/i })).toBeInTheDocument();
  });

  it("upload comum que falhou continua com reenviar, sem editar", () => {
    renderRow({ storageKind: "NAS_UPLOAD", uploadStatus: "FAILED", url: null });
    expect(screen.queryByRole("button", { name: /editar e tentar de novo/i })).toBeNull();
    expect(screen.getByRole("button", { name: /reenviar/i })).toBeInTheDocument();
  });

  it("importação pronta não oferece editar", () => {
    renderRow({ storageKind: "NAS_UPLOAD", uploadStatus: "READY", url: "https://x/a.jpg" });
    expect(screen.queryByRole("button", { name: /editar e tentar de novo/i })).toBeNull();
  });

  it("motivo desconhecido cai no texto cru em vez de sumir", () => {
    renderRow({
      storageKind: "NAS_UPLOAD",
      uploadStatus: "FAILED",
      url: "https://x/a.jpg",
      failedReason: "MOTIVO_NOVO_DO_AGENTE",
    });
    expect(screen.getByText("MOTIVO_NOVO_DO_AGENTE")).toBeInTheDocument();
  });
});
