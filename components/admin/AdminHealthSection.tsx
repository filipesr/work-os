import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import TeamLoadBalance from "@/components/admin/TeamLoadBalance";
import AgingQueue from "@/components/admin/AgingQueue";
import BlockedQueue from "@/components/admin/BlockedQueue";
import SystemConstraint from "@/components/admin/SystemConstraint";
import WipLimits from "@/components/admin/WipLimits";
import BurnoutSignals from "@/components/admin/BurnoutSignals";
import OneOnOneCadence from "@/components/admin/OneOnOneCadence";
import WeeklyReview from "@/components/admin/WeeklyReview";

function CardSkeleton() {
  return <div className="bg-card rounded-xl border-2 border-border p-6 h-48 animate-pulse" />;
}

export async function AdminHealthSection() {
  const t = await getTranslations("admin.health");
  const reviewSteps = [
    t("review.constraint"),
    t("review.aging"),
    t("review.blocked"),
    t("review.wip"),
    t("review.load"),
    t("review.burnout"),
    t("review.oneOnOne"),
  ];
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-foreground mb-4">{t("title")}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <WeeklyReview
            title={t("review.title")}
            subtitle={t("review.subtitle")}
            steps={reviewSteps}
          />
        </div>
        <div className="lg:col-span-2">
          <Suspense fallback={null}>
            <SystemConstraint />
          </Suspense>
        </div>
        <div className="lg:col-span-2">
          <Suspense fallback={<CardSkeleton />}>
            <TeamLoadBalance />
          </Suspense>
        </div>
        <Suspense fallback={<CardSkeleton />}>
          <AgingQueue />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <BlockedQueue />
        </Suspense>
        <div className="lg:col-span-2">
          <Suspense fallback={null}>
            <WipLimits />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <BurnoutSignals />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <OneOnOneCadence />
        </Suspense>
      </div>
    </section>
  );
}
