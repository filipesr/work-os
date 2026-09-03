// Fila de importação (agente -> nuvem). O agente PERGUNTA o que há para baixar; a Vercel nunca
// alcança o NAS, então o pedido parte sempre de dentro da rede. Autenticado pelo MESMO HMAC do
// finalize (timestamp + corpo cru), sem sessão.
//
// Reserva: o que sai daqui vai para UPLOADING com carimbo. Item preso além de IMPORT_LEASE_MS
// volta para PENDING — é a recuperação do agente que reiniciou no meio de um download.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFinalizeSecret, IMPORT_LEASE_MS, IMPORT_QUEUE_MAX } from "@/lib/nas/config";
import { verifyFinalizeSignature } from "@/lib/nas/token";
import { ALLOWLIST, isUploadableMediaType, type ArtifactMediaType } from "@/lib/nas/path";

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

  let body: { agentId?: string; limit?: number } = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const limit = Math.min(Math.max(1, Number(body.limit) || IMPORT_QUEUE_MAX), IMPORT_QUEUE_MAX);

  const now = new Date();

  // 1. Devolve à fila o que ficou preso (agente reiniciado no meio do download).
  await prisma.taskArtifact.updateMany({
    where: {
      storageKind: "NAS_UPLOAD",
      uploadStatus: "UPLOADING",
      url: { not: null },
      importClaimedAt: { lt: new Date(now.getTime() - IMPORT_LEASE_MS) },
    },
    data: { uploadStatus: "PENDING", importClaimedAt: null },
  });

  // 2. Reserva. `url: { not: null }` é o que separa importação de upload de navegador — um upload
  // parado em PENDING espera bytes que o navegador vai mandar, e o agente não tem o que baixar.
  const candidatos = await prisma.taskArtifact.findMany({
    where: {
      storageKind: "NAS_UPLOAD",
      uploadStatus: "PENDING",
      url: { not: null },
      deletedAt: null,
      nasPath: { not: null },
      mediaType: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  if (candidatos.length === 0) return NextResponse.json({ items: [] });

  const ids = candidatos.map((c) => c.id);
  await prisma.taskArtifact.updateMany({
    where: { id: { in: ids }, uploadStatus: "PENDING" },
    data: { uploadStatus: "UPLOADING", importClaimedAt: now, agentId: body.agentId ?? null },
  });

  // Relê só o que ESTE pedido reservou (o carimbo é a prova), em vez de assumir que a reserva
  // pegou tudo: entre a leitura e a escrita alguém pode ter mexido na linha.
  const reservados = await prisma.taskArtifact.findMany({
    where: { id: { in: ids }, uploadStatus: "UPLOADING", importClaimedAt: now },
    select: { id: true, url: true, nasPath: true, fileName: true, mediaType: true },
  });

  // Uma linha com tipo só-de-link não deveria existir na fila (a action recusa), mas a fila é lida
  // por OUTRO deployable: se aparecer, sai da lista em vez de derrubar a resposta inteira.
  const items = reservados.flatMap((a) => {
    const m = a.mediaType as ArtifactMediaType | null;
    if (!m || !isUploadableMediaType(m)) return [];
    return [
      {
        artifactId: a.id,
        url: a.url as string,
        nasPath: a.nasPath as string,
        fileName: a.fileName as string,
        mediaType: m,
        maxBytes: ALLOWLIST[m].maxBytes,
      },
    ];
  });
  return NextResponse.json({ items });
}
