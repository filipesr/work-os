import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import TeamLoadBalance from "@/components/admin/TeamLoadBalance";
import AgingQueue from "@/components/admin/AgingQueue";
import BlockedQueue from "@/components/admin/BlockedQueue";
import SystemConstraint from "@/components/admin/SystemConstraint";

function CardSkeleton() {
  return <div className="bg-card rounded-xl border-2 border-border p-6 h-48 animate-pulse" />;
}

export async function AdminHealthSection() {
  const t = await getTranslations("admin.health");
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-foreground mb-4">{t("title")}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      </div>
    </section>
  );
}
