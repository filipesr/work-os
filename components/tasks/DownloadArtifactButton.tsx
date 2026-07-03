"use client";

// Download a NAS artifact. Races the LAN agent (client-side) to pick net=lan vs net=remote, then
// navigates to the internal download route, which validates RBAC + the sensitivity matrix and
// 302-redirects to the agent (LAN direct, or the Cloudflare Tunnel when remote — CLIENTE only).

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { probeLanAgent } from "@/lib/nas/endpoint";

export function DownloadArtifactButton({ artifactId }: { artifactId: string }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    const health = await probeLanAgent();
    const net = health?.ok ? "lan" : "remote";
    window.location.href = `/api/artifacts/${artifactId}/download?net=${net}`;
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground hover:bg-accent transition-colors disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
      Baixar
    </button>
  );
}
