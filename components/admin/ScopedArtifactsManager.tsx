"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addScopedLinkArtifact, removeScopedArtifact } from "@/lib/actions/artifact";
import toast from "react-hot-toast";

type ScopedArtifact = { id: string; title: string; url: string | null };

interface ScopedArtifactsManagerProps {
  scope: "PROJECT" | "CLIENT";
  ownerId: string;
  artifacts: ScopedArtifact[];
}

/** Gestão de artefatos de referência (link) com escopo PROJECT ou CLIENT.
 * v1: apenas links. MANAGER+ (validado na action). */
export function ScopedArtifactsManager({ scope, ownerId, artifacts }: ScopedArtifactsManagerProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  const ownerKey = scope === "PROJECT" ? "projectId" : "clientId";

  const handleAdd = () => {
    if (!title.trim() || !url.trim()) return;
    startTransition(async () => {
      const res = await addScopedLinkArtifact({ scope, [ownerKey]: ownerId, title, url });
      if (res?.success) {
        setTitle("");
        setUrl("");
        toast.success("Artefato adicionado");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Erro ao adicionar");
      }
    });
  };

  const handleRemove = (id: string) => {
    startTransition(async () => {
      const res = await removeScopedArtifact(id);
      if (res?.success) {
        toast.success("Artefato removido");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Erro ao remover");
      }
    });
  };

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">
        Artefatos / documentos de referência
      </h3>

      {artifacts.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-4">Nenhum artefato ainda.</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {artifacts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2"
            >
              <a
                href={a.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-sm font-semibold text-primary hover:text-primary/80"
              >
                {a.title}
              </a>
              <button
                type="button"
                onClick={() => handleRemove(a.id)}
                disabled={isPending}
                className="shrink-0 text-sm font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título (ex.: Manual de marca)"
          className="h-11 flex-1 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 transition-all"
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="h-11 flex-1 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 transition-all"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !title.trim() || !url.trim()}
          className="h-11 rounded-lg bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}
