import { useTranslations } from "next-intl";
import { GitBranch, GitMerge } from "lucide-react";
import { SlideShell } from "../SlideShell";
import { StepCard } from "../StepCard";

export function ForkJoinSlide() {
  const t = useTranslations("taskFlow.slides.forkJoin");
  const keys = ["5", "6", "7"] as const;
  const accents = { "5": "primary", "6": "fork", "7": "join" } as const;
  const icons = { "6": GitBranch, "7": GitMerge } as const;
  return (
    <SlideShell kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")}>
      <div className="space-y-4">
        {keys.map((key) => (
          <StepCard
            key={key}
            badge={t(`steps.${key}.badge`)}
            title={t(`steps.${key}.title`)}
            actor={t(`steps.${key}.actor`)}
            text={t(`steps.${key}.text`)}
            accent={accents[key]}
            icon={icons[key as "6" | "7"]}
          />
        ))}
      </div>
    </SlideShell>
  );
}
