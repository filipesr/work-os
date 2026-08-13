import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WeekBlock } from "@/app/[locale]/(protected)/planning/coverage/WeekBlock";
import type { WeekCoverage } from "@/lib/actions/weekly-coverage";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

// Captura as props com que o diálogo de criação é aberto — é aí que mora a
// diferença entre os três gatilhos.
const batchProps = vi.fn();
vi.mock("@/components/planning/calendar/BatchCreateDialog", () => ({
  BatchCreateDialog: (props: Record<string, unknown>) => {
    batchProps(props);
    return <div data-testid="batch-dialog" />;
  },
}));

const CLIENTS = [
  { id: "c1", name: "Alfa" },
  { id: "c2", name: "Beta" },
];
const PROJECTS = [
  { id: "p1", name: "Proj A", clientId: "c1", clientName: "Alfa" },
  { id: "p2", name: "Proj B", clientId: "c1", clientName: "Alfa" },
  { id: "p3", name: "Proj C", clientId: "c2", clientName: "Beta" },
];

function makeWeek(over?: Partial<WeekCoverage>): WeekCoverage {
  return {
    key: "2026-08-10",
    startIso: "2026-08-10",
    endIso: "2026-08-16",
    occurrences: [],
    withDemand: [CLIENTS[0]],
    idle: [CLIENTS[1]],
    unlinked: [],
    ...over,
  };
}

const OCC = {
  id: "occ-1",
  iso: "2026-08-15",
  titlePt: "Fundação de Assunção",
  titleEs: "Fundación de Asunción",
  kind: "HOLIDAY" as const,
  source: "CURATED" as const,
  linkedClients: 1,
  tasks: [
    {
      id: "t1",
      title: "Post comemorativo",
      clientName: "Alfa",
      projectName: "Proj A",
      status: "IN_PROGRESS" as const,
      dueDateIso: "2026-08-15",
      assigneeName: "Ana",
    },
  ],
};

function renderBlock(week: WeekCoverage) {
  return render(
    <WeekBlock
      week={week}
      totalClients={2}
      isCurrent={false}
      isEs={false}
      clients={CLIENTS}
      projects={PROJECTS}
      templates={[{ id: "tpl1", name: "Post" }]}
      locale="pt-BR"
    />
  );
}

describe("WeekBlock — os três gatilhos de criação", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cabeçalho: cria para a SEMANA, sem projeto pré-marcado", async () => {
    const user = userEvent.setup();
    renderBlock(makeWeek());

    // O primeiro "create" é o do cabeçalho (não há data nesta semana).
    await user.click(screen.getAllByRole("button", { name: /create/ })[0]);

    expect(batchProps).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2026-08-10", // segunda
        occurrenceId: undefined,
        preselectedProjectIds: undefined,
      })
    );
  });

  it("data: cria naquele DIA e vincula à ocorrência", async () => {
    const user = userEvent.setup();
    renderBlock(makeWeek({ occurrences: [OCC] }));

    // [0] é o do cabeçalho, [1] o da data.
    await user.click(screen.getAllByRole("button", { name: /create/ })[1]);

    expect(batchProps).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-08-15", occurrenceId: "occ-1" })
    );
  });

  it("cliente ocioso: PRÉ-MARCA os projetos daquele cliente", async () => {
    // Era a redundância apontada: os três gatilhos abriam o mesmo diálogo
    // vazio. Sem a pré-seleção, clicar no cliente e ter que reencontrá-lo na
    // lista do diálogo é trabalho repetido.
    const user = userEvent.setup();
    renderBlock(makeWeek({ idle: [CLIENTS[0]] })); // Alfa tem p1 e p2

    await user.click(screen.getByRole("button", { name: /Alfa/ }));

    expect(batchProps).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2026-08-10",
        preselectedProjectIds: ["p1", "p2"],
      })
    );
  });
});

describe("WeekBlock — conteúdo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não colapsa: o conteúdo aparece sem clique", () => {
    renderBlock(makeWeek({ idle: [CLIENTS[1]] }));
    expect(screen.getByText(/week.idleTitle/)).toBeInTheDocument();
  });

  it("lista as demandas VINCULADAS a cada data", () => {
    renderBlock(makeWeek({ occurrences: [OCC] }));
    expect(screen.getByRole("button", { name: /Post comemorativo/ })).toBeInTheDocument();
  });

  it("lista as demandas da semana SEM data — a maior parte do trabalho", () => {
    // Sem isso o card mostrava só a agenda sazonal e uma semana cheia parecia
    // vazia.
    renderBlock(
      makeWeek({
        unlinked: [
          {
            id: "t9",
            title: "Rotina mensal",
            clientName: "Beta",
            projectName: "Proj C",
            status: "BACKLOG" as const,
            dueDateIso: "2026-08-12",
            assigneeName: null,
          },
        ],
      })
    );

    expect(screen.getByText(/week.otherDemands/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rotina mensal/ })).toBeInTheDocument();
  });

  it("clicar numa demanda abre o resumo, não navega", async () => {
    const user = userEvent.setup();
    renderBlock(makeWeek({ occurrences: [OCC] }));

    await user.click(screen.getByRole("button", { name: /Post comemorativo/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Post comemorativo");
    expect(dialog).toHaveTextContent("Alfa");
  });

  it("semana totalmente coberta não mostra lista de ociosos", () => {
    renderBlock(makeWeek({ idle: [], withDemand: CLIENTS }));
    expect(screen.getByText(/week.allCovered/)).toBeInTheDocument();
    expect(screen.queryByText(/week.idleTitle/)).not.toBeInTheDocument();
  });
});
