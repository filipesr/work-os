"use client";

import { useState } from "react";
import { ImageIcon, X } from "lucide-react";

interface HelpFigureProps {
  image?: string;
  caption?: string;
  placeholder: string;
}

/**
 * Renders a screenshot for a tutorial step. While the print does not exist yet
 * (file missing under /public/help), it shows a labeled placeholder. Drop the
 * image at `public/help/<image>` and it appears automatically.
 *
 * Clicking a present image opens a full-screen zoom overlay.
 */
export function HelpFigure({ image, caption, placeholder }: HelpFigureProps) {
  const [errored, setErrored] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const showImage = Boolean(image) && !errored;
  const src = `/help/${image}`;

  return (
    <>
      <figure className="mt-4 overflow-hidden rounded-xl border border-border bg-muted/40">
        {showImage ? (
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="block w-full cursor-zoom-in"
            aria-label={caption ? `Ampliar: ${caption}` : "Ampliar imagem"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={caption ?? ""}
              onError={() => setErrored(true)}
              className="w-full object-cover"
            />
          </button>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <span className="text-sm font-medium text-muted-foreground">{placeholder}</span>
            {image ? (
              <span className="text-xs text-muted-foreground/70 font-mono">/help/{image}</span>
            ) : null}
          </div>
        )}
        {caption ? (
          <figcaption className="border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground">
            {caption}
          </figcaption>
        ) : null}
      </figure>

      {zoomed && showImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={caption ?? "Imagem ampliada"}
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4 animate-in fade-in duration-150"
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="Fechar"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={caption ?? ""}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </>
  );
}
