"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { BatchCreateDialog } from "./BatchCreateDialog";
import type { ClientOption, ProjectOption, TemplateOption } from "./monthly-types";

/**
 * "Criar demanda neste dia" na visão SEMANAL. O mês já abria o
 * `BatchCreateDialog` a partir de um dia; a semana não tinha nenhum caminho de
 * criação — o gestor via um buraco na agenda e precisava sair da tela para
 * preenchê-lo. Mesmo diálogo (inclusive lote para vários projetos), mesma data
 * pré-preenchida.
 *
 * Só é renderizado com o modo planejamento ligado — o caller decide.
 */
export function DayCreateButton({
  date,
  clients,
  projects,
  templates,
}: {
  /** Dia (ISO YYYY-MM-DD) que vira o vencimento pré-preenchido. */
  date: string;
  clients: ClientOption[];
  projects: ProjectOption[];
  templates: TemplateOption[];
}) {
  const t = useTranslations("reportsCalendar.planning");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("createOnDay")}
        title={t("createOnDay")}
        className="mx-auto mt-1 inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-card text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Plus className="h-3 w-3" />
      </button>
      {open && (
        <BatchCreateDialog
          date={date}
          clients={clients}
          projects={projects}
          templates={templates}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
