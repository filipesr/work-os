import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

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

// Todo clique que dispara uma server action mocada (`setStageWindow`/`scheduleStage`/
// `listWindowCandidates`) vai dentro de `await act(async () => { fireEvent... })`, nunca solto.
// `act` com callback assíncrono drena a fila de microtasks — incluindo cadeias de VÁRIOS hops
// (ex.: `adiarOcupante` chamando `marcar` no próprio `onSuccess`) — antes de devolver, então a
// asserção que segue lê o estado final por construção, não por ter esperado o bastante. Um
// `waitFor`/`findBy` com timeout (1s por padrão) faz o oposto: sob contenção de CPU — a suíte
// inteira tem 128 arquivos disputando os mesmos núcleos, bem mais devagar que este arquivo sozinho
// — a cadeia pode não terminar dentro do orçamento, e o teste falha por relógio, não por lógica.
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

  it("envia início e fim", async () => {
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
    await act(async () => {
      fireEvent.submit(screen.getByTestId("window-form"));
    });
    expect(setStageWindow).toHaveBeenCalledWith({
      activeStageId: "as1",
      startTime: "09:30",
      endTime: null,
    });
  });

  it("desmarcar manda startTime nulo", async () => {
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
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "windowClear" }));
    });
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

    // `desmarcar.run` -> `setStageWindow` -> `onSuccess` (`fecharEAtualizar`: `setOpen(false)` +
    // `router.refresh()`) — `act` drena a cadeia inteira antes de devolver.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "windowClear" }));
    });
    expect(screen.queryByTestId("window-form")).not.toBeInTheDocument();

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
          // Fim DECLARADO: 14h às 16h foi combinado assim, não derivado da referência da etapa.
          endDeclared: true,
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
    await act(async () => {
      fireEvent.submit(screen.getByTestId("window-form"));
    });

    expect(screen.getByText(/Institucional Acme/)).toBeInTheDocument();
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
    await act(async () => {
      fireEvent.submit(screen.getByTestId("window-form"));
    });

    // O clique fecha DOIS elos: `adiarOcupante.run` resolve, e o `onSuccess` dele dispara um
    // SEGUNDO `setStageWindow` (via `marcar.run`) que fecha o diálogo (`fecharEAtualizar`). `act`
    // drena os dois hops antes de devolver.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapPostpone" }));
    });

    // 2026-09-04T20:00Z = 17h em São Paulo. E o fim vai JUNTO: a ocupante declarou 14h-16h, duas
    // horas — adiada para as 17h, ela termina às 19h. Mandar `endTime: null` aqui devolveria um
    // compromisso de "17h + referência da etapa", encurtando (ou esticando) por conta própria algo
    // que foi combinado com o estúdio. A spec é explícita: a duração declarada é preservada.
    expect(setStageWindow).toHaveBeenCalledWith({
      activeStageId: "as9",
      startTime: "17:00",
      endTime: "19:00",
    });
    expect(screen.queryByRole("button", { name: "overlapCancel" })).not.toBeInTheDocument();
  });

  it("adiar quem NÃO declarou fim continua sem fim — a faixa desliza com a referência", async () => {
    // O outro lado da mesma regra: `endISO` também vem preenchido quando o fim foi DERIVADO da
    // referência da etapa. Reenviá-lo como fim declarado inventaria um combinado que ninguém fez —
    // e congelaria a duração de um item cuja faixa deve continuar acompanhando a referência.
    setStageWindow.mockResolvedValueOnce({
      overlap: {
        ...OVERLAP.overlap,
        occupants: [{ ...OVERLAP.overlap.occupants[0], endDeclared: false }],
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
    await act(async () => {
      fireEvent.submit(screen.getByTestId("window-form"));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapPostpone" }));
    });

    expect(setStageWindow).toHaveBeenCalledWith({
      activeStageId: "as9",
      startTime: "17:00",
      endTime: null,
    });
  });

  it("com dois ocupantes, adiar não é oferecido", async () => {
    // Ruling do controlador (fora do brief): adiar E mover-a-ocupante mexem em UM compromisso
    // alheio por vez — decidir em cadeia é do gestor, uma ocupante de cada vez —, e os dois dependem
    // de um único referente ("a ocupante"): `firstFreeStartISO` é dimensionado só para um ocupante, e
    // o botão de mover hardcoda `occupants[0]`. Com dois ou mais, só as saídas que não tocam nos
    // ocupantes ficam de pé: escolher outro horário, mover a NOVA, ou cancelar.
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
    await act(async () => {
      fireEvent.submit(screen.getByTestId("window-form"));
    });

    expect(screen.getByText(/Institucional Acme/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "overlapPostpone" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "overlapMoveOccupant" })).not.toBeInTheDocument();
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
    await act(async () => {
      fireEvent.submit(screen.getByTestId("window-form"));
    });

    // `escolherPessoa` (via `startChoosing`) busca `listWindowCandidates` e só então preenche
    // `picker` — outro hop assíncrono que `act` drena antes de devolver.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapMoveOccupant" }));
    });

    const bruno = screen.getByRole("option", { name: /Bruno/ });
    expect(bruno).toBeDisabled();
    expect(screen.getByRole("option", { name: /Carla/ })).not.toBeDisabled();
  });

  it("com todo mundo ocupado, avisa em vez de deixar o formulário morto", async () => {
    // Sem isto, `picker.userId` fica "" para sempre (nenhum candidato livre para pré-selecionar) e
    // o botão de confirmar fica desabilitado sem explicação — igual ao `dialogNoOneInTeam` que o
    // `ScheduleDialog` já cobre para o time vazio.
    setStageWindow.mockResolvedValueOnce(OVERLAP);
    listWindowCandidates.mockResolvedValue({
      candidates: [
        { id: "u2", name: "Bruno", busy: true },
        { id: "u3", name: "Carla", busy: true },
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
    await act(async () => {
      fireEvent.submit(screen.getByTestId("window-form"));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapMoveOccupant" }));
    });

    expect(screen.getByText("overlapNoOneFree")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "overlapPickPersonSubmit" })).toBeDisabled();
  });

  it("[CRÍTICO] mover a NOVA pede os candidatos com a faixa DO FORMULÁRIO", async () => {
    // A nova não tem janela gravada — a escrita dela acabou de ser recusada pela colisão, que é o
    // motivo de este painel estar aberto. Pedir os candidatos sem dizer a faixa fazia o servidor
    // procurá-la no banco, não achar, e responder "etapa não encontrada": a saída que a spec
    // promete quando a prioridade NÃO autoriza morria com um erro que não explica nada.
    setStageWindow.mockResolvedValueOnce({
      ...OVERLAP,
      overlap: { ...OVERLAP.overlap, canOverride: false },
    });
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
    fireEvent.change(screen.getByLabelText("windowEnd"), { target: { value: "17:00" } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId("window-form"));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapMoveNew" }));
    });

    expect(listWindowCandidates).toHaveBeenCalledWith("as1", {
      startTime: "15:00",
      endTime: "17:00",
    });
    expect(screen.getByRole("option", { name: /Carla/ })).toBeInTheDocument();
  });

  it("mover a OCUPANTE pede os candidatos pela janela DELA, não pela do formulário", async () => {
    // A ocupante viaja com a hora que ela já tem (`scheduleStage` a preserva na troca de dono no
    // mesmo dia), e é contra ESSA faixa que o servidor checa a agenda do destino. Mandar aqui a
    // hora do formulário — que é da outra demanda — listaria como livre alguém que `scheduleStage`
    // recusaria em seguida com `windowBusyPerson`: um beco sem explicação.
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
    await act(async () => {
      fireEvent.submit(screen.getByTestId("window-form"));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapMoveOccupant" }));
    });

    expect(listWindowCandidates).toHaveBeenCalledWith("as9");
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
    await act(async () => {
      fireEvent.submit(screen.getByTestId("window-form"));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapMoveOccupant" }));
    });

    fireEvent.change(screen.getByLabelText("overlapPickPerson"), { target: { value: "u3" } });

    // `moverOcupante.run` -> `scheduleStage` -> `onSuccess` (`setPicker(null)` +
    // `fecharEAtualizar`) — outra cadeia de dois hops que `act` drena por inteiro.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlapPickPersonSubmit" }));
    });

    expect(scheduleStage).toHaveBeenCalledWith({
      activeStageId: "as9", // a OCUPANTE, não a nova
      userId: "u3",
      dateISO: "2026-09-04",
    });
    expect(screen.queryByRole("button", { name: "overlapCancel" })).not.toBeInTheDocument();
  });
});
