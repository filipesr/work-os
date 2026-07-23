import { getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { CreateTaskForm } from "@/components/tasks/CreateTaskForm";
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
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-semibold text-primary">{t("kicker")}</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <CreateTaskForm projects={projects} templates={templates} defaultProjectId={projectId} />
    </div>
  );
}
