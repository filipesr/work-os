"use client";

import { useState, useTransition } from "react";
import { revertTaskStage } from "@/lib/actions/task";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface RevertStageButtonProps {
  taskId: string;
  previousStages: Stage[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function RevertStageButton({
  taskId,
  previousStages,
  open: controlledOpen,
  onOpenChange,
}: RevertStageButtonProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();

  if (previousStages.length === 0) {
    return null;
  }

  const handleRevert = async () => {
    if (!selectedStageId || !comment.trim()) {
      toast.error("Por favor, selecione uma etapa e forneça um comentário.");
      return;
    }

    startTransition(async () => {
      const result = await revertTaskStage(taskId, selectedStageId, comment);

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Tarefa revertida para a etapa anterior");
        setIsOpen(false);
        setComment("");
        setSelectedStageId(null);
      }
    });
  };

  // If controlled via props, don't render button (only modal)
  const isControlled = controlledOpen !== undefined;

  return (
    <>
      {!isControlled && (
        <button
          onClick={() => setIsOpen(true)}
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          ← Revert Stage
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-background rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-border">
            {/* Header */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                Reverter para Etapa Anterior
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Envie esta tarefa de volta para uma etapa anterior (ex: necessita ajustes).
                Um comentário explicativo é obrigatório.
              </p>
            </div>

            {/* Info Badge */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800">
                <strong>ℹ️ Informação:</strong> Esta ação marcará a etapa atual como revertida e criará um novo log de entrada na etapa anterior.
              </p>
            </div>

            {/* Stage Selection */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-foreground mb-3">
                Reverter para a etapa:
              </label>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {previousStages.map((stage, index) => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setSelectedStageId(stage.id)}
                    disabled={isPending}
                    className={`w-full text-left p-4 border-2 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm hover:shadow-md ${
                      selectedStageId === stage.id
                        ? "border-blue-400 bg-gradient-to-r from-blue-50 to-indigo-50"
                        : "border-gray-200 hover:border-blue-300 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Order Badge */}
                      <div className="flex-shrink-0">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm shadow-md">
                          {stage.order}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground group-hover:text-blue-600 transition-colors">
                            {stage.name}
                          </span>
                          {index === 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Mais recente
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {index === 0
                            ? "Etapa anterior mais recente"
                            : "Etapa anterior no histórico"}
                        </p>
                      </div>

                      {/* Selected indicator */}
                      {selectedStageId === stage.id && (
                        <div className="flex-shrink-0">
                          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-foreground mb-2">
                Motivo da reversão: *
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                disabled={isPending}
                className="w-full px-4 py-3 border-2 border-input bg-background text-foreground rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:border-input disabled:opacity-50 transition-all placeholder:text-muted-foreground"
                placeholder="Explique o motivo da reversão... (ex: 'Encontrados erros que precisam ser corrigidos')"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Este comentário será registrado no histórico da tarefa
              </p>
            </div>

            {/* Footer */}
            <div className="flex gap-3 justify-between items-center pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                {previousStages.length === 1
                  ? "1 etapa anterior disponível"
                  : `${previousStages.length} etapas anteriores disponíveis`}
              </p>
              <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setComment("");
                  setSelectedStageId(null);
                }}
                disabled={isPending}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRevert}
                disabled={isPending || !selectedStageId || !comment.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isPending ? "Reverting..." : "Revert Task"}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
