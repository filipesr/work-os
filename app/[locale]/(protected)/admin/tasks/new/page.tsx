import Link from "next/link";
import { getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { CreateTaskForm } from "@/components/tasks/CreateTaskForm";
import { getTranslations } from "next-intl/server";

export default async function NewTaskPage() {
  const t = await getTranslations("admin.tasks.new");

  const [projects, templates] = await Promise.all([
    getProjectsForSelect(),
    getTemplatesForSelect(),
  ]);

  return (
    <div className="container mx-auto p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/tasks"
          className="inline-flex items-center text-primary hover:text-primary/80 mb-4 font-semibold transition-colors"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M15 19l-7-7 7-7" />
          </svg>
          {t("backToTasks")}
        </Link>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Form */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
        <CreateTaskForm projects={projects} templates={templates} />
      </div>

      {/* Help Text */}
      <div className="mt-6 bg-primary/5 border-2 border-primary/20 rounded-xl p-5">
        <h3 className="text-sm font-bold text-foreground mb-3">{t("howItWorks.title")}</h3>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
          <li>{t("howItWorks.step1")}</li>
          <li>{t("howItWorks.step2")}</li>
          <li>{t("howItWorks.step3")}</li>
          <li>{t("howItWorks.step4")}</li>
          <li>{t("howItWorks.step5")}</li>
        </ul>
      </div>
    </div>
  );
}
