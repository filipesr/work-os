import { notFound } from "next/navigation";
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
import { BackLink } from "@/components/ui/BackLink";
import { SectionCard } from "@/components/ui/SectionCard";
import { getTranslations } from "next-intl/server";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const t = await getTranslations("admin.workflows.detail");
  const { templateId } = await params;
  const template = await getWorkflowTemplate(templateId);
  const teams = await getTeamsForSelect();

  if (!template) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <BackLink href="/admin/templates" label={t("backToTemplates")} className="mb-6" />

      {/* Template Header - Name, Description, Delete */}
      <TemplateHeader template={template} />

      {/* Stages Section */}
      <SectionCard
        title={t("workflowStages")}
        subtitle={t("workflowStagesDescription")}
        className="mt-8"
      >
        {/* Create New Stage Form */}
        <CreateStageForm
          templateId={template.id}
          teams={teams}
          existingStages={template.stages.map((s) => ({ id: s.id, name: s.name, order: s.order }))}
        />

        {/* Stages List */}
        <div className="mt-8">
          <StagesList stages={template.stages} templateId={template.id} teams={teams} />
        </div>
      </SectionCard>

      {/* Workflow Visualization */}
      {template.stages.length > 0 && (
        <div className="mt-8">
          <WorkflowVisualization stages={template.stages} />
        </div>
      )}
    </div>
  );
}
