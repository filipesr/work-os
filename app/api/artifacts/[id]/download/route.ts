// Internal download (authenticated). Validates RBAC + the sensitivity matrix, signs a short-lived
// download token and 302-redirects the browser to the agent. The client picks LAN vs Tunnel via the
// `?net=lan|remote` query (from the client-side race in lib/nas/endpoint). The server ENFORCES the
// policy: external (remote/tunnel) download is only allowed for CLIENTE.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signDownloadToken } from "@/lib/nas/token";
import { canDownloadExternally } from "@/lib/nas/sensitivity";
import {
  getNasSigningConfig,
  isNasTunnelConfigured,
  isNasUploadConfigured,
  nasConfig,
  NAS_TOKEN_TTL,
} from "@/lib/nas/config";

const MEMBER_ROLES = new Set(["ADMIN", "MANAGER", "SUPERVISOR", "MEMBER"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  if (!MEMBER_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: "sem permissão" }, { status: 403 });
  }

  const net = request.nextUrl.searchParams.get("net") === "lan" ? "lan" : "remote";

  const artifact = await prisma.taskArtifact.findUnique({
    where: { id },
    select: {
      id: true,
      storageKind: true,
      uploadStatus: true,
      sensitivity: true,
      nasPath: true,
      fileName: true,
      deletedAt: true,
      deleteRequestedAt: true,
    },
  });
  if (
    !artifact ||
    artifact.storageKind !== "NAS_UPLOAD" ||
    !artifact.nasPath ||
    !artifact.fileName
  ) {
    return NextResponse.json({ error: "artefato não encontrado" }, { status: 404 });
  }
  if (artifact.deletedAt || artifact.deleteRequestedAt) {
    return NextResponse.json({ error: "artefato removido" }, { status: 410 });
  }
  if (artifact.uploadStatus !== "READY") {
    return NextResponse.json({ error: "artefato ainda não está pronto" }, { status: 409 });
  }

  // Sensitivity matrix: only CLIENTE may leave the LAN (tunnel). INTERNO/CONFIDENCIAL are LAN-only.
  if (net === "remote" && !canDownloadExternally(artifact.sensitivity)) {
    return NextResponse.json(
      { error: "download externo permitido apenas para artefatos CLIENTE" },
      { status: 403 }
    );
  }

  const configured = net === "lan" ? isNasUploadConfigured() : isNasTunnelConfigured();
  if (!configured) {
    return NextResponse.json({ error: "canal de download não configurado" }, { status: 503 });
  }

  const token = await signDownloadToken(
    {
      artifactId: artifact.id,
      nasPath: artifact.nasPath,
      fileName: artifact.fileName,
      dispositionName: artifact.fileName,
      sensitivity: artifact.sensitivity,
      sub: session.user.id,
    },
    getNasSigningConfig(),
    NAS_TOKEN_TTL.download
  );

  const ip =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? null;
  await prisma.artifactAuditLog.create({
    data: {
      artifactId: artifact.id,
      actorUserId: session.user.id,
      eventType: "DOWNLOAD_INTERNAL",
      ip,
      userAgent: request.headers.get("user-agent"),
      metadata: { net },
    },
  });

  const base = net === "lan" ? nasConfig.agentLanUrl : nasConfig.agentTunnelUrl;
  return NextResponse.redirect(`${base}/v1/download?token=${encodeURIComponent(token)}`, 302);
}
