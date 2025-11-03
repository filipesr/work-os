"use client";

import { createTask } from "@/lib/actions/task";

interface Project {
  id: string;
  name: string;
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
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Task Title *
        </label>
        <input
          type="text"
          id="title"
          name="title"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Create product demo video"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Provide details about this task..."
        />
      </div>

      {/* Project Selection */}
      <div>
        <label htmlFor="projectId" className="block text-sm font-medium text-gray-700 mb-1">
          Project *
        </label>
        <select
          id="projectId"
          name="projectId"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a project...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.client.name} - {project.name}
            </option>
          ))}
        </select>
        {projects.length === 0 && (
          <p className="mt-1 text-sm text-red-600">
            No projects available. Please create a project first.
          </p>
        )}
      </div>

      {/* Template Selection */}
      <div>
        <label htmlFor="templateId" className="block text-sm font-medium text-gray-700 mb-1">
          Workflow Template *
        </label>
        <select
          id="templateId"
          name="templateId"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a workflow template...</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} ({template._count.stages} stages)
            </option>
          ))}
        </select>
        {templates.length === 0 && (
          <p className="mt-1 text-sm text-red-600">
            No workflow templates available. Please create a template first.
          </p>
        )}
      </div>

      {/* Priority */}
      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
          Priority *
        </label>
        <select
          id="priority"
          name="priority"
          required
          defaultValue="MEDIUM"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
      </div>

      {/* Due Date */}
      <div>
        <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">
          Due Date
        </label>
        <input
          type="date"
          id="dueDate"
          name="dueDate"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Submit Button */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={projects.length === 0 || templates.length === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Task
        </button>
        <a
          href="/admin/tasks"
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
