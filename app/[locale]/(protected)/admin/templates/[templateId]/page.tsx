import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getWorkflowTemplate,
  updateWorkflowTemplate,
  deleteWorkflowTemplate,
} from "@/lib/actions/template";
import { getTeamsForSelect } from "@/lib/actions/stage";
import { StagesList } from "@/components/admin/StagesList";
import { CreateStageForm } from "@/components/admin/CreateStageForm";
import { TemplateHeader } from "@/components/admin/TemplateHeader";
import { WorkflowVisualization } from "@/components/admin/WorkflowVisualization";
import { getTranslations } from "next-intl/server";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const t = await getTranslations("template.detail");
  const { templateId } = await params;
  const template = await getWorkflowTemplate(templateId);
  const teams = await getTeamsForSelect();

  if (!template) {
    notFound();
  }

  return (
    <div className="container mx-auto p-8">
      {/* Back link */}
      <Link
        href="/admin/templates"
        className="inline-flex items-center text-primary hover:text-primary/80 mb-6 font-medium transition-colors"
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
        {t("backToTemplates")}
      </Link>

      {/* Template Header - Name, Description, Delete */}
      <TemplateHeader template={template} />

      {/* Stages Section */}
      <div className="mt-8 bg-card border border-border shadow-sm rounded-lg p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-3">{t("workflowStages")}</h2>
          <p className="text-muted-foreground">
            {t("workflowStagesDescription")}
          </p>
        </div>

        {/* Create New Stage Form */}
        <CreateStageForm
          templateId={template.id}
          teams={teams}
          existingStages={template.stages.map(s => ({ id: s.id, name: s.name, order: s.order }))}
        />

        {/* Stages List */}
        <div className="mt-8">
          <StagesList
            stages={template.stages}
            templateId={template.id}
            teams={teams}
          />
        </div>
      </div>

      {/* Workflow Visualization */}
      {template.stages.length > 0 && (
        <div className="mt-8">
          <WorkflowVisualization stages={template.stages} />
        </div>
      )}
    </div>
  );
}
