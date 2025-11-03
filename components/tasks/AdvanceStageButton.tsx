"use client";

import { useState } from "react";
import { advanceTaskStage } from "@/lib/actions/task";

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface AdvanceStageButtonProps {
  taskId: string;
  availableStages: Stage[];
}

export function AdvanceStageButton({
  taskId,
  availableStages,
}: AdvanceStageButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (availableStages.length === 0) {
    return null;
  }

  const handleAdvance = async (stageId: string) => {
    setIsSubmitting(true);
    setError(null);

    const result = await advanceTaskStage(taskId, stageId);

    if (result?.error) {
      setError(result.error);
      setIsSubmitting(false);
    } else {
      // Success - page will be revalidated
      setIsOpen(false);
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
      >
        Advance Stage →
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">
              Advance Task to Next Stage
            </h3>
            <p className="text-gray-600 mb-6 text-sm">
              Select which stage to move this task to. Only stages with met
              dependencies are shown.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2 mb-6">
              {availableStages.map((stage) => (
                <button
                  key={stage.id}
                  onClick={() => handleAdvance(stage.id)}
                  disabled={isSubmitting}
                  className="w-full text-left p-3 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-semibold text-sm">
                      {stage.order}
                    </span>
                    <span className="font-medium">{stage.name}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
