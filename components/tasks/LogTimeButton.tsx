"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { LogTimeForm } from "./LogTimeForm";

interface LogTimeButtonProps {
  taskId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Repassada ao formulário — ver `LogTimeForm`/`logTime`. */
  activeStageId?: string;
}

export function LogTimeButton({
  taskId,
  open: controlledOpen,
  onOpenChange,
  activeStageId,
}: LogTimeButtonProps) {
  // `tasks.actions` é o namespace dos rótulos de ação da demanda, e `logTime` já existia lá —
  // criada para o menu suspenso que sumiu com a tela da etapa. O rótulo estava cravado em
  // português aqui: a paridade de locales não o via, porque não estava em locale nenhum.
  const t = useTranslations("tasks.actions");
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };

  // If controlled via props, don't render button (only modal/form)
  const isControlled = controlledOpen !== undefined;

  return (
    <div className="space-y-3">
      {!isControlled && !isOpen && (
        <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
          <Clock className="h-4 w-4 mr-2" />
          {t("logTime")}
        </Button>
      )}

      {isOpen && (
        <div className="border rounded-lg p-4 bg-card">
          <LogTimeForm
            taskId={taskId}
            onClose={() => setIsOpen(false)}
            activeStageId={activeStageId}
          />
        </div>
      )}
    </div>
  );
}
