import { useTranslations } from "next-intl";
import { SlideShell } from "../SlideShell";

export function PremiseSlide() {
  const t = useTranslations("taskFlow.slides.premise");
  return (
    <SlideShell
      kicker={t("kicker")}
      title={
        <>
          {t("title")}
          <br />
          <span className="text-primary">{t("highlight")}</span>
        </>
      }
    >
      <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
        {t("body")}
      </p>
    </SlideShell>
  );
}
