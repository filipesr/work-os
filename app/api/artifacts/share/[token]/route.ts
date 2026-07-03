// Public share (no session). Resolves the share token, verifies it timing-safe, checks
// revocation/expiry/maxDownloads and the optional Argon2id password, then 302-redirects to the agent
// via the Cloudflare Tunnel. Only CLIENTE artifacts are ever shareable. Rate-limited by publicId+IP.
//
// maxDownloads counts only this initial (session-starting) hit; the Range requests the browser makes
// afterwards go straight to the agent and are not counted here.

import { NextRequest, NextResponse } from "next/server";
import { verify as argon2Verify } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { parseShareToken, verifyShareSecret } from "@/lib/nas/share-token";
import { signDownloadToken } from "@/lib/nas/token";
import {
  getNasSigningConfig,
  getShareTokenPepper,
  nasConfig,
  NAS_TOKEN_TTL,
} from "@/lib/nas/config";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const parsed = parseShareToken(token);
  if (!parsed) return NextResponse.json({ error: "link inválido" }, { status: 404 });

  const ip =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(`share:${parsed.publicId}:${ip}`, {
    limit: 20,
    windowInSeconds: 60,
  });
  if (!success) return NextResponse.json({ error: "muitas tentativas" }, { status: 429 });

  let pepper: string;
  try {
    pepper = getShareTokenPepper();
  } catch {
    return NextResponse.json({ error: "compartilhamento não configurado" }, { status: 503 });
  }

  const link = await prisma.artifactShareLink.findUnique({
    where: { publicId: parsed.publicId },
    select: {
      id: true,
      tokenHash: true,
      passwordHash: true,
      expiresAt: true,
      maxDownloads: true,
      downloadCount: true,
      revokedAt: true,
      artifact: {
        select: {
          id: true,
          nasPath: true,
          fileName: true,
          sensitivity: true,
          uploadStatus: true,
          storageKind: true,
          deletedAt: true,
          deleteRequestedAt: true,
        },
      },
    },
  });
  // Uniform 404 for "no such link" and "wrong secret" so tokens can't be probed.
  if (!link || !verifyShareSecret(parsed.secret, pepper, link.tokenHash)) {
    return NextResponse.json({ error: "link inválido" }, { status: 404 });
  }
  if (link.revokedAt || link.expiresAt < new Date()) {
    return NextResponse.json({ error: "link expirado ou revogado" }, { status: 410 });
  }
  const a = link.artifact;
  if (
    !a ||
    a.storageKind !== "NAS_UPLOAD" ||
    a.uploadStatus !== "READY" ||
    a.deletedAt ||
    a.deleteRequestedAt ||
    !a.nasPath ||
    !a.fileName
  ) {
    return NextResponse.json({ error: "arquivo indisponível" }, { status: 410 });
  }
  // Defense in depth: only CLIENTE is shareable, even if sensitivity changed after creation.
  if (a.sensitivity !== "CLIENTE") {
    return NextResponse.json(
      { error: "arquivo não disponível para compartilhamento" },
      { status: 403 }
    );
  }
  if (link.maxDownloads != null && link.downloadCount >= link.maxDownloads) {
    return NextResponse.json({ error: "limite de downloads atingido" }, { status: 410 });
  }

  if (link.passwordHash) {
    const pw = request.nextUrl.searchParams.get("pw") ?? "";
    if (!pw || !(await argon2Verify(link.passwordHash, pw))) {
      return NextResponse.json({ error: "senha inválida" }, { status: 401 });
    }
  }

  const dlToken = await signDownloadToken(
    {
      artifactId: a.id,
      nasPath: a.nasPath,
      fileName: a.fileName,
      dispositionName: a.fileName,
      sensitivity: a.sensitivity,
      shareLinkId: link.id,
    },
    getNasSigningConfig(),
    NAS_TOKEN_TTL.download
  );

  await prisma.$transaction([
    prisma.artifactShareLink.update({
      where: { id: link.id },
      data: { downloadCount: { increment: 1 }, lastDownloadedAt: new Date() },
    }),
    prisma.artifactAuditLog.create({
      data: {
        artifactId: a.id,
        eventType: "DOWNLOAD_SHARE",
        ip,
        userAgent: request.headers.get("user-agent"),
        metadata: { shareLinkId: link.id },
      },
    }),
  ]);

  return NextResponse.redirect(
    `${nasConfig.agentTunnelUrl}/v1/download?token=${encodeURIComponent(dlToken)}`,
    302
  );
}
