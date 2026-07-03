// Reconciliation cron (Vercel Cron). Expires uploads that never completed. It NEVER touches a READY
// artifact, and uses a generous UPLOADING TTL so a slow finalize retry (agent offline -> queue) still
// wins the race before we mark it FAILED. Protected by CRON_SECRET (Vercel sends it as a Bearer).
//
// Schedule (add to vercel.json at deploy):
//   { "crons": [{ "path": "/api/cron/nas-reconcile", "schedule": "*/15 * * * *" }] }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

const PENDING_TTL_MIN = 30; // prepared but never started an upload
const UPLOADING_TTL_MIN = 180; // started but no finalize — generous for agent finalize retries

export async function GET(request: NextRequest) {
  if (env.CRON_SECRET) {
    const authz = request.headers.get("authorization");
    if (authz !== `Bearer ${env.CRON_SECRET}`) {
      return NextResponse.json({ error: "não autorizado" }, { status: 401 });
    }
  }

  const now = Date.now();
  const pendingCutoff = new Date(now - PENDING_TTL_MIN * 60_000);
  const uploadingCutoff = new Date(now - UPLOADING_TTL_MIN * 60_000);

  const expired = await prisma.taskArtifact.updateMany({
    where: { storageKind: "NAS_UPLOAD", uploadStatus: "PENDING", createdAt: { lt: pendingCutoff } },
    data: { uploadStatus: "EXPIRED" },
  });

  const failed = await prisma.taskArtifact.updateMany({
    where: {
      storageKind: "NAS_UPLOAD",
      uploadStatus: "UPLOADING",
      createdAt: { lt: uploadingCutoff },
    },
    data: {
      uploadStatus: "FAILED",
      failedAt: new Date(),
      failedReason: "upload timeout (reconcile)",
    },
  });

  return NextResponse.json({ ok: true, expired: expired.count, failed: failed.count });
}
