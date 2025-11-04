import Link from "next/link";
import { getWorkflowTemplates, createWorkflowTemplate } from "@/lib/actions/template";

export default async function TemplatesPage() {
  const templates = await getWorkflowTemplates();

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Workflow Templates</h1>
        <p className="text-muted-foreground">
          Create and manage workflow templates. These are the "scripts" that define
          how tasks flow through your system.
        </p>
      </div>

      {/* Create New Template Form */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">Create New Template</h2>
        <form action={createWorkflowTemplate} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">
              Template Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
              placeholder="e.g., Short Video, Landing Page"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-semibold text-foreground mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="w-full min-h-[100px] rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200 resize-none"
              placeholder="Describe what this workflow template is for..."
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-200"
          >
            Create Template
          </button>
        </form>
      </div>

      {/* Templates List */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        <div className="px-6 py-4 border-b-2 border-border bg-muted">
          <h2 className="text-xl font-bold text-foreground">Existing Templates</h2>
        </div>
        {templates.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No templates yet. Create your first template above.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {templates.map((template: any) => (
              <Link
                key={template.id}
                href={`/admin/templates/${template.id}`}
                className="block p-6 hover:bg-accent transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-primary mb-1">
                      {template.name}
                    </h3>
                    <p className="text-muted-foreground text-sm mb-2">
                      {template.description || "No description"}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="font-medium">{template._count.stages} stages</span>
                      <span>•</span>
                      <span>Created {new Date(template.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <svg
                      className="w-5 h-5 text-muted-foreground"
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
