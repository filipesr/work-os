"use client";

import { useState } from "react";
import { createTemplateStage } from "@/lib/actions/stage";

interface CreateStageFormProps {
  templateId: string;
  teams: Array<{ id: string; name: string }>;
}

export function CreateStageForm({ templateId, teams }: CreateStageFormProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
      >
        + Add New Stage
      </button>
    );
  }

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
      <h3 className="font-semibold mb-4">Add New Stage</h3>
      <form
        action={async (formData: FormData) => {
          const result = await createTemplateStage(templateId, formData);
          if (result?.success) {
            setIsOpen(false);
          }
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Stage Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g., Script Writing"
            />
          </div>
          <div>
            <label htmlFor="order" className="block text-sm font-medium text-gray-700 mb-1">
              Order *
            </label>
            <input
              type="number"
              id="order"
              name="order"
              required
              min="0"
              defaultValue="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label
              htmlFor="defaultTeamId"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Default Team
            </label>
            <select
              id="defaultTeamId"
              name="defaultTeamId"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">No default team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            Create Stage
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
