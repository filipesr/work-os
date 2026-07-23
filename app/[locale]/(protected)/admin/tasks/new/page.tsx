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
      <header className="mb-6 max-w-3xl">
        <p className="text-sm font-medium text-primary">{t("kicker")}</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
      </header>

      <CreateTaskForm projects={projects} templates={templates} defaultProjectId={projectId} />
    </div>
  );
}
