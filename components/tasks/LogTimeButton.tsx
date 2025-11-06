"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { LogTimeForm } from "./LogTimeForm";

interface LogTimeButtonProps {
  taskId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LogTimeButton({
  taskId,
  open: controlledOpen,
  onOpenChange,
}: LogTimeButtonProps) {
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
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setIsOpen(true)}
        >
          <Clock className="h-4 w-4 mr-2" />
          Registrar Tempo
        </Button>
      )}

      {isOpen && (
        <div className="border rounded-lg p-4 bg-card">
          <LogTimeForm taskId={taskId} onClose={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}
