import { ClipboardCheck, ExternalLink } from "lucide-react";

export type ReviewStep = { label: string; href?: string };

// Guided review, always expanded (it is an important standing reference, not a
// collapsible extra): a checklist that walks the manager through the signals,
// each linking (new tab) to the screen where that info is checked in depth.
// Server component — no client state; it frames the daily management routine.
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
  return (
    <div className="rounded-xl border-2 border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-foreground" />
        <span className="font-bold text-foreground">{title}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      <ul className="mt-3 space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 text-muted-foreground">•</span>
            <span className="text-foreground">{step.label}</span>
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
    </div>
  );
}
