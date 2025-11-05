"use client";

import { useState, useTransition } from "react";
import { advanceTaskStage } from "@/lib/actions/task";
import { Loader2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface Diagnostic {
  hasContribution: boolean;
  isLastStage: boolean;
  blockedStages: Array<{
    name: string;
    reasons: string[];
  }>;
  reasons: string[];
}

interface AdvanceStageButtonProps {
  taskId: string;
  availableStages: Stage[];
  diagnostic?: Diagnostic;
}

export function AdvanceStageButton({
  taskId,
  availableStages,
  diagnostic,
}: AdvanceStageButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showDebug, setShowDebug] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingStage, setPendingStage] = useState<{ id: string; name: string } | null>(null);

  // 🔍 DEBUG MODE: Show why button doesn't appear
  if (availableStages.length === 0) {
    const hasValidDiagnostic = diagnostic && diagnostic.reasons && diagnostic.reasons.length > 0;

    return (
      <div className="border border-yellow-300 bg-yellow-50 rounded-lg p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <p className="text-sm font-medium text-yellow-900">
              Nenhuma próxima etapa disponível
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              console.log('Debug button clicked, current state:', showDebug);
              setShowDebug(!showDebug);
            }}
            className="text-xs text-yellow-700 hover:text-yellow-900 underline cursor-pointer"
          >
            {showDebug ? "Ocultar" : "Por quê?"}
          </button>
        </div>

        {showDebug && (
          <div className="mt-3 text-xs text-yellow-800 space-y-2 border-t border-yellow-200 pt-3">
            {hasValidDiagnostic ? (
              <>
                <p className="font-semibold">Motivos:</p>
                <ul className="list-disc pl-5 space-y-2">
                  {diagnostic.reasons.map((reason, index) => (
                    <li key={index}>
                      <strong>{reason}</strong>
                    </li>
                  ))}
                </ul>

                {/* Show blocked stages details if any */}
                {diagnostic.blockedStages && diagnostic.blockedStages.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-yellow-200">
                    <p className="font-semibold mb-2">Etapas bloqueadas:</p>
                    <div className="space-y-2">
                      {diagnostic.blockedStages.map((stage, index) => (
                        <div key={index} className="pl-3">
                          <p className="font-medium">{stage.name}:</p>
                          <ul className="list-disc pl-5 text-yellow-700">
                            {stage.reasons.map((reason, rIndex) => (
                              <li key={rIndex}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Show help only if user hasn't contributed */}
                {diagnostic.hasContribution === false && (
                  <div className="mt-3 p-2 bg-yellow-100 rounded">
                    <p className="font-semibold mb-1">💡 Como resolver:</p>
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Role para cima e adicione um <strong>Artefato</strong> (Google Drive, Figma, etc.)</li>
                      <li>OU adicione um <strong>Comentário</strong> sobre seu trabalho</li>
                      <li>O botão &quot;Advance Stage&quot; aparecerá automaticamente</li>
                    </ol>
                  </div>
                )}
              </>
            ) : (
              <div>
                <p className="font-semibold mb-2">Possíveis razões:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Você não adicionou artefatos ou comentários ainda</strong>
                    <br />
                    <span className="text-yellow-700">
                      Para avançar a etapa atual, você precisa contribuir com pelo menos 1 artefato (link/arquivo) ou 1 comentário.
                    </span>
                  </li>
                  <li>Esta é a última etapa do template (não há próximas etapas)</li>
                  <li>As próximas etapas têm outras dependências não cumpridas</li>
                </ul>
                <div className="mt-3 p-2 bg-yellow-100 rounded">
                  <p className="font-semibold mb-1">💡 Como resolver:</p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Role para cima e adicione um <strong>Artefato</strong> (Google Drive, Figma, etc.)</li>
                    <li>OU adicione um <strong>Comentário</strong> sobre seu trabalho</li>
                    <li>O botão &quot;Advance Stage&quot; aparecerá automaticamente</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const handleAdvanceClick = (stageId: string, stageName: string) => {
    // Check if user is bypassing contribution requirement (admin/manager)
    const isBypassingValidation = diagnostic && !diagnostic.hasContribution;

    if (isBypassingValidation) {
      // Show confirmation modal for admin/manager
      setPendingStage({ id: stageId, name: stageName });
      setShowConfirmModal(true);
    } else {
      // Proceed directly
      executeAdvance(stageId, stageName, false);
    }
  };

  const executeAdvance = async (stageId: string, stageName: string, isBypass: boolean) => {
    startTransition(async () => {
      const result = await advanceTaskStage(taskId, stageId);

      if (result?.error) {
        toast.error(result.error);
      } else {
        if (isBypass) {
          toast.success(`Tarefa movida para ${stageName} (movido manualmente)`);
        } else {
          toast.success("Tarefa avançada para a próxima etapa");
        }
        setIsOpen(false);
        setShowConfirmModal(false);
        setPendingStage(null);
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={isPending}
        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Advance Stage →
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 border border-gray-200">
            {/* Header */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Avançar para Próxima Etapa
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Selecione a próxima etapa do fluxo de trabalho. Esta ação marcará a etapa atual como concluída e
                moverá a tarefa para o backlog da equipe responsável pela próxima etapa.
              </p>
            </div>

            {/* Info Badge */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800">
                <strong>💡 Dica:</strong> Apenas etapas com todas as dependências cumpridas são exibidas.
              </p>
            </div>

            {/* Stages List */}
            <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto">
              {availableStages.map((stage, index) => (
                <button
                  key={stage.id}
                  onClick={() => handleAdvanceClick(stage.id, stage.name)}
                  disabled={isPending}
                  className="w-full text-left p-4 border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    {/* Order Badge */}
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white font-bold text-sm shadow-md">
                        {stage.order}
                      </span>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors">
                          {stage.name}
                        </span>
                        {index === 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Recomendada
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {index === 0
                          ? "Próxima etapa sequencial do fluxo"
                          : "Etapa alternativa disponível"}
                      </p>
                    </div>

                    {/* Loading indicator */}
                    {isPending && (
                      <Loader2 className="flex-shrink-0 h-5 w-5 animate-spin text-green-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="flex gap-3 justify-between items-center pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                {availableStages.length === 1
                  ? "1 etapa disponível"
                  : `${availableStages.length} etapas disponíveis`}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Admin/Manager Bypass */}
      {showConfirmModal && pendingStage && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 border border-gray-200">
            {/* Header */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                ⚠️ Confirmação Necessária
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Você está movendo esta tarefa sem ter contribuído com artefatos ou comentários.
              </p>
            </div>

            {/* Warning Info */}
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Próxima etapa:</strong> {pendingStage.name}
              </p>
              <p className="text-xs text-yellow-700 mt-2">
                Um comentário automático será adicionado indicando que a tarefa foi movida por um administrador/gerente.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingStage(null);
                }}
                disabled={isPending}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={() => executeAdvance(pendingStage.id, pendingStage.name, true)}
                disabled={isPending}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50 font-medium"
              >
                {isPending ? "Movendo..." : "Confirmar e Mover"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
