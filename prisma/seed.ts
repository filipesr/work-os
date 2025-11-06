import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  // 1. Create all Teams (Idempotent)
  // (These are all the roles from the user's agency)
  const teams = [
    'Designers', 'Video-makers', 'Social Media', 'Traffic Manager',
    'Software Engineer', 'Call Center', 'Quality Control',
    'Supervisor', 'Manager', 'SEO', 'HR', 'Copywriting'
  ];

  for (const name of teams) {
    await prisma.team.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Created/Updated ${teams.length} teams.`);

  // Fetch the teams we just created to get their IDs
  const teamMap = (await prisma.team.findMany()).reduce((map, team) => {
    map.set(team.name, team.id);
    return map;
  }, new Map<string, string>());

  // 2. Pre-register the Admin User (Idempotent)
  // This user will get Admin rights upon first login with Google
  // const adminEmail = 'movimento.jant@gmail.com';
  // await prisma.user.upsert({
  //   where: { email: adminEmail },
  //   update: { role: UserRole.ADMIN },
  //   create: {
  //     email: adminEmail,
  //     name: 'Admin (Pre-seeded)', // This name will be updated by Google on first login
  //     role: UserRole.ADMIN,
  //   },
  // });
  // console.log(`Pre-registered ADMIN user: ${adminEmail}`);

  // 3. Create Workflow Templates

  // TEMPLATE 1: Vídeo Curto
  const videoTemplate = await prisma.workflowTemplate.upsert({
    where: { name: 'Vídeo Curto' },
    update: {},
    create: {
      name: 'Vídeo Curto',
      description: 'Fluxo para criação de vídeos curtos (Reels, TikTok).',
      stages: {
        create: [
          { name: 'Roteiro', order: 1, defaultTeamId: teamMap.get('Social Media') },
          { name: 'Edição', order: 2, defaultTeamId: teamMap.get('Video-makers') },
          { name: 'Revisão QC', order: 3, defaultTeamId: teamMap.get('Quality Control') },
        ],
      },
    },
    include: { stages: true },
  });
  // Add dependencies for Video Template
  const [roteiro, edicao, revisaoQC] = videoTemplate.stages.sort((a, b) => a.order - b.order);
  await prisma.stageDependency.upsert({
    where: { stageId_dependsOnStageId: { stageId: edicao.id, dependsOnStageId: roteiro.id } },
    update: {}, create: { stageId: edicao.id, dependsOnStageId: roteiro.id },
  });
  await prisma.stageDependency.upsert({
    where: { stageId_dependsOnStageId: { stageId: revisaoQC.id, dependsOnStageId: edicao.id } },
    update: {}, create: { stageId: revisaoQC.id, dependsOnStageId: edicao.id },
  });
  console.log(`Created/Updated template: ${videoTemplate.name}`);

  // TEMPLATE 2: Landing Page
  const lpTemplate = await prisma.workflowTemplate.upsert({
    where: { name: 'Landing Page' },
    update: {},
    create: {
      name: 'Landing Page',
      description: 'Fluxo completo de criação de Landing Pages.',
      stages: {
        create: [
          { name: 'Briefing & Copy', order: 1, defaultTeamId: teamMap.get('Copywriting') },
          { name: 'Design', order: 2, defaultTeamId: teamMap.get('Designers') },
          { name: 'Development', order: 3, defaultTeamId: teamMap.get('Software Engineer') },
          { name: 'Revisão QC', order: 4, defaultTeamId: teamMap.get('Quality Control') },
          { name: 'SEO', order: 5, defaultTeamId: teamMap.get('SEO') },
        ],
      },
    },
    include: { stages: true },
  });
  // Add dependencies for LP Template
  const [briefingCopy, design, dev, lpQC, seo] = lpTemplate.stages.sort((a, b) => a.order - b.order);
  await prisma.stageDependency.upsert({ // Design depends on Copy
    where: { stageId_dependsOnStageId: { stageId: design.id, dependsOnStageId: briefingCopy.id } },
    update: {}, create: { stageId: design.id, dependsOnStageId: briefingCopy.id },
  });
  await prisma.stageDependency.upsert({ // Dev depends on Design
    where: { stageId_dependsOnStageId: { stageId: dev.id, dependsOnStageId: design.id } },
    update: {}, create: { stageId: dev.id, dependsOnStageId: design.id },
  });
  await prisma.stageDependency.upsert({ // QC depends on Dev
    where: { stageId_dependsOnStageId: { stageId: lpQC.id, dependsOnStageId: dev.id } },
    update: {}, create: { stageId: lpQC.id, dependsOnStageId: dev.id },
  });
  await prisma.stageDependency.upsert({ // SEO depends on Dev (can run parallel to QC)
    where: { stageId_dependsOnStageId: { stageId: seo.id, dependsOnStageId: dev.id } },
    update: {}, create: { stageId: seo.id, dependsOnStageId: dev.id },
  });
  console.log(`Created/Updated template: ${lpTemplate.name}`);

  // TEMPLATE 3: Post Carrossel Estático
  const carrosselTemplate = await prisma.workflowTemplate.upsert({
    where: { name: 'Post Carrossel Estático' },
    update: {},
    create: {
      name: 'Post Carrossel Estático',
      description: 'Criação de post de carrossel para redes sociais.',
      stages: {
        create: [
          { name: 'Copy & Briefing', order: 1, defaultTeamId: teamMap.get('Social Media') },
          { name: 'Design Carrossel', order: 2, defaultTeamId: teamMap.get('Designers') },
          { name: 'Revisão Final', order: 3, defaultTeamId: teamMap.get('Quality Control') },
        ],
      },
    },
    include: { stages: true },
  });
  // Add dependencies for Carrossel Template
  const [copyBriefing, designCarrossel, revisaoFinal] = carrosselTemplate.stages.sort((a, b) => a.order - b.order);
  await prisma.stageDependency.upsert({
    where: { stageId_dependsOnStageId: { stageId: designCarrossel.id, dependsOnStageId: copyBriefing.id } },
    update: {}, create: { stageId: designCarrossel.id, dependsOnStageId: copyBriefing.id },
  });
  await prisma.stageDependency.upsert({
    where: { stageId_dependsOnStageId: { stageId: revisaoFinal.id, dependsOnStageId: designCarrossel.id } },
    update: {}, create: { stageId: revisaoFinal.id, dependsOnStageId: designCarrossel.id },
  });
  console.log(`Created/Updated template: ${carrosselTemplate.name}`);

  // TEMPLATE 4: Campanha de Tráfego
  const trafegoTemplate = await prisma.workflowTemplate.upsert({
    where: { name: 'Campanha de Tráfego' },
    update: {},
    create: {
      name: 'Campanha de Tráfego',
      description: 'Setup e gerenciamento de campanhas de tráfego pago.',
      stages: {
        create: [
          { name: 'Setup de Campanha', order: 1, defaultTeamId: teamMap.get('Traffic Manager') },
          { name: 'Acompanhamento', order: 2, defaultTeamId: teamMap.get('Traffic Manager') },
          { name: 'Relatório Mensal', order: 3, defaultTeamId: teamMap.get('Traffic Manager') },
        ],
      },
    },
    include: { stages: true },
  });
  // Add dependencies for Trafego Template
  const [setup, acompanhamento, relatorio] = trafegoTemplate.stages.sort((a, b) => a.order - b.order);
  await prisma.stageDependency.upsert({
    where: { stageId_dependsOnStageId: { stageId: acompanhamento.id, dependsOnStageId: setup.id } },
    update: {}, create: { stageId: acompanhamento.id, dependsOnStageId: setup.id },
  });
  await prisma.stageDependency.upsert({
    where: { stageId_dependsOnStageId: { stageId: relatorio.id, dependsOnStageId: acompanhamento.id } },
    update: {}, create: { stageId: relatorio.id, dependsOnStageId: acompanhamento.id },
  });
  console.log(`Created/Updated template: ${trafegoTemplate.name}`);

  console.log(`Seeding finished.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
