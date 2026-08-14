import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TeamProfileView } from "@/components/help/TeamProfileView";
import { getProfileBySlug } from "@/lib/team-profiles/catalog";
import type { TeamProfileContent, TeamProfileUi } from "@/lib/team-profiles/content";
import ptBR from "@/locales/pt-BR/teamProfiles.json";

/**
 * Render do descritivo com o conteúdo REAL de pt-BR — não com fixture. O que
 * este teste protege é a ligação entre o JSON e a tela: uma seção renomeada no
 * conteúdo ou esquecida no componente some da página sem quebrar o typecheck,
 * porque `t.raw()`/import dinâmico não são verificados.
 */

/** Nome de fonte tem `*`, `(` e `.` — literais numa RegExp de accessible name. */
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ui = ptBR.ui as unknown as TeamProfileUi;
const content = ptBR.profiles["social-media"] as unknown as TeamProfileContent;
const profile = getProfileBySlug("social-media")!;

describe("TeamProfileView", () => {
  it("renderiza as dez seções do descritivo", () => {
    render(<TeamProfileView profile={profile} content={content} ui={ui} />);

    expect(screen.getByRole("heading", { level: 1, name: content.title })).toBeInTheDocument();
    expect(screen.getByText(content.missao)).toBeInTheDocument();
    expect(screen.getByText(content.occupationRef)).toBeInTheDocument();

    // O nome da equipe pode coincidir com o título do descritivo ("Social
    // Media"), então a busca é pelo bloco rotulado, não pelo texto solto.
    const teamsBlock = screen.getByText(ui.coveredTeams).parentElement!;
    expect(teamsBlock.textContent).toContain(profile.teamNames.join(" · "));

    for (const label of Object.values(ui.sectionLabels)) {
      // `missao` aparece no cabeçalho, sem rótulo próprio.
      if (label === ui.sectionLabels.missao) continue;
      expect(screen.getByText(label), `seção "${label}" não renderizou`).toBeInTheDocument();
    }
  });

  it("mostra as quatro cadências de obrigações, com os itens de cada uma", () => {
    render(<TeamProfileView profile={profile} content={content} ui={ui} />);

    for (const cadence of ["diarias", "semanais", "mensais", "anuais"] as const) {
      expect(screen.getByText(ui.cadence[cadence])).toBeInTheDocument();
      for (const duty of content.obrigacoes[cadence]) {
        expect(screen.getByText(duty)).toBeInTheDocument();
      }
    }

    // A obrigação mensal concreta que motivou o formato: o calendário tem data.
    expect(
      screen.getByText(/calendário de publicação do mês seguinte até o dia 25/i)
    ).toBeVisible();
  });

  it("apresenta cada relatório com destino e sensibilidade", () => {
    render(<TeamProfileView profile={profile} content={content} ui={ui} />);

    for (const report of content.relatorios) {
      const card = screen.getByText(report.nome).parentElement!;
      expect(within(card).getByText(report.conteudo)).toBeInTheDocument();
      expect(within(card).getByText(report.ondeEntregar)).toBeInTheDocument();

      // Destino e sensibilidade andam juntos (cliente ⟺ CLIENTE), então o mesmo
      // rótulo aparece duas vezes no card: compara-se o par label+valor.
      for (const [label, value] of [
        [ui.reportFields.quando, report.quando],
        [ui.reportFields.destino, ui.destino[report.destino]],
        [ui.reportFields.sensibilidade, ui.sensitivity[report.sensibilidade]],
      ] as const) {
        const chip = within(card)
          .getAllByText(label)
          .map((el) => el.parentElement!)
          .find((el) => el.textContent === `${label}${value}`);
        expect(chip, `${report.nome}: faltou a etiqueta ${label} = ${value}`).toBeDefined();
      }
    }
  });

  it("abre ferramentas externas em nova aba e não inventa link para referência interna", () => {
    render(<TeamProfileView profile={profile} content={content} ui={ui} />);

    for (const tool of content.ferramentas.obrigatorias) {
      if (!tool.url) continue;
      const link = screen.getByRole("link", { name: new RegExp(tool.nome, "i") });
      expect(link).toHaveAttribute("href", tool.url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    }

    for (const tool of content.ferramentas.internas) {
      expect(screen.queryByRole("link", { name: new RegExp(tool.nome, "i") })).toBeNull();
    }
  });

  it("torna as fontes conferíveis: externa em nova aba, interna na mesma", () => {
    render(<TeamProfileView profile={profile} content={content} ui={ui} />);

    for (const source of content.fontes) {
      if (!source.url) {
        expect(screen.getByText(source.texto)).toBeInTheDocument();
        continue;
      }

      const link = screen.getByRole("link", { name: new RegExp(escapeRegExp(source.texto), "i") });
      expect(link).toHaveAttribute("href", source.url);

      if (source.url.startsWith("/")) {
        expect(link).not.toHaveAttribute("target");
      } else {
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noreferrer");
      }
    }
  });

  // P1/P2: a salvaguarda não é opcional nem depende do texto de cada função —
  // ela é estrutural, e aparece antes dos sinais em TODO descritivo.
  it("sempre mostra a salvaguarda de avaliação e o que nunca se faz", () => {
    render(<TeamProfileView profile={profile} content={content} ui={ui} />);

    expect(screen.getByText(`${ui.avaliacaoCallout.label}.`)).toBeInTheDocument();
    expect(screen.getByText(ui.avaliacaoCallout.text)).toBeInTheDocument();
    expect(screen.getByText(ui.avaliacaoFields.oQueNuncaFazemos)).toBeInTheDocument();

    for (const item of content.avaliacao.oQueNuncaFazemos) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });
});
