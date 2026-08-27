"use client";

// Download a NAS artifact. Races the LAN agent (client-side) to pick net=lan vs net=remote, then
// navigates to the internal download route, which validates RBAC + the sensitivity matrix and
// 302-redirects to the agent (LAN direct, or the Cloudflare Tunnel when remote — CLIENTE only).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  probeLanAgentDetailed,
  nasClientConfigured,
  NAS_ENDPOINT_CONFIG,
} from "@/lib/nas/endpoint";
import { nasFailureMessage } from "@/lib/nas/failure-message";

export function DownloadArtifactButton({
  artifactId,
  iconOnly = false,
}: {
  artifactId: string;
  /** Só o ícone (usado nas linhas compactas do histórico de versões). */
  iconOnly?: boolean;
}) {
  const t = useTranslations("tasks.artifacts.download");
  const tNas = useTranslations("tasks.nasProbe");
  const [busy, setBusy] = useState(false);

  async function go() {
    // Degrada com elegância em vez de navegar para o erro JSON cru da rota de download.
    if (!nasClientConfigured()) {
      toast.error(t("unavailable"));
      return;
    }
    setBusy(true);
    const probe = await probeLanAgentDetailed();
    // Para BAIXAR, disco cheio não atrapalha: `writable:false` impede o ENVIO, não a leitura — e a
    // LAN serve qualquer sensibilidade, enquanto o túnel só serve CLIENTE. Mas isso vale só quando
    // o agente se declarou OK: um `ok:false` (ou corpo ilegível) é agente em mau estado, e aí o
    // túnel é a aposta melhor — que era o comportamento antes desta tela ganhar motivos.
    const lanUsable = probe.ok || (probe.reason === "unhealthy" && probe.health?.ok === true);
    // Sem agente na LAN e sem túnel configurado → não há como baixar. Avisa DIZENDO O MOTIVO (o
    // genérico "conecte-se à LAN/VPN" foi o que mandou caçar rede num certificado vencido) e não
    // navega.
    if (!lanUsable && !NAS_ENDPOINT_CONFIG.TUNNEL_URL) {
      setBusy(false);
      toast.error(nasFailureMessage(tNas, probe.reason, probe.status));
      return;
    }
    const net = lanUsable ? "lan" : "remote";
    window.location.href = `/api/artifacts/${artifactId}/download?net=${net}`;
    // O download é uma navegação que NÃO descarrega a página; sem isto o botão fica "girando" para
    // sempre (inclusive se o usuário cancela). Libera após iniciar.
    setTimeout(() => setBusy(false), 2000);
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={go}
        disabled={busy}
        title={t("label")}
        aria-label={t("label")}
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
      {t("label")}
    </button>
  );
}
