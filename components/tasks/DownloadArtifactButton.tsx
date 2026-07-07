"use client";

// Download a NAS artifact. Races the LAN agent (client-side) to pick net=lan vs net=remote, then
// navigates to the internal download route, which validates RBAC + the sensitivity matrix and
// 302-redirects to the agent (LAN direct, or the Cloudflare Tunnel when remote — CLIENTE only).

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { probeLanAgent } from "@/lib/nas/endpoint";

export function DownloadArtifactButton({
  artifactId,
  iconOnly = false,
}: {
  artifactId: string;
  /** Só o ícone (usado nas linhas compactas do histórico de versões). */
  iconOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const health = await probeLanAgent();
      const net = health?.ok ? "lan" : "remote";
      window.location.href = `/api/artifacts/${artifactId}/download?net=${net}`;
    } finally {
      // O download é uma navegação que NÃO descarrega a página; sem isto o botão fica "girando"
      // para sempre (inclusive se o usuário cancela o download). Libera após iniciar.
      setTimeout(() => setBusy(false), 2000);
    }
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={go}
        disabled={busy}
        title="Baixar"
        aria-label="Baixar"
        className="inline-flex items-center rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </button>
    );
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
