"use client";

import { useState } from "react";
import { ClipboardCheck, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

export type ReviewStep = { label: string; href?: string };

// Guided weekly review (traffic management cadence): a checklist that walks the
// manager through the signals, each linking (new tab) to the screen where that
// info is checked. Pure client state — the counts live in each block/report.
export default function WeeklyReview({
  steps,
  title,
  subtitle,
  openLabel,
}: {
  steps: ReviewStep[];
  title: string;
  subtitle: string;
  openLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(() => steps.map(() => false));

  const done = checked.filter(Boolean).length;
  const toggle = (i: number) => setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  return (
    <div className="rounded-xl border-2 border-border bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-foreground" />
          <span className="font-bold text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">
            {done}/{steps.length}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
          <ul className="mt-3 space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked[i]}
                  onChange={() => toggle(i)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                  id={`review-step-${i}`}
                />
                <label
                  htmlFor={`review-step-${i}`}
                  className={`cursor-pointer ${checked[i] ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {step.label}
                </label>
                {step.href && (
                  <a
                    href={step.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={openLabel}
                    aria-label={openLabel}
                    className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
