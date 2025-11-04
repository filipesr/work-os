"use client";

import { createTask } from "@/lib/actions/task";

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

export function CreateTaskForm({ projects, templates }: CreateTaskFormProps) {
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
        <label htmlFor="projectId" className="block text-sm font-semibold text-foreground mb-2">
          Project *
        </label>
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
          <p className="mt-2 text-sm text-destructive font-medium">
            No projects available. Please create a project first.
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
