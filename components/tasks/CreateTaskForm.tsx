"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/actions/task";
import { getTemplateStagePreview } from "@/app/actions/templateActions";
import { getClients } from "@/lib/actions/client";
import { getTypeForecast } from "@/lib/actions/reporting";
import {
  assessFeasibility,
  idealStartOffsetDays,
  confidentDays,
  firstIncludedStageId,
} from "@/lib/forecast-feasibility";
import { getAssigneeTypeExperience } from "@/lib/actions/assignee-experience";
import { QuickCreateProject } from "@/components/quick-create/QuickCreateProject";
import { StageAssigneeSelect } from "@/components/ui/StageAssigneeSelect";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations, useLocale } from "next-intl";
import { Loader2 } from "lucide-react";

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
  defaultProjectId?: string;
}

// Define types for stage preview
type StagePreviewItem = Awaited<ReturnType<typeof getTemplateStagePreview>>[0];

export function CreateTaskForm({
  projects: initialProjects,
  templates,
  defaultProjectId,
}: CreateTaskFormProps) {
  const t = useTranslations("tasks");
  const tPriority = useTranslations("tasks.priority");
  const locale = useLocale();
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [stagePreview, setStagePreview] = useState<StagePreviewItem[]>([]);
  const [isPreviewLoading, startPreviewTransition] = useTransition();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [forecast, setForecast] = useState<{
    p50: number;
    p85: number;
    p95: number;
    count: number;
    lowConfidence: boolean;
  } | null>(null);
  // Per-stage form state so the "entry stage" can respect optional-unchecked:
  // which stages are included (checkbox) and who is assigned to each.
  const [checkedStages, setCheckedStages] = useState<Record<string, boolean>>({});
  const [stageAssignees, setStageAssignees] = useState<Record<string, string>>({});
  const [entryExperienced, setEntryExperienced] = useState<boolean | null>(null);

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
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setCheckedStages({});
    setStageAssignees({});
    setEntryExperienced(null);
    if (!templateId) {
      setStagePreview([]);
      setForecast(null);
      return;
    }

    startPreviewTransition(async () => {
      const [stages, f] = await Promise.all([
        getTemplateStagePreview(templateId),
        getTypeForecast(templateId),
      ]);
      setStagePreview(stages);
      // Optional stages start unchecked (defaultChecked={!optional}); mirror that
      // in state so the entry-stage derivation below sees the real inclusion set.
      setCheckedStages(Object.fromEntries(stages.map((s) => [s.id, !s.optional])));
      setForecast(f);
    });
  };

  // Entry stage = the FIRST stage still checked in the preview. Optional stages
  // start unchecked, so an optional stage[0] hands the entry to the next included
  // stage (and unchecking a stage re-derives it live). Its assignee drives the
  // confidence band — bandwidth only, never a person score.
  const entryStageId = firstIncludedStageId(stagePreview, checkedStages);
  const entryAssigneeId = entryStageId ? (stageAssignees[entryStageId] ?? "") : "";

  // Fetch the entry-stage assignee's experience with this work type — widens
  // the confidence band (p85 → p95) when they're new to it. Bandwidth only,
  // never a person score.
  useEffect(() => {
    if (!entryAssigneeId || !selectedTemplateId) {
      setEntryExperienced(null);
      return;
    }
    let cancelled = false;
    getAssigneeTypeExperience(entryAssigneeId, selectedTemplateId).then((r) => {
      if (!cancelled) setEntryExperienced(r.experienced);
    });
    return () => {
      cancelled = true;
    };
  }, [entryAssigneeId, selectedTemplateId]);

  const selectedTemplate = templates.find((tmpl) => tmpl.id === selectedTemplateId);
  const daysAvailable = dueDate
    ? Math.ceil((new Date(dueDate).getTime() - new Date().setHours(0, 0, 0, 0)) / 8.64e7)
    : NaN;
  const band =
    forecast && forecast.p85 > 0
      ? confidentDays(forecast.p85, forecast.p95, entryExperienced ?? true)
      : 0;
  const feasibility =
    forecast && forecast.count > 0 && dueDate
      ? assessFeasibility(daysAvailable, forecast.p50, band)
      : "unknown";
  const idealStart =
    band > 0 && dueDate
      ? new Date(new Date(dueDate).getTime() - idealStartOffsetDays(band) * 8.64e7)
      : null;
  const idealStartPassed = idealStart
    ? idealStart.getTime() < new Date().setHours(0, 0, 0, 0)
    : false;
  const fmtDate = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" });

  return (
    <form action={createTask} className="space-y-6">
      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-semibold text-foreground mb-2">
          {t("create.titleLabel")}
        </label>
        <Input
          type="text"
          id="title"
          name="title"
          required
          placeholder={t("create.titlePlaceholder")}
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-semibold text-foreground mb-2">
          {t("create.descriptionLabel")}
        </label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          placeholder={t("create.descriptionPlaceholder")}
        />
      </div>

      {/* Project Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="projectId" className="block text-sm font-semibold text-foreground">
            {t("create.projectLabel")}
          </label>
          <QuickCreateProject
            clients={clients}
            variant="ghost"
            size="sm"
            onProjectCreated={handleProjectCreated}
          />
        </div>
        <Select name="projectId" required defaultValue={defaultProjectId}>
          <SelectTrigger id="projectId">
            <SelectValue placeholder={t("create.projectPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.client.name} - {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {projects.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
            <span>{t("create.noProjectsAvailable")}</span>
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
          {t("create.templateLabel")}
        </label>
        <Select name="templateId" required onValueChange={handleTemplateChange}>
          <SelectTrigger id="templateId">
            <SelectValue placeholder={t("create.templatePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name} ({t("create.templateStages", { count: template._count.stages })})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {templates.length === 0 && (
          <p className="mt-2 text-sm text-destructive font-medium">
            {t("create.noTemplatesAvailable")}
          </p>
        )}

        {/* Dynamic Stage Preview */}
        <div className="mt-4 p-4 bg-muted/30 rounded-lg border-2 border-border">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            {t("create.stagePreviewTitle")}
          </h4>

          {isPreviewLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("create.stagePreviewLoading")}
            </div>
          )}

          {!isPreviewLoading && stagePreview.length === 0 && (
            <div className="text-sm text-muted-foreground">{t("create.stagePreviewEmpty")}</div>
          )}

          {!isPreviewLoading && stagePreview.length > 0 && (
            <ol className="space-y-2">
              {stagePreview.map((stage, index) => (
                <li
                  key={stage.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      name={`stage:${stage.id}`}
                      checked={checkedStages[stage.id] ?? !stage.optional}
                      onChange={(e) =>
                        setCheckedStages((prev) => ({ ...prev, [stage.id]: e.target.checked }))
                      }
                      className="h-4 w-4 shrink-0"
                      aria-label={stage.name}
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        {index + 1}. {stage.name}
                        {stage.optional && (
                          <span className="ml-2 text-xs text-muted-foreground">(opcional)</span>
                        )}
                      </span>
                      {stage.defaultTeam && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {stage.defaultTeam.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <StageAssigneeSelect
                    stageId={stage.id}
                    teamName={stage.defaultTeam?.name ?? null}
                    members={stage.defaultTeam?.members ?? []}
                    onChange={(v: string) =>
                      setStageAssignees((prev) => ({ ...prev, [stage.id]: v }))
                    }
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Priority */}
      <div>
        <label htmlFor="priority" className="block text-sm font-semibold text-foreground mb-2">
          {t("create.priorityLabel")}
        </label>
        <Select name="priority" required defaultValue="MEDIUM">
          <SelectTrigger id="priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">{tPriority("low")}</SelectItem>
            <SelectItem value="MEDIUM">{tPriority("medium")}</SelectItem>
            <SelectItem value="HIGH">{tPriority("high")}</SelectItem>
            <SelectItem value="URGENT">{tPriority("urgent")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Due Date */}
      <div>
        <label htmlFor="dueDate" className="block text-sm font-semibold text-foreground mb-2">
          {t("create.dueDateLabel")}
        </label>
        <Input
          type="date"
          id="dueDate"
          name="dueDate"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        {feasibility !== "unknown" && selectedTemplate && forecast && (
          <div
            className={`mt-2 rounded-md border p-2 text-xs ${
              feasibility === "comfortable"
                ? "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                : feasibility === "tight"
                  ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
            }`}
          >
            <span className="font-semibold">{t(`create.feasibility.${feasibility}`)}</span>{" "}
            {t("create.feasibility.summary", {
              type: selectedTemplate.name,
              p50: forecast.p50.toFixed(0),
              p85: forecast.p85.toFixed(0),
              count: forecast.count,
              days: Number.isFinite(daysAvailable) ? daysAvailable : 0,
            })}
            {forecast.lowConfidence && (
              <span className="block">
                {t("create.feasibility.lowConfidence", { count: forecast.count })}
              </span>
            )}
            {entryAssigneeId && entryExperienced === false && (
              <span className="block">
                {t("create.feasibility.newToTypeNote", { days: Math.ceil(band) })}
              </span>
            )}
            {idealStartPassed && idealStart && (
              <span className="block">
                {t("create.feasibility.idealStart", { date: fmtDate.format(idealStart) })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={projects.length === 0 || templates.length === 0}
          className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("create.createButton")}
        </button>
        <a
          href="/admin/tasks"
          className="px-6 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/90 transition-all duration-200 shadow-sm"
        >
          {t("create.cancelButton")}
        </a>
      </div>
    </form>
  );
}
