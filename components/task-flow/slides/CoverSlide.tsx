import { useTranslations } from "next-intl";
import { SlideShell } from "../SlideShell";

export function CoverSlide() {
  const t = useTranslations("taskFlow.slides.cover");
  return (
    <SlideShell
      kicker={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
      toneClass="bg-gradient-to-br from-primary/10 via-background to-background"
    >
      <p className="text-sm text-muted-foreground mt-6 animate-pulse">{t("hint")}</p>
    </SlideShell>
  );
}
