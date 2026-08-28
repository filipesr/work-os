"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HandHelping } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Button } from "@/components/ui/button";
import { pullStageToMe } from "@/lib/actions/my-week";
import { useServerAction } from "@/lib/hooks/useServerAction";

/** Assumir uma etapa do poço, escolhendo o dia. Diálogo e não arrasto: a lista é curta, e mirar uma
 *  célula no celular é pior do que escolher de um select — e esta é a tela que mais será aberta do
 *  celular. */
export function PullDialog({
  activeStageId,
  label,
  days,
  defaultDay,
}: {
  activeStageId: string;
  label: string;
  days: string[];
  defaultDay: string;
}) {
  const t = useTranslations("planning.myWeek");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dateISO, setDateISO] = useState(defaultDay);

  const { run, isPending } = useServerAction(pullStageToMe, {
    successMessage: t("pulled_toast"),
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
          <HandHelping className="h-3.5 w-3.5" />
          {t("pull")}
        </Button>
      }
      title={t("pullTitle")}
      description={label}
      formId="pull-stage-form"
      submitLabel={t("pullSubmit")}
      isPending={isPending}
    >
      <form
        id="pull-stage-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(activeStageId, dateISO);
        }}
      >
        <div>
          <FieldLabel htmlFor="pull-day" required>
            {t("pullDay")}
          </FieldLabel>
          <select
            id="pull-day"
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
