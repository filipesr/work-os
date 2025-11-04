"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { LogTimeForm } from "./LogTimeForm";

interface LogTimeButtonProps {
  taskId: string;
}

export function LogTimeButton({ taskId }: LogTimeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-3">
      {!isOpen ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setIsOpen(true)}
        >
          <Clock className="h-4 w-4 mr-2" />
          Registrar Tempo
        </Button>
      ) : (
        <div className="border rounded-lg p-4 bg-card">
          <LogTimeForm taskId={taskId} onClose={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}
