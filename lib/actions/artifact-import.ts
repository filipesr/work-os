"use server";

// Importação de um artefato registrado por link para dentro do NAS. Aqui só se ENFILEIRA: o
// artefato nasce NAS_UPLOAD/PENDING com a origem em `url`, e quem baixa é o agente da LAN — a
// Vercel não alcança o NAS, então o tráfego anda no sentido que já funciona (agente -> nuvem).

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireMemberOrHigher, requireManagerOrAdmin } from "@/lib/permissions";
import { importArtifactSchema } from "@/lib/validations";
import { createArtifactWithVersion, resolveArtifactOwner } from "@/lib/actions/artifact";
import { checkImportUrl, deriveFileNameFromUrl, URL_PROBLEM_KEY } from "@/lib/nas/import-source";
import { isNasImportConfigured } from "@/lib/nas/config";
import { NasPathError, isUploadableMediaType, normalizeExtension } from "@/lib/nas/path";

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

    const originalFileName = deriveFileNameFromUrl(data.url) as string;
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
      userId: user.id as string,
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
