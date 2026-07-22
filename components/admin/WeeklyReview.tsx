"use client";

import { useState } from "react";
import { ClipboardCheck, ChevronDown, ChevronRight } from "lucide-react";

// Guided weekly review (traffic management cadence): a checklist that walks the
// manager through the cockpit signals below. Pure client state — the counts
// live in each block; this frames the routine ("measure → manage → adjust").
export default function WeeklyReview({
  steps,
  title,
  subtitle,
}: {
  steps: string[];
  title: string;
  subtitle: string;
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
              <li key={i}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked[i]}
                    onChange={() => toggle(i)}
                    className="h-4 w-4"
                  />
                  <span
                    className={
                      checked[i] ? "text-muted-foreground line-through" : "text-foreground"
                    }
                  >
                    {step}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
