"use server";

// NAS artifact control-plane actions (spec 2026-07-02). The cloud never touches bytes: it computes
// the sealed path/name, signs the upload token, and records/audits. The browser PUTs the file
// straight to the LAN agent; the agent calls back /api/artifacts/finalize to flip PENDING -> READY.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { hash as argon2Hash } from "@node-rs/argon2";

import { prisma } from "@/lib/prisma";
import {
  getSessionUser,
  requireManagerOrAdmin,
  requireMemberOrHigher,
  requireSupervisorOrHigher,
} from "@/lib/permissions";
import {
  prepareArtifactUploadSchema,
  createShareLinkSchema,
  changeSensitivitySchema,
  scopedLinkArtifactSchema,
} from "@/lib/validations";
import {
  ALLOWLIST,
  buildNasPath,
  fileBaseToken,
  NasPathError,
  normalizeExtension,
} from "@/lib/nas/path";
import { signUploadToken } from "@/lib/nas/token";
import {
  getNasSigningConfig,
  getShareTokenPepper,
  isNasTunnelConfigured,
  isNasUploadConfigured,
  nasConfig,
  NAS_TOKEN_TTL,
} from "@/lib/nas/config";
import { generateShareToken, hashShareSecret } from "@/lib/nas/share-token";
import { canShare, transitionRevokesShares } from "@/lib/nas/sensitivity";
import { mapArtifactRow, type ArtifactOrigin } from "@/lib/artifacts/unify";

type Db = typeof prisma | Prisma.TransactionClient;

async function audit(
  db: Db,
  e: {
    artifactId?: string;
    actorUserId?: string;
    eventType: string;
    ip?: string;
    userAgent?: string;
    metadata?: Prisma.InputJsonValue;
  }
): Promise<void> {
  try {
    await db.artifactAuditLog.create({
      data: {
        artifactId: e.artifactId ?? null,
        actorUserId: e.actorUserId ?? null,
        eventType: e.eventType,
        ip: e.ip ?? null,
        userAgent: e.userAgent ?? null,
        metadata: e.metadata,
      },
    });
  } catch (err) {
    // Auditing must never break the primary action.
    console.error("artifact audit log failed:", err);
  }
}

interface VersionParams {
  scope: "TASK" | "PROJECT" | "CLIENT";
  taskId: string | null;
  projectId: string | null;
  clientId: string | null;
  userId: string;
  folderName: string;
  /** Task title (TASK) / project name (PROJECT). Undefined para CLIENT. */
  ownerName?: string;
  ownerId?: string;
  mediaType: Prisma.TaskArtifactCreateInput["mediaType"];
  purposeId: string | null;
  /** DeliverablePurpose label; "" quando sem propósito (omitido do nome). */
  purposeLabel: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  sensitivity: Prisma.TaskArtifactCreateInput["sensitivity"];
  stageId?: string;
}

// Aloca a próxima versão e cria o artefato PENDING numa transação. A versão é max(existentes)+1 no
// grupo (dono do escopo, fileKey) — MESMO nome de arquivo = nova versão; nome diferente = artefato
// novo. Expirados/falhos/deletados contam, então nunca se reusa número. Encadeia com a versão
// vigente (marca a anterior isCurrent=false). Reintenta na corrida de constraint única.
async function createArtifactWithVersion(
  params: VersionParams
): Promise<{ id: string; nasPath: string; fileName: string; version: number }> {
  const ownerWhere =
    params.scope === "TASK"
      ? { taskId: params.taskId }
      : params.scope === "PROJECT"
        ? { projectId: params.projectId }
        : { clientId: params.clientId };

  // Identidade da cadeia = nome do arquivo normalizado (mesmo token que compõe o nome no NAS).
  const fileKey = fileBaseToken(params.originalFileName);

  const MAX_RETRIES = 5;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const group = { ...ownerWhere, fileKey };
        const last = await tx.taskArtifact.findFirst({
          where: group,
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const currentRow = await tx.taskArtifact.findFirst({
          where: { ...group, isCurrent: true },
          select: { id: true, rootId: true },
        });
        const version = (last?.version ?? 0) + 1;
        const rootId = currentRow ? (currentRow.rootId ?? currentRow.id) : null;

        const built = buildNasPath({
          scope: params.scope,
          client: params.folderName,
          ownerName: params.ownerName,
          ownerId: params.ownerId,
          mediaType: params.mediaType as NonNullable<VersionParams["mediaType"]>,
          originalFileName: params.originalFileName,
          version,
          uploadDate: new Date(),
        });

        if (currentRow) {
          await tx.taskArtifact.update({
            where: { id: currentRow.id },
            data: { isCurrent: false },
          });
        }

        const created = await tx.taskArtifact.create({
          data: {
            scope: params.scope,
            taskId: params.taskId,
            projectId: params.projectId,
            clientId: params.clientId,
            userId: params.userId,
            uploadedById: params.userId,
            title: params.originalFileName,
            url: null,
            type: "OTHER",
            storageKind: "NAS_UPLOAD",
            uploadStatus: "PENDING",
            mediaType: params.mediaType,
            purposeId: params.purposeId,
            fileKey,
            sensitivity: params.sensitivity,
            stageId: params.stageId ?? null,
            nasPath: built.relPath,
            fileName: built.fileName,
            originalFileName: params.originalFileName,
            mimeType: params.mimeType,
            sizeBytes: BigInt(params.sizeBytes),
            version,
            rootId,
            isCurrent: true,
          },
          select: { id: true },
        });
        return { id: created.id, nasPath: built.relPath, fileName: built.fileName, version };
      });
    } catch (e) {
      lastErr = e;
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // race — retry
      throw e;
    }
  }
  throw lastErr ?? new Error("Falha ao alocar versão do artefato");
}

/**
 * Step 1 of the upload — RBAC + validation, compute the sealed path/name, create the PENDING
 * artifact and return a signed upload token + the LAN agent URL for the browser to PUT to.
 */
export async function prepareArtifactUpload(input: unknown) {
  try {
    const parsed = prepareArtifactUploadSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;

    // RBAC por escopo: tarefa = membro+; projeto/cliente = MANAGER+.
    const user =
      data.scope === "TASK" ? await requireMemberOrHigher() : await requireManagerOrAdmin();
    const userId = user.id as string;

    if (!isNasUploadConfigured()) {
      return { error: "Upload no NAS não está configurado neste ambiente." };
    }

    // Resolve folderName (raiz do cliente) + nome/id do dono conforme o escopo.
    let folderName: string | null = null;
    let ownerName: string | undefined;
    let ownerId: string | undefined;
    let taskId: string | null = null;
    let projectId: string | null = null;
    let clientId: string | null = null;

    if (data.scope === "TASK") {
      const task = await prisma.task.findUnique({
        where: { id: data.taskId ?? "" },
        select: {
          id: true,
          title: true,
          project: { select: { client: { select: { folderName: true } } } },
        },
      });
      if (!task) return { error: "Demanda não encontrada." };
      folderName = task.project.client.folderName;
      ownerName = task.title;
      ownerId = task.id;
      taskId = task.id;
    } else if (data.scope === "PROJECT") {
      const project = await prisma.project.findUnique({
        where: { id: data.projectId ?? "" },
        select: { id: true, name: true, client: { select: { folderName: true } } },
      });
      if (!project) return { error: "Projeto não encontrado." };
      folderName = project.client.folderName;
      ownerName = project.name;
      ownerId = project.id;
      projectId = project.id;
    } else {
      const client = await prisma.client.findUnique({
        where: { id: data.clientId ?? "" },
        select: { id: true, folderName: true },
      });
      if (!client) return { error: "Cliente não encontrado." };
      folderName = client.folderName;
      clientId = client.id;
    }
    if (!folderName) return { error: "Cliente sem pasta (folderName) definida para o NAS." };

    // Propósito é opcional: quando informado, valida; quando ausente, o nome sai sem esse segmento.
    let purposeId: string | null = null;
    let purposeLabel = "";
    if (data.purposeId) {
      const purpose = await prisma.deliverablePurpose.findUnique({
        where: { id: data.purposeId },
        select: { id: true, label: true, active: true },
      });
      if (!purpose || !purpose.active) return { error: "Propósito inválido ou inativo." };
      purposeId = purpose.id;
      purposeLabel = purpose.label;
    }

    // Extension + size validation (allowlist / Apêndice D). Agent re-checks + sniffs the bytes.
    try {
      normalizeExtension(data.originalFileName, data.mediaType);
    } catch (e) {
      if (e instanceof NasPathError) return { error: e.message };
      throw e;
    }
    const maxBytes = ALLOWLIST[data.mediaType].maxBytes;
    if (data.sizeBytes > maxBytes) {
      return {
        error: `Arquivo excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MB para ${data.mediaType}.`,
      };
    }

    const artifact = await createArtifactWithVersion({
      scope: data.scope,
      taskId,
      projectId,
      clientId,
      userId,
      folderName,
      ownerName,
      ownerId,
      mediaType: data.mediaType,
      purposeId,
      purposeLabel,
      originalFileName: data.originalFileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      sensitivity: data.sensitivity,
      stageId: data.stageId,
    });

    const jti = randomUUID();
    const uploadToken = await signUploadToken(
      {
        artifactId: artifact.id,
        taskId: taskId ?? projectId ?? clientId ?? artifact.id,
        nasPath: artifact.nasPath,
        fileName: artifact.fileName,
        maxSize: maxBytes,
        jti,
      },
      getNasSigningConfig(),
      NAS_TOKEN_TTL.upload
    );

    await audit(prisma, {
      artifactId: artifact.id,
      actorUserId: userId,
      eventType: "UPLOAD_PREPARED",
      metadata: { version: artifact.version, mediaType: data.mediaType },
    });

    if (taskId) {
      revalidatePath(`/tasks/${taskId}`);
      revalidatePath(`/admin/tasks/${taskId}`);
    }
    if (projectId) revalidatePath(`/admin/projects/${projectId}`);
    if (clientId) revalidatePath(`/admin/clients/${clientId}`);

    return {
      success: true as const,
      artifact: {
        id: artifact.id,
        fileName: artifact.fileName,
        nasPath: artifact.nasPath,
        version: artifact.version,
      },
      upload: {
        url: `${nasConfig.agentLanUrl}/v1/uploads/${artifact.id}`,
        token: uploadToken,
        maxSize: maxBytes,
        expiresInSeconds: NAS_TOKEN_TTL.upload,
      },
    };
  } catch (error) {
    console.error("prepareArtifactUpload error:", error);
    return { error: "Erro ao preparar upload." };
  }
}

/** Estado do ambiente para o form de upload (só o gate de configuração — o form coleta Arquivo /
 * Tipo de mídia / Sensibilidade; propósito e proveniência foram removidos por serem write-only). */
export async function getArtifactUploadOptions(_args: {
  scope: "TASK" | "PROJECT" | "CLIENT";
  taskId?: string;
}) {
  try {
    await requireMemberOrHigher();
    return {
      success: true as const,
      uploadConfigured: isNasUploadConfigured(),
    };
  } catch (error) {
    console.error("getArtifactUploadOptions error:", error);
    return { error: "Erro ao carregar opções de upload." };
  }
}

/** UX hint — the browser flags PENDING -> UPLOADING right before the PUT. Not authoritative. */
export async function markUploading(artifactId: string) {
  try {
    await requireMemberOrHigher();
    const res = await prisma.taskArtifact.updateMany({
      where: { id: artifactId, uploadStatus: "PENDING" },
      data: { uploadStatus: "UPLOADING" },
    });
    if (res.count === 0) return { error: "Artefato não está pendente." };
    return { success: true as const };
  } catch (error) {
    console.error("markUploading error:", error);
    return { error: "Erro ao marcar upload." };
  }
}

/** Create an external share link (só CLIENTE, SUPERVISOR+). Token is shown once. */
export async function createShareLink(input: unknown) {
  try {
    const user = await requireSupervisorOrHigher();
    const parsed = createShareLinkSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;

    if (!isNasTunnelConfigured()) return { error: "Compartilhamento externo não configurado." };

    const artifact = await prisma.taskArtifact.findUnique({
      where: { id: data.artifactId },
      select: { id: true, sensitivity: true, uploadStatus: true, storageKind: true, taskId: true },
    });
    if (!artifact || artifact.storageKind !== "NAS_UPLOAD") return { error: "Artefato inválido." };
    if (artifact.uploadStatus !== "READY") return { error: "Artefato ainda não está pronto." };
    if (!canShare(artifact.sensitivity)) {
      return { error: "Somente artefatos CLIENTE podem ser compartilhados externamente." };
    }

    const { publicId, secret, token } = generateShareToken();
    const tokenHash = hashShareSecret(secret, getShareTokenPepper());
    const passwordHash = data.password ? await argon2Hash(data.password) : null;
    const expiresAt = new Date(Date.now() + data.expiresInDays * 86_400_000);

    const link = await prisma.artifactShareLink.create({
      data: {
        artifactId: artifact.id,
        publicId,
        tokenHash,
        passwordHash,
        expiresAt,
        maxDownloads: data.maxDownloads ?? null,
        createdById: user.id as string,
        note: data.note ?? null,
      },
      select: { id: true },
    });

    await audit(prisma, {
      artifactId: artifact.id,
      actorUserId: user.id as string,
      eventType: "SHARE_CREATED",
      metadata: { shareLinkId: link.id, expiresAt: expiresAt.toISOString() },
    });
    revalidatePath(`/tasks/${artifact.taskId}`);

    return {
      success: true as const,
      shareLinkId: link.id,
      token, // shown once
      url: `${nasConfig.shareBaseUrl}/${token}`,
      expiresAt,
    };
  } catch (error) {
    console.error("createShareLink error:", error);
    return { error: "Erro ao criar link de compartilhamento." };
  }
}

export async function revokeShareLink(shareLinkId: string) {
  try {
    const user = await requireSupervisorOrHigher();
    const res = await prisma.artifactShareLink.updateMany({
      where: { id: shareLinkId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) return { error: "Link não encontrado ou já revogado." };
    await audit(prisma, {
      actorUserId: user.id as string,
      eventType: "SHARE_REVOKED",
      metadata: { shareLinkId },
    });
    return { success: true as const };
  } catch (error) {
    console.error("revokeShareLink error:", error);
    return { error: "Erro ao revogar link." };
  }
}

/** Change sensitivity (MANAGER+). Leaving CLIENTE auto-revokes active shares. */
export async function changeSensitivity(input: unknown) {
  try {
    const user = await requireManagerOrAdmin();
    const parsed = changeSensitivitySchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { artifactId, sensitivity } = parsed.data;

    const artifact = await prisma.taskArtifact.findUnique({
      where: { id: artifactId },
      select: { id: true, sensitivity: true, taskId: true },
    });
    if (!artifact) return { error: "Artefato não encontrado." };
    const from = artifact.sensitivity;

    await prisma.$transaction(async (tx) => {
      await tx.taskArtifact.update({ where: { id: artifactId }, data: { sensitivity } });
      if (transitionRevokesShares(from, sensitivity)) {
        await tx.artifactShareLink.updateMany({
          where: { artifactId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await audit(tx, {
        artifactId,
        actorUserId: user.id as string,
        eventType: "SENSITIVITY_CHANGED",
        metadata: { from, to: sensitivity },
      });
    });

    revalidatePath(`/tasks/${artifact.taskId}`);
    return { success: true as const };
  } catch (error) {
    console.error("changeSensitivity error:", error);
    return { error: "Erro ao alterar sensibilidade." };
  }
}

/** Soft delete (autor ou MANAGER+). Marca deleteRequestedAt; o agente move p/ _trash depois. */
export async function softDeleteArtifact(artifactId: string) {
  try {
    const user = await getSessionUser();
    const artifact = await prisma.taskArtifact.findUnique({
      where: { id: artifactId },
      select: {
        id: true,
        uploadedById: true,
        userId: true,
        taskId: true,
        deletedAt: true,
        deleteRequestedAt: true,
      },
    });
    if (!artifact) return { error: "Artefato não encontrado." };

    const isAuthor = artifact.uploadedById === user.id || artifact.userId === user.id;
    const isManager = user.role === "ADMIN" || user.role === "MANAGER";
    if (!isAuthor && !isManager) return { error: "Sem permissão para excluir este artefato." };
    if (artifact.deletedAt || artifact.deleteRequestedAt) return { success: true as const }; // idempotent

    await prisma.$transaction(async (tx) => {
      await tx.taskArtifact.update({
        where: { id: artifactId },
        data: { deleteRequestedAt: new Date(), deletedById: user.id as string },
      });
      await tx.artifactShareLink.updateMany({
        where: { artifactId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit(tx, {
        artifactId,
        actorUserId: user.id as string,
        eventType: "DELETE_REQUESTED",
      });
    });

    revalidatePath(`/tasks/${artifact.taskId}`);
    return { success: true as const };
  } catch (error) {
    console.error("softDeleteArtifact error:", error);
    return { error: "Erro ao excluir artefato." };
  }
}

/** Restore a soft-deleted artifact (MANAGER+). */
export async function restoreArtifact(artifactId: string) {
  try {
    const user = await requireManagerOrAdmin();
    const artifact = await prisma.taskArtifact.findUnique({
      where: { id: artifactId },
      select: { taskId: true },
    });
    if (!artifact) return { error: "Artefato não encontrado." };

    await prisma.taskArtifact.update({
      where: { id: artifactId },
      data: { deleteRequestedAt: null, deletedAt: null, deletedById: null },
    });
    await audit(prisma, { artifactId, actorUserId: user.id as string, eventType: "RESTORED" });

    revalidatePath(`/tasks/${artifact.taskId}`);
    return { success: true as const };
  } catch (error) {
    console.error("restoreArtifact error:", error);
    return { error: "Erro ao restaurar artefato." };
  }
}

// ========== Scoped link artifacts (spec 2026-07-06) ==========
// PROJECT/CLIENT reference material (v1: link only). TASK-scoped links keep using
// addLinkArtifact in lib/actions/task.ts. Owner/scope invariant enforced by the schema.

export async function addScopedLinkArtifact(input: unknown) {
  const user = await requireManagerOrAdmin();
  const parsed = scopedLinkArtifactSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { scope, projectId, clientId, title, url, type } = parsed.data;
  if (scope === "TASK") {
    return { error: "Artefatos de tarefa usam o fluxo da própria demanda." };
  }

  try {
    await prisma.taskArtifact.create({
      data: {
        scope,
        projectId: projectId ?? null,
        clientId: clientId ?? null,
        title: title.trim(),
        url: url.trim(),
        type,
        userId: user.id as string,
        storageKind: "LINK",
        uploadStatus: "READY",
      },
    });
    if (projectId) revalidatePath(`/admin/projects/${projectId}`);
    if (clientId) revalidatePath(`/admin/clients/${clientId}`);
    return { success: true };
  } catch (error) {
    console.error("addScopedLinkArtifact error:", error);
    return { error: "Erro ao adicionar artefato." };
  }
}

export async function removeScopedArtifact(id: string) {
  await requireManagerOrAdmin();
  try {
    const art = await prisma.taskArtifact.findUnique({
      where: { id },
      select: { scope: true, projectId: true, clientId: true },
    });
    if (!art) return { error: "Artefato não encontrado." };
    if (art.scope === "TASK") {
      return { error: "Artefatos de tarefa não são removidos por aqui." };
    }
    await prisma.taskArtifact.delete({ where: { id } });
    if (art.projectId) revalidatePath(`/admin/projects/${art.projectId}`);
    if (art.clientId) revalidatePath(`/admin/clients/${art.clientId}`);
    return { success: true };
  } catch (error) {
    console.error("removeScopedArtifact error:", error);
    return { error: "Erro ao remover artefato." };
  }
}

/** Recuperação: remove um upload NAS NÃO-READY (travado/falho) em qualquer escopo, inclusive TASK.
 *  Se era a versão vigente, promove a anterior da cadeia a vigente (não deixa a cadeia sem current).
 *  READY não sai por aqui. RBAC por escopo (tarefa = membro+; projeto/cliente = MANAGER+). */
export async function removeFailedArtifact(id: string) {
  const art = await prisma.taskArtifact.findUnique({
    where: { id },
    select: {
      scope: true,
      storageKind: true,
      uploadStatus: true,
      taskId: true,
      projectId: true,
      clientId: true,
      rootId: true,
      isCurrent: true,
    },
  });
  if (!art) return { error: "Artefato não encontrado." };
  await requireForArtifactScope(art.scope); // throws (propaga) se não autorizado
  if (art.storageKind !== "NAS_UPLOAD") return { error: "Só uploads NAS saem por aqui." };
  if (art.uploadStatus === "READY") return { error: "Artefato pronto — não é removível por aqui." };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.artifactAuditLog.deleteMany({ where: { artifactId: id } });
      await tx.taskArtifact.delete({ where: { id } });
      if (art.isCurrent) {
        const root = art.rootId ?? id;
        const prev = await tx.taskArtifact.findFirst({
          where: { OR: [{ id: root }, { rootId: root }], NOT: { id } },
          orderBy: { version: "desc" },
          select: { id: true },
        });
        if (prev) {
          await tx.taskArtifact.update({ where: { id: prev.id }, data: { isCurrent: true } });
        }
      }
    });
    revalidateForArtifact(art);
    return { success: true };
  } catch (error) {
    console.error("removeFailedArtifact error:", error);
    return { error: "Erro ao remover artefato." };
  }
}

// ========== Versionamento (spec 2026-07-06) ==========

// Permissão por escopo: tarefa = membro+; projeto/cliente = MANAGER+.
async function requireForArtifactScope(scope: string) {
  return scope === "TASK" ? requireMemberOrHigher() : requireManagerOrAdmin();
}

function revalidateForArtifact(a: {
  taskId: string | null;
  projectId: string | null;
  clientId: string | null;
}) {
  if (a.taskId) {
    revalidatePath(`/tasks/${a.taskId}`);
    revalidatePath(`/admin/tasks/${a.taskId}`);
  }
  if (a.projectId) revalidatePath(`/admin/projects/${a.projectId}`);
  if (a.clientId) revalidatePath(`/admin/clients/${a.clientId}`);
}

/** Cria uma nova versão (link) de um artefato existente: nova linha na mesma raiz, version+1,
 * isCurrent=true; a anterior vira isCurrent=false. Título e tipo são HERDADOS da versão vigente —
 * só a URL muda. Só a versão vigente pode ser versionada. */
export async function addLinkArtifactVersion(artifactId: string, input: { url: string }) {
  try {
    const current = await prisma.taskArtifact.findUnique({ where: { id: artifactId } });
    if (!current) return { error: "Artefato não encontrado." };
    if (!current.isCurrent) return { error: "Só a versão vigente pode receber uma nova versão." };

    const user = await requireForArtifactScope(current.scope);

    const url = input.url?.trim();
    if (!url) return { error: "URL é obrigatória." };
    try {
      new URL(url);
    } catch {
      return { error: "URL inválida." };
    }
    const rootId = current.rootId ?? current.id;

    await prisma.$transaction([
      prisma.taskArtifact.update({ where: { id: current.id }, data: { isCurrent: false } }),
      prisma.taskArtifact.create({
        data: {
          scope: current.scope,
          taskId: current.taskId,
          projectId: current.projectId,
          clientId: current.clientId,
          title: current.title, // herdado
          url,
          type: current.type, // herdado
          storageKind: "LINK",
          uploadStatus: "READY",
          userId: user.id as string,
          rootId,
          version: current.version + 1,
          isCurrent: true,
        },
      }),
    ]);

    revalidateForArtifact(current);
    return { success: true };
  } catch (error) {
    console.error("addLinkArtifactVersion error:", error);
    return { error: "Erro ao criar nova versão." };
  }
}

/** Retorna a cadeia de versões de um artefato (todas as versões da mesma raiz), desc por versão. */
export async function getArtifactVersions(artifactId: string) {
  const art = await prisma.taskArtifact.findUnique({
    where: { id: artifactId },
    select: { id: true, rootId: true, scope: true },
  });
  if (!art) return [];
  await requireForArtifactScope(art.scope);

  const root = art.rootId ?? art.id;
  const rows = await prisma.taskArtifact.findMany({
    where: { OR: [{ id: root }, { rootId: root }] },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { version: "desc" },
  });
  return rows.map((r) => mapArtifactRow(r, r.scope as ArtifactOrigin));
}
