import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const setStageWindow = vi.fn().mockResolvedValue({ success: true });
const listWindowCandidates = vi.fn();
const scheduleStage = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/actions/week-planning", () => ({
  setStageWindow: (...a: unknown[]) => setStageWindow(...a),
  listWindowCandidates: (...a: unknown[]) => listWindowCandidates(...a),
  scheduleStage: (...a: unknown[]) => scheduleStage(...a),
}));
// Igual ao mock de CalendarToolbar.test.tsx: com `vals`, embute o JSON na saída — é como
// `screen.findByText(/Institucional Acme/)` enxerga o `task` interpolado sem precisar de um
// next-intl de verdade rodando no teste.
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vals?: Record<string, unknown>) =>
    vals ? `${k}:${JSON.stringify(vals)}` : k,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { WindowDialog } from "@/app/[locale]/(protected)/planning/week/WindowDialog";

beforeEach(() => vi.clearAllMocks());

describe("WindowDialog", () => {
  it("reabre com a hora que já está marcada", () => {
    // Editar um compromisso de 14h–16h num formulário vazio o transformaria em outro compromisso.
    render(
      <WindowDialog
        activeStageId="as1"
        label="Reels · Gravação"
        startTime="14:00"
        endTime="16:00"
        dayISO="2026-09-04"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    // `exact: false`: o label carrega o asterisco de obrigatório (FieldLabel `required`), então o
    // texto acessível é "windowStart*", não "windowStart".
    expect((screen.getByLabelText("windowStart", { exact: false }) as HTMLInputElement).value).toBe(
      "14:00"
    );
    expect((screen.getByLabelText("windowEnd") as HTMLInputElement).value).toBe("16:00");
  });

  it("envia início e fim", () => {
    render(
      <WindowDialog
        activeStageId="as1"
        label="Reels · Gravação"
        startTime={null}
        endTime={null}
        dayISO="2026-09-04"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.change(screen.getByLabelText("windowStart", { exact: false }), {
      target: { value: "09:30" },
    });
    fireEvent.submit(screen.getByTestId("window-form"));
    expect(setStageWindow).toHaveBeenCalledWith({
      activeStageId: "as1",
      startTime: "09:30",
      endTime: null,
    });
  });

  it("desmarcar manda startTime nulo", () => {
    // Limpar é a mesma porta, sem uma segunda ação no servidor.
    render(
      <WindowDialog
        activeStageId="as1"
        label="Reels · Gravação"
        startTime="14:00"
        endTime={null}
        dayISO="2026-09-04"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.click(screen.getByRole("button", { name: "windowClear" }));
    expect(setStageWindow).toHaveBeenCalledWith({ activeStageId: "as1", startTime: null });
  });

  it("reabrir depois de desmarcar não ressuscita o horário apagado", async () => {
    // A falha que isto evita: o `<li>` da célula é estável entre um "Desmarcar" e o
    // `router.refresh()` que o segue, então a MESMA instância do componente sobrevive. Sem
    // recarregar o rascunho a partir das props ao abrir, o formulário reabriria mostrando
    // 14:00–16:00 mesmo depois do servidor já ter apagado o compromisso — e um submit
    // desatento o recriaria.
    const { rerender } = render(
      <WindowDialog
        activeStageId="as1"
        label="Reels · Gravação"
        startTime="14:00"
        endTime="16:00"
        dayISO="2026-09-04"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.click(screen.getByRole("button", { name: "windowClear" }));

    // `fecharEAtualizar` roda dentro do `useTransition` do `useServerAction` — assíncrono. Espera
    // o diálogo fechar de verdade antes de simular o `router.refresh()`, senão a reabertura abaixo
    // não passaria por `handleOpenChange` com o diálogo já aberto.
    await waitFor(() => expect(screen.queryByTestId("window-form")).not.toBeInTheDocument());

    // O que `router.refresh()` traria de volta: as mesmas props, agora nulas.
    rerender(
      <WindowDialog
        activeStageId="as1"
        label="Reels · Gravação"
        startTime={null}
        endTime={null}
        dayISO="2026-09-04"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    expect((screen.getByLabelText("windowStart", { exact: false }) as HTMLInputElement).value).toBe(
      ""
    );
    expect((screen.getByLabelText("windowEnd") as HTMLInputElement).value).toBe("");
  });

  const OVERLAP = {
    overlap: {
      canOverride: true,
      occupants: [
        {
          activeStageId: "as9",
          taskTitle: "Institucional Acme",
          stageName: "Gravação",
          priority: "HIGH",
          startISO: "2026-09-04T17:00:00.000Z",
          endISO: "2026-09-04T19:00:00.000Z",
        },
      ],
      firstFreeStartISO: "2026-09-04T20:00:00.000Z",
    },
  };

  it("mostra quem está no caminho em vez de um erro genérico", async () => {
    // Uma recusa que não diz o que está no caminho obriga o gestor a caçar na grade.
    setStageWindow.mockResolvedValueOnce({
      ...OVERLAP,
      overlap: { ...OVERLAP.overlap, canOverride: false },
    });
    render(
      <WindowDialog
        activeStageId="as1"
        label="Natal · Gravação"
        startTime={null}
        endTime={null}
        dayISO="2026-09-04"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.change(screen.getByLabelText("windowStart", { exact: false }), {
      target: { value: "15:00" },
    });
    fireEvent.submit(screen.getByTestId("window-form"));

    expect(await screen.findByText(/Institucional Acme/)).toBeInTheDocument();
    // Prioridade não autoriza: adiar a ocupante não é oferecido.
    expect(screen.queryByRole("button", { name: "overlapPostpone" })).not.toBeInTheDocument();
  });

  it("com prioridade autorizada, adiar a ocupante manda o horário já calculado", async () => {
    setStageWindow.mockResolvedValueOnce(OVERLAP);
    render(
      <WindowDialog
        activeStageId="as1"
        label="Natal · Gravação"
        startTime={null}
        endTime={null}
        dayISO="2026-09-04"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.change(screen.getByLabelText("windowStart", { exact: false }), {
      target: { value: "15:00" },
    });
    fireEvent.submit(screen.getByTestId("window-form"));

    // Espera o botão existir e só então busca a referência de novo antes de clicar — o handle que
    // `findByRole` devolve pode ter ficado obsoleto se algo re-renderizou entre o `await` e o clique
    // (o `DismissableLayer` do Radix reage a montagem de forma assíncrona), e clicar num nó
    // desconectado não dispara o handler do React.
    await screen.findByRole("button", { name: "overlapPostpone" });
    fireEvent.click(screen.getByRole("button", { name: "overlapPostpone" }));

    // O clique roda `adiarOcupante.run` dentro de um `useTransition` — a chamada a `setStageWindow`
    // não é garantida antes deste ponto da mesma task síncrona, então a asserção espera por ela em
    // vez de presumir que já aconteceu.
    // 2026-09-04T20:00Z = 17h em São Paulo.
    await waitFor(() =>
      expect(setStageWindow).toHaveBeenCalledWith({
        activeStageId: "as9",
        startTime: "17:00",
        endTime: null,
      })
    );
  });

  it("com dois ocupantes, adiar não é oferecido", async () => {
    // Ruling do controlador (fora do brief): adiar mexe em UM compromisso por vez — decidir em
    // cadeia é do gestor, uma ocupante de cada vez — e o `firstFreeStartISO` que o servidor manda
    // é dimensionado só para o caso de um único ocupante. Com dois ou mais, só as saídas que não
    // tocam nos ocupantes ficam de pé: escolher outro horário, ou cancelar.
    setStageWindow.mockResolvedValueOnce({
      overlap: {
        canOverride: true,
        occupants: [
          OVERLAP.overlap.occupants[0],
          {
            activeStageId: "as10",
            taskTitle: "Reels Natal",
            stageName: "Edição",
            priority: "HIGH",
            startISO: "2026-09-04T19:00:00.000Z",
            endISO: "2026-09-04T20:00:00.000Z",
          },
        ],
        firstFreeStartISO: "2026-09-04T21:00:00.000Z",
      },
    });
    render(
      <WindowDialog
        activeStageId="as1"
        label="Natal · Gravação"
        startTime={null}
        endTime={null}
        dayISO="2026-09-04"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.change(screen.getByLabelText("windowStart", { exact: false }), {
      target: { value: "15:00" },
    });
    fireEvent.submit(screen.getByTestId("window-form"));

    expect(await screen.findByText(/Institucional Acme/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "overlapPostpone" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "overlapRetime" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "overlapCancel" })).toBeInTheDocument();
  });

  it("oferece só quem está livre, e mostra o ocupado desabilitado", async () => {
    // Sumir da lista não se distingue de "não é do time".
    setStageWindow.mockResolvedValueOnce(OVERLAP);
    listWindowCandidates.mockResolvedValue({
      candidates: [
        { id: "u2", name: "Bruno", busy: true },
        { id: "u3", name: "Carla", busy: false },
      ],
    });
    render(
      <WindowDialog
        activeStageId="as1"
        label="Natal · Gravação"
        startTime={null}
        endTime={null}
        dayISO="2026-09-04"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.change(screen.getByLabelText("windowStart", { exact: false }), {
      target: { value: "15:00" },
    });
    fireEvent.submit(screen.getByTestId("window-form"));

    // Mesma cautela do teste de adiar: espera existir e busca de novo antes de clicar, para
    // não usar um handle que ficou obsoleto entre o `await` e o clique.
    await screen.findByRole("button", { name: "overlapMoveOccupant" });
    fireEvent.click(screen.getByRole("button", { name: "overlapMoveOccupant" }));

    const bruno = await screen.findByRole("option", { name: /Bruno/ });
    expect(bruno).toBeDisabled();
    expect(screen.getByRole("option", { name: /Carla/ })).not.toBeDisabled();
  });

  it("transferir a OCUPANTE chama scheduleStage com o dia da coluna", async () => {
    setStageWindow.mockResolvedValueOnce(OVERLAP);
    listWindowCandidates.mockResolvedValue({
      candidates: [{ id: "u3", name: "Carla", busy: false }],
    });
    render(
      <WindowDialog
        activeStageId="as1"
        label="Natal · Gravação"
        startTime={null}
        endTime={null}
        dayISO="2026-09-04"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.change(screen.getByLabelText("windowStart", { exact: false }), {
      target: { value: "15:00" },
    });
    fireEvent.submit(screen.getByTestId("window-form"));
    // Mesma cautela do teste de adiar: espera existir e busca de novo antes de clicar, para
    // não usar um handle que ficou obsoleto entre o `await` e o clique.
    await screen.findByRole("button", { name: "overlapMoveOccupant" });
    fireEvent.click(screen.getByRole("button", { name: "overlapMoveOccupant" }));
    await screen.findByLabelText("overlapPickPerson");
    fireEvent.change(screen.getByLabelText("overlapPickPerson"), { target: { value: "u3" } });
    fireEvent.click(screen.getByRole("button", { name: "overlapPickPersonSubmit" }));

    // Mesmo motivo do teste de adiar: o clique roda `moverOcupante.run` dentro de um
    // `useTransition`, então a asserção espera em vez de presumir a chamada síncrona.
    await waitFor(() =>
      expect(scheduleStage).toHaveBeenCalledWith({
        activeStageId: "as9", // a OCUPANTE, não a nova
        userId: "u3",
        dateISO: "2026-09-04",
      })
    );
  });
});
