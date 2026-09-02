"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Button } from "@/components/ui/button";
import { setStageWindow } from "@/lib/actions/week-planning";
import { useServerAction } from "@/lib/hooks/useServerAction";

/** Marca (ou desmarca) o compromisso fixo de uma etapa já programada — o studio às 14h que a
 *  grade não sabe representar como número de horas.
 *
 *  `setStageWindow` é a mesma porta para os dois casos: marcar manda `startTime`, desmarcar manda
 *  `startTime: null`. Dois `useServerAction` sobre a mesma action, não um só, porque cada caminho
 *  fecha com um toast diferente — "marcado" e "desmarcado" não são a mesma frase. */
export function WindowDialog({
  activeStageId,
  label,
  startTime,
  endTime,
}: {
  activeStageId: string;
  label: string;
  /** "14:00" no relógio de São Paulo, ou nula se a etapa não tem compromisso. */
  startTime: string | null;
  endTime: string | null;
}) {
  const t = useTranslations("planning.week");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Inicializado da prop, não sincronizado depois: reabrir o diálogo precisa mostrar o horário que
  // já está marcado (ver comentário no teste), e o diálogo nasce fechado a cada montagem da célula.
  const [start, setStart] = useState(startTime ?? "");
  const [end, setEnd] = useState(endTime ?? "");

  const fecharEAtualizar = () => {
    setOpen(false);
    router.refresh();
  };

  const marcar = useServerAction(setStageWindow, {
    successMessage: t("windowSet_toast"),
    onSuccess: fecharEAtualizar,
  });
  const desmarcar = useServerAction(setStageWindow, {
    successMessage: t("windowCleared_toast"),
    onSuccess: fecharEAtualizar,
  });
  const isPending = marcar.isPending || desmarcar.isPending;

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button type="button" variant="outline" size="sm" aria-label={t("windowOpen")}>
          <Clock className="h-3.5 w-3.5" />
        </Button>
      }
      title={t("windowTitle")}
      description={label}
      formId="window-form"
      submitLabel={t("windowSubmit")}
      isPending={isPending}
    >
      <form
        id="window-form"
        data-testid="window-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          marcar.run({ activeStageId, startTime: start, endTime: end || null });
        }}
      >
        <div>
          <FieldLabel htmlFor="wd-start">{t("windowStart")}</FieldLabel>
          <input
            id="wd-start"
            type="time"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
          />
        </div>
        <div>
          <FieldLabel htmlFor="wd-end">{t("windowEnd")}</FieldLabel>
          <input
            id="wd-end"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
          />
          {/* Sem o fim, a etapa não fica sem duração: o servidor fecha a janela pela referência
              dela. Quem olha o formulário precisa saber disso antes de deixar o campo em branco. */}
          <p className="mt-1 text-xs text-muted-foreground">{t("windowEndHint")}</p>
        </div>
        {/* Só existe o que desmarcar quando já há um compromisso — a prop original, não o estado
            do formulário, porque é o servidor que decide se há algo para limpar. */}
        {startTime !== null && (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => desmarcar.run({ activeStageId, startTime: null })}
          >
            {t("windowClear")}
          </Button>
        )}
      </form>
    </FormDialog>
  );
}
