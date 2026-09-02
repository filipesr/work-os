import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({ getStageReferences: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { listWindowCandidates, setStageWindow } from "@/lib/actions/week-planning";
import { notDiscardedStageWhere } from "@/lib/task-availability";

const db = prisma as unknown as {
  taskActiveStage: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

/** Linha programada para 04/09, sem compromisso ainda. `plannedDate` é meia-noite SP codificada em
 *  UTC — a mesma convenção que `scheduleStage` grava. */
function linha(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    assigneeId: "u1",
    status: "ACTIVE",
    stageId: "s1",
    plannedDate: new Date("2026-09-04T00:00:00Z"),
    scheduledStart: null,
    scheduledEnd: null,
    task: { priority: "MEDIUM", title: "Reels institucional" },
    stage: { name: "Gravação" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.taskActiveStage.findMany.mockResolvedValue([]);
  vi.mocked(getStageReferences).mockResolvedValue(
    new Map([["s1", { hours: 3, source: "observed" }]])
  );
});

/** Relógio congelado: as datas dos casos são fixas e a regra "hoje é fila" compara com o dia
 *  corrente. Sem isto, o arquivo passaria hoje e falharia sozinho em 04/09. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T15:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("setStageWindow — hoje não recebe compromisso", () => {
  it("recusa marcar hora numa etapa cujo dia é HOJE", async () => {
    // Hoje é ordem de FILA: o que entra no dia de alguém agora se faz na vez, não às 14h em ponto.
    // Compromisso é coisa de dia futuro — e uma hora marcada para hoje nasceria metade das vezes
    // já vencida, que é o defeito que esta regra fecha na origem.
    vi.setSystemTime(new Date("2026-09-04T15:00:00.000Z"));
    db.taskActiveStage.findUnique.mockResolvedValue(linha());

    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });

    expect(r).toEqual({ error: "windowNotToday" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("DESMARCAR continua valendo mesmo no dia de hoje", async () => {
    // Limpar é sempre permitido: um compromisso preso numa etapa que não pode mais recebê-lo é
    // pior que a limpeza. Vale para o legado marcado antes desta regra existir.
    vi.setSystemTime(new Date("2026-09-04T15:00:00.000Z"));
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ scheduledStart: new Date("2026-09-04T17:00:00Z") })
    );

    const r = await setStageWindow({ activeStageId: "as1", startTime: null });

    expect(r).toEqual({ success: true });
    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      scheduledStart: null,
      scheduledEnd: null,
    });
  });

  it("dia FUTURO recebe compromisso normalmente", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });
    expect(r).toEqual({ success: true });
  });
});

describe("setStageWindow", () => {
  it("grava a hora como INSTANTE REAL do dia da coluna", async () => {
    // 14h em São Paulo é 17h UTC. Gravar "14:00" cru deixaria o compromisso três horas adiantado,
    // e o erro só apareceria na borda do dia — o mesmo que o comentário de `realInstant` descreve.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());

    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });

    expect(r).toEqual({ success: true });
    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      scheduledStart: new Date("2026-09-04T17:00:00.000Z"),
      scheduledEnd: null,
    });
  });

  it("grava o fim quando informado", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());

    await setStageWindow({ activeStageId: "as1", startTime: "14:00", endTime: "16:30" });

    expect(db.taskActiveStage.update.mock.calls[0][0].data.scheduledEnd).toEqual(
      new Date("2026-09-04T19:30:00.000Z")
    );
  });

  it("startTime nulo limpa a janela inteira", async () => {
    // Desmarcar o compromisso é a mesma porta, sem uma segunda ação: o fim nunca sobrevive ao
    // início, senão sobraria uma janela sem começo.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({
        scheduledStart: new Date("2026-09-04T17:00:00Z"),
        scheduledEnd: new Date("2026-09-04T19:00:00Z"),
      })
    );

    await setStageWindow({ activeStageId: "as1", startTime: null });

    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      scheduledStart: null,
      scheduledEnd: null,
    });
  });
});

describe("setStageWindow — recusas", () => {
  it("etapa sem dia não recebe compromisso", async () => {
    // "Quinta às 14h" precisa da quinta. Sem `plannedDate` não há dia em que ancorar a hora, e o
    // item nem aparece numa coluna da grade.
    db.taskActiveStage.findUnique.mockResolvedValue(linha({ plannedDate: null }));
    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });
    expect(r).toEqual({ error: "windowNeedsDay" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("etapa concluída não recebe compromisso", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha({ status: "COMPLETED" }));
    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });
    expect(r).toEqual({ error: "completedStage" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("hora fora do formato é recusada, sem tentar gravar", async () => {
    // Vem de `<input type="time">`, mas a ação é chamável direto — a tela explica, o servidor
    // garante.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    for (const hora of ["25:00", "14h", "", "9:00"]) {
      const r = await setStageWindow({ activeStageId: "as1", startTime: hora });
      expect(r).toEqual({ error: "invalidTime" });
    }
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("fim antes do início é recusado", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    const r = await setStageWindow({ activeStageId: "as1", startTime: "16:00", endTime: "14:00" });
    expect(r).toEqual({ error: "windowEndBeforeStart" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("fim IGUAL ao início é recusado — janela de duração zero não ocupa nada", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00", endTime: "14:00" });
    expect(r).toEqual({ error: "windowEndBeforeStart" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });
});

/** Uma ocupante já marcada das 14h às 16h para a mesma pessoa, no mesmo dia. */
function ocupante(over: Record<string, unknown> = {}) {
  return {
    id: "as9",
    stageId: "s9",
    scheduledStart: new Date("2026-09-04T17:00:00Z"),
    scheduledEnd: new Date("2026-09-04T19:00:00Z"),
    task: { priority: "HIGH", title: "Institucional Acme" },
    stage: { name: "Gravação" },
    ...over,
  };
}

describe("setStageWindow — a trava de sobreposição", () => {
  it("sem colisão, grava", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);
    // 17h–20h não encosta em 14h–16h.
    const r = await setStageWindow({ activeStageId: "as1", startTime: "17:00" });
    expect(r).toEqual({ success: true });
  });

  it("colide e a prioridade NÃO autoriza: não grava, e diz quem está no caminho", async () => {
    // MEDIUM contra HIGH. Uma recusa que não nomeia a ocupante obriga o gestor a caçar na grade.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);

    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      overlap: {
        canOverride: false,
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
      },
    });
  });

  it("colide e a prioridade autoriza: AINDA NÃO grava — a saída é do gestor", async () => {
    // A regra é "sempre avisa, e só permite se a prioridade autorizar". Permitir não é gravar por
    // cima: gravar deixaria duas janelas no mesmo horário, que é exatamente o que esta trava
    // existe para impedir. Quem escolhe a saída é o gestor, no diálogo.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ task: { priority: "URGENT", title: "Campanha Natal" } })
    );
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);

    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
    expect(r).toMatchObject({ overlap: { canOverride: true } });
  });

  it("o horário oferecido para adiar pula um terceiro compromisso", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ task: { priority: "URGENT", title: "Campanha Natal" } })
    );
    db.taskActiveStage.findMany.mockResolvedValue([
      ocupante(),
      ocupante({
        id: "as8",
        scheduledStart: new Date("2026-09-04T20:00:00Z"), // 17h–18h
        scheduledEnd: new Date("2026-09-04T21:00:00Z"),
      }),
    ]);

    // Nova das 15h às 17h (2h de referência). A ocupante das 14h–16h seria empurrada para 17h,
    // onde há outro compromisso — então o primeiro livre de verdade é 18h.
    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00", endTime: "17:00" });

    expect(r).toMatchObject({ overlap: { firstFreeStartISO: "2026-09-04T21:00:00.000Z" } });
  });

  it("o payload diz se o FIM da ocupante foi declarado — 14h-18h não vira 14h+referência", async () => {
    // "A duração declarada é preservada", diz a spec da saída "adiar". A tela só sabe preservá-la
    // se souber que existe: `endISO` sozinho é ambíguo, porque ele também vem preenchido quando o
    // fim foi DERIVADO da referência da etapa. Sem esta marca, adiar um compromisso declarado de
    // 14h às 18h o devolvia como início + referência, encolhendo um combinado com o estúdio.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);

    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(r).toMatchObject({ overlap: { occupants: [{ endDeclared: true }] } });
  });

  it("ocupante SEM fim declarado é marcada como tal — a faixa dela veio da referência", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    db.taskActiveStage.findMany.mockResolvedValue([ocupante({ scheduledEnd: null })]);
    vi.mocked(getStageReferences).mockResolvedValue(
      new Map([
        ["s1", { hours: 3, source: "observed" }],
        ["s9", { hours: 2, source: "observed" }],
      ])
    );

    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(r).toMatchObject({ overlap: { occupants: [{ endDeclared: false }] } });
  });

  it("[IMPORTANTE] a ocupante não é obstáculo de si mesma no primeiro horário livre", async () => {
    // Nova das 14h às 15h contra uma ocupante das 14h às 16h: o lugar livre para a ocupante é 15h,
    // logo depois da nova. Passando a lista INTEIRA de ocupadas, a própria ocupante entrava como
    // obstáculo — 15h-17h "colide" com ela mesma às 14h-16h — e a tela oferecia 16h, uma hora a
    // mais de atraso que ninguém precisava.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ task: { priority: "URGENT", title: "Campanha Natal" } })
    );
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);

    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00", endTime: "15:00" });

    // 2026-09-04T18:00Z = 15h em São Paulo.
    expect(r).toMatchObject({ overlap: { firstFreeStartISO: "2026-09-04T18:00:00.000Z" } });
  });

  it("a consulta das ocupantes é da MESMA pessoa, no MESMO dia, e ignora a própria linha", async () => {
    // Sem excluir a si mesma, remarcar um compromisso existente colidiria com ele próprio.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ scheduledStart: new Date("2026-09-04T17:00:00Z") })
    );
    db.taskActiveStage.findMany.mockResolvedValue([]);

    await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(db.taskActiveStage.findMany.mock.calls[0][0].where).toMatchObject({
      assigneeId: "u1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: { not: null },
      id: { not: "as1" },
    });
  });

  it("[IMPORTANTE] demanda DESCARTADA não bloqueia horário — é a mesma regra da mesa", async () => {
    // A leitura da mesa já aplica `notDiscardedStageWhere`: uma demanda obsoleta ou cancelada não
    // ocupa dia de ninguém e não aparece na grade. As checagens de colisão não aplicavam — então a
    // janela de uma demanda MORTA barrava um agendamento legítimo, e a recusa ainda nomeava, como
    // obstáculo, algo que a tela não mostra em lugar nenhum. O gestor era mandado caçar um
    // fantasma. A regra mora em `lib/task-availability.ts` justamente para não divergir por tela.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    db.taskActiveStage.findMany.mockResolvedValue([]);

    await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(db.taskActiveStage.findMany.mock.calls[0][0].where).toMatchObject(
      notDiscardedStageWhere()
    );
  });
});

describe("listWindowCandidates", () => {
  it("lista o time efetivo marcando quem já tem compromisso na faixa", async () => {
    // Quem está ocupado aparece DESABILITADO, não sumido: "some da lista" não se distingue de "não
    // é do time", e o gestor precisa saber que a pessoa existe e está comprometida.
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      stageId: "s1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: new Date("2026-09-04T17:00:00Z"),
      scheduledEnd: new Date("2026-09-04T19:00:00Z"),
      teamId: null,
      team: null,
      stage: {
        name: "Gravação",
        defaultTeam: {
          id: "video",
          name: "Vídeo",
          members: [
            { id: "u1", name: "Ana", email: "ana@example.com" },
            { id: "u2", name: "Bruno", email: "bruno@example.com" },
            { id: "u3", name: "Carla", email: "carla@example.com" },
            // Sem nome preenchido: o rótulo tem de cair para o e-mail, não para o cuid cru — a
            // convenção `name ?? email ?? id` do resto do arquivo.
            { id: "u4", name: null, email: "dara@example.com" },
          ],
        },
      },
    });
    // Bruno tem 15h–17h, dentro da faixa da etapa (14h–16h): colide, fica ocupado.
    // Carla tem 17h–18h, no MESMO DIA mas FORA da faixa: é o caso que separa "ocupado NA FAIXA" de
    // "tem compromisso naquele dia" — sem ele, uma implementação que marcasse ocupado só por ter
    // algo no dia passaria batido.
    // Dara não tem nada.
    db.taskActiveStage.findMany.mockResolvedValue([
      {
        id: "as9",
        stageId: "s9",
        assigneeId: "u2",
        scheduledStart: new Date("2026-09-04T18:00:00Z"),
        scheduledEnd: new Date("2026-09-04T20:00:00Z"),
      },
      {
        id: "as10",
        stageId: "s10",
        assigneeId: "u3",
        scheduledStart: new Date("2026-09-04T20:00:00Z"),
        scheduledEnd: new Date("2026-09-04T21:00:00Z"),
      },
    ]);
    vi.mocked(getStageReferences).mockResolvedValue(new Map());

    const r = await listWindowCandidates("as1");

    expect(r).toEqual({
      candidates: [
        { id: "u1", name: "Ana", busy: false },
        { id: "u2", name: "Bruno", busy: true },
        { id: "u3", name: "Carla", busy: false },
        { id: "u4", name: "dara@example.com", busy: false },
      ],
    });
  });

  it("[CRÍTICO] etapa SEM janela armazenada, com a faixa PEDIDA explícita: calcula mesmo assim", async () => {
    // É a saída "passar ESTA para outra pessoa" do diálogo de sobreposição, e ela só existe para a
    // demanda NOVA — cuja escrita acabou de ser recusada pela colisão, então ela não tem janela
    // gravada nenhuma. Exigir `scheduledStart` matava a única saída construtiva que a spec promete
    // quando a prioridade NÃO autoriza tomar o horário: o gestor recebia "etapa não encontrada".
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      stageId: "s1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: null,
      scheduledEnd: null,
      teamId: null,
      team: null,
      stage: {
        name: "Gravação",
        defaultTeam: {
          id: "video",
          name: "Vídeo",
          members: [
            { id: "u2", name: "Bruno", email: "bruno@example.com" },
            { id: "u3", name: "Carla", email: "carla@example.com" },
          ],
        },
      },
    });
    // Bruno tem 15h–17h (colide com a faixa pedida de 14h–16h); Carla tem 17h–18h (não colide).
    db.taskActiveStage.findMany.mockResolvedValue([
      {
        id: "as9",
        stageId: "s9",
        assigneeId: "u2",
        scheduledStart: new Date("2026-09-04T18:00:00Z"),
        scheduledEnd: new Date("2026-09-04T20:00:00Z"),
      },
      {
        id: "as10",
        stageId: "s10",
        assigneeId: "u3",
        scheduledStart: new Date("2026-09-04T20:00:00Z"),
        scheduledEnd: new Date("2026-09-04T21:00:00Z"),
      },
    ]);
    vi.mocked(getStageReferences).mockResolvedValue(new Map());

    const r = await listWindowCandidates("as1", { startTime: "14:00", endTime: "16:00" });

    expect(r).toEqual({
      candidates: [
        { id: "u2", name: "Bruno", busy: true },
        { id: "u3", name: "Carla", busy: false },
      ],
    });
  });

  it("[CRÍTICO] a faixa PEDIDA vence a janela armazenada", async () => {
    // Reabrir o diálogo de um compromisso das 14h e pedir 17h: quem decide quem está livre é a
    // hora que o gestor acabou de digitar, não a que está no banco. Inferir da janela guardada
    // listava gente livre às 14h como se estivesse livre às 17h — e o contrário.
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      stageId: "s1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: new Date("2026-09-04T17:00:00Z"), // 14h
      scheduledEnd: new Date("2026-09-04T19:00:00Z"), // 16h
      teamId: null,
      team: null,
      stage: {
        name: "Gravação",
        defaultTeam: {
          id: "video",
          name: "Vídeo",
          members: [
            { id: "u2", name: "Bruno", email: "bruno@example.com" },
            { id: "u3", name: "Carla", email: "carla@example.com" },
          ],
        },
      },
    });
    // Bruno ocupa 14h–15h (colide com a janela ARMAZENADA, livre na pedida);
    // Carla ocupa 17h30–18h (colide com a faixa PEDIDA de 17h–19h, livre na armazenada).
    db.taskActiveStage.findMany.mockResolvedValue([
      {
        id: "as9",
        stageId: "s9",
        assigneeId: "u2",
        scheduledStart: new Date("2026-09-04T17:00:00Z"),
        scheduledEnd: new Date("2026-09-04T18:00:00Z"),
      },
      {
        id: "as10",
        stageId: "s10",
        assigneeId: "u3",
        scheduledStart: new Date("2026-09-04T20:30:00Z"),
        scheduledEnd: new Date("2026-09-04T21:00:00Z"),
      },
    ]);
    vi.mocked(getStageReferences).mockResolvedValue(new Map());

    const r = await listWindowCandidates("as1", { startTime: "17:00", endTime: "19:00" });

    expect(r).toEqual({
      candidates: [
        { id: "u2", name: "Bruno", busy: false },
        { id: "u3", name: "Carla", busy: true },
      ],
    });
  });

  it("etapa sem janela não tem candidatos a calcular", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      stageId: "s1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: null,
      scheduledEnd: null,
      teamId: null,
      team: null,
      stage: { name: "Gravação", defaultTeam: { id: "video", name: "Vídeo", members: [] } },
    });
    // Sem janela guardada E sem faixa pedida não há faixa nenhuma contra a qual medir "ocupado" —
    // é o único caso que continua recusando.
    expect(await listWindowCandidates("as1")).toEqual({ error: "stageNotFound" });
  });
});
