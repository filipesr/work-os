import Link from "next/link";
import { getWorkflowTemplates, createWorkflowTemplate } from "@/lib/actions/template";

export default async function TemplatesPage() {
  const templates = await getWorkflowTemplates();

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Workflow Templates</h1>
        <p className="text-gray-600">
          Create and manage workflow templates. These are the "scripts" that define
          how tasks flow through your system.
        </p>
      </div>

      {/* Create New Template Form */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Create New Template</h2>
        <form action={createWorkflowTemplate} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Template Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Short Video, Landing Page"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe what this workflow template is for..."
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Create Template
          </button>
        </form>
      </div>

      {/* Templates List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Existing Templates</h2>
        </div>
        {templates.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No templates yet. Create your first template above.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {templates.map((template: any) => (
              <Link
                key={template.id}
                href={`/admin/templates/${template.id}`}
                className="block p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-blue-600 mb-1">
                      {template.name}
                    </h3>
                    <p className="text-gray-600 text-sm mb-2">
                      {template.description || "No description"}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{template._count.stages} stages</span>
                      <span>•</span>
                      <span>Created {new Date(template.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
