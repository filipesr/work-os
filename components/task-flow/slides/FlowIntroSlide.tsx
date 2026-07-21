import { useTranslations } from "next-intl";
import { MessageSquareWarning } from "lucide-react";
import { SlideShell } from "../SlideShell";
import { StepCard } from "../StepCard";

export function FlowIntroSlide() {
  const t = useTranslations("taskFlow.slides.flowIntro");
  const keys = ["1", "2", "3", "4"] as const;
  const accents = { "1": "primary", "2": "primary", "3": "primary", "4": "loop" } as const;
  const icons = { "4": MessageSquareWarning } as const;
  return (
    <SlideShell kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")}>
      <div className="mb-6 inline-flex items-center justify-center mx-auto bg-muted px-4 py-2 rounded-lg text-sm font-mono text-foreground">
        {t("stages")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {keys.map((key) => (
          <StepCard
            key={key}
            badge={t(`steps.${key}.badge`)}
            title={t(`steps.${key}.title`)}
            actor={t(`steps.${key}.actor`)}
            text={t(`steps.${key}.text`)}
            accent={accents[key]}
            icon={icons[key as "4"]}
          />
        ))}
      </div>
    </SlideShell>
  );
}
