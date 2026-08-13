import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    team: { findMany: vi.fn() },
    taskActiveStage: { findMany: vi.fn(), groupBy: vi.fn() },
    stageDependency: { findMany: vi.fn() },
    templateStage: { findMany: vi.fn(), findUnique: vi.fn() },
    timeLog: { findMany: vi.fn() },
  },
}));
vi.mock("@prisma/client", () => ({
  UserRole: {
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
    SUPERVISOR: "SUPERVISOR",
    MEMBER: "MEMBER",
    VIEWER: "VIEWER",
  },
}));

import { median } from "@/lib/actions/team-health";

describe("median", () => {
  it("returns 0 for empty", () => expect(median([])).toBe(0));
  it("odd length → middle", () => expect(median([3, 1, 2])).toBe(2));
  it("even length → average of middles", () => expect(median([1, 2, 3, 4])).toBe(2.5));
});

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getTeamMemberLoad } from "@/lib/actions/team-health";

const mockAuth = vi.mocked(auth);
const db = vi.mocked(prisma, true);

function asManager() {
  mockAuth.mockResolvedValue({ user: { id: "mgr", role: "MANAGER" } } as never);
  db.user.findUnique.mockResolvedValue({ teams: [{ id: "team1" }] } as never);
}

describe("getTeamMemberLoad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-manager", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", role: "MEMBER" } } as never);
    await expect(getTeamMemberLoad()).rejects.toThrow(/Access Denied/i);
  });

  it("flags overloaded (>= ceiling), idle (<= threshold) and buckets by due date", async () => {
    asManager();
    db.user.findMany.mockResolvedValue([
      { id: "a", name: "Ana" },
      { id: "b", name: "Bruno" },
    ] as never);
    const overdue = new Date(Date.now() - 5 * 864e5);
    const soon = new Date(Date.now() + 1 * 864e5);
    const far = new Date(Date.now() + 30 * 864e5);
    // Ana: 8 active stages (>= OVERLOAD_CEILING) → overloaded; Bruno: 1 → idle
    db.taskActiveStage.findMany.mockResolvedValue([
      ...Array.from({ length: 6 }, () => ({ assigneeId: "a", task: { dueDate: far } })),
      { assigneeId: "a", task: { dueDate: soon } },
      { assigneeId: "a", task: { dueDate: overdue } },
      { assigneeId: "b", task: { dueDate: null } },
    ] as never);

    const rows = await getTeamMemberLoad();
    const ana = rows.find((r) => r.userId === "a")!;
    const bruno = rows.find((r) => r.userId === "b")!;
    expect(ana.count).toBe(8);
    expect(ana.overloaded).toBe(true);
    expect(ana.overdue).toBe(1);
    expect(ana.dueSoon).toBe(1);
    expect(ana.onTrack).toBe(6);
    expect(bruno.count).toBe(1);
    expect(bruno.idle).toBe(true);
    expect(rows[0].userId).toBe("a"); // sorted by count desc
  });

  it("flags relative overload (> median + margin) only when the median is meaningful", async () => {
    asManager();
    db.user.findMany.mockResolvedValue([
      { id: "a", name: "Ana" },
      { id: "b", name: "Bruno" },
      { id: "c", name: "Caio" },
      { id: "d", name: "Dora" },
      { id: "e", name: "Edu" },
    ] as never);
    // counts: a=7, b=c=d=e=3 → median 3 (>= MIN_MEDIAN); 7 >= 3 + 3 → overloaded (< ceiling 8)
    const stages = [
      ...Array.from({ length: 7 }, () => ({ assigneeId: "a", task: { dueDate: null } })),
      ...["b", "c", "d", "e"].flatMap((id) =>
        Array.from({ length: 3 }, () => ({ assigneeId: id, task: { dueDate: null } }))
      ),
    ];
    db.taskActiveStage.findMany.mockResolvedValue(stages as never);
    const rows = await getTeamMemberLoad();
    expect(rows.find((r) => r.userId === "a")!.overloaded).toBe(true);
    expect(rows.find((r) => r.userId === "b")!.overloaded).toBe(false); // at the median
  });

  it("does NOT flag relative overload on a mostly-idle team (median ~0)", async () => {
    asManager();
    db.user.findMany.mockResolvedValue([
      { id: "a", name: "Ana" },
      { id: "b", name: "Bruno" },
      { id: "c", name: "Caio" },
    ] as never);
    // a=3, rest 0 → median 0 < MIN_MEDIAN → relative rule off; 3 < ceiling 8 → not overloaded
    db.taskActiveStage.findMany.mockResolvedValue(
      Array.from({ length: 3 }, () => ({ assigneeId: "a", task: { dueDate: null } })) as never
    );
    const rows = await getTeamMemberLoad();
    expect(rows.find((r) => r.userId === "a")!.overloaded).toBe(false);
  });
});

import { getAgingStages } from "@/lib/actions/team-health";

describe("getAgingStages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes items past SLA and applies DEFAULT_SLA when stage has none; sorts by ratio desc", async () => {
    asManager();
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3.6e6);
    db.taskActiveStage.findMany.mockResolvedValue([
      // 96h old, SLA 24 → ratio 4
      {
        activatedAt: hoursAgo(96),
        task: { id: "t1", title: "A", dueDate: null },
        stage: { name: "Dev", expectedDurationHours: 24 },
        assignee: { name: "Ana" },
      },
      // 36h old, no SLA → default 72 → ratio 0.5 → excluded (not aging, no due risk)
      {
        activatedAt: hoursAgo(36),
        task: { id: "t2", title: "B", dueDate: null },
        stage: { name: "QC", expectedDurationHours: null },
        assignee: null,
      },
      // 80h old, no SLA → default 72 → ratio ~1.11 → included
      {
        activatedAt: hoursAgo(80),
        task: { id: "t3", title: "C", dueDate: null },
        stage: { name: "SEO", expectedDurationHours: null },
        assignee: null,
      },
    ] as never);

    const items = await getAgingStages();
    expect(items.map((i) => i.taskId)).toEqual(["t1", "t3"]); // t2 excluded, sorted by ratio desc
    expect(items[0].agingRatio).toBeCloseTo(4, 1);
    expect(items[1].slaHours).toBe(72);
  });

  it("includes on-SLA items that are overdue by due date", async () => {
    asManager();
    db.taskActiveStage.findMany.mockResolvedValue([
      {
        activatedAt: new Date(),
        task: { id: "t9", title: "Z", dueDate: new Date(Date.now() - 864e5) },
        stage: { name: "Dev", expectedDurationHours: 999999 },
        assignee: null,
      },
    ] as never);
    const items = await getAgingStages();
    expect(items).toHaveLength(1);
    expect(items[0].dueState).toBe("overdue");
  });
});

import { getBlockedStages } from "@/lib/actions/team-health";

describe("getBlockedStages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists blocked stages with unmet prerequisites as waitingOn, sorted by age desc", async () => {
    asManager();
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3.6e6);
    // blocked stages query
    db.taskActiveStage.findMany
      .mockResolvedValueOnce([
        {
          stageId: "sQC",
          activatedAt: hoursAgo(10),
          task: { id: "t1", title: "A" },
          stage: { name: "QC" },
          assignee: { name: "Ana" },
        },
        {
          stageId: "sSEO",
          activatedAt: hoursAgo(50),
          task: { id: "t1", title: "A" },
          stage: { name: "SEO" },
          assignee: null,
        },
      ] as never)
      // completed stages for involved tasks
      .mockResolvedValueOnce([{ taskId: "t1", stageId: "sDesign" }] as never);
    // prerequisites: QC depends on Dev (unmet) ; SEO depends on Design (met)
    db.stageDependency.findMany.mockResolvedValue([
      { stageId: "sQC", dependsOnStageId: "sDev" },
      { stageId: "sSEO", dependsOnStageId: "sDesign" },
    ] as never);
    db.templateStage.findMany.mockResolvedValue([
      { id: "sDev", name: "Dev" },
      { id: "sDesign", name: "Design" },
    ] as never);

    const items = await getBlockedStages();
    expect(items.map((i) => i.stageName)).toEqual(["SEO", "QC"]); // 50h before 10h
    const qc = items.find((i) => i.stageName === "QC")!;
    expect(qc.waitingOn).toEqual(["Dev"]); // Dev not completed
    const seo = items.find((i) => i.stageName === "SEO")!;
    expect(seo.waitingOn).toEqual([]); // Design completed
  });
});

import { getSystemConstraint } from "@/lib/actions/team-health";

describe("getSystemConstraint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when nothing is blocked", async () => {
    asManager();
    db.taskActiveStage.findMany.mockResolvedValueOnce([] as never);
    expect(await getSystemConstraint()).toBeNull();
  });

  it("picks the pending prerequisite with the most accumulated downstream wait", async () => {
    asManager();
    const h = (n: number) => new Date(Date.now() - n * 3.6e6);
    // Two tasks blocked; both wait on sDev (unmet). t1 also waits on sArt.
    db.taskActiveStage.findMany
      // blocked stages in scope
      .mockResolvedValueOnce([
        { stageId: "sQC", activatedAt: h(100), blockedAt: h(30), task: { id: "t1" } },
        { stageId: "sQC", activatedAt: h(100), blockedAt: h(20), task: { id: "t2" } },
      ] as never)
      // completed stages for involved tasks (none)
      .mockResolvedValueOnce([] as never);
    db.stageDependency.findMany.mockResolvedValue([
      { stageId: "sQC", dependsOnStageId: "sDev" },
      { stageId: "sQC", dependsOnStageId: "sArt" },
    ] as never);
    db.templateStage.findUnique.mockResolvedValue({ name: "Dev" } as never);

    const c = await getSystemConstraint();
    // sDev blocks both t1+t2 (30+20=50h); sArt blocks both too (same) — but only
    // the winner is returned; tiebreak by task count is equal, so waitHours ties.
    // Here sDev and sArt both = 50h/2 tasks; Map insertion order keeps first (sDev).
    expect(c).not.toBeNull();
    expect(c!.stageName).toBe("Dev");
    expect(c!.blockedTaskCount).toBe(2);
    expect(Math.round(c!.totalWaitHours)).toBe(50);
  });

  it("excludes prerequisites already completed for that task", async () => {
    asManager();
    const h = (n: number) => new Date(Date.now() - n * 3.6e6);
    db.taskActiveStage.findMany
      .mockResolvedValueOnce([
        { stageId: "sQC", activatedAt: h(100), blockedAt: h(40), task: { id: "t1" } },
      ] as never)
      // sDone already completed for t1 → not a blocker
      .mockResolvedValueOnce([{ taskId: "t1", stageId: "sDone" }] as never);
    db.stageDependency.findMany.mockResolvedValue([
      { stageId: "sQC", dependsOnStageId: "sDone" },
      { stageId: "sQC", dependsOnStageId: "sDev" },
    ] as never);
    db.templateStage.findUnique.mockResolvedValue({ name: "Dev" } as never);

    const c = await getSystemConstraint();
    expect(c!.stageName).toBe("Dev"); // sDone excluded
    expect(c!.blockedTaskCount).toBe(1);
  });
});

import { getWipStatus } from "@/lib/actions/team-health";

describe("getWipStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty when no stage has a WIP limit", async () => {
    asManager();
    db.templateStage.findMany.mockResolvedValue([] as never);
    expect(await getWipStatus()).toEqual([]);
  });

  it("flags stages at (full) and over (breached) their limit; hides within-limit", async () => {
    asManager();
    db.templateStage.findMany.mockResolvedValue([
      { id: "sA", name: "QC", wipLimit: 3, defaultTeam: { name: "Quality" } },
      { id: "sB", name: "Design", wipLimit: 2, defaultTeam: { name: "Creative" } },
      { id: "sC", name: "Dev", wipLimit: 5, defaultTeam: null },
    ] as never);
    db.taskActiveStage.groupBy.mockResolvedValue([
      { stageId: "sA", _count: { _all: 3 } }, // == limit → full
      { stageId: "sB", _count: { _all: 4 } }, // > limit → over
      { stageId: "sC", _count: { _all: 2 } }, // < limit → hidden
    ] as never);

    const rows = await getWipStatus();
    expect(rows.map((r) => r.stageName)).toEqual(["Design", "QC"]); // over first
    const design = rows.find((r) => r.stageName === "Design")!;
    expect(design.state).toBe("over");
    expect(design.inProgress).toBe(4);
    expect(design.limit).toBe(2);
    const qc = rows.find((r) => r.stageName === "QC")!;
    expect(qc.state).toBe("full");
    expect(rows.some((r) => r.stageName === "Dev")).toBe(false); // within limit
  });
});

import { getBurnoutSignals, getOneOnOneCadence } from "@/lib/actions/team-health";

describe("getBurnoutSignals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flags high risk on sustained high utilization and hides healthy members", async () => {
    asManager();
    db.user.findMany.mockResolvedValue([
      { id: "a", name: "Ana", weeklyCapacityHours: 40 }, // overloaded
      { id: "b", name: "Bruno", weeklyCapacityHours: 40 }, // healthy
    ] as never);
    // 4 weeks; Ana logs ~44h/week (>90% util & overtime), Bruno ~20h/week.
    const now = Date.now();
    const wk = 7 * 24 * 3.6e6;
    const logs: { userId: string; hoursSpent: number; logDate: Date }[] = [];
    for (let w = 0; w < 4; w++) {
      const d = new Date(now - (3 - w) * wk - 1 * 24 * 3.6e6);
      logs.push({ userId: "a", hoursSpent: 44, logDate: d });
      logs.push({ userId: "b", hoursSpent: 20, logDate: d });
    }
    db.timeLog.findMany.mockResolvedValue(logs as never);
    db.taskActiveStage.groupBy.mockResolvedValue([
      { assigneeId: "a", _count: { _all: 5 } },
    ] as never);

    const rows = await getBurnoutSignals();
    expect(rows.map((r) => r.name)).toEqual(["Ana"]); // Bruno healthy → hidden
    expect(rows[0].risk).toBe("high");
    expect(rows[0].overtimeWeeks).toBe(4);
  });

  it("returns empty when no member is at risk", async () => {
    asManager();
    db.user.findMany.mockResolvedValue([
      { id: "b", name: "Bruno", weeklyCapacityHours: 40 },
    ] as never);
    db.timeLog.findMany.mockResolvedValue([] as never);
    db.taskActiveStage.groupBy.mockResolvedValue([] as never);
    expect(await getBurnoutSignals()).toEqual([]);
  });
});

describe("getOneOnOneCadence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks never-met and stale 1:1s overdue, ordering overdue first", async () => {
    asManager();
    const daysAgo = (d: number) => new Date(Date.now() - d * 8.64e7);
    db.user.findMany.mockResolvedValue([
      { id: "a", name: "Ana", oneOnOnesReceived: [{ occurredAt: daysAgo(45) }] }, // overdue
      { id: "b", name: "Bruno", oneOnOnesReceived: [{ occurredAt: daysAgo(5) }] }, // recent
      { id: "c", name: "Caio", oneOnOnesReceived: [] }, // never
    ] as never);

    const rows = await getOneOnOneCadence();
    expect(rows[0].overdue).toBe(true); // overdue sorted first
    const bruno = rows.find((r) => r.userId === "b")!;
    expect(bruno.overdue).toBe(false);
    expect(bruno.daysSince).toBe(5);
    const caio = rows.find((r) => r.userId === "c")!;
    expect(caio.overdue).toBe(true);
    expect(caio.lastOneOnOne).toBeNull();
  });

  it("devolve a anotação da última conversa", async () => {
    // A cadência existia só como data. Registrar que o 1:1 aconteceu sem o que
    // foi dito transforma a rotina em caixinha de "feito": quem conduz o próximo
    // chega sem o combinado do anterior.
    asManager();
    db.user.findMany.mockResolvedValue([
      {
        id: "a",
        name: "Ana",
        oneOnOnesReceived: [
          { occurredAt: new Date(Date.now() - 5 * 8.64e7), notes: "quer assumir motion" },
        ],
      },
      { id: "b", name: "Bruno", oneOnOnesReceived: [{ occurredAt: new Date(), notes: null }] },
      { id: "c", name: "Caio", oneOnOnesReceived: [] },
    ] as never);

    const rows = await getOneOnOneCadence();
    expect(rows.find((r) => r.userId === "a")!.lastNotes).toBe("quer assumir motion");
    // Nota é opcional: sem ela, o campo é null — nunca `undefined`, que vazaria
    // como "sem 1:1" na renderização.
    expect(rows.find((r) => r.userId === "b")!.lastNotes).toBeNull();
    expect(rows.find((r) => r.userId === "c")!.lastNotes).toBeNull();
  });
});
