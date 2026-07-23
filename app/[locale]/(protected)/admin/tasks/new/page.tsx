import { getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { CreateTaskForm } from "@/components/tasks/CreateTaskForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { getTranslations } from "next-intl/server";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const t = await getTranslations("admin.tasks.new");
  const { projectId } = await searchParams;

  const [projects, templates] = await Promise.all([
    getProjectsForSelect(),
    getTemplatesForSelect(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")} />

      <CreateTaskForm projects={projects} templates={templates} defaultProjectId={projectId} />
    </div>
  );
}
