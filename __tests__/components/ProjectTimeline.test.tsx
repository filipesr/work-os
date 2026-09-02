import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Server Component: os rótulos vêm do locale, e aqui a chave basta — o teste olha a ESTRUTURA do
// tooltip, não a tradução. Só `legend` devolve texto de verdade, porque a tela o parte em quatro.
vi.mock("next-intl/server", () => ({
  getTranslations: vi
    .fn()
    .mockResolvedValue((k: string) =>
      k === "legend" ? "feito / em curso / não liberada / referência" : k
    ),
}));

import { ProjectTimeline } from "@/app/[locale]/(protected)/projects/[projectId]/ProjectTimeline";
import type { ProjectTimeline as Timeline, TimelineLine } from "@/lib/actions/project-timeline";

const DIA = "2026-09-01";

function grade(lines: TimelineLine[]): Timeline {
  return {
    rows: [{ kind: "day", dayISO: DIA }],
    demands: [
      {
        taskId: "t1",
        title: "Reels institucional",
        open: true,
        discarded: false,
        dueDateISO: null,
        overdue: false,
      },
    ],
    todayISO: DIA,
    byDay: { [DIA]: { t1: { doneHours: 0, pendingHours: 0, lines } } },
  };
}

const linha = (over: Partial<TimelineLine> = {}): TimelineLine => ({
  stageId: "s1",
  stageOrder: 1,
  stageName: "Roteiro",
  assigneeName: "Ana Souza Pereira",
  hours: 2,
  estimated: false,
  state: "done",
  ...over,
});

/** O `title` de cada item da célula — o texto que aparece ao apontar. */
async function tooltips(data: Timeline): Promise<(string | null)[]> {
  const { container } = render(await ProjectTimeline({ data }));
  return [...container.querySelectorAll("li > span.truncate")].map((s) => s.getAttribute("title"));
}

describe("ProjectTimeline — tooltip da célula", () => {
  it("a linha SEM etapa não pendura um separador vazio", async () => {
    // Hora apontada na demanda inteira: a célula mostra "sem etapa" com o rótulo certo, mas o
    // tooltip vinha montado à mão a partir de campos que ali são vazios — virava " · ", um
    // separador sozinho, sem nada de cada lado.
    const [t] = await tooltips(
      grade([linha({ stageId: "", stageOrder: 0, stageName: "", assigneeName: null })])
    );
    expect(t).toBe("noStage");
    expect(t).not.toContain("·");
  });

  it("com etapa, o tooltip repete o rótulo da célula — número e nome", async () => {
    // O tooltip existe porque a célula é truncada: ele tem que dizer a MESMA coisa por inteiro.
    // Sem o número, ele contava uma história diferente da que estava escrita ao lado.
    const [t] = await tooltips(grade([linha({ assigneeName: null })]));
    expect(t).toBe("1. Roteiro");
  });

  it("o responsável entra INTEIRO no tooltip, e só quando existe", async () => {
    // Na célula o nome é cortado em dois pedaços para caber; apontar é justamente o gesto de
    // pedir o nome completo.
    const [comDono, semDono] = await tooltips(
      grade([
        linha(),
        linha({ stageId: "s2", stageOrder: 2, stageName: "Edição", assigneeName: null }),
      ])
    );
    expect(comDono).toBe("1. Roteiro · Ana Souza Pereira");
    expect(semDono).toBe("2. Edição");
  });
});
