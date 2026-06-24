"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

interface HelpFigureProps {
  image?: string;
  caption?: string;
  placeholder: string;
}

/**
 * Renders a screenshot for a tutorial step. While the print does not exist yet
 * (file missing under /public/help), it shows a labeled placeholder. Drop the
 * image at `public/help/<image>` and it appears automatically.
 */
export function HelpFigure({ image, caption, placeholder }: HelpFigureProps) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(image) && !errored;

  return (
    <figure className="mt-4 overflow-hidden rounded-xl border-2 border-border bg-muted/40">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/help/${image}`}
          alt={caption ?? ""}
          onError={() => setErrored(true)}
          className="w-full object-cover"
        />
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
  );
}
