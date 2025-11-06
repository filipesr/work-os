"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/actions/task";
import { getTemplateStagePreview } from "@/app/actions/templateActions";
import { getClients } from "@/lib/actions/client";
import { QuickCreateProject } from "@/components/quick-create/QuickCreateProject";

interface Project {
  id: string;
  name: string;
  clientId: string;
  client: {
    name: string;
  };
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  _count: {
    stages: number;
  };
}

interface CreateTaskFormProps {
  projects: Project[];
  templates: Template[];
}

// Define types for stage preview
type StagePreviewItem = Awaited<ReturnType<typeof getTemplateStagePreview>>[0];

export function CreateTaskForm({ projects: initialProjects, templates }: CreateTaskFormProps) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [stagePreview, setStagePreview] = useState<StagePreviewItem[]>([]);
  const [isPreviewLoading, startPreviewTransition] = useTransition();

  // Load clients for QuickCreateProject
  useEffect(() => {
    const loadClients = async () => {
      const clientsList = await getClients();
      setClients(clientsList);
    };
    loadClients();
  }, []);

  // Update projects list when initialProjects changes
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  // Handler for when a project is created
  const handleProjectCreated = (projectId: string) => {
    router.refresh();
  };

  // Handler for when the user selects a template
  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const templateId = e.target.value;

    if (!templateId) {
      setStagePreview([]);
      return;
    }

    startPreviewTransition(async () => {
      const stages = await getTemplateStagePreview(templateId);
      setStagePreview(stages);
    });
  };
  return (
    <form action={createTask} className="space-y-6">
      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-semibold text-foreground mb-2">
          Task Title *
        </label>
        <input
          type="text"
          id="title"
          name="title"
          required
          className="w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
          placeholder="e.g., Create product demo video"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-semibold text-foreground mb-2">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          className="w-full min-h-[100px] rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200 resize-none"
          placeholder="Provide details about this task..."
        />
      </div>

      {/* Project Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="projectId" className="block text-sm font-semibold text-foreground">
            Project *
          </label>
          <QuickCreateProject
            clients={clients}
            variant="ghost"
            size="sm"
            onProjectCreated={handleProjectCreated}
          />
        </div>
        <select
          id="projectId"
          name="projectId"
          required
          className="w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
        >
          <option value="">Select a project...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.client.name} - {project.name}
            </option>
          ))}
        </select>
        {projects.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
            <span>No projects available.</span>
            <QuickCreateProject
              clients={clients}
              variant="ghost"
              size="sm"
              className="h-auto p-0"
              onProjectCreated={handleProjectCreated}
            />
          </p>
        )}
      </div>

      {/* Template Selection */}
      <div>
        <label htmlFor="templateId" className="block text-sm font-semibold text-foreground mb-2">
          Workflow Template *
        </label>
        <select
          id="templateId"
          name="templateId"
          required
          onChange={handleTemplateChange}
          className="w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
        >
          <option value="">Select a workflow template...</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} ({template._count.stages} stages)
            </option>
          ))}
        </select>
        {templates.length === 0 && (
          <p className="mt-2 text-sm text-destructive font-medium">
            No workflow templates available. Please create a template first.
          </p>
        )}

        {/* Dynamic Stage Preview */}
        <div className="mt-4 p-4 bg-muted/30 rounded-lg border-2 border-border">
          <h4 className="text-sm font-semibold text-foreground mb-3">Stage Preview:</h4>

          {isPreviewLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading stages...
            </div>
          )}

          {!isPreviewLoading && stagePreview.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Select a workflow template above to preview its stages.
            </div>
          )}

          {!isPreviewLoading && stagePreview.length > 0 && (
            <ol className="list-decimal list-inside space-y-2">
              {stagePreview.map((stage, index) => (
                <li key={stage.id} className="text-sm text-foreground font-medium">
                  {stage.name}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Priority */}
      <div>
        <label htmlFor="priority" className="block text-sm font-semibold text-foreground mb-2">
          Priority *
        </label>
        <select
          id="priority"
          name="priority"
          required
          defaultValue="MEDIUM"
          className="w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
      </div>

      {/* Due Date */}
      <div>
        <label htmlFor="dueDate" className="block text-sm font-semibold text-foreground mb-2">
          Due Date
        </label>
        <input
          type="date"
          id="dueDate"
          name="dueDate"
          className="w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
        />
      </div>

      {/* Submit Button */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={projects.length === 0 || templates.length === 0}
          className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Task
        </button>
        <a
          href="/admin/tasks"
          className="px-6 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/90 transition-all duration-200 shadow-sm"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
