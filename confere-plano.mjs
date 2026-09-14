import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
await prisma.$queryRaw`select 1`;
const { buildImportPlan } = await import("./lib/trello/plan.ts");

const FILE = "/Users/fsrezende/Downloads/goon/atl/export trello/INm0k5De - atlantico-shop.json";
const board = JSON.parse(fs.readFileSync(FILE, "utf8"));

const dbUsers = await prisma.user.findMany({ select:{id:true,name:true,email:true,teams:{select:{id:true,name:true}}} });
const workosUsers = dbUsers.map(u => ({ id:u.id, name:u.name??"", email:u.email??"", teamIds:u.teams.map(t=>t.id) }));
const nome = new Map(dbUsers.map(u=>[u.id, u.name]));
const times = new Map(dbUsers.map(u=>[u.id, u.teams.map(t=>t.name).join(",")]));

const dbStages = await prisma.templateStage.findMany({ where:{defaultTeamId:{not:null}}, select:{name:true,defaultTeamId:true} });
const stageTeams = Object.fromEntries(dbStages.map(s=>[s.name, s.defaultTeamId]));

function contar(plan, rotulo) {
  const porEtapa = new Map();
  let com = 0, sem = 0;
  for (const t of plan.tasks) for (const s of [...t.stages, ...t.futureStages]) {
    const k = s.stageName;
    const m = porEtapa.get(k) ?? { com:new Map(), sem:0 };
    if (s.assigneeUserId) { com++; const p = `${(nome.get(s.assigneeUserId)||"?").split(" ")[0]} [${times.get(s.assigneeUserId)||"—"}]`; m.com.set(p,(m.com.get(p)??0)+1); }
    else { sem++; m.sem++; }
    porEtapa.set(k,m);
  }
  console.log(`\n  ═══ ${rotulo}: ${com} etapas COM dono, ${sem} sem`);
  for (const [etapa,m] of [...porEtapa].sort()) {
    if (m.com.size === 0) continue;
    console.log(`    ${etapa}  (sem dono: ${m.sem})`);
    for (const [p,n] of [...m.com].sort((a,b)=>b[1]-a[1])) console.log(`       ${String(n).padStart(3)}×  ${p}`);
  }
  return {com,sem};
}

const comTrava = buildImportPlan(board, workosUsers, { clientId:"x", stageTeams,
  manualMatches:{saragoon1:"saragoonmmkt@gmail.com"}, designerAliases:{"SUPERVISIÓN":"dalbiranmktgoon@gmail.com"},
  completedListNames:["Concluido","Agosto","Julio"] });
const semTrava = buildImportPlan(board, workosUsers, { clientId:"x",
  manualMatches:{saragoon1:"saragoonmmkt@gmail.com"}, designerAliases:{"SUPERVISIÓN":"dalbiranmktgoon@gmail.com"},
  completedListNames:["Concluido","Agosto","Julio"] });

const a = contar(semTrava, "SEM a trava de equipe (como era antes)");
const b = contar(comTrava, "COM a trava de equipe (como vai gravar)");
console.log(`\n  diferença: ${a.com - b.com} etapas deixam de ganhar dono\n`);
await prisma.$disconnect();
