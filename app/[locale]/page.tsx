import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function Home() {
  const session = await auth();

  // Redirect authenticated users to dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  const t = await getTranslations("common");

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-center py-16 px-4">
        <div className="text-center max-w-4xl">
          <h1 className="text-5xl font-bold mb-4 text-foreground bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Work OS
          </h1>
          <p className="text-xl text-muted-foreground mb-12 font-medium">{t("home.subtitle")}</p>

          <div className="space-y-6">
            <p className="text-lg text-muted-foreground">{t("home.loginPrompt")}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/auth/signin"
                className="inline-block px-8 py-3.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-md hover:shadow-lg transition-all duration-200"
              >
                {t("home.login")}
              </Link>
              <Link
                href="/next"
                className="inline-block px-8 py-3.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/90 shadow-md hover:shadow-lg transition-all duration-200"
              >
                {t("home.viewPresentation")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
