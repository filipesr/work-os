"use client";

// Upload mode of the artifact form (v1: LAN-only). On mount it races the LAN agent (health probe)
// and loads the dropdown data. If the agent isn't reachable, or the project/env isn't configured,
// upload is disabled with an explanation. The file bytes go straight from the browser to the agent
// (PUT with the signed token) — never through Vercel.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Upload, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveUploadEndpoint, type UploadEndpoint } from "@/lib/nas/endpoint";
import {
  getArtifactUploadOptions,
  markUploading,
  prepareArtifactUpload,
} from "@/lib/actions/artifact";

const MEDIA_TYPES = [
  { v: "VIDEOS", l: "Vídeos" },
  { v: "FOTOS", l: "Fotos" },
  { v: "DOCUMENTOS", l: "Documentos" },
  { v: "LOGOS", l: "Logos" },
  { v: "SOCIAL_MEDIA", l: "Social Media" },
  { v: "OUTROS", l: "Outros" },
];
const SENSITIVITIES = [
  { v: "INTERNO", l: "Interno" },
  { v: "CLIENTE", l: "Cliente" },
  { v: "CONFIDENCIAL", l: "Confidencial" },
];

interface Options {
  nasUploadEnabled: boolean;
  uploadConfigured: boolean;
  purposes: { id: string; label: string }[];
  stages: { id: string; name: string; defaultMediaType: string | null }[];
}

type Phase = "idle" | "preparing" | "uploading" | "done" | "error";

const selectClass =
  "flex h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 transition-all";

function putWithProgress(
  url: string,
  token: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Agente respondeu ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Erro de rede ao enviar ao agente"));
    xhr.send(file);
  });
}

export function UploadArtifactForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [endpoint, setEndpoint] = useState<UploadEndpoint | null>(null);
  const [options, setOptions] = useState<Options | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState("FOTOS");
  const [purposeId, setPurposeId] = useState("");
  const [target, setTarget] = useState("CAMPANHA");
  const [sensitivity, setSensitivity] = useState("INTERNO");
  const [stageId, setStageId] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [ep, opt] = await Promise.all([
        resolveUploadEndpoint(),
        getArtifactUploadOptions(taskId),
      ]);
      if (!active) return;
      setEndpoint(ep);
      if ("success" in opt && opt.success) {
        setOptions({
          nasUploadEnabled: opt.nasUploadEnabled,
          uploadConfigured: opt.uploadConfigured,
          purposes: opt.purposes,
          stages: opt.stages,
        });
      }
      setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [taskId]);

  const busy = phase === "preparing" || phase === "uploading";
  const blockedReason = checking
    ? null
    : !endpoint?.uploadEnabled
      ? "Agente do NAS não encontrado na rede local. Conecte-se à LAN ou à VPN para enviar arquivos."
      : !options?.uploadConfigured
        ? "Upload no NAS não está configurado neste ambiente."
        : !options?.nasUploadEnabled
          ? "Upload no NAS não habilitado para este projeto. Peça a um gestor para revisar os metadados de campanha."
          : options.purposes.length === 0
            ? "Nenhum propósito de entregável cadastrado. Cadastre em Admin › Propósitos de entregável."
            : null;
  const canUpload = !checking && !blockedReason;

  async function handleUpload() {
    if (!file) return toast.error("Selecione um arquivo.");
    if (!purposeId) return toast.error("Selecione um propósito.");

    setPhase("preparing");
    setErrorMsg("");
    const prep = await prepareArtifactUpload({
      taskId,
      mediaType,
      purposeId,
      target,
      sensitivity,
      stageId: stageId || undefined,
      originalFileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
    if (!("success" in prep) || !prep.success) {
      setPhase("error");
      setErrorMsg(("error" in prep && prep.error) || "Falha ao preparar upload.");
      return;
    }

    await markUploading(prep.artifact.id);
    setPhase("uploading");
    setProgress(0);
    try {
      await putWithProgress(prep.upload.url, prep.upload.token, file, setProgress);
      setPhase("done");
      toast.success(`Enviado: ${prep.artifact.fileName}. Finalizando no servidor…`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // The agent finalizes asynchronously (PENDING/UPLOADING -> READY); refresh to reflect it.
      setTimeout(() => router.refresh(), 1500);
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Falha no upload.");
    }
  }

  if (checking) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Verificando agente na rede local…
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div className="flex items-start gap-2 rounded-lg border-2 border-border bg-muted/50 p-3 text-sm text-muted-foreground">
        <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>{blockedReason}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="nas-file" className="text-sm">
            Arquivo
          </Label>
          <input
            ref={fileInputRef}
            id="nas-file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground file:font-semibold hover:file:bg-primary/90"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nas-mediaType" className="text-sm">
            Tipo de mídia
          </Label>
          <select
            id="nas-mediaType"
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value)}
            disabled={busy}
            className={selectClass}
          >
            {MEDIA_TYPES.map((m) => (
              <option key={m.v} value={m.v}>
                {m.l}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nas-purpose" className="text-sm">
            Propósito
          </Label>
          <select
            id="nas-purpose"
            value={purposeId}
            onChange={(e) => setPurposeId(e.target.value)}
            disabled={busy}
            className={selectClass}
          >
            <option value="">Selecione…</option>
            {options!.purposes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nas-target" className="text-sm">
            Destino
          </Label>
          <select
            id="nas-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={busy}
            className={selectClass}
          >
            <option value="CAMPANHA">Campanha</option>
            <option value="INSTITUCIONAL">Institucional</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nas-sensitivity" className="text-sm">
            Sensibilidade
          </Label>
          <select
            id="nas-sensitivity"
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value)}
            disabled={busy}
            className={selectClass}
          >
            {SENSITIVITIES.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
        </div>

        {options!.stages.length > 0 && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="nas-stage" className="text-sm">
              Etapa (proveniência) — opcional
            </Label>
            <select
              id="nas-stage"
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              disabled={busy}
              className={selectClass}
            >
              <option value="">—</option>
              {options!.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {phase === "uploading" && (
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Enviando… {progress}%</p>
        </div>
      )}
      {phase === "error" && <p className="text-sm text-destructive">{errorMsg}</p>}
      {phase === "done" && (
        <p className="text-sm text-green-600">Upload concluído — finalizando no servidor.</p>
      )}

      <Button
        type="button"
        size="sm"
        onClick={handleUpload}
        disabled={!canUpload || busy || !file || !purposeId}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Upload className="h-4 w-4 mr-2" />
        )}
        {phase === "preparing"
          ? "Preparando…"
          : phase === "uploading"
            ? "Enviando…"
            : "Enviar ao NAS"}
      </Button>
    </div>
  );
}
