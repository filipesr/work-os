import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function RootNotFound() {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <h2 className="text-xl font-semibold text-foreground">{t("notFound.pageTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("notFound.pageDescription")}</p>
        <div className="flex justify-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {t("notFound.toDashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
}
