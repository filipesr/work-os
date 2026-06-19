import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL_DOMAIN = "@demo.workos.fake";
const DEMO_CLIENT_PREFIX = "[DEMO] ";

async function main() {
  console.log("🧹 Starting demo cleanup...\n");

  // ─── 1. Identify demo entities ─────────────────────────────────────────────

  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: DEMO_EMAIL_DOMAIN } },
    select: { id: true, email: true },
  });
  const demoUserIds = demoUsers.map((u) => u.id);
  console.log(`Found ${demoUsers.length} demo users.`);

  const demoClients = await prisma.client.findMany({
    where: { name: { startsWith: DEMO_CLIENT_PREFIX } },
    select: { id: true, name: true },
  });
  const demoClientIds = demoClients.map((c) => c.id);
  console.log(`Found ${demoClients.length} demo clients.`);

  const demoProjects = await prisma.project.findMany({
    where: { clientId: { in: demoClientIds } },
    select: { id: true },
  });
  const demoProjectIds = demoProjects.map((p) => p.id);
  console.log(`Found ${demoProjects.length} demo projects.`);

  const demoTasks = await prisma.task.findMany({
    where: { projectId: { in: demoProjectIds } },
    select: { id: true },
  });
  const demoTaskIds = demoTasks.map((t) => t.id);
  console.log(`Found ${demoTasks.length} demo tasks.\n`);

  if (demoTaskIds.length === 0 && demoUserIds.length === 0 && demoClientIds.length === 0) {
    console.log("No demo data found. Nothing to clean up.");
    return;
  }

  // ─── 2. Delete in correct FK order ─────────────────────────────────────────

  // Task children (order matters for FK constraints)
  if (demoTaskIds.length > 0) {
    const activityLogs = await prisma.activityLog.deleteMany({
      where: { taskId: { in: demoTaskIds } },
    });
    console.log(`Deleted ${activityLogs.count} activity logs.`);

    const timeLogs = await prisma.timeLog.deleteMany({
      where: { taskId: { in: demoTaskIds } },
    });
    console.log(`Deleted ${timeLogs.count} time logs.`);

    const stageLogs = await prisma.taskStageLog.deleteMany({
      where: { taskId: { in: demoTaskIds } },
    });
    console.log(`Deleted ${stageLogs.count} task stage logs.`);

    const activeStages = await prisma.taskActiveStage.deleteMany({
      where: { taskId: { in: demoTaskIds } },
    });
    console.log(`Deleted ${activeStages.count} task active stages.`);

    const comments = await prisma.taskComment.deleteMany({
      where: { taskId: { in: demoTaskIds } },
    });
    console.log(`Deleted ${comments.count} task comments.`);

    const artifacts = await prisma.taskArtifact.deleteMany({
      where: { taskId: { in: demoTaskIds } },
    });
    console.log(`Deleted ${artifacts.count} task artifacts.`);
  }

  // Tasks
  if (demoTaskIds.length > 0) {
    const tasks = await prisma.task.deleteMany({
      where: { id: { in: demoTaskIds } },
    });
    console.log(`Deleted ${tasks.count} tasks.`);
  }

  // Projects (cascade from clients would handle this, but explicit is safer)
  if (demoProjectIds.length > 0) {
    const projects = await prisma.project.deleteMany({
      where: { id: { in: demoProjectIds } },
    });
    console.log(`Deleted ${projects.count} projects.`);
  }

  // Clients
  if (demoClientIds.length > 0) {
    const clients = await prisma.client.deleteMany({
      where: { id: { in: demoClientIds } },
    });
    console.log(`Deleted ${clients.count} clients.`);
  }

  // Demo users (delete any remaining user-owned logs first)
  if (demoUserIds.length > 0) {
    // Clean up any orphaned user records (activity logs by user, not by task)
    await prisma.activityLog.deleteMany({ where: { userId: { in: demoUserIds } } });
    await prisma.timeLog.deleteMany({ where: { userId: { in: demoUserIds } } });
    await prisma.taskStageLog.deleteMany({ where: { userId: { in: demoUserIds } } });
    await prisma.taskComment.deleteMany({ where: { userId: { in: demoUserIds } } });
    await prisma.taskArtifact.deleteMany({ where: { userId: { in: demoUserIds } } });

    const users = await prisma.user.deleteMany({
      where: { id: { in: demoUserIds } },
    });
    console.log(`Deleted ${users.count} users.`);
  }

  console.log("\n✅ Demo cleanup complete! Teams, templates, and real data were preserved.");
}

main()
  .catch(async (e) => {
    console.error("❌ Demo cleanup failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
