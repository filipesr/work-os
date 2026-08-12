import { PrismaClient, Prisma, UserRole, TaskStatus, TaskPriority } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date();

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 1): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function hoursAgo(hours: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d;
}

function minutesAgo(minutes: number): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() - minutes);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

function randomDateBetween(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

/** Clamp a chained stage date into the past (in-flight stages must have activated
 * before now — the naïve duration chain can overshoot for recently-created tasks). */
function pastify(d: Date, fallbackMaxDays: number): Date {
  return d.getTime() > NOW.getTime() - 3.6e6 ? daysAgo(randomInt(1, fallbackMaxDays)) : d;
}

function pickPriority(): TaskPriority {
  const r = Math.random();
  if (r < 0.2) return "LOW";
  if (r < 0.6) return "MEDIUM";
  if (r < 0.9) return "HIGH";
  return "URGENT";
}

function pickDueDate(_createdAt: Date): Date | null {
  const r = Math.random();
  const now = new Date();
  if (r < 0.08) return null; // 8% sem prazo
  if (r < 0.3) return addDays(now, -randomInt(1, 6)); // 22% atrasadas
  if (r < 0.5) return addDays(now, randomInt(0, 2)); // 20% próximos 3 dias
  if (r < 0.75) return addDays(now, randomInt(3, 7)); // 25% resto da semana
  if (r < 0.92) return addDays(now, randomInt(8, 14)); // 17% próxima semana
  return addDays(now, randomInt(15, 35)); // 8% futuro distante
}

/** A stage whose name suggests a review/quality gate — where we concentrate the
 * system constraint (more blocking, more aging, tighter WIP limit → ToC). */
function isBottleneckStageName(name: string): boolean {
  const n = name.toLowerCase();
  return ["design", "quality", "revis", "qc", "aprova"].some((h) => n.includes(h));
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const DEMO_EMAIL_DOMAIN = "@demo.workos.fake";
const DEMO_CLIENT_PREFIX = "[DEMO] ";

// Real users promoted to rich per-person history (their contributions live on
// DEMO tasks, so demo-cleanup removes them via task cascade; only their
// weeklyCapacityHours — a field on the real User — is reset by cleanup).
const RICH_REAL_EMAILS = ["movimento.jant@gmail.com", "leligoonmkt@gmail.com"];

interface TeamUserSpec {
  team: string;
  slug: string;
  count: number;
  roles: UserRole[];
}

// Enxuto (~19) e concentrado nos times REAIS usados pelos templates semeados
// (Vídeo Curto, Post Carrossel, Campanha de Tráfego, Landing Page).
const TEAM_USERS: TeamUserSpec[] = [
  {
    team: "Designers",
    slug: "design",
    count: 3,
    roles: [...Array(2).fill("MEMBER" as UserRole), "SUPERVISOR"],
  },
  { team: "Software Engineer", slug: "dev", count: 2, roles: Array(2).fill("MEMBER" as UserRole) },
  { team: "Video-makers", slug: "video", count: 2, roles: Array(2).fill("MEMBER" as UserRole) },
  {
    team: "Quality Control",
    slug: "qc",
    count: 3,
    roles: [...Array(2).fill("MEMBER" as UserRole), "SUPERVISOR"],
  },
  {
    team: "Traffic Manager",
    slug: "traffic",
    count: 3,
    roles: Array(3).fill("MEMBER" as UserRole),
  },
  { team: "Social Media", slug: "social", count: 2, roles: Array(2).fill("MEMBER" as UserRole) },
  { team: "Briefing", slug: "brief", count: 1, roles: ["MEMBER" as UserRole] },
  { team: "Proofreading", slug: "proof", count: 1, roles: ["MEMBER" as UserRole] },
  { team: "Manager", slug: "mgr", count: 2, roles: Array(2).fill("MANAGER" as UserRole) },
];

const BRAZILIAN_NAMES = [
  "Ana Silva",
  "Bruno Costa",
  "Camila Oliveira",
  "Daniel Santos",
  "Eduarda Lima",
  "Felipe Souza",
  "Gabriela Ferreira",
  "Henrique Almeida",
  "Isabela Rodrigues",
  "João Pereira",
  "Karla Martins",
  "Lucas Araújo",
  "Mariana Barbosa",
  "Nicolas Gonçalves",
  "Olívia Ribeiro",
  "Pedro Carvalho",
  "Rafael Nascimento",
  "Sara Mendes",
  "Thiago Correia",
  "Valentina Alves",
  "Wagner Batista",
  "Yasmin Monteiro",
];

interface DemoClient {
  name: string;
  projects: string[];
}

const DEMO_CLIENTS: DemoClient[] = [
  { name: "Nova Saúde", projects: ["Campanha Verão 2025", "Portal do Paciente"] },
  { name: "TechFit", projects: ["Lançamento App 3.0", "Black Friday 2025"] },
  { name: "Café Artesanal", projects: ["Rebranding 2025", "Social Media Mensal"] },
];

const VIDEO_TITLES = [
  "Reels Promo Verão",
  "TikTok Behind Scenes",
  "Reels Depoimento Cliente",
  "Story Animado Launch",
  "Reels Tutorial Produto",
  "TikTok Trend Mensal",
  "Reels Institucional",
  "Story Countdown Evento",
  "Reels Comparativo",
  "TikTok Unboxing",
  "Reels FAQ Rápido",
  "Story Resultado Case",
  "Reels Time-lapse",
  "TikTok Receita Especial",
  "Reels Tour Escritório",
  "Story Enquete Produto",
  "Reels Desafio Marca",
  "TikTok Collab Creator",
];

const CARROSSEL_TITLES = [
  "Carrossel 5 Dicas Saúde",
  "Carrossel Portfólio Cases",
  "Carrossel Checklist Fitness",
  "Carrossel Infográfico Vendas",
  "Carrossel Antes/Depois",
  "Carrossel Passo a Passo",
  "Carrossel Depoimentos",
  "Carrossel Novidades Mês",
  "Carrossel FAQ Top 5",
  "Carrossel Timeline Marca",
  "Carrossel Comparativo Planos",
  "Carrossel Dicas Nutrição",
  "Carrossel Resultado Campanha",
  "Carrossel Guia Rápido",
  "Carrossel Behind Scenes",
  "Carrossel Storytelling Case",
  "Carrossel Produtos Destaque",
  "Carrossel Mini Tutorial",
];

const LP_TITLES = [
  "LP Curso Online Python",
  "LP Plano Premium Saúde",
  "LP Black Friday Mega",
  "LP App Download 3.0",
  "LP Evento Presencial",
  "LP Assinatura Mensal",
  "LP Consultoria Grátis",
  "LP Ebook Exclusivo",
  "LP Webinar Lançamento",
  "LP Promo Fim de Ano",
  "LP Trial 14 Dias",
  "LP Programa Fidelidade",
  "LP Congresso Digital",
  "LP Pré-Venda Produto",
  "LP Captação Leads B2B",
];

const TRAFEGO_TITLES = [
  "Google Ads Verão 2025",
  "Meta Ads Lançamento App",
  "Retargeting Abandono Cart",
  "Google Ads Institucional",
  "Meta Ads Stories Promo",
  "LinkedIn Ads B2B",
  "Google Ads Black Friday",
  "Meta Ads Carrossel Promo",
  "TikTok Ads Awareness",
  "Google Ads Remarketing",
  "Meta Ads Lead Gen",
  "YouTube Ads Pre-Roll",
  "Google Ads Search Brand",
  "Meta Ads Conversão Loja",
  "Pinterest Ads Lifestyle",
];

const REWORK_REASONS = [
  "Cliente pediu ajuste no tom da copy após revisão.",
  "Cores fora do manual da marca — refazer arte.",
  "Faltou CTA no layout aprovado; devolvido para correção.",
  "Erro de dado no criativo (preço desatualizado).",
  "Enquadramento do vídeo cortou o logo — reeditar.",
  "Texto com erro de português apontado no QC.",
  "Briefing mudou de direção; versão anterior descartada.",
  "Link da LP quebrado no ambiente de homologação.",
  "Cliente mudou a oferta principal na última hora.",
  "Ajuste de responsividade mobile solicitado pelo QC.",
];

const ONE_ON_ONE_NOTES = [
  "Alinhamento de prioridades da semana; sem bloqueios.",
  "Feedback sobre última entrega; combinamos foco em qualidade.",
  "Conversa sobre carga de trabalho — redistribuir 1 demanda.",
  "Desenvolvimento: interesse em assumir tarefas de motion.",
  "Check-in rápido; tudo fluindo bem.",
  "Revisamos os gargalos recentes na etapa de aprovação.",
];

// ─── StageTransition emission ────────────────────────────────────────────────────

type TransitionInput = Prisma.StageTransitionCreateManyInput;

/** Emit the transition log for a COMPLETED stage instance. ~fraction of stages
 * get a BLOCKED span in the middle → flow efficiency < 100% for that stage. */
async function emitCompletedTransitions(
  taskId: string,
  stageId: string,
  activatedAt: Date,
  completedAt: Date,
  blocked: boolean
): Promise<void> {
  const rows: TransitionInput[] = [{ taskId, stageId, status: "ACTIVE", at: activatedAt }];
  if (blocked && completedAt.getTime() > activatedAt.getTime()) {
    const total = completedAt.getTime() - activatedAt.getTime();
    rows.push({
      taskId,
      stageId,
      status: "BLOCKED",
      at: new Date(activatedAt.getTime() + total * 0.3),
    });
    rows.push({
      taskId,
      stageId,
      status: "ACTIVE",
      at: new Date(activatedAt.getTime() + total * 0.6),
    });
  }
  rows.push({ taskId, stageId, status: "COMPLETED", at: completedAt });
  await prisma.stageTransition.createMany({ data: rows });
}

/** Emit the transition log for a currently-open stage (ACTIVE, optionally then
 * BLOCKED — the last status accrues to `now` in the flow-efficiency reconstruction). */
async function emitOpenTransitions(
  taskId: string,
  stageId: string,
  activatedAt: Date,
  blockedAt: Date | null
): Promise<void> {
  const rows: TransitionInput[] = [{ taskId, stageId, status: "ACTIVE", at: activatedAt }];
  if (blockedAt) rows.push({ taskId, stageId, status: "BLOCKED", at: blockedAt });
  await prisma.stageTransition.createMany({ data: rows });
}

// ─── Main Seed Logic ───────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Starting demo seed...\n");

  // ─── 1. Teams + real rich users ──────────────────────────────────────────────

  const allTeams = await prisma.team.findMany();
  const teamMap = new Map(allTeams.map((t) => [t.name, t.id]));
  console.log(`Found ${allTeams.length} teams.`);

  const richReal = await prisma.user.findMany({
    where: { email: { in: RICH_REAL_EMAILS } },
    select: { id: true, email: true },
  });
  const richRealIds = richReal.map((u) => u.id);
  console.log(`Rich real users resolved: ${richReal.map((u) => u.email).join(", ") || "(none)"}`);

  // ─── 2. Demo users (with weekly capacity) ────────────────────────────────────

  const namePool = shuffle(BRAZILIAN_NAMES);
  let nameIdx = 0;
  const usersByTeam = new Map<string, string[]>();
  const allUserIds: string[] = [];

  for (const spec of TEAM_USERS) {
    const teamId = teamMap.get(spec.team);
    if (!teamId) {
      console.warn(`Team "${spec.team}" not found, skipping.`);
      continue;
    }
    const ids: string[] = [];
    for (let i = 1; i <= spec.count; i++) {
      const email = `demo-${spec.slug}-${String(i).padStart(2, "0")}${DEMO_EMAIL_DOMAIN}`;
      const name = namePool[nameIdx++] || `Demo User ${nameIdx}`;
      const role = spec.roles[i - 1];
      const user = await prisma.user.upsert({
        where: { email },
        update: {
          name,
          role,
          weeklyCapacityHours: randomInt(30, 40),
          teams: { set: [{ id: teamId }] },
        },
        create: {
          email,
          name,
          role,
          weeklyCapacityHours: randomInt(30, 40),
          teams: { connect: { id: teamId } },
        },
      });
      ids.push(user.id);
      allUserIds.push(user.id);
    }
    usersByTeam.set(spec.team, ids);
  }
  console.log(`Created ${allUserIds.length} demo users.\n`);

  const managerPool = [...(usersByTeam.get("Manager") ?? []), ...richRealIds];
  const managerIds = managerPool.length > 0 ? managerPool : allUserIds;

  // Give the rich real users a capacity target too (reset by demo-cleanup).
  for (const id of richRealIds) {
    await prisma.user.update({ where: { id }, data: { weeklyCapacityHours: 40 } });
  }

  // ─── 3. Presence (lastSeenAt) ────────────────────────────────────────────────

  const shuffledUsers = shuffle(allUserIds);
  const presenceBuckets: { count: number; fn: () => Date | null }[] = [
    { count: 4, fn: () => minutesAgo(randomInt(0, 5)) },
    { count: 3, fn: () => hoursAgo(randomFloat(1, 4)) },
    { count: 3, fn: () => hoursAgo(randomFloat(5, 12)) },
    { count: 2, fn: () => daysAgo(1) },
    { count: 3, fn: () => daysAgo(randomInt(2, 14)) },
    { count: 3, fn: () => null },
  ];
  let presIdx = 0;
  for (const bucket of presenceBuckets) {
    for (let i = 0; i < bucket.count && presIdx < shuffledUsers.length; i++, presIdx++) {
      await prisma.user.update({
        where: { id: shuffledUsers[presIdx] },
        data: { lastSeenAt: bucket.fn() },
      });
    }
  }
  console.log("Set lastSeenAt for presence simulation.");

  // ─── 4. Clients & projects ───────────────────────────────────────────────────

  const projectIds: string[] = [];
  for (const c of DEMO_CLIENTS) {
    const client = await prisma.client.upsert({
      where: { name: `${DEMO_CLIENT_PREFIX}${c.name}` },
      update: {},
      create: {
        name: `${DEMO_CLIENT_PREFIX}${c.name}`,
        description: `Cliente demo para apresentação — ${c.name}`,
        email: `contato@${c.name.toLowerCase().replace(/\s+/g, "")}.com.br`,
        phone: `(11) 9${randomInt(1000, 9999)}-${randomInt(1000, 9999)}`,
      },
    });
    for (const projName of c.projects) {
      const project = await prisma.project.create({
        data: {
          name: projName,
          description: `Projeto "${projName}" para ${c.name}`,
          clientId: client.id,
        },
      });
      projectIds.push(project.id);
    }
  }
  console.log(`Created ${DEMO_CLIENTS.length} clients and ${projectIds.length} projects.\n`);

  // ─── 5. Templates + WIP limits ───────────────────────────────────────────────

  const templates = await prisma.workflowTemplate.findMany({
    include: { stages: { orderBy: { order: "asc" } } },
  });
  const templateByName = new Map(templates.map((t) => [t.name, t]));

  // Set wipLimit on real template stages (reset to null by demo-cleanup). The
  // bottleneck stage gets a tight limit so its WIP meter reads over-limit.
  let wipStagesSet = 0;
  for (const tpl of templates) {
    for (const stage of tpl.stages) {
      const limit = isBottleneckStageName(stage.name) ? 2 : randomInt(4, 5);
      await prisma.templateStage.update({ where: { id: stage.id }, data: { wipLimit: limit } });
      wipStagesSet++;
    }
  }
  console.log(`Set wipLimit on ${wipStagesSet} template stages.`);

  // ─── 6. Tasks (3 trajectories) ───────────────────────────────────────────────

  interface TaskPlan {
    templateName: string;
    titles: string[];
    distribution: { stage: number; count: number; status: TaskStatus; hasAssignee: boolean }[];
    cancelledCount?: number;
  }

  const threeStage35: TaskPlan["distribution"] = [
    { stage: 1, count: 6, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 2, count: 6, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 3, count: 4, status: "IN_PROGRESS", hasAssignee: true },
    { stage: -1, count: 12, status: "COMPLETED", hasAssignee: true },
    { stage: 1, count: 3, status: "BACKLOG", hasAssignee: false },
    { stage: 2, count: 2, status: "PAUSED", hasAssignee: true },
  ];

  const threeStage25: TaskPlan["distribution"] = [
    { stage: 1, count: 4, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 2, count: 5, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 3, count: 3, status: "IN_PROGRESS", hasAssignee: true },
    { stage: -1, count: 10, status: "COMPLETED", hasAssignee: true },
    { stage: 1, count: 2, status: "BACKLOG", hasAssignee: false },
    { stage: 1, count: 1, status: "PAUSED", hasAssignee: true },
  ];

  const fourStageLP: TaskPlan["distribution"] = [
    { stage: 1, count: 3, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 2, count: 4, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 3, count: 3, status: "IN_PROGRESS", hasAssignee: true },
    { stage: -1, count: 12, status: "COMPLETED", hasAssignee: true },
    { stage: 1, count: 2, status: "BACKLOG", hasAssignee: false },
    { stage: 2, count: 1, status: "PAUSED", hasAssignee: true },
  ];

  const taskPlans: TaskPlan[] = [
    { templateName: "Vídeo Curto", titles: VIDEO_TITLES, distribution: threeStage35 },
    {
      templateName: "Post Carrossel Estático",
      titles: CARROSSEL_TITLES,
      distribution: threeStage35,
    },
    {
      templateName: "Landing Page",
      titles: LP_TITLES,
      distribution: fourStageLP,
      cancelledCount: 2,
    },
    { templateName: "Campanha de Tráfego", titles: TRAFEGO_TITLES, distribution: threeStage25 },
  ];

  // Rework candidates: completed stage instances we can later attribute a defect to.
  interface ReworkCandidate {
    taskId: string;
    sourceStageId: string;
    sourceAssigneeId: string;
    isBottleneck: boolean;
    taskCreatedAt: Date;
    taskCompletedAt: Date | null;
  }
  const reworkCandidates: ReworkCandidate[] = [];
  const activityLogCandidates: { userId: string; taskId: string; stageId: string }[] = [];
  const recentTimeLogTargets: { userId: string; taskId: string; stageId: string }[] = [];

  let totalTasks = 0;
  let totalTimeLogs = 0;
  let totalTransitions = 0;
  let blockedNow = 0;

  const pickAssignee = (stageUsers: string[]): string => {
    const pool = stageUsers.length > 0 ? stageUsers : allUserIds;
    if (richRealIds.length > 0 && Math.random() < 0.22) return pick(richRealIds);
    return pick(pool);
  };

  for (const plan of taskPlans) {
    const template = templateByName.get(plan.templateName);
    if (!template) {
      console.warn(`Template "${plan.templateName}" not found, skipping.`);
      continue;
    }
    const stages = template.stages;
    const titlePool = shuffle(plan.titles);
    let titleIdx = 0;

    const stageUserMap = new Map<string, string[]>();
    for (const stage of stages) {
      if (stage.defaultTeamId) {
        const team = allTeams.find((t) => t.id === stage.defaultTeamId);
        if (team) stageUserMap.set(stage.id, usersByTeam.get(team.name) || []);
      }
    }

    // Create a single currently-open stage (ACTIVE or BLOCKED) for an in-flight task.
    const createOpenStage = async (
      taskId: string,
      stage: (typeof stages)[number],
      chainedStart: Date,
      hasAssignee: boolean
    ): Promise<void> => {
      const stageUsers = stageUserMap.get(stage.id) || [];
      const assignee = hasAssignee ? pickAssignee(stageUsers) : null;
      const bottleneck = isBottleneckStageName(stage.name);
      const activatedAt = pastify(chainedStart, bottleneck ? 16 : 10);
      const blocked = bottleneck ? Math.random() < 0.5 : Math.random() < 0.2;
      let blockedAt: Date | null = null;
      if (blocked) {
        const span = NOW.getTime() - activatedAt.getTime();
        blockedAt = new Date(activatedAt.getTime() + span * randomFloat(0.3, 0.7, 3));
        blockedNow++;
      }
      await prisma.taskActiveStage.create({
        data: {
          taskId,
          stageId: stage.id,
          status: blocked ? "BLOCKED" : "ACTIVE",
          assigneeId: assignee,
          activatedAt,
          assignedAt: assignee ? activatedAt : null,
          blockedAt,
          completedAt: null,
        },
      });
      await prisma.taskStageLog.create({
        data: {
          taskId,
          stageId: stage.id,
          enteredAt: activatedAt,
          exitedAt: null,
          status: null,
          userId: assignee || pickAssignee(stageUsers),
        },
      });
      await emitOpenTransitions(taskId, stage.id, activatedAt, blockedAt);
      totalTransitions += blockedAt ? 2 : 1;
      if (assignee) {
        activityLogCandidates.push({ userId: assignee, taskId, stageId: stage.id });
        if (!blocked) recentTimeLogTargets.push({ userId: assignee, taskId, stageId: stage.id });
      }
    };

    for (const dist of plan.distribution) {
      for (let i = 0; i < dist.count; i++) {
        const title = titlePool[titleIdx++ % titlePool.length];
        const projectId = pick(projectIds);
        const priority = pickPriority();

        let completedStageCount: number;
        if (dist.status === "COMPLETED") completedStageCount = stages.length;
        else completedStageCount = dist.stage - 1;

        // FILA (criação → alguém pegar) e EXECUÇÃO (início → entrega) são sorteadas
        // ANTES da data de criação, para que a cadeia inteira caiba no passado:
        // ancorar a entrega em createdAt podia jogar conclusões para o futuro, o que
        // some do throughput (buckets terminam hoje) mas contamina os percentis.
        // A fila precisa ser materialmente > 0 — com fila ~0, cycle ≈ lead e a
        // separação some justamente na tela que existe para mostrá-la.
        const queueDays = dist.status === "BACKLOG" ? 0 : randomFloat(0.5, 6);
        const execDays =
          dist.status === "COMPLETED"
            ? randomInt(completedStageCount * 2, completedStageCount * 5 + 8)
            : 0;

        const createdAt = daysAgo(randomInt(Math.ceil(queueDays + execDays) + 1, 80));
        const dueDate = pickDueDate(createdAt);

        // BACKLOG nunca foi pega → startedAt null, como na vida real (e sai da
        // base de cycle time, que é o comportamento correto).
        const startedAt = dist.status === "BACKLOG" ? null : addDays(createdAt, queueDays);
        const completedAt =
          dist.status === "COMPLETED" ? addDays(startedAt ?? createdAt, execDays) : null;

        const task = await prisma.task.create({
          data: {
            title,
            description: `Tarefa demo: ${title} — Template ${plan.templateName}`,
            status: dist.status,
            priority,
            createdAt,
            dueDate,
            startedAt,
            completedAt,
            projectId,
            workflowTemplateId: template.id,
          },
        });
        totalTasks++;

        // As etapas começam quando a tarefa começa (não na criação).
        let stageStartDate = addDays(startedAt ?? createdAt, randomFloat(0, 1));

        for (let s = 0; s < completedStageCount && s < stages.length; s++) {
          const stage = stages[s];
          const stageUsers = stageUserMap.get(stage.id) || [];
          const assignee = pickAssignee(stageUsers);
          const bottleneck = isBottleneckStageName(stage.name);
          const stageDuration = randomInt(1, bottleneck ? 7 : 5);
          const stageEndDate = addDays(stageStartDate, stageDuration);

          await prisma.taskActiveStage.create({
            data: {
              taskId: task.id,
              stageId: stage.id,
              status: "COMPLETED",
              assigneeId: assignee,
              activatedAt: stageStartDate,
              assignedAt: stageStartDate,
              completedAt: stageEndDate,
            },
          });
          await prisma.taskStageLog.create({
            data: {
              taskId: task.id,
              stageId: stage.id,
              enteredAt: stageStartDate,
              exitedAt: stageEndDate,
              status: "COMPLETED",
              userId: assignee,
            },
          });

          const blocked = bottleneck ? Math.random() < 0.45 : Math.random() < 0.25;
          await emitCompletedTransitions(task.id, stage.id, stageStartDate, stageEndDate, blocked);
          totalTransitions += blocked ? 4 : 2;

          if (Math.random() < 0.6) {
            const logCount = randomInt(1, 3);
            for (let l = 0; l < logCount; l++) {
              await prisma.timeLog.create({
                data: {
                  taskId: task.id,
                  stageId: stage.id,
                  userId: assignee,
                  hoursSpent: randomFloat(0.5, 8.0),
                  logDate: randomDateBetween(stageStartDate, stageEndDate),
                  description: null,
                },
              });
              totalTimeLogs++;
            }
          }

          // Track as a possible defect source (bias to bottleneck/quality stages).
          reworkCandidates.push({
            taskId: task.id,
            sourceStageId: stage.id,
            sourceAssigneeId: assignee,
            isBottleneck: bottleneck,
            taskCreatedAt: createdAt,
            taskCompletedAt: completedAt,
          });

          stageStartDate = addDays(stageEndDate, randomFloat(0, 0.5));
        }

        // Current open stage for in-flight/paused tasks.
        if (dist.status !== "COMPLETED" && dist.status !== "BACKLOG") {
          const activeStageIdx = completedStageCount;
          if (activeStageIdx < stages.length) {
            await createOpenStage(
              task.id,
              stages[activeStageIdx],
              stageStartDate,
              dist.hasAssignee
            );
          }
        }
      }
    }

    // Cancelled tasks (LP): first stage completed, then cancelled.
    if (plan.cancelledCount) {
      for (let i = 0; i < plan.cancelledCount; i++) {
        const title = `${titlePool[titleIdx++ % titlePool.length]} (Cancelado)`;
        const projectId = pick(projectIds);
        const createdAt = daysAgo(randomInt(10, 60));
        const task = await prisma.task.create({
          data: {
            title,
            description: `Tarefa cancelada demo: ${title}`,
            status: "CANCELLED",
            priority: pickPriority(),
            createdAt,
            // Chegou a ser trabalhada (1ª etapa concluída antes do cancelamento).
            startedAt: createdAt,
            dueDate: null,
            projectId,
            workflowTemplateId: template.id,
          },
        });
        totalTasks++;
        const stage = stages[0];
        const stageUsers = stageUserMap.get(stage.id) || [];
        const assignee = pickAssignee(stageUsers);
        const endDate = addDays(createdAt, randomInt(1, 3));
        await prisma.taskActiveStage.create({
          data: {
            taskId: task.id,
            stageId: stage.id,
            status: "COMPLETED",
            assigneeId: assignee,
            activatedAt: createdAt,
            assignedAt: createdAt,
            completedAt: endDate,
          },
        });
        await prisma.taskStageLog.create({
          data: {
            taskId: task.id,
            stageId: stage.id,
            enteredAt: createdAt,
            exitedAt: endDate,
            status: "COMPLETED",
            userId: assignee,
          },
        });
        await emitCompletedTransitions(task.id, stage.id, createdAt, endDate, false);
        totalTransitions += 2;
      }
    }

    console.log(`Created tasks for template "${plan.templateName}".`);
  }

  console.log(`\nTotal tasks: ${totalTasks}`);
  console.log(`Total time logs: ${totalTimeLogs}`);
  console.log(`Total stage transitions: ${totalTransitions}`);
  console.log(`Currently blocked stages: ${blockedNow}`);

  // ─── 7. Rework events (defect-at-source, internal vs client) ──────────────────

  let reworkCount = 0;
  const usedTaskForRework = new Set<string>();
  // Prefer bottleneck-stage sources; sample ~30 events across distinct tasks.
  const reworkPool = shuffle(reworkCandidates).sort(
    (a, b) => Number(b.isBottleneck) - Number(a.isBottleneck)
  );
  for (const cand of reworkPool) {
    if (reworkCount >= 30) break;
    if (usedTaskForRework.has(cand.taskId)) continue;
    if (Math.random() > (cand.isBottleneck ? 0.5 : 0.18)) continue;
    usedTaskForRework.add(cand.taskId);

    const kind: "INTERNAL" | "CLIENT" = Math.random() < 0.7 ? "INTERNAL" : "CLIENT";
    const rc = Math.random();
    const reworkClass: "DEFECT" | "LEGITIMATE" | null =
      rc < 0.7 ? "DEFECT" : rc < 0.9 ? "LEGITIMATE" : null;
    const upper = cand.taskCompletedAt ?? NOW;
    const at = randomDateBetween(cand.taskCreatedAt, upper > cand.taskCreatedAt ? upper : NOW);
    await prisma.reworkEvent.create({
      data: {
        at,
        kind,
        reason: pick(REWORK_REASONS),
        taskId: cand.taskId,
        sourceStageId: cand.sourceStageId,
        byUserId: pick(managerIds),
        reworkClass,
        sourceAssigneeId: cand.sourceAssigneeId,
      },
    });
    reworkCount++;
  }
  console.log(`Created ${reworkCount} rework events.`);

  // ─── 8. 1:1 cadence (some recent, some overdue) ──────────────────────────────

  const oneOnOneSubjects = shuffle([...allUserIds, ...richRealIds]);
  let oneOnOneCount = 0;
  for (const userId of oneOnOneSubjects) {
    if (Math.random() > 0.6) continue; // ~40% left with no 1:1 → overdue
    const logs = randomInt(1, 3);
    for (let l = 0; l < logs; l++) {
      const manager = pick(managerIds.filter((m) => m !== userId)) ?? pick(managerIds);
      await prisma.oneOnOneLog.create({
        data: {
          userId,
          managerId: manager,
          occurredAt: daysAgo(randomInt(1, 30) + l * 14),
          notes: pick(ONE_ON_ONE_NOTES),
        },
      });
      oneOnOneCount++;
    }
  }
  console.log(`Created ${oneOnOneCount} one-on-one logs.`);

  // ─── 9. Recent time logs (current utilization for open work) ─────────────────

  let recentLogs = 0;
  for (const target of shuffle(recentTimeLogTargets).slice(0, 40)) {
    const n = randomInt(1, 3);
    for (let l = 0; l < n; l++) {
      await prisma.timeLog.create({
        data: {
          taskId: target.taskId,
          stageId: target.stageId,
          userId: target.userId,
          hoursSpent: randomFloat(1, 6),
          logDate: daysAgo(randomInt(0, 6)),
          description: null,
        },
      });
      recentLogs++;
      totalTimeLogs++;
    }
  }
  console.log(`Created ${recentLogs} recent time logs.`);

  // ─── 10. Activity logs (live sessions) ───────────────────────────────────────

  const onlineUserIds = shuffledUsers.slice(0, 4);
  const onlineCandidates = activityLogCandidates.filter((c) => onlineUserIds.includes(c.userId));
  const activeWorkers = shuffle(onlineCandidates).slice(0, randomInt(3, 6));
  let activityLogCount = 0;
  for (const worker of activeWorkers) {
    await prisma.activityLog.create({
      data: {
        userId: worker.userId,
        taskId: worker.taskId,
        stageId: worker.stageId,
        startedAt: minutesAgo(randomInt(5, 120)),
        endedAt: null,
      },
    });
    activityLogCount++;
  }
  const closedCandidates = shuffle(activityLogCandidates).slice(0, randomInt(20, 35));
  for (const candidate of closedCandidates) {
    const startedAt = hoursAgo(randomInt(1, 168));
    const endedAt = addHours(startedAt, randomFloat(0.25, 4));
    await prisma.activityLog.create({
      data: {
        userId: candidate.userId,
        taskId: candidate.taskId,
        stageId: candidate.stageId,
        startedAt,
        endedAt,
      },
    });
    activityLogCount++;
  }
  console.log(`Created ${activityLogCount} activity logs.`);

  // ─── Summary ─────────────────────────────────────────────────────────────────

  console.log("\n✅ Demo seed complete!");
  console.log(`   Demo users: ${allUserIds.length} (+ ${richRealIds.length} real enriched)`);
  console.log(`   Clients: ${DEMO_CLIENTS.length} · Projects: ${projectIds.length}`);
  console.log(
    `   Tasks: ${totalTasks} · Transitions: ${totalTransitions} · Blocked now: ${blockedNow}`
  );
  console.log(`   Rework events: ${reworkCount} · 1:1 logs: ${oneOnOneCount}`);
  console.log(`   Time logs: ${totalTimeLogs} · Activity logs: ${activityLogCount}`);
}

main()
  .catch(async (e) => {
    console.error("❌ Demo seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
