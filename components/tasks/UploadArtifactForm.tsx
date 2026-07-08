"use client";

// Upload mode of the artifact form (v1: LAN-only). On mount it races the LAN agent (health probe)
// and loads the dropdown data. If the agent isn't reachable, or the project/env isn't configured,
// upload is disabled with an explanation. The file bytes go straight from the browser to the agent
// (PUT with the signed token) — never through Vercel.
//
// Envios são fire-and-forget e CONCORRENTES: ao enviar, o picker é liberado na hora e o upload corre
// em background numa lista de progresso (cada item some ao concluir). O status final (finalizando ->
// Pronto) aparece no card do artefato, via router.refresh().

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Upload, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { resolveUploadEndpoint, type UploadEndpoint } from "@/lib/nas/endpoint";
import { getArtifactUploadOptions } from "@/lib/actions/artifact";
import { guessMediaType, uploadFileToNas } from "@/lib/nas/upload-client";

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
  uploadConfigured: boolean;
}

type Scope = "TASK" | "PROJECT" | "CLIENT";
interface UploadArtifactFormProps {
  scope: Scope;
  taskId?: string;
  projectId?: string;
  clientId?: string;
}

// Um envio em andamento (concorrente). `error` preenchido = falhou (fica na lista até dispensar).
interface InFlight {
  id: number;
  name: string;
  progress: number;
  error?: string;
}

const selectClass =
  "flex h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 transition-all";

export function UploadArtifactForm({
  scope,
  taskId,
  projectId,
  clientId,
}: UploadArtifactFormProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [endpoint, setEndpoint] = useState<UploadEndpoint | null>(null);
  const [options, setOptions] = useState<Options | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState("FOTOS");
  const [sensitivity, setSensitivity] = useState("INTERNO");

  const [inFlight, setInFlight] = useState<InFlight[]>([]);
  const idRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [ep, opt] = await Promise.all([
        resolveUploadEndpoint(),
        getArtifactUploadOptions({ scope, taskId }),
      ]);
      if (!active) return;
      setEndpoint(ep);
      if ("success" in opt && opt.success) {
        setOptions({ uploadConfigured: opt.uploadConfigured });
      }
      setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [scope, taskId, projectId, clientId]);

  const blockedReason = checking
    ? null
    : !endpoint?.uploadEnabled
      ? "Agente do NAS não encontrado na rede local. Conecte-se à LAN ou à VPN para enviar arquivos."
      : !options?.uploadConfigured
        ? "Upload no NAS não está configurado neste ambiente."
        : null;
  const canUpload = !checking && !blockedReason;

  // Fire-and-forget: libera o picker na hora e sobe em background (permite envios concorrentes).
  function handleUpload() {
    if (!file) return toast.error("Selecione um arquivo.");
    const f = file;
    const params = { scope, taskId, projectId, clientId, mediaType, sensitivity };
    const id = ++idRef.current;

    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setInFlight((cur) => [...cur, { id, name: f.name, progress: 0 }]);

    void uploadFileToNas(f, params, (pct) =>
      setInFlight((cur) => cur.map((e) => (e.id === id ? { ...e, progress: pct } : e)))
    ).then((res) => {
      if (res.ok) {
        setInFlight((cur) => cur.filter((e) => e.id !== id));
        toast.success(`Enviado: ${res.fileName}`);
        router.refresh(); // o card reflete finalizando -> Pronto
      } else {
        setInFlight((cur) => cur.map((e) => (e.id === id ? { ...e, error: res.error } : e)));
        toast.error(res.error);
      }
    });
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
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f) {
                const guessed = guessMediaType(f.name);
                if (guessed) setMediaType(guessed);
              }
            }}
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
          <Label htmlFor="nas-sensitivity" className="text-sm">
            Sensibilidade
          </Label>
          <select
            id="nas-sensitivity"
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value)}
            className={selectClass}
          >
            {SENSITIVITIES.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button type="button" size="sm" onClick={handleUpload} disabled={!canUpload || !file}>
        <Upload className="h-4 w-4 mr-2" />
        Enviar ao NAS
      </Button>

      {/* Envios em andamento (concorrentes) — cada item some ao concluir. */}
      {inFlight.length > 0 && (
        <ul className="space-y-2 pt-1">
          {inFlight.map((e) => (
            <li key={e.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{e.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {e.error ? "falhou" : `${e.progress}%`}
                  {e.error && (
                    <button
                      type="button"
                      onClick={() => setInFlight((cur) => cur.filter((x) => x.id !== e.id))}
                      className="ml-1 align-middle text-muted-foreground hover:text-foreground"
                      aria-label="Dispensar"
                    >
                      <X className="inline h-3 w-3" />
                    </button>
                  )}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all ${e.error ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${e.error ? 100 : e.progress}%` }}
                />
              </div>
              {e.error && <p className="text-xs text-destructive">{e.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
