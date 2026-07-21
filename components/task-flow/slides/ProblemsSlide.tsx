import { useTranslations } from "next-intl";
import { Calendar, Eye, MessageSquareWarning, PauseCircle, TrendingDown } from "lucide-react";
import { SlideShell } from "../SlideShell";
import { SlideCard } from "../SlideCard";

const PROBLEM_ICONS = {
  doing: Eye,
  planned: Calendar,
  assignment: MessageSquareWarning,
  parallel: PauseCircle,
  metrics: TrendingDown,
} as const;

export function ProblemsSlide({
  slideKey,
  keys,
}: {
  slideKey: "problems";
  keys: ReadonlyArray<keyof typeof PROBLEM_ICONS>;
}) {
  const t = useTranslations(`taskFlow.slides.${slideKey}`);
  return (
    <SlideShell kicker={t("kicker")} title={t("title")}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {keys.map((key) => (
          <SlideCard
            key={key}
            icon={PROBLEM_ICONS[key]}
            title={t(`cards.${key}.title`)}
            text={t(`cards.${key}.text`)}
            tone="problem"
          />
        ))}
      </div>
    </SlideShell>
  );
}
