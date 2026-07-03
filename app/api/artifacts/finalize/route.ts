// Finalize (agent -> cloud). The NAS agent calls this after temp->rename->sha256 to flip the
// artifact PENDING/UPLOADING -> READY. Authenticated by HMAC over `${timestamp}.${rawBody}` (not a
// session). Idempotent: a replay for an already-READY artifact returns ok. This is the single
// authoritative state transition to READY.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFinalizeSecret } from "@/lib/nas/config";
import { verifyFinalizeSignature } from "@/lib/nas/token";

export async function POST(request: NextRequest) {
  let secret: string;
  try {
    secret = getFinalizeSecret();
  } catch {
    return NextResponse.json({ error: "NAS finalize não configurado" }, { status: 503 });
  }

  const timestamp = request.headers.get("x-nas-timestamp") ?? "";
  const signature = request.headers.get("x-nas-signature") ?? "";
  const rawBody = await request.text();

  const v = verifyFinalizeSignature(secret, timestamp, rawBody, signature);
  if (!v.ok) {
    return NextResponse.json({ error: "assinatura inválida", reason: v.reason }, { status: 401 });
  }

  let body: {
    artifactId?: string;
    checksum?: string;
    sizeBytes?: number | string;
    agentId?: string;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { artifactId, checksum, sizeBytes, agentId } = body;
  if (!artifactId) return NextResponse.json({ error: "artifactId obrigatório" }, { status: 400 });

  const artifact = await prisma.taskArtifact.findUnique({
    where: { id: artifactId },
    select: { id: true, uploadStatus: true },
  });
  if (!artifact) return NextResponse.json({ error: "artefato não encontrado" }, { status: 404 });

  // Idempotent: already finalized.
  if (artifact.uploadStatus === "READY") {
    return NextResponse.json({ ok: true, idempotent: true });
  }
  // Terminal states shouldn't be revived by a late finalize.
  if (artifact.uploadStatus === "EXPIRED" || artifact.uploadStatus === "FAILED") {
    return NextResponse.json(
      { error: `artefato em estado ${artifact.uploadStatus}` },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.taskArtifact.update({
      where: { id: artifactId },
      data: {
        uploadStatus: "READY",
        checksum: checksum ?? null,
        sizeBytes: sizeBytes != null ? BigInt(sizeBytes) : undefined,
        readyAt: new Date(),
        agentId: agentId ?? null,
      },
    });
    await tx.artifactAuditLog.create({
      data: {
        artifactId,
        eventType: "UPLOAD_FINALIZED",
        metadata: {
          checksum: checksum ?? null,
          sizeBytes: sizeBytes != null ? String(sizeBytes) : null,
          agentId: agentId ?? null,
        },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
