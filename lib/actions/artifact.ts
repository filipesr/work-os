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
} from "@/lib/validations";
import { ALLOWLIST, buildNasPath, NasPathError, normalizeExtension } from "@/lib/nas/path";
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
  taskId: string;
  userId: string;
  folderName: string;
  target: "CAMPANHA" | "INSTITUCIONAL";
  mediaType: Prisma.TaskArtifactCreateInput["mediaType"];
  purposeId: string;
  purposeLabel: string;
  taskTitle: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  sensitivity: Prisma.TaskArtifactCreateInput["sensitivity"];
  stageId?: string;
  campaignYear?: number;
  campaignMonth?: number;
  campaignSlug?: string;
}

// Allocate the next version and create the PENDING artifact in one transaction. The version is
// max(existing)+1 across ALL rows for (taskId, purposeId, mediaType) — expired/failed/deleted count,
// so a number is never reused. Retries on the unique-constraint race.
async function createArtifactWithVersion(
  params: VersionParams
): Promise<{ id: string; nasPath: string; fileName: string; version: number }> {
  const MAX_RETRIES = 5;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.taskArtifact.findFirst({
          where: {
            taskId: params.taskId,
            purposeId: params.purposeId,
            mediaType: params.mediaType,
          },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const version = (last?.version ?? 0) + 1;
        const built = buildNasPath({
          client: params.folderName,
          target: params.target,
          mediaType: params.mediaType as NonNullable<VersionParams["mediaType"]>,
          purpose: params.purposeLabel,
          taskTitle: params.taskTitle,
          originalFileName: params.originalFileName,
          version,
          campaignYear: params.campaignYear,
          campaignMonth: params.campaignMonth,
          campaignSlug: params.campaignSlug,
        });
        const created = await tx.taskArtifact.create({
          data: {
            taskId: params.taskId,
            userId: params.userId,
            uploadedById: params.userId,
            title: params.originalFileName,
            url: null,
            type: "OTHER",
            storageKind: "NAS_UPLOAD",
            uploadStatus: "PENDING",
            mediaType: params.mediaType,
            purposeId: params.purposeId,
            target: params.target,
            sensitivity: params.sensitivity,
            stageId: params.stageId ?? null,
            nasPath: built.relPath,
            fileName: built.fileName,
            originalFileName: params.originalFileName,
            mimeType: params.mimeType,
            sizeBytes: BigInt(params.sizeBytes),
            version,
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
    const user = await requireMemberOrHigher();
    const userId = user.id as string;

    const parsed = prepareArtifactUploadSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;

    if (!isNasUploadConfigured()) {
      return { error: "Upload no NAS não está configurado neste ambiente." };
    }

    const task = await prisma.task.findUnique({
      where: { id: data.taskId },
      select: {
        id: true,
        title: true,
        project: {
          select: {
            nasUploadEnabled: true,
            campaignSlug: true,
            campaignYear: true,
            campaignMonth: true,
            client: { select: { folderName: true } },
          },
        },
      },
    });
    if (!task) return { error: "Demanda não encontrada." };
    if (!task.project.nasUploadEnabled) {
      return {
        error: "Upload no NAS não habilitado para este projeto (pendente revisão de metadados).",
      };
    }
    const folderName = task.project.client.folderName;
    if (!folderName) return { error: "Cliente sem folderName definido para o NAS." };

    if (
      data.target === "CAMPANHA" &&
      (task.project.campaignSlug == null ||
        task.project.campaignYear == null ||
        task.project.campaignMonth == null)
    ) {
      return { error: "Projeto sem metadados de campanha (slug/ano/mês). Revise antes do upload." };
    }

    const purpose = await prisma.deliverablePurpose.findUnique({
      where: { id: data.purposeId },
      select: { id: true, label: true, active: true },
    });
    if (!purpose || !purpose.active) return { error: "Propósito inválido ou inativo." };

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
      taskId: task.id,
      userId,
      folderName,
      target: data.target,
      mediaType: data.mediaType,
      purposeId: purpose.id,
      purposeLabel: purpose.label,
      taskTitle: task.title,
      originalFileName: data.originalFileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      sensitivity: data.sensitivity,
      stageId: data.stageId,
      campaignYear: task.project.campaignYear ?? undefined,
      campaignMonth: task.project.campaignMonth ?? undefined,
      campaignSlug: task.project.campaignSlug ?? undefined,
    });

    const jti = randomUUID();
    const uploadToken = await signUploadToken(
      {
        artifactId: artifact.id,
        taskId: task.id,
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

    revalidatePath(`/tasks/${task.id}`);
    revalidatePath(`/admin/tasks/${task.id}`);

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

/** Dropdown data + gating flags for the upload form (active purposes, task stages, config state). */
export async function getArtifactUploadOptions(taskId: string) {
  try {
    await requireMemberOrHigher();
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        project: { select: { nasUploadEnabled: true } },
        activeStages: {
          select: { stage: { select: { id: true, name: true, defaultMediaType: true } } },
        },
      },
    });
    if (!task) return { error: "Demanda não encontrada." };

    const purposes = await prisma.deliverablePurpose.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { label: "asc" }],
      select: { id: true, label: true },
    });

    return {
      success: true as const,
      nasUploadEnabled: task.project.nasUploadEnabled,
      uploadConfigured: isNasUploadConfigured(),
      purposes,
      stages: task.activeStages.map((s) => ({
        id: s.stage.id,
        name: s.stage.name,
        defaultMediaType: s.stage.defaultMediaType,
      })),
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
