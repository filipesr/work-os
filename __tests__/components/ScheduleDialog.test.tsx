import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const scheduleStage = vi.fn().mockResolvedValue({ success: true });
const setStageWindow = vi.fn().mockResolvedValue({ success: true });
const listWindowCandidates = vi.fn();
vi.mock("@/lib/actions/week-planning", () => ({
  scheduleStage: (...a: unknown[]) => scheduleStage(...a),
  setStageWindow: (...a: unknown[]) => setStageWindow(...a),
  listWindowCandidates: (...a: unknown[]) => listWindowCandidates(...a),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vals?: Record<string, unknown>) =>
    vals ? `${k}:${Object.values(vals).join("|")}` : k,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { ScheduleDialog } from "@/app/[locale]/(protected)/planning/week/ScheduleDialog";

const HOJE = "2026-09-10";
const AMANHA = "2026-09-11";

function abrir() {
  render(
    <ScheduleDialog
      activeStageId="as1"
      label="Reels · Gravação"
      teamName="Vídeo"
      people={[{ id: "u1", name: "Ana" }]}
      todayISO={HOJE}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /schedule/ }));
}

const dia = () => screen.getByLabelText("dialogDay", { exact: false }) as HTMLInputElement;
const horaInicio = () => screen.getByLabelText("windowStart") as HTMLInputElement;
const horaFim = () => screen.getByLabelText("windowEnd") as HTMLInputElement;

async function enviar() {
  await act(async () => {
    fireEvent.submit(screen.getByTestId("schedule-form"));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  scheduleStage.mockResolvedValue({ success: true });
  setStageWindow.mockResolvedValue({ success: true });
});

describe("ScheduleDialog — hoje é fila, dia futuro tem hora", () => {
  it("abre em HOJE, com a hora desabilitada", () => {
    // O que entra no dia de alguém agora se faz na vez. Um campo de hora habilitado aqui convidaria
    // a marcar um compromisso que nasceria vencido metade das vezes.
    abrir();
    expect(dia().value).toBe(HOJE);
    expect(horaInicio()).toBeDisabled();
    expect(horaFim()).toBeDisabled();
  });

  it("o campo de dia não deixa escolher o passado", () => {
    // A tela explica; `scheduleStage` recusa de novo, porque atributo de input não é regra.
    abrir();
    expect(dia()).toHaveAttribute("min", HOJE);
  });

  it("dia futuro habilita a hora", () => {
    abrir();
    fireEvent.change(dia(), { target: { value: AMANHA } });
    expect(horaInicio()).not.toBeDisabled();
  });

  it("voltar para hoje LIMPA a hora já digitada", () => {
    // Só desabilitar deixaria o valor no estado e ele seria enviado ao servidor — uma hora que o
    // gestor não vê mais na tela.
    abrir();
    fireEvent.change(dia(), { target: { value: AMANHA } });
    fireEvent.change(horaInicio(), { target: { value: "14:00" } });
    fireEvent.change(dia(), { target: { value: HOJE } });
    expect(horaInicio().value).toBe("");
  });
});

describe("ScheduleDialog — o envio", () => {
  it("sem hora, programa e para por aí", async () => {
    abrir();
    await enviar();
    expect(scheduleStage).toHaveBeenCalledWith({
      activeStageId: "as1",
      userId: "u1",
      dateISO: HOJE,
    });
    expect(setStageWindow).not.toHaveBeenCalled();
  });

  it("com hora, programa PRIMEIRO e marca depois", async () => {
    // `setStageWindow` ancora o horário no dia da própria linha: ele só existe depois que a linha
    // tem dia. A ordem não é preferência, é dependência.
    abrir();
    fireEvent.change(dia(), { target: { value: AMANHA } });
    fireEvent.change(horaInicio(), { target: { value: "14:00" } });
    fireEvent.change(horaFim(), { target: { value: "16:00" } });
    await enviar();

    expect(scheduleStage).toHaveBeenCalledWith({
      activeStageId: "as1",
      userId: "u1",
      dateISO: AMANHA,
    });
    expect(setStageWindow).toHaveBeenCalledWith({
      activeStageId: "as1",
      startTime: "14:00",
      endTime: "16:00",
    });
  });

  it("fim vazio vai como nulo, não como string vazia", async () => {
    abrir();
    fireEvent.change(dia(), { target: { value: AMANHA } });
    fireEvent.change(horaInicio(), { target: { value: "14:00" } });
    await enviar();
    expect(setStageWindow).toHaveBeenCalledWith({
      activeStageId: "as1",
      startTime: "14:00",
      endTime: null,
    });
  });

  it("se programar falhar, a hora nem é tentada", async () => {
    // Sem dia não há onde ancorar a hora: insistir devolveria um segundo erro sobre o primeiro.
    scheduleStage.mockResolvedValueOnce({ error: "notInTeam" });
    abrir();
    fireEvent.change(dia(), { target: { value: AMANHA } });
    fireEvent.change(horaInicio(), { target: { value: "14:00" } });
    await enviar();
    expect(setStageWindow).not.toHaveBeenCalled();
  });
});

const OCUPANTE = {
  activeStageId: "as9",
  taskTitle: "Institucional Acme",
  stageName: "Gravação",
  priority: "HIGH",
  startISO: "2026-09-11T17:00:00.000Z",
  endISO: "2026-09-11T19:00:00.000Z",
  endDeclared: true,
};
const OVERLAP = {
  overlap: {
    canOverride: true,
    teamId: "t-video",
    occupants: [OCUPANTE],
    firstFreeStartISO: "2026-09-11T20:00:00.000Z",
  },
};

async function enviarComConflito(overlap: unknown = OVERLAP) {
  setStageWindow.mockResolvedValueOnce(overlap);
  abrir();
  fireEvent.change(dia(), { target: { value: AMANHA } });
  fireEvent.change(horaInicio(), { target: { value: "15:00" } });
  await enviar();
}

describe("ScheduleDialog — o conflito de horário", () => {
  it("nomeia quem está no caminho em vez de dar erro genérico", async () => {
    await enviarComConflito();
    expect(screen.getByText(/Institucional Acme/)).toBeInTheDocument();
  });

  it("adiar manda o horário calculado e preserva a duração declarada", async () => {
    // 20:00Z = 17h em São Paulo; a ocupante durava 2h declaradas, então termina às 19h.
    await enviarComConflito();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapPostpone" }));
    });
    expect(setStageWindow).toHaveBeenCalledWith({
      activeStageId: "as9",
      startTime: "17:00",
      endTime: "19:00",
    });
  });

  it("com DUAS ocupantes, some o adiar e aparece o caminho para a mesa", async () => {
    // "A que estava marcada" não tem referente com duas, e adiar em cadeia seria o sistema
    // remarcando compromissos combinados fora dele.
    await enviarComConflito({
      overlap: {
        ...OVERLAP.overlap,
        occupants: [OCUPANTE, { ...OCUPANTE, activeStageId: "as8", taskTitle: "Campanha Natal" }],
      },
    });
    expect(screen.queryByRole("button", { name: "overlapPostpone" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "overlapFreeSpaceLink" })).toHaveAttribute(
      "href",
      `/planning/week?week=${AMANHA}&team=t-video`
    );
  });

  it("transferir a NOVA usa o dia ESCOLHIDO no formulário", async () => {
    // O dia é o do formulário, não o da coluna: o diálogo agora agenda para qualquer data futura.
    listWindowCandidates.mockResolvedValue({
      candidates: [{ id: "u3", name: "Carla", busy: false }],
    });
    await enviarComConflito();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapMoveNew" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapPickPersonSubmit" }));
    });
    expect(scheduleStage).toHaveBeenLastCalledWith({
      activeStageId: "as1",
      userId: "u3",
      dateISO: AMANHA,
    });
  });
});
