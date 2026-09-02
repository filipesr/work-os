import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "ana", role: "MEMBER" }),
}));
vi.mock("@/lib/planning/reorder", () => ({ applyDayReorder: vi.fn() }));
// A ATRIBUIÇÃO não é escrita por `pullStageToMe`: ela delega ao caminho canônico de reivindicar,
// que é quem aplica limite de WIP, log de etapa e carimbo de início. Aqui ele é mockado para que
// os testes vejam O QUE foi delegado — e para provar que a recusa dele volta intacta.
vi.mock("@/lib/actions/task", () => ({ claimActiveStage: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
    taskActiveStage: { findUnique: vi.fn(), aggregate: vi.fn(), update: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { applyDayReorder } from "@/lib/planning/reorder";
import { claimActiveStage } from "@/lib/actions/task";
import { reorderMyDay, pullStageToMe, moveMyStageToDay } from "@/lib/actions/my-week";
import { formatISODate, todayInSaoPaulo } from "@/lib/dates";

const DIA_MS = 86_400_000;

/** A data de N dias a partir de hoje, na MESMA convenção que a ação usa (SP-local, via
 *  `todayInSaoPaulo`). Calcular em UTC com `toISOString()` fazia o teste do "dia no passado"
 *  quebrar entre 21h e meia-noite em São Paulo: ali o UTC já virou o dia e a ação não. */
function emDias(n: number): string {
  return formatISODate(new Date(todayInSaoPaulo().getTime() + n * DIA_MS));
}

/** Um dia futuro que a ação aceita: amanhã, ou depois de amanhã se amanhã cair num domingo —
 *  domingo não existe na grade de segunda-a-sábado e a ação recusa (ver `problemaDeData`). */
function amanha(): string {
  const alvo = new Date(todayInSaoPaulo().getTime() + DIA_MS);
  return formatISODate(alvo.getUTCDay() === 0 ? new Date(alvo.getTime() + DIA_MS) : alvo);
}

/** Um dia além do teto de quatro semanas que não caia num domingo: a recusa de domingo vem antes
 *  na validação, e sem este cuidado o teste passaria a acusar a outra chave aos sábados. */
function foraDaJanela(): string {
  const alvo = new Date(todayInSaoPaulo().getTime() + 29 * DIA_MS);
  return formatISODate(alvo.getUTCDay() === 0 ? new Date(alvo.getTime() + DIA_MS) : alvo);
}

/** O próximo domingo — sempre no futuro, para isolar a recusa de domingo da de data passada. */
function domingo(): string {
  const hoje = todayInSaoPaulo();
  const faltam = 7 - hoje.getUTCDay() || 7;
  return formatISODate(new Date(hoje.getTime() + faltam * DIA_MS));
}

function livre(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    taskId: "t1",
    stageId: "s1",
    assigneeId: null,
    status: "ACTIVE",
    teamId: "time1",
    scheduledStart: null,
    stage: { defaultTeamId: null },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ teams: [{ id: "time1" }] } as never);
  vi.mocked(prisma.taskActiveStage.aggregate).mockResolvedValue({
    _max: { plannedOrder: 3 },
  } as never);
  vi.mocked(prisma.taskActiveStage.update).mockResolvedValue({} as never);
  vi.mocked(claimActiveStage).mockResolvedValue({ success: true } as never);
});

describe("reorderMyDay", () => {
  it("passa o próprio id como dono — é o que impede reordenar o dia do colega", async () => {
    vi.mocked(applyDayReorder).mockResolvedValue({ ok: true } as never);
    await reorderMyDay("as1", "up");
    expect(applyDayReorder).toHaveBeenCalledWith("as1", "up", "ana");
  });

  it("traduz o problema devolvido pelo módulo de ordenação", async () => {
    vi.mocked(applyDayReorder).mockResolvedValue({ problem: "notYours" } as never);
    expect(await reorderMyDay("as1", "up")).toEqual({ error: "notYours" });
  });
});

describe("pullStageToMe", () => {
  it("delega a atribuição e grava o dia no fim da fila", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(livre() as never);
    const dia = amanha();

    const r = await pullStageToMe("as1", dia);
    expect(r).toEqual({ success: true });

    // A atribuição inteira (WIP, log de etapa, carimbo de início) vem do caminho canônico — esta
    // tela não escreve `assigneeId` por fora dele.
    expect(claimActiveStage).toHaveBeenCalledWith("t1", "s1");
    const data = vi.mocked(prisma.taskActiveStage.update).mock.calls[0][0].data as {
      assigneeId?: string;
      plannedDate: Date;
      plannedOrder: number;
    };
    expect(data.assigneeId).toBeUndefined();
    expect(data.plannedDate).toEqual(new Date(`${dia}T00:00:00Z`));
    // Entra DEPOIS do que já estava: quem chega não fura a ordem que a pessoa montou.
    expect(data.plannedOrder).toBe(4);
  });

  it("[CRÍTICO] puxar para si limpa qualquer compromisso que a etapa trouxe do poço", async () => {
    // A janela do poço é de OUTRO dia e de OUTRA pessoa — o compromisso foi combinado com quem já
    // não a executa. Herdá-la calada faria a etapa nascer na minha semana "agendada" numa hora que
    // ninguém marcou comigo, e a hora ainda apontaria para o dia antigo. Ver `unscheduleStage`.
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ scheduledStart: new Date("2026-09-04T17:00:00Z") }) as never
    );

    await pullStageToMe("as1", amanha());

    const data = vi.mocked(prisma.taskActiveStage.update).mock.calls[0][0].data as {
      scheduledStart: Date | null;
      scheduledEnd: Date | null;
    };
    expect(data.scheduledStart).toBeNull();
    expect(data.scheduledEnd).toBeNull();
  });

  it("devolve a recusa de quem reivindica como está — a mensagem dela é a melhor", async () => {
    // Dono, etapa não liberada e limite de WIP são recusas do caminho canônico. A dele diz, por
    // exemplo, quantos itens já estão em andamento; uma genérica daqui perderia isso.
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(livre() as never);
    vi.mocked(claimActiveStage).mockResolvedValue({ error: "wipLimitReached" } as never);

    expect(await pullStageToMe("as1", amanha())).toEqual({ error: "wipLimitReached" });
    // E o dia NÃO é gravado: sem dono, `plannedDate` sozinho sumiria do poço e da grade.
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa etapa que já tem dono", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ assigneeId: "bruno" }) as never
    );
    vi.mocked(claimActiveStage).mockResolvedValue({ error: "stageAlreadyAssigned" } as never);
    expect(await pullStageToMe("as1", amanha())).toEqual({ error: "stageAlreadyAssigned" });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa etapa não liberada", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ status: "INACTIVE" }) as never
    );
    vi.mocked(claimActiveStage).mockResolvedValue({ error: "stageNotClaimable" } as never);
    expect(await pullStageToMe("as1", amanha())).toEqual({ error: "stageNotClaimable" });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa etapa de outro time — esta é recusa DAQUI, quem reivindica não valida time", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ teamId: "time9" }) as never
    );
    expect(await pullStageToMe("as1", amanha())).toEqual({ error: "otherTeam" });
    expect(claimActiveStage).not.toHaveBeenCalled();
  });

  it("etapa coringa herda o time do modelo e é assumível", async () => {
    // `teamId` nulo não quer dizer "sem time": o time efetivo vem de `stage.defaultTeamId`.
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ teamId: null, stage: { defaultTeamId: "time1" } }) as never
    );
    expect(await pullStageToMe("as1", amanha())).toEqual({ success: true });
  });

  it("recusa dia no passado", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(livre() as never);
    expect(await pullStageToMe("as1", emDias(-1))).toEqual({ error: "pastDate" });
  });

  it("recusa dia além das quatro semanas — sem teto, um dígito errado estaciona trabalho em 2031", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(livre() as never);
    expect(await pullStageToMe("as1", foraDaJanela())).toEqual({ error: "tooFarAhead" });
    expect(prisma.taskActiveStage.findUnique).not.toHaveBeenCalled();
  });

  it("recusa domingo — o que vai para lá some das três telas até a semana virar corrente", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(livre() as never);
    expect(await pullStageToMe("as1", domingo())).toEqual({ error: "sundayDate" });
  });

  it("recusa data malformada antes de consultar o banco", async () => {
    expect(await pullStageToMe("as1", "07/09/2026")).toEqual({ error: "invalidDate" });
    expect(prisma.taskActiveStage.findUnique).not.toHaveBeenCalled();
  });
});

describe("moveMyStageToDay", () => {
  it("muda o dia de uma etapa sua", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      assigneeId: "ana",
      status: "ACTIVE",
      scheduledStart: null,
    } as never);
    const dia = amanha();

    expect(await moveMyStageToDay("as1", dia)).toEqual({ success: true });
    const data = vi.mocked(prisma.taskActiveStage.update).mock.calls[0][0].data as {
      plannedDate: Date;
      plannedOrder: number;
    };
    expect(data.plannedDate).toEqual(new Date(`${dia}T00:00:00Z`));
    expect(data.plannedOrder).toBe(4);
  });

  it("recusa etapa de outra pessoa", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      assigneeId: "bruno",
      status: "ACTIVE",
      scheduledStart: null,
    } as never);
    expect(await moveMyStageToDay("as1", amanha())).toEqual({ error: "notYours" });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa mover etapa com hora marcada — compromisso não muda de dia por arrasto", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      assigneeId: "ana",
      status: "ACTIVE",
      scheduledStart: new Date("2026-09-10T14:00:00Z"),
    } as never);
    expect(await moveMyStageToDay("as1", amanha())).toEqual({ error: "scheduledStage" });
  });

  it("recusa mover etapa concluída — reprogramar o que já foi feito descreve uma semana falsa", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      assigneeId: "ana",
      status: "COMPLETED",
      scheduledStart: null,
    } as never);
    expect(await moveMyStageToDay("as1", amanha())).toEqual({ error: "completedStage" });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });
});
