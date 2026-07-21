import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { SlideShell } from "../SlideShell";

export function BonusSlide({
  slideKey,
  items,
}: {
  slideKey: "bonus1" | "bonus2";
  items: ReadonlyArray<{ key: string; href: string; icon: LucideIcon }>;
}) {
  const t = useTranslations(`taskFlow.slides.${slideKey}`);
  return (
    <SlideShell kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {items.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            className="group bg-card border-2 border-amber-500/40 rounded-2xl p-6 text-left flex flex-col hover:border-amber-500/70 hover:shadow-xl transition-all"
          >
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 mb-4">
              <Icon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2 leading-tight">
              {t(`cards.${key}.title`)}
            </h3>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed flex-1">
              {t(`cards.${key}.text`)}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
              {t(`cards.${key}.cta`)}
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </SlideShell>
  );
}
