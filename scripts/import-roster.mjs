// One-off import of the GoOn team roster (docs/goon - EQUIPE.xlsx).
// - Creates/keeps teams (English names), assigns users to teams (many-to-many).
// - Restores existing users' teams from /tmp/users_backup.json (captured before
//   the teamId column was dropped).
// - Creates/updates users that have an email, setting birthday + admissionDate.
//
// Run: node scripts/import-roster.mjs
import fs from "fs";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const XLSX = "docs/goon - EQUIPE.xlsx";

// ---- xlsx parsing (shared strings + sheet1) ----
function parseXlsx() {
  const dir = fs.mkdtempSync("/tmp/roster-");
  execSync(`unzip -o "${XLSX}" -d "${dir}" >/dev/null 2>&1`);
  const ss = fs.readFileSync(`${dir}/xl/sharedStrings.xml`, "utf8");
  const strings = [];
  for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
    strings.push(texts.join("").replace(/&amp;/g, "&").trim());
  }
  const sheet = fs.readFileSync(`${dir}/xl/worksheets/sheet1.xml`, "utf8");
  const colToNum = (col) => {
    let n = 0;
    for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  const rows = [];
  for (const r of sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    const cRe =
      /<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]*)")?[^>]*>(?:<v>([\s\S]*?)<\/v>|<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?<\/c>/g;
    let c;
    while ((c = cRe.exec(r[2]))) {
      const col = colToNum(c[1]);
      const t = c[2];
      let v = c[3] !== undefined ? c[3] : c[4];
      if (v === undefined) {
        cells[col] = "";
        continue;
      }
      if (t === "s") v = strings[parseInt(v, 10)];
      cells[col] = v;
    }
    rows.push(cells);
  }
  return rows;
}

function excelDate(n) {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
}
function asDate(v) {
  if (!v) return null;
  const n = parseFloat(v);
  if (!isNaN(n) && n > 10000 && n < 60000) return excelDate(n);
  return null; // non-serial strings (e.g. "Fundadora") → no date
}

// ---- cargo → team(s) in English ----
const CARGO_TEAM = {
  "diseñador": "Designers",
  "proyectista": "Designers",
  "social media": "Social Media",
  "sm": "Social Media",
  "community": "Community",
  "comunicador": "Communicators",
  "comunicadora": "Communicators",
  "assessoria prensa": "Press Office",
  "videomaker": "Video-makers",
  "filmmaker": "Video-makers",
  "gestor de tráfego": "Traffic Manager",
  "programador": "Software Engineer",
  "t.i": "IT",
  "corrección": "Proofreading",
  "aux. de marketing": "Reception",
  "estrategia": "Strategy",
  "coordinadora eventos": "Events",
  "coordinadora": "Coordination",
  "generales": "General Services",
  "rrhh": "HR",
  "financiero": "Finance",
  "directora": "Management",
  "pdv": "POS",
  "comercial": "Commercial",
  "atendimento": "Customer Service",
  "callcenter atl": "Call Center",
  "receptivo guias": "Receptive Guides",
  "gestora receptivo guias": "Supervisor Receptive Guides",
  "pasante": "Interns",
};

function teamsForCargo(cargo) {
  const teams = new Set();
  for (const part of (cargo || "").split("/")) {
    const key = part.trim().toLowerCase();
    if (CARGO_TEAM[key]) teams.add(CARGO_TEAM[key]);
  }
  return [...teams];
}

async function main() {
  const rows = parseXlsx();
  const roster = [];
  for (let i = 2; i < rows.length; i++) {
    const rw = rows[i];
    const name = (rw[5] || "").trim();
    if (!name) continue;
    roster.push({
      name,
      email: (rw[1] || "").trim().toLowerCase() || null,
      birthday: asDate(rw[8]),
      admissionDate: asDate(rw[10]),
      teams: teamsForCargo(rw[9]),
    });
  }

  // Existing users' teams (captured before teamId was dropped).
  const backup = JSON.parse(fs.readFileSync("/tmp/users_backup.json", "utf8"));

  // All team names to ensure exist: from roster + from backup.
  const teamNames = new Set();
  roster.forEach((p) => p.teams.forEach((t) => teamNames.add(t)));
  backup.forEach((u) => u.team?.name && teamNames.add(u.team.name));

  for (const name of teamNames) {
    await prisma.team.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Teams garantidas: ${teamNames.size}`);

  // Restore existing users' teams.
  for (const u of backup) {
    if (!u.team?.name) continue;
    await prisma.user.update({
      where: { id: u.id },
      data: { teams: { connect: { name: u.team.name } } },
    });
  }
  console.log(`Times restaurados para ${backup.filter((u) => u.team).length} usuários existentes`);

  // Create/update roster users that have an email.
  let created = 0,
    updated = 0,
    skipped = 0;
  for (const p of roster) {
    if (!p.email) {
      skipped++;
      continue;
    }
    const teamConnect = p.teams.map((name) => ({ name }));
    const existing = await prisma.user.findUnique({ where: { email: p.email } });
    if (existing) {
      await prisma.user.update({
        where: { email: p.email },
        data: {
          birthday: p.birthday ?? undefined,
          admissionDate: p.admissionDate ?? undefined,
          teams: { connect: teamConnect },
        },
      });
      updated++;
    } else {
      await prisma.user.create({
        data: {
          name: p.name,
          email: p.email,
          role: "MEMBER",
          birthday: p.birthday,
          admissionDate: p.admissionDate,
          teams: { connect: teamConnect },
        },
      });
      created++;
    }
  }
  console.log(`Usuários — criados: ${created}, atualizados: ${updated}, sem email (pulados): ${skipped}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
