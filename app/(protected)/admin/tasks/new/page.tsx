import Link from "next/link";
import { getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { CreateTaskForm } from "@/components/tasks/CreateTaskForm";

export default async function NewTaskPage() {
  const [projects, templates] = await Promise.all([
    getProjectsForSelect(),
    getTemplatesForSelect(),
  ]);

  return (
    <div className="container mx-auto p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/tasks"
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M15 19l-7-7 7-7" />
          </svg>
          Back to Tasks
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create New Task</h1>
        <p className="mt-2 text-sm text-gray-600">
          Initialize a new task from a workflow template. The task will start at the first
          stage of the selected template.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white shadow rounded-lg p-6">
        <CreateTaskForm projects={projects} templates={templates} />
      </div>

      {/* Help Text */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">How it works:</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Select a project to associate this task with</li>
          <li>Choose a workflow template that defines the task's stages</li>
          <li>The task will automatically start at the template's first stage</li>
          <li>You will be assigned as the initial assignee</li>
          <li>The task can be moved through stages based on the workflow dependencies</li>
        </ul>
      </div>
    </div>
  );
}
