"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarPlus } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Button } from "@/components/ui/button";
import { scheduleStage } from "@/lib/actions/week-planning";
import { useServerAction } from "@/lib/hooks/useServerAction";

/** Programar por diálogo, não arrastando.
 *
 *  Não há biblioteca de drag no projeto, e arrastar é a parte que os testes menos alcançam. Numa
 *  grade larga de pessoas × dias, escolher de uma lista é mais preciso que mirar uma célula — e a
 *  fatia 2, que é onde arrastar de fato importa, nasce podendo adotá-lo por cima disto. */
export function ScheduleDialog({
  activeStageId,
  label,
  teamName,
  people,
  days,
}: {
  activeStageId: string;
  label: string;
  /** A equipe efetiva da etapa; nula na coringa que ninguém roteou. */
  teamName: string | null;
  /** Quem pode receber a etapa — já recortado pela equipe. A tela explica, o servidor garante:
   *  `scheduleStage` recusa de novo, porque uma lista de opções não é uma regra. */
  people: { id: string; name: string }[];
  days: string[];
}) {
  const t = useTranslations("planning.week");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(people[0]?.id ?? "");
  const [dateISO, setDateISO] = useState(days[0] ?? "");

  const { run, isPending } = useServerAction(scheduleStage, {
    successMessage: t("scheduled_toast"),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <CalendarPlus className="h-3.5 w-3.5" />
          {t("schedule")}
        </Button>
      }
      title={t("dialogTitle")}
      description={label}
      formId="schedule-stage-form"
      submitLabel={t("dialogSubmit")}
      isPending={isPending}
    >
      <form
        id="schedule-stage-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run({ activeStageId, userId, dateISO });
        }}
      >
        <div>
          <FieldLabel htmlFor="sd-person" required>
            {t("dialogPerson")}
          </FieldLabel>
          {/* De quem é o trabalho, dito antes de perguntar para quem vai. Sem isto, a lista curta
              parecia arbitrária: o gestor não via POR QUE aquelas pessoas e não as outras. */}
          {teamName && (
            <p className="mb-1 text-xs text-muted-foreground">
              {t("dialogTeam", { team: teamName })}
            </p>
          )}
          {people.length === 0 && (
            <p className="mb-1 text-xs text-danger">{t("dialogNoOneInTeam")}</p>
          )}
          <select
            id="sd-person"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="sd-day" required>
            {t("dialogDay")}
          </FieldLabel>
          <select
            id="sd-day"
            value={dateISO}
            onChange={(e) => setDateISO(e.target.value)}
            className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </form>
    </FormDialog>
  );
}
