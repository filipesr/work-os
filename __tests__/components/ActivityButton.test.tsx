import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityButton } from "@/components/tasks/ActivityButton";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

const toastError = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: (m: string) => toastError(m) }),
}));

const startWork = vi.fn(async () => ({ success: true, status: "started" }));
const stopWork = vi.fn(async () => ({ success: true }));
vi.mock("@/lib/actions/activity", () => ({
  startWorkOnTask: (...a: unknown[]) => startWork(...(a as [])),
  stopWorkOnTask: (...a: unknown[]) => stopWork(...(a as [])),
}));

// useServerAction encapsula pending/toast; aqui só precisamos que ele CHAME a
// action e repasse o resultado ao onSuccess.
vi.mock("@/lib/hooks/useServerAction", () => ({
  useServerAction: (
    action: (...a: unknown[]) => Promise<unknown>,
    opts?: { onSuccess?: (r: unknown) => void }
  ) => ({
    run: async (...args: unknown[]) => {
      const r = await action(...args);
      opts?.onSuccess?.(r);
      return r;
    },
    isPending: false,
  }),
}));

const OTHER_LOG = {
  id: "log-A",
  taskId: "task-A",
  task: { id: "task-A", title: "Tarefa anterior" },
};

/**
 * A regra de produto: trocar de tarefa exige justificativa; parar a própria não.
 * O fluxo nunca foi visto funcionando, e é o que protege contra perder as horas
 * da tarefa interrompida.
 */
describe("ActivityButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem nada em curso, iniciar chama a action direto (sem diálogo)", async () => {
    const user = userEvent.setup();
    render(
      <ActivityButton taskId="task-B" taskTitle="Nova" currentStageId="s1" activeLog={null} />
    );

    await user.click(screen.getByRole("button", { name: /startWork/ }));

    expect(startWork).toHaveBeenCalledWith("task-B", "s1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("com OUTRA tarefa em curso, iniciar abre o diálogo em vez de trocar", async () => {
    // O ponto da feature: a troca não pode acontecer em silêncio.
    const user = userEvent.setup();
    render(
      <ActivityButton taskId="task-B" taskTitle="Nova" currentStageId="s1" activeLog={OTHER_LOG} />
    );

    await user.click(screen.getByRole("button", { name: /startWork/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(startWork).not.toHaveBeenCalled();
  });

  it("o campo de motivo é obrigatório no diálogo de troca", async () => {
    const user = userEvent.setup();
    render(
      <ActivityButton taskId="task-B" taskTitle="Nova" currentStageId="s1" activeLog={OTHER_LOG} />
    );

    await user.click(screen.getByRole("button", { name: /startWork/ }));
    await screen.findByRole("dialog");

    expect(screen.getByLabelText(/switch.label/)).toBeRequired();
  });

  it("com motivo preenchido, troca passando a justificativa", async () => {
    const user = userEvent.setup();
    render(
      <ActivityButton taskId="task-B" taskTitle="Nova" currentStageId="s1" activeLog={OTHER_LOG} />
    );

    await user.click(screen.getByRole("button", { name: /startWork/ }));
    await user.type(await screen.findByLabelText(/switch.label/), "cliente pediu prioridade");
    await user.click(screen.getByRole("button", { name: /switch.confirm/ }));

    expect(startWork).toHaveBeenCalledWith("task-B", "s1", "cliente pediu prioridade");
  });

  it("avisa que as horas da tarefa anterior serão registradas", async () => {
    // Sem esse aviso, quem conhecia o comportamento antigo evitaria trocar de
    // tarefa para não perder o tempo trabalhado.
    const user = userEvent.setup();
    render(
      <ActivityButton taskId="task-B" taskTitle="Nova" currentStageId="s1" activeLog={OTHER_LOG} />
    );

    await user.click(screen.getByRole("button", { name: /startWork/ }));
    expect(await screen.findByText(/switch.timeNotice/)).toBeInTheDocument();
  });

  it("na tarefa ATIVA mostra parar, e a descrição é opcional", async () => {
    const user = userEvent.setup();
    const own = { id: "log-B", taskId: "task-B", task: { id: "task-B", title: "Nova" } };
    render(<ActivityButton taskId="task-B" taskTitle="Nova" currentStageId="s1" activeLog={own} />);

    await user.click(screen.getByRole("button", { name: /stopWork/ }));
    await screen.findByRole("dialog");

    // Parar o próprio trabalho não exige justificar-se.
    expect(screen.getByLabelText(/modal.label/)).not.toBeRequired();

    await user.click(screen.getByRole("button", { name: /modal.confirm/ }));
    expect(stopWork).toHaveBeenCalledWith("log-B", "task-B", "");
  });

  it("sem etapa atual, avisa e não chama a action", async () => {
    const user = userEvent.setup();
    render(
      <ActivityButton taskId="task-B" taskTitle="Nova" currentStageId={null} activeLog={null} />
    );

    await user.click(screen.getByRole("button", { name: /startWork/ }));

    expect(startWork).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });
});
