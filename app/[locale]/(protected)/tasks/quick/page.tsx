import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getQuickTemplates } from "@/lib/actions/quick-task";
import { getProjectsForSelect } from "@/lib/actions/task";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { QuickTaskForm } from "./QuickTaskForm";

export const metadata: Metadata = { title: "Registro rápido" };

export default async function QuickTaskPage() {
  const [t, templates, projects] = await Promise.all([
    getTranslations("tasks.quick"),
    getQuickTemplates(),
    getProjectsForSelect(),
  ]);

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <PageHeader kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")} />
      <SectionCard bodyClassName="p-6">
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noTemplates")}</p>
        ) : (
          <QuickTaskForm templates={templates} projects={projects} />
        )}
      </SectionCard>
    </div>
  );
}
