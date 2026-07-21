import { useTranslations } from "next-intl";
import { Calendar, GitBranch, TrendingUp, Tv, Users } from "lucide-react";
import { SlideShell } from "../SlideShell";
import { SlideCard } from "../SlideCard";

const SOLUTION_ICONS = {
  doing: Tv,
  planned: Calendar,
  assignment: Users,
  parallel: GitBranch,
  metrics: TrendingUp,
} as const;

export function SolutionsSlide({
  slideKey,
  keys,
}: {
  slideKey: "solutions";
  keys: ReadonlyArray<keyof typeof SOLUTION_ICONS>;
}) {
  const t = useTranslations(`taskFlow.slides.${slideKey}`);
  return (
    <SlideShell kicker={t("kicker")} title={t("title")}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {keys.map((key) => (
          <SlideCard
            key={key}
            icon={SOLUTION_ICONS[key]}
            title={t(`cards.${key}.title`)}
            text={t(`cards.${key}.text`)}
            tone="solution"
          />
        ))}
      </div>
    </SlideShell>
  );
}
