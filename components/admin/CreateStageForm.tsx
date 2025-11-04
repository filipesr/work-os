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
        className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm"
      >
        + Add New Stage
      </button>
    );
  }

  return (
    <div className="border-2 border-border rounded-lg p-6 bg-muted/30">
      <h3 className="font-bold text-foreground text-lg mb-4">Add New Stage</h3>
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
            <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">
              Stage Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
              placeholder="e.g., Script Writing"
            />
          </div>
          <div>
            <label htmlFor="order" className="block text-sm font-semibold text-foreground mb-2">
              Order *
            </label>
            <input
              type="number"
              id="order"
              name="order"
              required
              min="0"
              defaultValue="0"
              className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
            />
          </div>
          <div>
            <label
              htmlFor="defaultTeamId"
              className="block text-sm font-semibold text-foreground mb-2"
            >
              Default Team
            </label>
            <select
              id="defaultTeamId"
              name="defaultTeamId"
              className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
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
        <div className="flex gap-3">
          <button
            type="submit"
            className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm"
          >
            Create Stage
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
