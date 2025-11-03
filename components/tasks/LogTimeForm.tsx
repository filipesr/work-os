"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { logTime } from "@/lib/actions/task";
import { Clock, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LogTimeFormProps {
  taskId: string;
  onClose?: () => void;
}

export function LogTimeForm({ taskId, onClose }: LogTimeFormProps) {
  const [hoursSpent, setHoursSpent] = useState("");
  const [logDate, setLogDate] = useState(
    new Date().toISOString().split("T")[0] // Default to today
  );
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const hours = parseFloat(hoursSpent);

    if (!hours || hours <= 0) {
      toast({
        title: "Erro",
        description: "Por favor, insira um valor válido para as horas gastas",
        variant: "destructive",
      });
      return;
    }

    if (!logDate) {
      toast({
        title: "Erro",
        description: "Por favor, selecione uma data",
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      const result = await logTime(
        taskId,
        hours,
        new Date(logDate),
        description || undefined
      );

      if (result.error) {
        toast({
          title: "Erro ao registrar tempo",
          description: result.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Tempo registrado",
          description: `${hours} hora(s) registrada(s) com sucesso`,
        });
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
          <h3 className="font-semibold text-lg">Registrar Tempo</h3>
        </div>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="hoursSpent">
          Horas Gastas <span className="text-red-500">*</span>
        </Label>
        <Input
          id="hoursSpent"
          type="number"
          step="0.5"
          min="0.5"
          value={hoursSpent}
          onChange={(e) => setHoursSpent(e.target.value)}
          placeholder="Ex: 2.5"
          disabled={isPending}
          required
        />
        <p className="text-xs text-muted-foreground">
          Use decimais para minutos (ex: 1.5 = 1 hora e 30 minutos)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="logDate">
          Data <span className="text-red-500">*</span>
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
        <Label htmlFor="description">Descrição (opcional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o trabalho realizado..."
          disabled={isPending}
          rows={3}
          className="resize-none"
        />
      </div>

      <div className="flex gap-2 justify-end">
        {onClose && (
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          disabled={isPending || !hoursSpent || !logDate}
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isPending ? "Registrando..." : "Registrar Tempo"}
        </Button>
      </div>
    </form>
  );
}
