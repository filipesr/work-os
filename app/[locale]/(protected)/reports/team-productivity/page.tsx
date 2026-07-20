import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import {
  getTeamThroughput,
  getTeamCurrentLoad,
  getStageDuration,
  getOnTimeRate,
} from "@/lib/actions/reporting";
import { OnTimeRateCard } from "@/components/reports/team-productivity/OnTimeRateCard";
import { ThroughputTable } from "@/components/reports/team-productivity/ThroughputTable";
import { CurrentLoadGrid } from "@/components/reports/team-productivity/CurrentLoadGrid";
import { StageDurationTable } from "@/components/reports/team-productivity/StageDurationTable";
import { PeriodSelector } from "./PeriodSelector";

export const metadata: Metadata = {
  title: "Produtividade por Equipe",
};

type Period = "week" | "month" | "custom";

interface PageProps {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
  }>;
}

function resolveRange(
  period: Period,
  from: string | undefined,
  to: string | undefined
): { from: Date; to: Date } {
  const now = new Date();
  if (period === "custom" && from && to) {
    const f = new Date(`${from}T00:00:00.000Z`);
    const t = new Date(`${to}T23:59:59.999Z`);
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f <= t) {
      return { from: f, to: t };
    }
  }
  if (period === "month") {
    const f = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: f, to: now };
  }
  const f = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: f, to: now };
}

async function OnTimeSection({ range }: { range: { from: Date; to: Date } }) {
  const data = await getOnTimeRate(range);
  return <OnTimeRateCard data={data} />;
}

async function ThroughputSection({ range }: { range: { from: Date; to: Date } }) {
  const rows = await getTeamThroughput(range);
  return <ThroughputTable rows={rows} />;
}

async function CurrentLoadSection() {
  const rows = await getTeamCurrentLoad();
  return <CurrentLoadGrid rows={rows} />;
}

async function StageDurationSection({ range }: { range: { from: Date; to: Date } }) {
  const rows = await getStageDuration(range);
  return <StageDurationTable rows={rows} />;
}

function SectionSkeleton() {
  return (
    <div className="bg-card border-2 border-border rounded-xl p-6">
      <div className="h-6 w-48 bg-muted rounded animate-pulse mb-3" />
      <div className="h-24 bg-muted rounded animate-pulse" />
    </div>
  );
}

export default async function TeamProductivityPage({ searchParams }: PageProps) {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const params = await searchParams;
  const period: Period =
    params.period === "month" || params.period === "custom" ? params.period : "week";
  const range = resolveRange(period, params.from, params.to);

  const t = await getTranslations("reportsTeam");

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-1">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="bg-card border-2 border-border rounded-xl p-4">
        <PeriodSelector period={period} from={params.from} to={params.to} />
      </div>

      <Suspense fallback={<SectionSkeleton />}>
        <OnTimeSection range={range} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <ThroughputSection range={range} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <CurrentLoadSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <StageDurationSection range={range} />
      </Suspense>
    </div>
  );
}
