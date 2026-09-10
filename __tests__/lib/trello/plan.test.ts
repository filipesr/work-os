import fs from "fs";
import { describe, expect, it } from "vitest";
import { buildImportPlan } from "@/lib/trello/plan";
import type {
  ExportCard,
  TrelloAction,
  TrelloBoardExport,
  TrelloList,
  TrelloMember,
  WorkOSUser,
} from "@/lib/trello/types";

/** Helper: cria um card do export com os valores padrão para teste. `id` é obrigatório — é a chave
 * que casa o card com suas movimentações e o identifica nos itens do plano. */
function card(overrides: Partial<ExportCard> & Pick<ExportCard, "id">): ExportCard {
  return {
    name: "Card padrão",
    idLabels: [],
    attachments: [],
    idList: "L_OTHER",
    dateClosed: null,
    dateLastActivity: null,
    closed: false,
    desc: "",
    due: null,
    ...overrides,
  };
}

/** Helper: cria uma ação "updateCard" com troca de lista, do jeito que board.actions carrega. */
function action(
  fromListName: string,
  toListName: string,
  at: string,
  cardId: string
): TrelloAction {
  return {
    type: "updateCard",
    date: at,
    data: {
      card: { id: cardId },
      listBefore: { name: fromListName },
      listAfter: { name: toListName },
    },
  };
}

function trelloList(id: string, name: string): TrelloList {
  return { id, name };
}

function member(id: string, username: string, fullName: string): TrelloMember {
  return { id, username, fullName };
}

function user(id: string, name: string, email: string): WorkOSUser {
  return { id, name, email };
}

/** Listas padrão do quadro de teste — as mesmas que map-stages.test.ts usa, mais COMUNICADOR (lista
 * que não mapeia para etapa nenhuma — a armadilha que a spec cita). */
const LISTS: TrelloList[] = [
  trelloList("L_DESENHO", "DISEÑO - MARTIN"),
  trelloList("L_AV", "AUDIOVISUAL"),
  trelloList("L_REVISION", "REVISIÓN"),
  trelloList("L_LIBERADO", "LIBERADO"),
  trelloList("L_CONC", "Concluido"),
  trelloList("L_COMUNICADOR", "COMUNICADOR"),
];

const MEMBERS: TrelloMember[] = [member("tMartin", "martingoonmkt", "Martin")];
const USERS: WorkOSUser[] = [user("u1", "Martin", "martin@goon.com")];

/** Helper: monta um board de teste a partir de uma lista de cards. */
function board(cards: ExportCard[], overrides: Partial<TrelloBoardExport> = {}): TrelloBoardExport {
  return {
    cards,
    labels: [],
    lists: LISTS,
    members: MEMBERS,
    actions: [],
    ...overrides,
  };
}

// Fixture reutilizada pelos testes de agrupamento e descarte: uma demanda de verdade (nível 3, lista
// DISEÑO - MARTIN) e um representante de cada natureza não-demanda.
const demanda1 = card({
  id: "c1",
  name: "Peça de campanha",
  idList: "L_DESENHO",
  due: "2026-07-15T00:00:00Z",
});
const separador = card({ id: "c2", name: "-----" });
const ausencia = card({ id: "c3", name: "FERIADO 14/05" });
const referencia = card({ id: "c4", name: "MODELO - Coisa" });
const baseBoard = board([demanda1, separador, ausencia, referencia]);

describe("buildImportPlan", () => {
  it("agrupa em um projeto por mês, com nome previsível", () => {
    const p = buildImportPlan(baseBoard, USERS, {});
    expect(p.projects.map((x) => x.name)).toContain("AtlanticoShop 2026-07");
  });

  it("descarta separador, ausência e referência, dizendo o motivo de cada um", () => {
    const p = buildImportPlan(baseBoard, USERS, {});
    const motivos = new Set(p.skipped.map((s) => s.reason));
    expect(motivos).toEqual(new Set(["separador", "ausencia", "referencia"]));
  });

  it("toda demanda planejada tem pelo menos uma etapa", () => {
    const p = buildImportPlan(baseBoard, USERS, {});
    for (const t of p.tasks) expect(t.stages.length).toBeGreaterThan(0);
  });

  it("resolve o responsável da etapa a partir do nome na lista, casado com o usuário WorkOS", () => {
    const p = buildImportPlan(baseBoard, USERS, {});
    const t = p.tasks.find((x) => x.card.id === "c1")!;
    expect(t.stages[0]).toMatchObject({
      stageName: "Desenho",
      assigneeTrelloId: "tMartin",
      assigneeUserId: "u1",
    });
  });

  it("opts.clientName sobrescreve o nome do cliente no nome do projeto", () => {
    const p = buildImportPlan(baseBoard, USERS, { clientName: "OutroCliente" });
    expect(p.projects.map((x) => x.name)).toContain("OutroCliente 2026-07");
  });

  it("opts.clientId vira o clientId de cada projeto — dado, não recorte do nome", () => {
    const p = buildImportPlan(baseBoard, USERS, { clientId: "client-real-id" });
    expect(p.projects.every((x) => x.clientId === "client-real-id")).toBe(true);
  });

  it("sem opts.clientId, o projeto nasce com clientId vazio — plan.ts continua puro, sem inventar id", () => {
    const p = buildImportPlan(baseBoard, USERS, {});
    expect(p.projects.every((x) => x.clientId === "")).toBe(true);
  });

  it("opts.manualMatches casa o membro cujo cadastro foge do padrão das três chaves", () => {
    const foraDoPadrao = [user("u9", "Sara Rufina Maldonado Morel", "saragoonmmkt@gmail.com")];
    const b = board(
      [card({ id: "s1", idList: "L_AV", idMembers: ["tSara"], due: "2026-07-15T00:00:00Z" })],
      {
        members: [member("tSara", "saragoon1", "Sara Goon")],
      }
    );
    const semMapa = buildImportPlan(b, foraDoPadrao, {});
    expect(semMapa.unmatchedPeople.map((x) => x.id)).toEqual(["tSara"]);

    const comMapa = buildImportPlan(b, foraDoPadrao, {
      manualMatches: { saragoon1: "saragoonmmkt@gmail.com" },
    });
    expect(comMapa.unmatchedPeople).toEqual([]);
    expect(comMapa.tasks[0].stages[0].assigneeUserId).toBe("u9");
  });

  it("membro do Trello sem casamento no WorkOS vai para unmatchedPeople", () => {
    const p = buildImportPlan(baseBoard, [], {});
    expect(p.unmatchedPeople.map((m) => m.id)).toContain("tMartin");
  });

  it("card sem due e sem dateLastActivity vai para descartados, não para um mês inventado", () => {
    const semMes = card({
      id: "c5",
      name: "Vídeo institucional",
      idList: "L_DESENHO",
      due: null,
      dateLastActivity: null,
    });
    const p = buildImportPlan(board([semMes]), USERS, {});
    expect(p.tasks).toHaveLength(0);
    expect(p.skipped).toEqual([{ card: semMes, reason: "sem mês" }]);
    expect(p.projects).toEqual([]);
  });

  describe("invariante: toda demanda planejada tem etapa — createTaskStages lança em plano vazio", () => {
    it("card sem etapa mapeável (lista sem correspondência, sem movimentação, sem anexo) vai para descartados", () => {
      // COMUNICADOR não mapeia para etapa nenhuma (mapListToStage devolve null) — sem movimentação
      // nem anexo, planStages devolve stages: []. Sem esse descarte, um card assim viraria uma
      // PlannedTask sem etapa e derrubaria a transação inteira do mês na Task 9 (createTaskStages
      // lança "At least one stage must be included in the task.").
      const semEtapa = card({
        id: "c6",
        name: "Follow-up cliente",
        idList: "L_COMUNICADOR",
        due: "2026-08-01T00:00:00Z",
      });
      const p = buildImportPlan(board([semEtapa]), USERS, {});
      expect(p.tasks).toHaveLength(0);
      expect(p.skipped).toEqual([{ card: semEtapa, reason: "sem etapa mapeável" }]);
    });

    it("card com etapa mapeável (o outro lado) entra no plano normalmente, com a etapa incluída", () => {
      const p = buildImportPlan(baseBoard, USERS, {});
      const t = p.tasks.find((x) => x.card.id === "c1")!;
      expect(t.stages.length).toBeGreaterThan(0);
      expect(t.stages[0].stageName).toBe("Desenho");
    });
  });

  it("card com movimentações reconstrói a jornada nível 1, inclui retrabalho e fecha COMPLETED com completedAt", () => {
    const c = card({
      id: "c7",
      name: "Banner campanha",
      idList: "L_CONC",
      due: "2026-08-20T00:00:00Z",
      // Sem `dateClosed` de propósito: a data de conclusão sai da ÚLTIMA movimentação para
      // "Concluido" (a última ação abaixo), não do arquivamento — ver fix-final-brief.md,
      // conserto 1. Com o campo aqui, o teste passaria pelos dois caminhos e não provaria nada.
    });
    const acts = [
      action("DISEÑO - MARTIN", "REVISIÓN", "2026-08-20T10:00:00Z", "c7"),
      action("REVISIÓN", "DISEÑO - MARTIN", "2026-08-20T11:00:00Z", "c7"), // devolução da revisão
      action("DISEÑO - MARTIN", "REVISIÓN", "2026-08-21T09:00:00Z", "c7"),
      action("REVISIÓN", "LIBERADO", "2026-08-21T15:00:00Z", "c7"),
      action("LIBERADO", "Concluido", "2026-08-22T09:00:00Z", "c7"),
    ];
    const p = buildImportPlan(board([c], { actions: acts }), USERS, {});
    const t = p.tasks.find((x) => x.card.id === "c7")!;
    expect(t.monthKey).toBe("2026-08");
    expect(t.status).toBe("COMPLETED");
    expect(t.completedAt).toEqual(new Date("2026-08-22T09:00:00Z"));
    expect(t.stages.map((s) => s.stageName)).toEqual(["Desenho", "Quality Control", "Aprovação"]);
    expect(t.rework).toHaveLength(1);
    expect(t.rework[0].sourceStageName).toBe("Desenho");
  });

  it("ações que não são updateCard-com-troca-de-lista (comentário, anexo) não viram movimentação", () => {
    const c = card({ id: "c8", name: "Outro banner", idList: "L_AV", due: "2026-08-01T00:00:00Z" });
    const naoMovimento: TrelloAction = {
      type: "commentCard",
      date: "2026-08-01T00:00:00Z",
      data: { card: { id: "c8" } },
    };
    const p = buildImportPlan(board([c], { actions: [naoMovimento] }), USERS, {});
    const t = p.tasks.find((x) => x.card.id === "c8")!;
    // Sem movimentação de fato, cai no nível 3: só a lista de origem.
    expect(t.stages).toHaveLength(1);
    expect(t.stages[0].stageName).toBe("Audio Visual");
  });
});

// As demandas ABERTAS não são registro do passado: as etapas que faltam são o trabalho que ainda
// vai acontecer. Sem isto, ao concluir o Desenho de uma demanda importada não haveria Quality
// Control nem Aprovação para ativar, e ela terminaria pulando o portão de qualidade.
describe("buildImportPlan — a demanda aberta recebe o resto da sequência do template", () => {
  function planoDe(c: ExportCard, actions: TrelloAction[] = []) {
    return buildImportPlan(board([c], { actions }), USERS, {});
  }

  it("demanda aberta parada na produção ganha revisão, aprovação e relatório pela frente", () => {
    const p = planoDe(card({ id: "a1", idList: "L_DESENHO", due: "2026-07-15T00:00:00Z" }));
    const t = p.tasks.find((x) => x.card.id === "a1")!;
    expect(t.status).toBe("IN_PROGRESS");
    expect(t.stages.map((s) => s.stageName)).toEqual(["Desenho"]);
    expect(t.futureStageNames).toEqual(["Quality Control", "Aprovação", "Relatório"]);
  });

  it("demanda aberta que já passou pela aprovação só tem o relatório pela frente", () => {
    const p = planoDe(card({ id: "a2", idList: "L_LIBERADO", due: "2026-07-15T00:00:00Z" }), [
      action("DISEÑO - MARTIN", "REVISIÓN", "2026-07-02T10:00:00Z", "a2"),
      action("REVISIÓN", "LIBERADO", "2026-07-03T10:00:00Z", "a2"),
    ]);
    const t = p.tasks.find((x) => x.card.id === "a2")!;
    expect(t.stages.map((s) => s.stageName)).toContain("Aprovação");
    expect(t.futureStageNames).toEqual(["Relatório"]);
  });

  it("demanda concluída não ganha etapa nenhuma pela frente — o trabalho acabou", () => {
    const p = planoDe(
      card({
        id: "a3",
        idList: "L_CONC",
        due: "2026-07-15T00:00:00Z",
        dateCompleted: "2026-07-20T10:00:00Z",
        attachments: [{ id: "x", mimeType: "image/png", date: "2026-07-10T10:00:00Z" }],
      })
    );
    const t = p.tasks.find((x) => x.card.id === "a3")!;
    expect(t.status).toBe("COMPLETED");
    expect(t.futureStageNames).toEqual([]);
  });

  it("demanda obsoleta não ganha etapa nenhuma pela frente — foi abandonada, não pausada", () => {
    const p = planoDe(
      card({ id: "a4", idList: "L_DESENHO", closed: true, due: "2026-07-15T00:00:00Z" })
    );
    const t = p.tasks.find((x) => x.card.id === "a4")!;
    expect(t.status).toBe("OBSOLETE");
    expect(t.futureStageNames).toEqual([]);
  });
});

// O card declara quem é responsável em `idMembers`. Era o único campo do mapeamento da spec que o
// código nunca lia — 127 cards do export real o preenchem.
describe("buildImportPlan — o responsável declarado no card vira dono da etapa", () => {
  const MEMBROS = [
    member("tMartin", "martingoonmkt", "Martin"),
    member("tSara", "saragoonmkt", "Sara Goon"),
    member("tPedro", "pedrogoonmkt", "Pedro Villalba"),
  ];
  const USUARIOS = [
    user("u1", "Martin", "martin@goon.com"),
    user("u2", "Sara Goon", "sara@goon.com"),
    user("u3", "Pedro Villalba", "pedro@goon.com"),
  ];

  function planoDe(c: ExportCard, actions: TrelloAction[] = []) {
    return buildImportPlan(board([c], { members: MEMBROS, actions }), USUARIOS, {});
  }

  it("um membro só: ele é o dono da etapa que não tinha dono", () => {
    const p = planoDe(
      card({ id: "m1", idList: "L_AV", idMembers: ["tSara"], due: "2026-07-15T00:00:00Z" })
    );
    expect(p.tasks[0].stages[0]).toMatchObject({ stageName: "Audio Visual", assigneeUserId: "u2" });
  });

  it("evidência mais forte manda: o nome na lista não é sobrescrito pelo membro declarado", () => {
    const p = planoDe(
      card({ id: "m2", idList: "L_DESENHO", idMembers: ["tSara"], due: "2026-07-15T00:00:00Z" })
    );
    expect(p.tasks[0].stages[0].assigneeUserId).toBe("u1");
  });

  it("vários membros: fica com quem também anexou arquivo no card", () => {
    const p = planoDe(
      card({
        id: "m3",
        idList: "L_AV",
        idMembers: ["tPedro", "tSara"],
        attachments: [{ id: "an1", idMember: "tSara" }],
        due: "2026-07-15T00:00:00Z",
      }),
      [action("AUDIOVISUAL", "REVISIÓN", "2026-07-02T10:00:00Z", "m3")]
    );
    const av = p.tasks[0].stages.find((s) => s.stageName === "Audio Visual")!;
    expect(av.assigneeUserId).toBe("u2");
  });

  it("vários membros e nenhum anexou: fica com o primeiro do card", () => {
    const p = planoDe(
      card({
        id: "m4",
        idList: "L_AV",
        idMembers: ["tPedro", "tSara"],
        due: "2026-07-15T00:00:00Z",
      }),
      [action("AUDIOVISUAL", "REVISIÓN", "2026-07-02T10:00:00Z", "m4")]
    );
    const av = p.tasks[0].stages.find((s) => s.stageName === "Audio Visual")!;
    expect(av.assigneeUserId).toBe("u3");
  });

  it("membro sem casamento no WorkOS não conta — sobra um, e é ele", () => {
    const p = planoDe(
      card({
        id: "m5",
        idList: "L_AV",
        idMembers: ["tDesconhecido", "tSara"],
        due: "2026-07-15T00:00:00Z",
      })
    );
    expect(p.tasks[0].stages[0].assigneeUserId).toBe("u2");
  });

  it("card sem membro nenhum continua sem dono — nada é inventado", () => {
    const p = planoDe(card({ id: "m6", idList: "L_AV", due: "2026-07-15T00:00:00Z" }));
    expect(p.tasks[0].stages[0].assigneeUserId).toBeUndefined();
  });
});

describe("contra o export real", () => {
  const exportPath =
    "/Users/fsrezende/Downloads/goon/atl/export trello/INm0k5De - atlantico-shop.json";
  const exportExists = fs.existsSync(exportPath);

  it.skipIf(!exportExists)(
    // Números medidos contra o export real, na Rodada de conserto 1 (não os 230/18/73 otimistas da
    // spec de desenho, escrita ANTES desta task existir, nem os 148/155/82 da primeira rodada desta
    // task): a soma bate — 204 + 99 = 303 = total de cards. Dos 82 "sem etapa mapeável" da primeira
    // rodada, 57 tinham anexo datado e só ficavam de fora porque a lista onde o card parou não era
    // de produção (Julio, Concluido, ANOTACIONES, LIBERADO, COMUNICADOR); map-stages.ts (Task 6)
    // passou a derivar a etapa do mimeType do anexo nesse caso (vídeo → Audio Visual; imagem/PDF →
    // Desenho) quando a lista não decide. Restam 26 genuinamente sem evidência nenhuma (sem
    // movimento, sem anexo, em listas organizacionais como "Fechas Conmemorativas" e "SM") — esses
    // continuam descartados, com motivo. Ver task-8-report.md.
    "a soma bate com o total de cards, e o descarte por falta de etapa reflete só o que é mesmo sem evidência (arquivo fora do repo, não existe em CI)",
    () => {
      const data = JSON.parse(fs.readFileSync(exportPath, "utf-8"));
      const realBoard: TrelloBoardExport = {
        cards: data.cards,
        labels: data.labels,
        lists: data.lists,
        members: data.members,
        actions: data.actions,
      };

      const p = buildImportPlan(realBoard, [], {});

      const total = p.tasks.length + p.skipped.length;
      expect(total).toBe(realBoard.cards.length);
      expect(realBoard.cards.length).toBe(303);

      const porMotivo: Record<string, number> = {};
      for (const s of p.skipped) porMotivo[s.reason] = (porMotivo[s.reason] ?? 0) + 1;

      expect(porMotivo["separador"]).toBe(38);
      expect(porMotivo["ausencia"]).toBe(25);
      expect(porMotivo["referencia"]).toBe(10);
      // As duas categorias de descarte que só o joiner decide (não a natureza do card):
      expect(porMotivo["sem mês"]).toBeUndefined();
      expect(porMotivo["sem etapa mapeável"]).toBe(26);

      expect(p.tasks.length).toBe(204);
      expect(p.skipped.length).toBe(99);

      for (const t of p.tasks) expect(t.stages.length).toBeGreaterThan(0);
    }
  );
});
