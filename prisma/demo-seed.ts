import {
  PrismaClient,
  UserRole,
  TaskStatus,
  TaskPriority,
  ActiveStageStatus,
  StageLogStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

// ─── Helpers ───────────────────────────────────────────────────────────────────

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
  // Concentrado pra demo/piloto: 70% das tarefas têm prazo na semana corrente
  // ou imediatamente vizinha (mais visibilidade no Gantt + métricas relevantes).
  if (r < 0.08) return null; // 8% sem prazo (alimenta linha "Sem prazo" do Gantt)
  if (r < 0.3) return addDays(now, -randomInt(1, 6)); // 22% atrasadas (≤ 6 dias)
  if (r < 0.5) return addDays(now, randomInt(0, 2)); // 20% próximos 3 dias
  if (r < 0.75) return addDays(now, randomInt(3, 7)); // 25% no restante da semana
  if (r < 0.92) return addDays(now, randomInt(8, 14)); // 17% próxima semana
  return addDays(now, randomInt(15, 35)); // 8% futuro distante
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const DEMO_EMAIL_DOMAIN = "@demo.workos.fake";
const DEMO_CLIENT_PREFIX = "[DEMO] ";

interface TeamUserSpec {
  team: string;
  slug: string;
  count: number;
  roles: UserRole[];
}

const TEAM_USERS: TeamUserSpec[] = [
  {
    team: "Quality Control",
    slug: "qc",
    count: 8,
    roles: [...Array(7).fill("MEMBER" as UserRole), "SUPERVISOR"],
  },
  {
    team: "Traffic Manager",
    slug: "traffic",
    count: 8,
    roles: [...Array(7).fill("MEMBER" as UserRole), "SUPERVISOR"],
  },
  {
    team: "Social Media",
    slug: "social",
    count: 7,
    roles: [...Array(6).fill("MEMBER" as UserRole), "SUPERVISOR"],
  },
  {
    team: "Designers",
    slug: "design",
    count: 7,
    roles: [...Array(6).fill("MEMBER" as UserRole), "SUPERVISOR"],
  },
  { team: "Video-makers", slug: "video", count: 5, roles: Array(5).fill("MEMBER" as UserRole) },
  { team: "Copywriting", slug: "copy", count: 5, roles: Array(5).fill("MEMBER" as UserRole) },
  { team: "Software Engineer", slug: "dev", count: 5, roles: Array(5).fill("MEMBER" as UserRole) },
  { team: "SEO", slug: "seo", count: 4, roles: Array(4).fill("MEMBER" as UserRole) },
  { team: "Manager", slug: "mgr", count: 4, roles: Array(4).fill("MANAGER" as UserRole) },
  { team: "Supervisor", slug: "sup", count: 3, roles: Array(3).fill("SUPERVISOR" as UserRole) },
  { team: "Call Center", slug: "call", count: 2, roles: Array(2).fill("MEMBER" as UserRole) },
  { team: "HR", slug: "hr", count: 2, roles: Array(2).fill("MEMBER" as UserRole) },
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
  "Quitéria Moraes",
  "Rafael Nascimento",
  "Sara Mendes",
  "Thiago Correia",
  "Ursula Teixeira",
  "Vinícius Cardoso",
  "Wanda Pinto",
  "Xavier Rocha",
  "Yasmin Monteiro",
  "Arthur Dias",
  "Bianca Nunes",
  "Caio Machado",
  "Débora Freitas",
  "Enzo Moreira",
  "Fernanda Castro",
  "Gustavo Campos",
  "Helena Vieira",
  "Igor Rezende",
  "Juliana Andrade",
  "Kevin Lopes",
  "Larissa Duarte",
  "Mateus Ramos",
  "Natália Guimarães",
  "Otávio Medeiros",
  "Patrícia Amaral",
  "Raul Fonseca",
  "Simone Cavalcanti",
  "Tomás Miranda",
  "Valentina Alves",
  "Wagner Batista",
  "Ximena Cruz",
  "Yuri Barros",
  "Zélia Pinheiro",
  "Amanda Gomes",
  "Bernardo Leite",
  "Cecília Amorim",
  "Diego Tavares",
  "Elisa Borges",
  "Fabiana Dantas",
  "Guilherme Melo",
  "Heloísa Reis",
  "Ian Figueiredo",
  "Joana Assis",
  "Leonardo Nogueira",
];

interface DemoClient {
  name: string;
  projects: string[];
}

const DEMO_CLIENTS: DemoClient[] = [
  { name: "Nova Saúde", projects: ["Campanha Verão 2025", "Portal do Paciente"] },
  { name: "TechFit", projects: ["Lançamento App 3.0", "Black Friday 2025"] },
  { name: "Café Artesanal", projects: ["Rebranding 2025", "Social Media Mensal"] },
  { name: "EduPlus", projects: ["LP Curso Python", "Campanha Matrículas"] },
  { name: "AutoElite", projects: ["Feirão de Outubro", "Instagram Semanal"] },
  { name: "PetAmigo", projects: ["E-commerce Launch", "Conteúdo Redes"] },
  { name: "Construtora Horizonte", projects: ["Lançamento Residencial Aurora"] },
];

// Task titles per template type
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
  "Reels Data Comemorativa",
  "Story Oferta Relâmpago",
  "Reels Bastidores Equipe",
  "TikTok Antes e Depois",
  "Reels Apresentação Time",
  "Story Mini-doc",
  "Reels Review Produto",
  "TikTok Dia a Dia",
  "Reels Lançamento Feature",
  "Story Rotina Empresa",
  "Reels Dica Rápida",
  "TikTok Transformação",
  "Reels Agradecimento",
  "Story Flash Sale",
  "Reels Q&A Rápido",
  "TikTok Hack Produto",
  "Reels Parceria Especial",
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
  "Carrossel Tendências 2025",
  "Carrossel Mitos e Verdades",
  "Carrossel Benefícios Produto",
  "Carrossel Processo Criativo",
  "Carrossel Ranking Mensal",
  "Carrossel Data Especial",
  "Carrossel Equipe Apresentação",
  "Carrossel Dúvidas Comuns",
  "Carrossel Transformação",
  "Carrossel Receita da Semana",
  "Carrossel Promoção Sazonal",
  "Carrossel Curiosidades",
  "Carrossel Resumo Evento",
  "Carrossel KPIs do Mês",
  "Carrossel Parceiros",
  "Carrossel Sustentabilidade",
  "Carrossel Review Serviço",
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
  "LP Imersão Fitness",
  "LP Pacote Corporativo",
  "LP Demo Gratuita",
  "LP Matrícula Antecipada",
  "LP Upgrade Plano",
  "LP Franchise Info",
  "LP Case Study Download",
  "LP Newsletter VIP",
  "LP Reserva Antecipada",
  "LP Workshop Intensivo",
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
  "Google Ads Display Network",
  "Meta Ads Evento Local",
  "Spotify Ads Podcast",
  "Google Ads Performance Max",
  "Meta Ads Lookalike",
  "Twitter Ads Engagement",
  "Google Shopping Produtos",
  "Meta Ads Video Views",
  "LinkedIn InMail Campaign",
  "Google Ads App Install",
];

// ─── Main Seed Logic ───────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Starting demo seed...\n");

  // ─── 1. Fetch existing teams ─────────────────────────────────────────────────

  const allTeams = await prisma.team.findMany();
  const teamMap = new Map(allTeams.map((t) => [t.name, t.id]));
  console.log(`Found ${allTeams.length} teams.`);

  // ─── 2. Create demo users ────────────────────────────────────────────────────

  const namePool = shuffle(BRAZILIAN_NAMES);
  let nameIdx = 0;
  const usersByTeam = new Map<string, string[]>(); // teamName → userId[]
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
        update: { name, role, teamId },
        create: { email, name, role, teamId },
      });
      ids.push(user.id);
      allUserIds.push(user.id);
    }
    usersByTeam.set(spec.team, ids);
  }
  console.log(`Created ${allUserIds.length} demo users.\n`);

  // ─── 3. Set lastSeenAt for presence ──────────────────────────────────────────

  const shuffledUsers = shuffle(allUserIds);
  const presenceBuckets: { count: number; fn: () => Date | null }[] = [
    { count: 12, fn: () => minutesAgo(randomInt(0, 5)) }, // Online agora
    { count: 10, fn: () => hoursAgo(randomFloat(1, 4)) }, // Recente
    { count: 10, fn: () => hoursAgo(randomFloat(5, 12)) }, // Hoje cedo
    { count: 8, fn: () => daysAgo(1) }, // Ontem
    { count: 10, fn: () => daysAgo(randomInt(2, 14)) }, // Dias atrás
    { count: 10, fn: () => null }, // Nunca visto
  ];

  let presIdx = 0;
  for (const bucket of presenceBuckets) {
    for (let i = 0; i < bucket.count && presIdx < shuffledUsers.length; i++, presIdx++) {
      const lastSeenAt = bucket.fn();
      await prisma.user.update({
        where: { id: shuffledUsers[presIdx] },
        data: { lastSeenAt },
      });
    }
  }
  console.log("Set lastSeenAt for presence simulation.");

  // ─── 4. Create demo clients & projects ───────────────────────────────────────

  const projectIds: string[] = [];
  const projectMap = new Map<string, string>(); // projectName → projectId

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
      projectMap.set(projName, project.id);
    }
  }
  console.log(`Created ${DEMO_CLIENTS.length} clients and ${projectIds.length} projects.\n`);

  // ─── 5. Fetch templates & stages ─────────────────────────────────────────────

  const templates = await prisma.workflowTemplate.findMany({
    include: { stages: { orderBy: { order: "asc" } } },
  });
  const templateByName = new Map(templates.map((t) => [t.name, t]));

  // ─── 6. Create tasks ─────────────────────────────────────────────────────────

  interface TaskPlan {
    templateName: string;
    titles: string[];
    distribution: { stage: number; count: number; status: TaskStatus; hasAssignee: boolean }[];
    cancelledCount?: number;
  }

  // For 3-stage templates (Video, Carrossel, Tráfego):
  // stage 1: 8, stage 2: 8, stage 3: 6, completed: 7, backlog: 4, paused: 2
  const threeStage35: TaskPlan["distribution"] = [
    { stage: 1, count: 8, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 2, count: 8, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 3, count: 6, status: "IN_PROGRESS", hasAssignee: true },
    { stage: -1, count: 7, status: "COMPLETED", hasAssignee: true }, // -1 = all completed
    { stage: 1, count: 4, status: "BACKLOG", hasAssignee: false },
    { stage: 1, count: 2, status: "PAUSED", hasAssignee: true },
  ];

  const threeStage25: TaskPlan["distribution"] = [
    { stage: 1, count: 5, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 2, count: 6, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 3, count: 4, status: "IN_PROGRESS", hasAssignee: true },
    { stage: -1, count: 5, status: "COMPLETED", hasAssignee: true },
    { stage: 1, count: 3, status: "BACKLOG", hasAssignee: false },
    { stage: 1, count: 2, status: "PAUSED", hasAssignee: true },
  ];

  // For 5-stage LP template:
  // stage 1: 4, stage 2: 4, stage 3: 4, stage 4+5 parallel: 4, completed: 4, backlog: 2, paused: 1, cancelled: 2
  const fiveStageLP: TaskPlan["distribution"] = [
    { stage: 1, count: 4, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 2, count: 4, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 3, count: 4, status: "IN_PROGRESS", hasAssignee: true },
    { stage: 4, count: 4, status: "IN_PROGRESS", hasAssignee: true }, // 4 = parallel QC+SEO
    { stage: -1, count: 4, status: "COMPLETED", hasAssignee: true },
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
      distribution: fiveStageLP,
      cancelledCount: 2,
    },
    { templateName: "Campanha de Tráfego", titles: TRAFEGO_TITLES, distribution: threeStage25 },
  ];

  let totalTasks = 0;
  let totalTimeLogs = 0;
  const onlineUserIds = shuffledUsers.slice(0, 12); // Users marked online
  const activityLogCandidates: { userId: string; taskId: string; stageId: string }[] = [];

  for (const plan of taskPlans) {
    const template = templateByName.get(plan.templateName);
    if (!template) {
      console.warn(`Template "${plan.templateName}" not found, skipping.`);
      continue;
    }

    const stages = template.stages; // already sorted by order
    const titlePool = shuffle(plan.titles);
    let titleIdx = 0;

    // Get users per stage based on defaultTeam
    const stageUserMap = new Map<string, string[]>();
    for (const stage of stages) {
      if (stage.defaultTeamId) {
        const team = allTeams.find((t) => t.id === stage.defaultTeamId);
        if (team) {
          stageUserMap.set(stage.id, usersByTeam.get(team.name) || []);
        }
      }
    }

    for (const dist of plan.distribution) {
      for (let i = 0; i < dist.count; i++) {
        const title = titlePool[titleIdx++ % titlePool.length];
        const projectId = pick(projectIds);
        const createdAt = daysAgo(randomInt(5, 45));
        const priority = pickPriority();
        const dueDate = pickDueDate(createdAt);

        // Determine how many stages are completed
        let completedStageCount: number;
        let isParallelLP = false;

        if (dist.status === "COMPLETED") {
          completedStageCount = stages.length;
        } else if (dist.stage === 4 && plan.templateName === "Landing Page") {
          // Parallel QC + SEO — 3 stages completed (Copy, Design, Dev), 2 active (QC, SEO)
          completedStageCount = 3;
          isParallelLP = true;
        } else {
          completedStageCount = dist.stage - 1;
        }

        // Build task data
        const completedAt =
          dist.status === "COMPLETED"
            ? addDays(createdAt, randomInt(completedStageCount * 2, completedStageCount * 5 + 10))
            : null;

        const task = await prisma.task.create({
          data: {
            title,
            description: `Tarefa demo: ${title} — Template ${plan.templateName}`,
            status: dist.status,
            priority,
            createdAt,
            dueDate,
            completedAt,
            projectId,
          },
        });
        totalTasks++;

        // Build stage timestamps chain
        let stageStartDate = addDays(createdAt, randomFloat(0, 1));

        // Create completed stages
        for (let s = 0; s < completedStageCount && s < stages.length; s++) {
          const stage = stages[s];
          const mappedStageUsers = stageUserMap.get(stage.id);
          const stageUsers =
            mappedStageUsers && mappedStageUsers.length > 0 ? mappedStageUsers : allUserIds;
          const assignee = pick(stageUsers);
          const stageDuration = randomInt(1, 5);
          const stageEndDate = addDays(stageStartDate, stageDuration);

          await prisma.taskActiveStage.create({
            data: {
              taskId: task.id,
              stageId: stage.id,
              status: "COMPLETED",
              assigneeId: assignee,
              activatedAt: stageStartDate,
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

          // TimeLogs for ~60% of tasks on completed stages
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

          stageStartDate = addDays(stageEndDate, randomFloat(0, 0.5));
        }

        // Create current active stage(s)
        if (dist.status !== "COMPLETED") {
          if (isParallelLP) {
            // Both QC (stage[3]) and SEO (stage[4]) active
            for (const parallelIdx of [3, 4]) {
              const stage = stages[parallelIdx];
              const mappedStageUsers = stageUserMap.get(stage.id);
              const stageUsers =
                mappedStageUsers && mappedStageUsers.length > 0 ? mappedStageUsers : allUserIds;
              const assignee = dist.hasAssignee ? pick(stageUsers) : null;

              await prisma.taskActiveStage.create({
                data: {
                  taskId: task.id,
                  stageId: stage.id,
                  status: "ACTIVE",
                  assigneeId: assignee,
                  activatedAt: stageStartDate,
                  completedAt: null,
                },
              });

              await prisma.taskStageLog.create({
                data: {
                  taskId: task.id,
                  stageId: stage.id,
                  enteredAt: stageStartDate,
                  exitedAt: null,
                  status: null,
                  userId: assignee || pick(stageUsers),
                },
              });

              if (assignee) {
                activityLogCandidates.push({
                  userId: assignee,
                  taskId: task.id,
                  stageId: stage.id,
                });
              }
            }
          } else {
            // Single active stage
            const activeStageIdx = completedStageCount;
            if (activeStageIdx < stages.length) {
              const stage = stages[activeStageIdx];
              const mappedStageUsers = stageUserMap.get(stage.id);
              const stageUsers =
                mappedStageUsers && mappedStageUsers.length > 0 ? mappedStageUsers : allUserIds;
              const assignee = dist.hasAssignee ? pick(stageUsers) : null;

              await prisma.taskActiveStage.create({
                data: {
                  taskId: task.id,
                  stageId: stage.id,
                  status: "ACTIVE",
                  assigneeId: assignee,
                  activatedAt: stageStartDate,
                  completedAt: null,
                },
              });

              await prisma.taskStageLog.create({
                data: {
                  taskId: task.id,
                  stageId: stage.id,
                  enteredAt: stageStartDate,
                  exitedAt: null,
                  status: null,
                  userId: assignee || pick(stageUsers),
                },
              });

              if (assignee) {
                activityLogCandidates.push({
                  userId: assignee,
                  taskId: task.id,
                  stageId: stage.id,
                });
              }
            }
          }
        }
      }
    }

    // Create cancelled tasks for LP
    if (plan.cancelledCount) {
      for (let i = 0; i < plan.cancelledCount; i++) {
        const title = `${titlePool[titleIdx++ % titlePool.length]} (Cancelado)`;
        const projectId = pick(projectIds);
        const createdAt = daysAgo(randomInt(10, 40));

        const task = await prisma.task.create({
          data: {
            title,
            description: `Tarefa cancelada demo: ${title}`,
            status: "CANCELLED",
            priority: pickPriority(),
            createdAt,
            dueDate: null,
            projectId,
          },
        });
        totalTasks++;

        // Cancelled after first stage
        const stage = stages[0];
        const mappedStageUsers = stageUserMap.get(stage.id);
        const stageUsers =
          mappedStageUsers && mappedStageUsers.length > 0 ? mappedStageUsers : allUserIds;
        const assignee = pick(stageUsers);

        await prisma.taskActiveStage.create({
          data: {
            taskId: task.id,
            stageId: stage.id,
            status: "COMPLETED",
            assigneeId: assignee,
            activatedAt: createdAt,
            completedAt: addDays(createdAt, randomInt(1, 3)),
          },
        });

        await prisma.taskStageLog.create({
          data: {
            taskId: task.id,
            stageId: stage.id,
            enteredAt: createdAt,
            exitedAt: addDays(createdAt, randomInt(1, 3)),
            status: "COMPLETED",
            userId: assignee,
          },
        });
      }
    }

    console.log(`Created tasks for template "${plan.templateName}".`);
  }

  console.log(`\nTotal tasks: ${totalTasks}`);
  console.log(`Total time logs: ${totalTimeLogs}`);

  // ─── 7. Activity Logs ────────────────────────────────────────────────────────

  // 5-8 online users with open ActivityLog (endedAt=null)
  const onlineCandidates = activityLogCandidates.filter((c) => onlineUserIds.includes(c.userId));
  const activeWorkers = shuffle(onlineCandidates).slice(0, randomInt(5, 8));
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

  // ~30-50 closed activity logs (past work sessions)
  const closedCount = randomInt(25, 42);
  const closedCandidates = shuffle(activityLogCandidates).slice(0, closedCount);

  for (const candidate of closedCandidates) {
    const startedAt = hoursAgo(randomInt(1, 168)); // up to a week ago
    const duration = randomFloat(0.25, 4); // 15 min to 4 hours
    const endedAt = addHours(startedAt, duration);

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
  console.log(`   Users: ${allUserIds.length}`);
  console.log(`   Clients: ${DEMO_CLIENTS.length}`);
  console.log(`   Projects: ${projectIds.length}`);
  console.log(`   Tasks: ${totalTasks}`);
  console.log(`   Time Logs: ${totalTimeLogs}`);
  console.log(`   Activity Logs: ${activityLogCount}`);
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
