import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next-intl: ecoa a chave com os valores, para as asserções não dependerem de
// texto traduzido — o que interessa aqui é QUAL mensagem aparece e quando.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key}:${JSON.stringify(vals)}` : key,
  useLocale: () => "pt-BR",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));

const createTasksBatch = vi.fn(async (_input: unknown) => ({ created: 1 }));
vi.mock("@/lib/actions/task", () => ({
  createTasksBatch: (input: unknown) => createTasksBatch(input as never),
}));
vi.mock("@/lib/actions/project", () => ({ createProject: vi.fn() }));

import { BatchCreateDialog } from "@/components/planning/calendar/BatchCreateDialog";
import type { TemplateOption } from "@/components/planning/calendar/monthly-types";

const CLIENTS = [{ id: "c1", name: "Acme" }];
const PROJECTS = [{ id: "p1", name: "Social", clientId: "c1", clientName: "Acme" }];

// 120h = 15 dias ÚTEIS (8h/dia). Prazo sex 11/12 → início seg 23/11.
const TEMPLATES: TemplateOption[] = [{ id: "tpl1", name: "Campanha", totalDurationHours: 120 }];

function abrir(templates: TemplateOption[] = TEMPLATES) {
  return render(
    <BatchCreateDialog
      date="2026-12-25"
      eventTitle="Natal"
      occurrenceId="occ1"
      preselectedProjectIds={["p1"]}
      clients={CLIENTS}
      projects={PROJECTS}
      templates={templates}
      onClose={vi.fn()}
    />
  );
}

/** Preenche fluxo + antecedência, que é o mínimo para o cálculo aparecer. */
async function preencher(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("templateLabel"), "tpl1");
  await user.type(screen.getByLabelText("leadDaysLabel"), "14");
}

describe("BatchCreateDialog — planejamento para trás", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deriva o prazo da antecedência em vez de usar a data do evento", async () => {
    // O bug de origem: a demanda de Natal vencia em 25/12, quando o material
    // precisa estar pronto antes. 25/12 − 14 = 11/12.
    const user = userEvent.setup();
    abrir();
    await preencher(user);

    expect(screen.getByText(/leadDaysResolved.*11\/12\/2026/)).toBeInTheDocument();
  });

  it("sugere o início recuando a duração do fluxo a partir do prazo", async () => {
    // 11/12 recuado 15 dias úteis (120h a 8h/dia) = 23/11, pulando dois fins de semana.
    const user = userEvent.setup();
    abrir();
    await preencher(user);

    expect(screen.getByLabelText("startLabel")).toHaveValue("2026-11-23");
    expect(screen.getByText(/startSuggested.*23\/11\/2026/)).toBeInTheDocument();
  });

  it("não sugere nada quando o fluxo não tem previsão configurada", async () => {
    // As etapas do sistema começaram todas sem `expectedDurationHours`. Chutar
    // aqui seria pior: uma sugestão errada é seguida, uma ausência é percebida.
    const user = userEvent.setup();
    abrir([{ id: "tpl1", name: "Campanha", totalDurationHours: null }]);
    await preencher(user);

    expect(screen.getByText("startNoEstimate")).toBeInTheDocument();
    expect(screen.getByLabelText("startLabel")).toHaveValue("");
  });

  it("alerta e BLOQUEIA o envio ao começar depois do sugerido", async () => {
    // O pedido: começar mais tarde que o sugerido é espremer o cronograma. Não é
    // proibido — prazo de cliente às vezes obriga — mas exige aceite explícito.
    const user = userEvent.setup();
    abrir();
    await preencher(user);

    await user.clear(screen.getByLabelText("startLabel"));
    await user.type(screen.getByLabelText("startLabel"), "2026-11-30");

    expect(screen.getByText(/compressedTitle.*"days":7/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "create" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "compressedAccept" }));
    expect(screen.getByRole("button", { name: "create" })).toBeEnabled();
  });

  it("começar ANTES do sugerido não alerta — é folga, não risco", async () => {
    const user = userEvent.setup();
    abrir();
    await preencher(user);

    await user.clear(screen.getByLabelText("startLabel"));
    await user.type(screen.getByLabelText("startLabel"), "2026-11-16");

    expect(screen.queryByText(/compressedTitle/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "create" })).toBeEnabled();
  });

  it("mexer na data de novo cancela o aceite anterior", async () => {
    // Senão o aceite de uma compressão de 2 dias valeria para uma de 20, que é
    // decisão diferente — e o gestor teria assinado a errada.
    const user = userEvent.setup();
    abrir();
    await preencher(user);

    const campo = screen.getByLabelText("startLabel");
    await user.clear(campo);
    await user.type(campo, "2026-11-25");
    await user.click(screen.getByRole("checkbox", { name: "compressedAccept" }));
    expect(screen.getByRole("button", { name: "create" })).toBeEnabled();

    await user.clear(campo);
    await user.type(campo, "2026-12-05");
    expect(screen.getByRole("checkbox", { name: "compressedAccept" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "create" })).toBeDisabled();
  });

  it("envia o prazo e o início planejado para a action", async () => {
    const user = userEvent.setup();
    abrir();
    await preencher(user);
    await user.click(screen.getByRole("button", { name: "create" }));

    expect(createTasksBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: "2026-12-11",
        plannedStartAt: "2026-11-23",
        calendarOccurrenceId: "occ1",
      })
    );
  });
});
