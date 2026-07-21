import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { SlideShell } from "../SlideShell";

export function CloserSlide() {
  const t = useTranslations("taskFlow.slides.closer");
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
      toneClass="bg-gradient-to-br from-background via-background to-primary/10"
    >
      <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
        {t("body")}
      </p>
      <Link
        href="/"
        className="mt-10 inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-md hover:shadow-lg transition-all"
      >
        {t("cta")}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </SlideShell>
  );
}
