import { getTranslations } from "next-intl/server";

export default async function LocaleLoading() {
  const t = await getTranslations("common");
  return (
    <div
      role="status"
      aria-label={t("common.loadingLabel")}
      className="min-h-screen flex items-center justify-center bg-background"
    >
      <div className="h-10 w-10 rounded-full border-4 border-muted border-t-primary animate-spin" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}
