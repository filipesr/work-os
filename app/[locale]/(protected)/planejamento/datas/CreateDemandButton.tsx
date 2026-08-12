"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { BatchCreateDialog } from "@/components/planejamento/calendario/BatchCreateDialog";
import type {
  ClientOption,
  ProjectOption,
  TemplateOption,
} from "@/components/planejamento/calendario/monthly-types";

/**
 * "Criar demanda nesta data" na lista de datas.
 *
 * Reusa o mesmo diálogo de lote do calendário mensal — a ação é idêntica
 * (escolher template, título e vários projetos de uma vez), e uma segunda
 * implementação divergiria na primeira mudança.
 *
 * Passa o `occurrenceId`: as demandas nascem VINCULADAS à data, então a
 * cobertura da linha sobe sozinha, sem ninguém confirmar nada depois.
 */
export function CreateDemandButton({
  occurrenceId,
  date,
  eventTitle,
  clients,
  projects,
  templates,
}: {
  occurrenceId: string;
  date: string;
  eventTitle: string;
  clients: ClientOption[];
  projects: ProjectOption[];
  templates: TemplateOption[];
}) {
  const t = useTranslations("planning.dates");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("createDemand")}
        title={t("createDemand")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {t("createDemand")}
      </button>
      {open && (
        <BatchCreateDialog
          date={date}
          eventTitle={eventTitle}
          occurrenceId={occurrenceId}
          clients={clients}
          projects={projects}
          templates={templates}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
