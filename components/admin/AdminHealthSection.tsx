import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import TeamLoadBalance from "@/components/admin/TeamLoadBalance";
import AgingQueue from "@/components/admin/AgingQueue";
import BlockedQueue from "@/components/admin/BlockedQueue";
import SystemConstraint from "@/components/admin/SystemConstraint";
import WipLimits from "@/components/admin/WipLimits";
import BurnoutSignals from "@/components/admin/BurnoutSignals";
import OneOnOneCadence from "@/components/admin/OneOnOneCadence";
import WeeklyReview, { type ReviewStep } from "@/components/admin/WeeklyReview";
import { CurrentLoadGrid } from "@/components/reports/team-productivity/CurrentLoadGrid";
import { getTeamCurrentLoad } from "@/lib/actions/reporting";

function CardSkeleton() {
  return <div className="bg-card rounded-xl border border-border p-6 h-48 animate-pulse" />;
}

// §3.1 MOVER: carga ao vivo por time (in-progress on-track/atenção/atrasado). É
// ops (exceção ao vivo, P6), não histórico — por isso vem dos relatórios para o
// cockpit. Origem: components/reports/team-productivity/CurrentLoadGrid.tsx.
async function CurrentLoadSection() {
  const rows = await getTeamCurrentLoad();
  return <CurrentLoadGrid rows={rows} />;
}

export async function AdminHealthSection() {
  const t = await getTranslations("admin.health");
  // Each step links (new tab) to the screen where that signal is checked in
  // depth. Live-triage signals (constraint, blocked, 1:1) live on this cockpit.
  const reviewSteps: ReviewStep[] = [
    { label: t("review.constraint"), href: "/reports/performance" },
    { label: t("review.aging"), href: "/planejamento/calendario" },
    { label: t("review.blocked") },
    { label: t("review.wip"), href: "/reports/performance" },
    { label: t("review.load"), href: "/reports/performance" },
    { label: t("review.burnout"), href: "/reports/productivity" },
    { label: t("review.oneOnOne") },
  ];
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-foreground mb-4">{t("title")}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WeeklyReview
          title={t("review.title")}
          subtitle={t("review.subtitle")}
          openLabel={t("review.open")}
          steps={reviewSteps}
        />
        <Suspense fallback={<CardSkeleton />}>
          <OneOnOneCadence />
        </Suspense>
        <div className="lg:col-span-2">
          <Suspense fallback={null}>
            <SystemConstraint />
          </Suspense>
        </div>
        <div className="lg:col-span-2">
          <Suspense fallback={<CardSkeleton />}>
            <CurrentLoadSection />
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
        <div className="lg:col-span-2">
          <Suspense fallback={null}>
            <BurnoutSignals />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
