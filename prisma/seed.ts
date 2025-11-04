import { PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // Clean up existing data (optional - comment out if you want to preserve data)
  console.log('🧹 Cleaning up existing data...')
  await prisma.activityLog.deleteMany()
  await prisma.taskStageLog.deleteMany()
  await prisma.timeLog.deleteMany()
  await prisma.taskArtifact.deleteMany()
  await prisma.taskComment.deleteMany()
  await prisma.task.deleteMany()
  await prisma.stageDependency.deleteMany()
  await prisma.templateStage.deleteMany()
  await prisma.workflowTemplate.deleteMany()
  await prisma.project.deleteMany()
  await prisma.client.deleteMany()
  await prisma.user.updateMany({
    data: {
      teamId: null,
    },
  })
  await prisma.team.deleteMany()

  // 1. Create Teams
  console.log('👥 Creating teams...')
  const designTeam = await prisma.team.create({
    data: { name: 'Design' },
  })

  const videoTeam = await prisma.team.create({
    data: { name: 'Video' },
  })

  const copywritingTeam = await prisma.team.create({
    data: { name: 'Copywriting' },
  })

  const qcTeam = await prisma.team.create({
    data: { name: 'QC' },
  })

  const trafficTeam = await prisma.team.create({
    data: { name: 'Traffic' },
  })

  // 2. Create Users
  console.log('👤 Creating users...')
  const adminUser = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@work-os.com',
      role: UserRole.ADMIN,
      teamId: null,
    },
  })

  const managerUser = await prisma.user.create({
    data: {
      name: 'Manager User',
      email: 'manager@work-os.com',
      role: UserRole.MANAGER,
      teamId: trafficTeam.id,
    },
  })

  const memberUser = await prisma.user.create({
    data: {
      name: 'Member User',
      email: 'member@work-os.com',
      role: UserRole.MEMBER,
      teamId: designTeam.id,
    },
  })

  const videoMember = await prisma.user.create({
    data: {
      name: 'Video Editor',
      email: 'video@work-os.com',
      role: UserRole.MEMBER,
      teamId: videoTeam.id,
    },
  })

  const copyMember = await prisma.user.create({
    data: {
      name: 'Copywriter',
      email: 'copy@work-os.com',
      role: UserRole.MEMBER,
      teamId: copywritingTeam.id,
    },
  })

  // 3. Create Client
  console.log('🏢 Creating client...')
  const testClient = await prisma.client.create({
    data: { name: 'Test Client' },
  })

  // 4. Create Project
  console.log('📁 Creating project...')
  const testProject = await prisma.project.create({
    data: {
      name: 'Test Project',
      clientId: testClient.id,
    },
  })

  // 5. Create Workflow Template
  console.log('📋 Creating workflow template...')
  const simpleVideoTemplate = await prisma.workflowTemplate.create({
    data: {
      name: 'Simple Video Workflow',
      description: 'Um workflow simplificado para produção de vídeos',
    },
  })

  // 6. Create Template Stages
  console.log('🎬 Creating template stages...')
  const roteiroStage = await prisma.templateStage.create({
    data: {
      name: 'Roteiro',
      order: 1,
      templateId: simpleVideoTemplate.id,
      defaultTeamId: copywritingTeam.id,
    },
  })

  const edicaoStage = await prisma.templateStage.create({
    data: {
      name: 'Edição',
      order: 2,
      templateId: simpleVideoTemplate.id,
      defaultTeamId: videoTeam.id,
    },
  })

  const revisaoStage = await prisma.templateStage.create({
    data: {
      name: 'Revisão',
      order: 3,
      templateId: simpleVideoTemplate.id,
      defaultTeamId: qcTeam.id,
    },
  })

  // 7. Create Stage Dependencies
  console.log('🔗 Creating stage dependencies...')
  await prisma.stageDependency.create({
    data: {
      stageId: edicaoStage.id,
      dependsOnStageId: roteiroStage.id,
    },
  })

  await prisma.stageDependency.create({
    data: {
      stageId: revisaoStage.id,
      dependsOnStageId: edicaoStage.id,
    },
  })

  // 8. Create Sample Tasks
  console.log('📝 Creating sample tasks...')
  const task1 = await prisma.task.create({
    data: {
      title: 'Vídeo Institucional - Empresa XYZ',
      description: 'Criar vídeo institucional mostrando os valores da empresa',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      projectId: testProject.id,
      assigneeId: copyMember.id,
      currentStageId: roteiroStage.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
  })

  const task2 = await prisma.task.create({
    data: {
      title: 'Vídeo de Produto - Lançamento',
      description: 'Vídeo demonstrativo do novo produto',
      priority: 'URGENT',
      status: 'BACKLOG',
      projectId: testProject.id,
      assigneeId: memberUser.id,
      currentStageId: roteiroStage.id,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    },
  })

  // 9. Create Task Stage Logs
  console.log('📊 Creating task stage logs...')
  await prisma.taskStageLog.create({
    data: {
      taskId: task1.id,
      stageId: roteiroStage.id,
      enteredAt: new Date(),
      exitedAt: null,
      userId: copyMember.id,
    },
  })

  await prisma.taskStageLog.create({
    data: {
      taskId: task2.id,
      stageId: roteiroStage.id,
      enteredAt: new Date(),
      exitedAt: null,
      userId: memberUser.id,
    },
  })

  // 10. Create Sample Comments
  console.log('💬 Creating sample comments...')
  await prisma.taskComment.create({
    data: {
      taskId: task1.id,
      userId: managerUser.id,
      content: 'Lembre-se de incluir o logo da empresa no início do vídeo.',
    },
  })

  // 11. Create Sample Time Logs
  console.log('⏱️ Creating sample time logs...')
  await prisma.timeLog.create({
    data: {
      taskId: task1.id,
      userId: copyMember.id,
      stageId: roteiroStage.id,
      hoursSpent: 2.5,
      logDate: new Date(),
      description: 'Tempo gasto escrevendo o roteiro inicial',
    },
  })

  // Create more comprehensive workflow template
  console.log('📋 Creating comprehensive workflow template...')
  const fullProductionTemplate = await prisma.workflowTemplate.create({
    data: {
      name: 'Full Production Workflow',
      description: 'Workflow completo para produção de conteúdo',
    },
  })

  const briefingStage = await prisma.templateStage.create({
    data: {
      name: 'Briefing',
      order: 1,
      templateId: fullProductionTemplate.id,
      defaultTeamId: trafficTeam.id,
    },
  })

  const criacaoStage = await prisma.templateStage.create({
    data: {
      name: 'Criação',
      order: 2,
      templateId: fullProductionTemplate.id,
      defaultTeamId: designTeam.id,
    },
  })

  const aprovaçãoStage = await prisma.templateStage.create({
    data: {
      name: 'Aprovação',
      order: 3,
      templateId: fullProductionTemplate.id,
      defaultTeamId: qcTeam.id,
    },
  })

  await prisma.stageDependency.create({
    data: {
      stageId: criacaoStage.id,
      dependsOnStageId: briefingStage.id,
    },
  })

  await prisma.stageDependency.create({
    data: {
      stageId: aprovaçãoStage.id,
      dependsOnStageId: criacaoStage.id,
    },
  })

  console.log('✅ Seed completed successfully!')
  console.log('')
  console.log('📌 Test Users:')
  console.log(`   Admin: ${adminUser.email}`)
  console.log(`   Manager: ${managerUser.email}`)
  console.log(`   Member: ${memberUser.email}`)
  console.log('')
  console.log('📌 Teams: Design, Video, Copywriting, QC, Traffic')
  console.log('📌 Workflow Templates: Simple Video Workflow, Full Production Workflow')
  console.log('📌 Sample Tasks: 2 tasks created')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
