import type { LucideIcon } from "lucide-react";

interface StepCardProps {
  badge: string;
  title: string;
  actor: string;
  text: string;
  accent?: "primary" | "loop" | "fork" | "join";
  icon?: LucideIcon;
}

const ACCENT_STYLES: Record<
  NonNullable<StepCardProps["accent"]>,
  { badge: string; border: string }
> = {
  primary: { badge: "bg-primary text-primary-foreground", border: "border-l-primary" },
  loop: { badge: "bg-warning-subtle0 text-white", border: "border-l-amber-500" },
  fork: { badge: "bg-primary text-white", border: "border-l-primary" },
  join: { badge: "bg-warning-subtle0 text-white", border: "border-l-orange-500" },
};

export function StepCard({
  badge,
  title,
  actor,
  text,
  accent = "primary",
  icon: Icon,
}: StepCardProps) {
  const styles = ACCENT_STYLES[accent];
  return (
    <article
      className={`bg-card border border-border border-l-4 ${styles.border} rounded-2xl p-5 text-left flex gap-4 items-start`}
    >
      <span
        className={`flex-shrink-0 inline-flex items-center justify-center min-w-[3rem] h-12 px-3 rounded-full font-bold text-xl ${styles.badge}`}
        aria-hidden="true"
      >
        {badge}
      </span>
      <div className="flex-1 min-w-0">
        <header className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-lg md:text-xl font-bold text-foreground leading-tight">{title}</h3>
          {Icon && <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />}
        </header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          {actor}
        </p>
        <p className="text-sm md:text-base text-foreground/90 leading-relaxed">{text}</p>
      </div>
    </article>
  );
}
