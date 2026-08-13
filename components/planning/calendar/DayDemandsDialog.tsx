"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DemandTaskCard } from "./DemandTaskCard";
import type { DemandTask } from "./monthly-types";

interface DayDemandsDialogProps {
  clientName: string;
  dateLabel: string;
  tasks: DemandTask[];
  onClose: () => void;
}

export function DayDemandsDialog({ clientName, dateLabel, tasks, onClose }: DayDemandsDialogProps) {
  const t = useTranslations("reportsCalendar.monthly.dayDemands");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("title", { client: clientName })}</DialogTitle>
          <DialogDescription>
            {t("subtitle", { count: tasks.length, date: dateLabel })}
          </DialogDescription>
        </DialogHeader>

        {tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto py-2">
            {tasks.map((task) => (
              <DemandTaskCard key={task.id} task={task} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
