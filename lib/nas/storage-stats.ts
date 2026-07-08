// Métricas de armazenamento no NAS — drill-down hierárquico de espaço OCUPADO (bytes reais gravados,
// somando TODAS as versões READY; PENDING/FAILED/EXPIRED e soft-deletados ficam de fora). Cada nível
// agrupa pelo nível abaixo, resolvendo o dono de cada artefato (escopo TASK/PROJECT/CLIENT) para o
// eixo do agrupamento. Sem `freeBytes` aqui — o disco livre vem do /v1/health do agente (a Vercel não
// o alcança server-side).

import { prisma } from "@/lib/prisma";
import type { StorageRow, StorageStats } from "@/lib/nas/storage-format";

export { formatBytes } from "@/lib/nas/storage-format";
export type { StorageRow, StorageStats } from "@/lib/nas/storage-format";

const NAS_READY = {
  storageKind: "NAS_UPLOAD" as const,
  uploadStatus: "READY" as const,
  deletedAt: null,
};

const MEDIA_LABEL: Record<string, string> = {
  VIDEOS: "Vídeos",
  FOTOS: "Fotos",
  DOCUMENTOS: "Documentos",
  LOGOS: "Logos",
  SOCIAL_MEDIA: "Social Media",
  OUTROS: "Outros",
};

function finalize(acc: Map<string, { label: string; bytes: number; files: number }>): StorageStats {
  const rows = [...acc.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.bytes - a.bytes);
  return {
    rows,
    totalBytes: rows.reduce((s, r) => s + r.bytes, 0),
    totalFiles: rows.reduce((s, r) => s + r.files, 0),
  };
}

function add(
  acc: Map<string, { label: string; bytes: number; files: number }>,
  key: string,
  label: string,
  sizeBytes: bigint | null
) {
  const e = acc.get(key) ?? { label, bytes: 0, files: 0 };
  e.bytes += Number(sizeBytes ?? 0);
  e.files += 1;
  acc.set(key, e);
}

/** Admin geral — ocupação por CLIENTE (roll-up de artefatos de cliente + seus projetos + tarefas). */
export async function storageByClient(): Promise<StorageStats> {
  const arts = await prisma.taskArtifact.findMany({
    where: NAS_READY,
    select: {
      sizeBytes: true,
      clientId: true,
      client: { select: { name: true } },
      project: { select: { clientId: true, client: { select: { name: true } } } },
      task: {
        select: { project: { select: { clientId: true, client: { select: { name: true } } } } },
      },
    },
  });
  const acc = new Map<string, { label: string; bytes: number; files: number }>();
  for (const a of arts) {
    const cid = a.clientId ?? a.project?.clientId ?? a.task?.project?.clientId;
    if (!cid) continue;
    const name = a.client?.name ?? a.project?.client?.name ?? a.task?.project?.client?.name ?? "—";
    add(acc, cid, name, a.sizeBytes);
  }
  return finalize(acc);
}

/** Cliente — ocupação por PROJETO (+ bucket "Cliente (institucional)" para artefatos de cliente). */
export async function storageByProject(clientId: string): Promise<StorageStats> {
  const arts = await prisma.taskArtifact.findMany({
    where: {
      ...NAS_READY,
      OR: [{ clientId }, { project: { clientId } }, { task: { project: { clientId } } }],
    },
    select: {
      sizeBytes: true,
      clientId: true,
      projectId: true,
      project: { select: { name: true } },
      task: { select: { projectId: true, project: { select: { name: true } } } },
    },
  });
  const acc = new Map<string, { label: string; bytes: number; files: number }>();
  for (const a of arts) {
    const pid = a.projectId ?? a.task?.projectId;
    if (pid) {
      add(acc, pid, a.project?.name ?? a.task?.project?.name ?? "—", a.sizeBytes);
    } else if (a.clientId) {
      add(acc, "__client__", "Cliente (institucional)", a.sizeBytes);
    }
  }
  return finalize(acc);
}

/** Projeto — ocupação por TAREFA (+ bucket "Projeto (institucional)" para artefatos de projeto). */
export async function storageByTask(projectId: string): Promise<StorageStats> {
  const arts = await prisma.taskArtifact.findMany({
    where: { ...NAS_READY, OR: [{ projectId }, { task: { projectId } }] },
    select: {
      sizeBytes: true,
      projectId: true,
      taskId: true,
      task: { select: { title: true } },
    },
  });
  const acc = new Map<string, { label: string; bytes: number; files: number }>();
  for (const a of arts) {
    if (a.taskId) {
      add(acc, a.taskId, a.task?.title ?? "—", a.sizeBytes);
    } else if (a.projectId) {
      add(acc, "__project__", "Projeto (institucional)", a.sizeBytes);
    }
  }
  return finalize(acc);
}

/** Tarefa — ocupação por TIPO de mídia. */
export async function storageByMediaType(taskId: string): Promise<StorageStats> {
  const grouped = await prisma.taskArtifact.groupBy({
    by: ["mediaType"],
    where: { taskId, ...NAS_READY },
    _sum: { sizeBytes: true },
    _count: { _all: true },
  });
  const rows: StorageRow[] = grouped.map((g) => {
    const key = g.mediaType ?? "OUTROS";
    return {
      key,
      label: MEDIA_LABEL[key] ?? key,
      bytes: Number(g._sum.sizeBytes ?? 0),
      files: g._count._all,
    };
  });
  rows.sort((a, b) => b.bytes - a.bytes);
  return {
    rows,
    totalBytes: rows.reduce((s, r) => s + r.bytes, 0),
    totalFiles: rows.reduce((s, r) => s + r.files, 0),
  };
}
