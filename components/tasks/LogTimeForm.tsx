"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { logTime } from "@/lib/actions/task";
import { Clock, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";

interface LogTimeFormProps {
  taskId: string;
  onClose?: () => void;
  /** A etapa (TaskActiveStage) sendo mostrada na tela que abriu este formulário — repassada a
   *  `logTime` para não adivinhar a etapa (ver `lib/actions/task.ts#logTime`). `undefined` quando
   *  o formulário é aberto sem contexto de etapa (ex.: fora da tela da etapa). */
  activeStageId?: string;
}

export function LogTimeForm({ taskId, onClose, activeStageId }: LogTimeFormProps) {
  const t = useTranslations("tasks.timeLogs.form");
  const tCommon = useTranslations("common");
  const [hoursSpent, setHoursSpent] = useState("");
  const [logDate, setLogDate] = useState(
    new Date().toISOString().split("T")[0] // Default to today
  );
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const hours = parseFloat(hoursSpent);

    if (!hours || hours <= 0) {
      toast.error(t("invalidHours"));
      return;
    }

    if (!logDate) {
      toast.error(t("selectDate"));
      return;
    }

    startTransition(async () => {
      const result = await logTime(
        taskId,
        hours,
        new Date(logDate),
        description || undefined,
        activeStageId
      );

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(t("success", { hours }));
        // Clear the form
        setHoursSpent("");
        setLogDate(new Date().toISOString().split("T")[0]);
        setDescription("");
        // Call onClose if provided
        if (onClose) {
          onClose();
        }
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          <h3 className="font-semibold text-lg">{t("title")}</h3>
        </div>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isPending}
            aria-label={tCommon("buttons.close")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="hoursSpent">
          {t("hoursLabel")} <span className="text-danger">*</span>
        </Label>
        <Input
          id="hoursSpent"
          type="number"
          step="0.5"
          min="0.5"
          value={hoursSpent}
          onChange={(e) => setHoursSpent(e.target.value)}
          placeholder={t("hoursPlaceholder")}
          disabled={isPending}
          required
        />
        <p className="text-xs text-muted-foreground">{t("hoursHint")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="logDate">
          {t("dateLabel")} <span className="text-danger">*</span>
        </Label>
        <Input
          id="logDate"
          type="date"
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
          disabled={isPending}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t("descriptionLabel")}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          disabled={isPending}
          rows={3}
          className="resize-none"
        />
      </div>

      <div className="flex gap-2 justify-end">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            {tCommon("buttons.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={isPending || !hoursSpent || !logDate}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isPending ? t("pending") : t("title")}
        </Button>
      </div>
    </form>
  );
}
