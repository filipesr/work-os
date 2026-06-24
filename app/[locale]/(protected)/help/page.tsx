import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("help");
  return { title: t("hub.title") };
}

const GUIDE_KEYS = ["templates", "projetos", "colaborador"] as const;

export default async function HelpPage() {
  const t = await getTranslations("help");

  return (
    <div className="container mx-auto max-w-3xl p-8">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t("hub.title")}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{t("hub.subtitle")}</p>
      </header>

      <div className="space-y-4">
        {GUIDE_KEYS.map((key) => (
          <Link
            key={key}
            href={`/help/${key}`}
            className="group flex items-center gap-5 rounded-xl border-2 border-border bg-card p-6 hover:border-primary/60 hover:shadow-md transition-all"
          >
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold">
              {t(`hub.guides.${key}.badge`)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-foreground mb-1">
                {t(`hub.guides.${key}.title`)}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`hub.guides.${key}.description`)}
              </p>
            </div>
            <span className="flex-none inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2.5 transition-all">
              {t("hub.openGuide")}
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
