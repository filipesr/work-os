import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import {
  TrendingUp,
  Clock,
  CalendarRange,
  Activity,
  UsersRound,
  ChevronRight,
  Info,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { UserReportPicker } from "@/components/reports/UserReportPicker";

export const metadata: Metadata = {
  title: "Relatórios",
};

const REPORT_LINKS: { key: string; href: string; icon: LucideIcon }[] = [
  { key: "performance", href: "/reports/performance", icon: TrendingUp },
  { key: "productivity", href: "/reports/productivity", icon: Clock },
  { key: "calendar", href: "/planning/calendar", icon: CalendarRange },
  { key: "liveActivity", href: "/reports/live-activity", icon: Activity },
];

export default async function ReportsIndexPage() {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const t = await getTranslations("reports.index");

  const collaborators = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  const collaboratorOptions = collaborators.map((u) => ({
    id: u.id,
    name: u.name ?? u.email ?? u.id,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")} />

      <div className="space-y-6">
        {/* Person analytics — the canonical per-person entry point */}
        <SectionCard
          title={t("userReport.title")}
          subtitle={t("userReport.description")}
          icon={UsersRound}
        >
          <div className="max-w-sm">
            <UserReportPicker
              users={collaboratorOptions}
              placeholder={t("userReport.pickerPlaceholder")}
            />
          </div>
        </SectionCard>

        {/* Other report surfaces */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("exploreHeading")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {REPORT_LINKS.map(({ key, href, icon: Icon }) => (
              <Link
                key={key}
                href={href}
                className="group flex items-start gap-3 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-foreground">{t(`${key}.title`)}</h3>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`${key}.description`)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Guide */}
        <SectionCard title={t("guide.title")} icon={Info}>
          <div className="space-y-3 text-sm">
            <div>
              <p className="mb-1 font-semibold text-foreground">{t("guide.productivityLabel")}</p>
              <p className="text-muted-foreground">{t("guide.productivityText")}</p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-foreground">{t("guide.performanceLabel")}</p>
              <p className="text-muted-foreground">{t("guide.performanceText")}</p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-foreground">{t("guide.liveActivityLabel")}</p>
              <p className="text-muted-foreground">{t("guide.liveActivityText")}</p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-foreground">{t("guide.tipLabel")}</p>
              <p className="text-muted-foreground">{t("guide.tipText")}</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
