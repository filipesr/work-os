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
    container: "border-red-500/40 hover:border-red-500/60",
    iconBg: "bg-red-500/10",
    iconColor: "text-red-600 dark:text-red-400",
  },
  solution: {
    container: "border-emerald-500/40 hover:border-emerald-500/60",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  bonus: {
    container: "border-amber-500/40 hover:border-amber-500/60",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
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
