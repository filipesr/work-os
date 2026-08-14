"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copia o esqueleto do relatório para a área de transferência.
 *
 * O `<pre>` com o texto fica sempre na página, ao lado — se a API de área de
 * transferência não estiver disponível (contexto sem HTTPS, permissão negada),
 * a pessoa ainda consegue selecionar e copiar à mão. O botão é conveniência,
 * não a única porta.
 */
export function CopySkeletonButton({
  text,
  labels,
}: {
  text: string;
  labels: { copy: string; copied: string; failed: string };
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        {state === "copied" ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {state === "copied" ? labels.copied : labels.copy}
      </button>
      {state === "failed" ? (
        <span role="alert" className="text-sm text-destructive">
          {labels.failed}
        </span>
      ) : null}
    </div>
  );
}
