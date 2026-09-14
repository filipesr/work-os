"use server";

// Importação de um artefato registrado por link para dentro do NAS. Aqui só se ENFILEIRA: o
// artefato nasce NAS_UPLOAD/PENDING com a origem em `url`, e quem baixa é o agente da LAN — a
// Vercel não alcança o NAS, então o tráfego anda no sentido que já funciona (agente -> nuvem).

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMemberOrHigher, requireManagerOrAdmin } from "@/lib/permissions";
import { importArtifactSchema, retryImportSchema } from "@/lib/validations";
import { createArtifactWithVersion, resolveArtifactOwner } from "@/lib/actions/artifact";
import { checkImportUrl, URL_PROBLEM_KEY } from "@/lib/nas/import-source";
import { isNasImportConfigured } from "@/lib/nas/config";
import {
  NasPathError,
  buildNasPath,
  fileBaseToken,
  isUploadableMediaType,
  normalizeExtension,
} from "@/lib/nas/path";

export async function enqueueArtifactImport(input: unknown) {
  const t = await getTranslations("errors.artifact");
  const tc = await getTranslations("errors.common");
  try {
    const parsed = importArtifactSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;

    // RBAC igual ao do upload: tarefa = membro+; projeto/cliente = MANAGER+.
    const user =
      data.scope === "TASK" ? await requireMemberOrHigher() : await requireManagerOrAdmin();

    if (!isNasImportConfigured()) return { error: t("importNotConfigured") };

    // Tipo só de link não vira arquivo. A recusa é aqui, com a frase certa — o formulário
    // desabilita o botão, mas o botão não é a trava.
    if (!isUploadableMediaType(data.mediaType)) return { error: t("mediaTypeLinkOnly") };

    const check = checkImportUrl(data.url);
    if (!check.ok) return { error: t(URL_PROBLEM_KEY[check.reason]) };

    const originalFileName = check.fileName;
    try {
      normalizeExtension(originalFileName, data.mediaType);
    } catch (e) {
      if (e instanceof NasPathError) return { error: e.message };
      throw e;
    }

    const owner = await resolveArtifactOwner(data);
    if (!owner.ok) {
      const isCommon = owner.errorKey === "projectNotFound" || owner.errorKey === "clientNotFound";
      return { error: isCommon ? tc(owner.errorKey) : t(owner.errorKey) };
    }
    const { folderName, ownerName, ownerId, taskId, projectId, clientId } = owner.ctx;

    const artifact = await createArtifactWithVersion({
      scope: data.scope,
      taskId,
      projectId,
      clientId,
      userId: user.id,
      folderName,
      ownerName,
      ownerId,
      mediaType: data.mediaType,
      purposeId: null,
      purposeLabel: "",
      originalFileName,
      mimeType: null,
      sizeBytes: null,
      sensitivity: data.sensitivity,
      stageId: data.stageId,
      title: data.title.trim(),
      sourceUrl: data.url.trim(),
    });

    await prisma.artifactAuditLog.create({
      data: {
        artifactId: artifact.id,
        eventType: "IMPORT_ENQUEUED",
        metadata: { url: data.url, mediaType: data.mediaType },
      },
    });

    if (taskId) {
      revalidatePath(`/tasks/${taskId}`);
      revalidatePath(`/admin/tasks/${taskId}`);
    }
    if (projectId) revalidatePath(`/admin/projects/${projectId}`);
    if (clientId) revalidatePath(`/admin/clients/${clientId}`);

    return { success: true as const, artifact: { id: artifact.id } };
  } catch (error) {
    console.error("enqueueArtifactImport error:", error);
    return { error: t("importFailed") };
  }
}

/**
 * Reedição de uma importação que FALHOU: reabre TODOS os campos (não só a URL — quem declarou
 * FOTOS para um vídeo de 300 MB é recusado pelo teto do TIPO declarado, e trocar só o link não
 * resolveria) e devolve o artefato para PENDING com o caminho reselado.
 *
 * A trava vive AQUI, não na tela: um artefato READY tem bytes gravados, e trocar a origem depois
 * faria a procedência mentir sobre um arquivo que existe. Um import que falhou nunca virou
 * arquivo — não há histórico a reescrever.
 */
export async function retryArtifactImport(artifactId: string, input: unknown) {
  const t = await getTranslations("errors.artifact");
  const tc = await getTranslations("errors.common");
  try {
    const parsed = retryImportSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;

    const atual = await prisma.taskArtifact.findUnique({
      where: { id: artifactId },
      select: {
        id: true,
        scope: true,
        taskId: true,
        projectId: true,
        clientId: true,
        storageKind: true,
        uploadStatus: true,
        url: true,
        version: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    if (!atual || atual.deletedAt) return { error: tc("artifactNotFound") };

    // RBAC igual ao do enfileiramento: tarefa = membro+; projeto/cliente = MANAGER+.
    const user =
      atual.scope === "TASK" ? await requireMemberOrHigher() : await requireManagerOrAdmin();
    void user;

    // A trava vive AQUI, não na tela: um artefato READY tem bytes gravados, e trocar a origem
    // depois faria a procedência mentir sobre um arquivo que existe.
    if (atual.storageKind !== "NAS_UPLOAD" || !atual.url) return { error: t("importOnlyImports") };
    if (atual.uploadStatus !== "FAILED") return { error: t("importOnlyFailed") };

    const check = checkImportUrl(data.url);
    if (!check.ok) return { error: t(URL_PROBLEM_KEY[check.reason]) };
    const originalFileName = check.fileName;
    try {
      normalizeExtension(originalFileName, data.mediaType);
    } catch (e) {
      if (e instanceof NasPathError) return { error: e.message };
      throw e;
    }

    const owner = await resolveArtifactOwner(atual);
    if (!owner.ok) {
      const isCommon = owner.errorKey === "projectNotFound" || owner.errorKey === "clientNotFound";
      return { error: isCommon ? tc(owner.errorKey) : t(owner.errorKey) };
    }

    // Resela o caminho: mudar o tipo de mídia muda a pasta, e mudar a URL muda a extensão.
    // A versão e a data de criação são as MESMAS — é o mesmo artefato tentando de novo, não um
    // novo; número de versão nunca se reusa nem se gasta à toa.
    const built = buildNasPath({
      scope: atual.scope,
      client: owner.ctx.folderName,
      ownerName: owner.ctx.ownerName,
      ownerId: owner.ctx.ownerId,
      mediaType: data.mediaType,
      originalFileName,
      version: atual.version,
      uploadDate: atual.createdAt,
    });

    try {
      await prisma.taskArtifact.update({
        where: { id: artifactId },
        data: {
          title: data.title.trim(),
          url: data.url.trim(),
          mediaType: data.mediaType,
          sensitivity: data.sensitivity,
          originalFileName,
          fileKey: fileBaseToken(originalFileName),
          nasPath: built.relPath,
          fileName: built.fileName,
          uploadStatus: "PENDING",
          failedAt: null,
          failedReason: null,
          importClaimedAt: null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { error: t("importPathTaken") };
      }
      throw e;
    }

    await prisma.artifactAuditLog.create({
      data: {
        artifactId,
        eventType: "IMPORT_RETRIED",
        metadata: { url: data.url, mediaType: data.mediaType },
      },
    });

    if (atual.taskId) {
      revalidatePath(`/tasks/${atual.taskId}`);
      revalidatePath(`/admin/tasks/${atual.taskId}`);
    }
    if (atual.projectId) revalidatePath(`/admin/projects/${atual.projectId}`);
    if (atual.clientId) revalidatePath(`/admin/clients/${atual.clientId}`);

    return { success: true as const };
  } catch (error) {
    console.error("retryArtifactImport error:", error);
    return { error: t("importFailed") };
  }
}
