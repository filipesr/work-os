import type { Metadata } from "next";
import { Workflow } from "lucide-react";
import { getWorkflowTemplates, createWorkflowTemplate } from "@/lib/actions/template";
import { getTranslations } from "next-intl/server";
import { SimpleEntityCrudList, type CrudItem } from "@/components/admin/SimpleEntityCrudList";

export const metadata: Metadata = {
  title: "Templates",
};

function formatDate(value: Date | string): string {
  const date = new Date(value);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

export default async function TemplatesPage() {
  const templates = await getWorkflowTemplates();
  const t = await getTranslations("admin.workflows");

  const items: CrudItem[] = templates.map((template: any) => ({
    id: template.id,
    href: `/admin/templates/${template.id}`,
    title: template.name,
    description: template.description || t("noDescription"),
    meta: `${t("stagesCount", { count: template._count.stages })} · ${t("created", {
      date: formatDate(template.createdAt),
    })}`,
  }));

  return (
    <SimpleEntityCrudList
      kicker={t("kicker")}
      title={t("title")}
      subtitle={t("subtitle")}
      createTitle={t("createTitle")}
      createAction={createWorkflowTemplate}
      createFields={[
        {
          name: "name",
          label: t("nameLabel"),
          placeholder: t("namePlaceholder"),
          required: true,
        },
        {
          name: "description",
          label: t("descriptionLabel"),
          placeholder: t("descriptionPlaceholder"),
          type: "textarea",
        },
      ]}
      createButtonLabel={t("createButton")}
      items={items}
      emptyLabel={t("noTemplates")}
      emptyIcon={Workflow}
    />
  );
}
