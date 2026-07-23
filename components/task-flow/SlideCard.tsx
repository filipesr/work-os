import type { LucideIcon } from "lucide-react";

interface SlideCardProps {
  icon: LucideIcon;
  title: string;
  text: string;
  tone: "problem" | "solution" | "bonus" | "step";
}

const TONE_STYLES: Record<
  SlideCardProps["tone"],
  { container: string; iconBg: string; iconColor: string }
> = {
  problem: {
    container: "border-danger/40/40 hover:border-danger/40/60",
    iconBg: "bg-danger-subtle0/10",
    iconColor: "text-danger",
  },
  solution: {
    container: "border-success/40/40 hover:border-success/40/60",
    iconBg: "bg-success-subtle0/10",
    iconColor: "text-success",
  },
  bonus: {
    container: "border-warning/40/40 hover:border-warning/40/60",
    iconBg: "bg-warning-subtle0/10",
    iconColor: "text-warning",
  },
  step: {
    container: "border-primary/40",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
};

export function SlideCard({ icon: Icon, title, text, tone }: SlideCardProps) {
  const styles = TONE_STYLES[tone];
  return (
    <article
      className={`bg-card border-2 ${styles.container} rounded-2xl p-6 text-left h-full flex flex-col transition-colors`}
    >
      <div
        className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${styles.iconBg} mb-4`}
      >
        <Icon className={`h-6 w-6 ${styles.iconColor}`} />
      </div>
      <h3 className="text-xl font-bold text-foreground mb-2 leading-tight">{title}</h3>
      <p className="text-sm md:text-base text-muted-foreground leading-relaxed flex-1">{text}</p>
    </article>
  );
}
