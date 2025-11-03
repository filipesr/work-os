"use client";

import { useState } from "react";
import { revertTaskStage } from "@/lib/actions/task";

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface RevertStageButtonProps {
  taskId: string;
  previousStages: Stage[];
}

export function RevertStageButton({
  taskId,
  previousStages,
}: RevertStageButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (previousStages.length === 0) {
    return null;
  }

  const handleRevert = async () => {
    if (!selectedStageId || !comment.trim()) {
      setError("Please select a stage and provide a comment.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await revertTaskStage(taskId, selectedStageId, comment);

    if (result?.error) {
      setError(result.error);
      setIsSubmitting(false);
    } else {
      // Success - page will be revalidated
      setIsOpen(false);
      setIsSubmitting(false);
      setComment("");
      setSelectedStageId(null);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
      >
        ← Revert Stage
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-2 text-orange-900">
              Revert Task to Previous Stage
            </h3>
            <p className="text-gray-600 mb-6 text-sm">
              Send this task back to a previous stage (e.g., for QC rejection).
              A comment is required to explain why.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                {error}
              </div>
            )}

            {/* Stage Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Revert to stage:
              </label>
              <div className="space-y-2">
                {previousStages.map((stage) => (
                  <label
                    key={stage.id}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedStageId === stage.id
                        ? "bg-orange-50 border-orange-300"
                        : "border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="revertStage"
                      value={stage.id}
                      checked={selectedStageId === stage.id}
                      onChange={() => setSelectedStageId(stage.id)}
                      className="w-4 h-4 text-orange-600"
                    />
                    <div className="ml-3 flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-semibold text-xs">
                        {stage.order}
                      </span>
                      <span className="font-medium">{stage.name}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for reversion: *
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Explain why this task is being reverted..."
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setError(null);
                  setComment("");
                  setSelectedStageId(null);
                }}
                disabled={isSubmitting}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRevert}
                disabled={isSubmitting || !selectedStageId || !comment.trim()}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Reverting..." : "Revert Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
