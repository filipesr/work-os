import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportModelView } from "@/components/help/ReportModelView";
import { getReportModelBySlug } from "@/lib/team-profiles/reports";
import type { ReportModelContent, ReportModelUi } from "@/lib/team-profiles/content";
import ptBR from "@/locales/pt-BR/reportModels.json";

/**
 * Render do modelo com o conteúdo REAL de pt-BR. Protege a ligação entre o JSON
 * e a tela, que nenhum typecheck cobre — e, principalmente, duas garantias que
 * não podem depender de quem escreveu o conteúdo: o aviso de exemplo fictício e
 * o esqueleto disponível mesmo sem a área de transferência.
 */

const ui = ptBR.ui as unknown as ReportModelUi;
const content = ptBR.models["relatorio-de-conta"] as unknown as ReportModelContent;
const model = getReportModelBySlug("relatorio-de-conta")!;

function renderView() {
  return render(
    <ReportModelView
      model={model}
      content={content}
      ui={ui}
      profileSlug={model.profileSlug}
      profileTitle="Atendimento"
      destinationLabel="Cliente"
      sensitivityLabel="Cliente"
    />
  );
}

describe("ReportModelView", () => {
  it("renderiza todas as seções do modelo", () => {
    renderView();

    expect(screen.getByRole("heading", { level: 1, name: content.titulo })).toBeInTheDocument();
    expect(screen.getByText(content.paraQue)).toBeInTheDocument();
    expect(screen.getByText(content.leitor)).toBeInTheDocument();
    expect(screen.getByText(content.quando)).toBeInTheDocument();

    for (const label of Object.values(ui.sectionLabels)) {
      expect(screen.getByText(label), `seção "${label}" não renderizou`).toBeInTheDocument();
    }
  });

  // Os títulos da anatomia reaparecem no exemplo — o exemplo segue a anatomia,
  // de propósito. Por isso a busca é escopada à lista numerada.
  it("numera a anatomia na ordem e descreve o que vai em cada seção", () => {
    const { container } = renderView();

    const anatomy = within(container.querySelector("ol")!);
    const items = container.querySelectorAll("ol > li");
    expect(items.length).toBe(content.estrutura.length);

    content.estrutura.forEach((section, i) => {
      expect(anatomy.getByText(section.titulo)).toBeInTheDocument();
      expect(anatomy.getByText(section.oQueVai)).toBeInTheDocument();
      expect(items[i].textContent).toContain(String(i + 1));
      expect(items[i].textContent).toContain(section.titulo);
    });
  });

  // Conteúdo com cara de relatório real não pode passar por dado de cliente.
  it("marca o exemplo como fictício", () => {
    renderView();

    expect(screen.getByText(ui.exampleWarning)).toBeInTheDocument();
    expect(screen.getByText(content.exemplo.legenda)).toBeInTheDocument();
    for (const bloco of content.exemplo.blocos) {
      expect(screen.getAllByText(bloco.titulo).length).toBeGreaterThan(0);
      for (const linha of bloco.corpo) {
        expect(screen.getByText(linha)).toBeInTheDocument();
      }
    }
  });

  it("mostra o esqueleto na página, não só no botão de copiar", () => {
    const { container } = renderView();

    const pre = container.querySelector("pre");
    expect(pre, "o esqueleto precisa ficar selecionável na página").not.toBeNull();
    expect(pre!.textContent).toBe(content.esqueleto);
  });

  it("liga de volta para o descritivo da função dona", () => {
    renderView();

    const links = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("href") === `/help/equipes/${model.profileSlug}`);
    expect(links.length, "faltou o link para a função dona").toBeGreaterThan(0);
  });
});

describe("CopySkeletonButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("copia o esqueleto e confirma", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderView();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(ui.copy, "i") }));

    expect(writeText).toHaveBeenCalledWith(content.esqueleto);
    expect(await screen.findByText(ui.copied)).toBeInTheDocument();
  });

  it("avisa quando a área de transferência falha, sem quebrar a página", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    renderView();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(ui.copy, "i") }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ui.copyFailed);
  });
});
