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
import { QuickCreateClient } from "@/components/quick-create/QuickCreateClient";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { EmptyState } from "@/components/ui/empty-state";
import { priorityTone } from "@/lib/status-tone";
import { useTranslations, useLocale } from "next-intl";
import {
  Loader2,
  ListChecks,
  ClipboardList,
  Sparkles,
  Plus,
  ChevronRight,
  Box,
  CalendarDays,
} from "lucide-react";

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

interface TeamOption {
  id: string;
  name: string;
  members: { id: string; name: string | null; email: string | null }[];
}

interface CreateTaskFormProps {
  projects: Project[];
  templates: Template[];
  /** Times com membros — usados só pelas etapas CORINGA (sem time padrão). */
  teams: TeamOption[];
  defaultProjectId?: string;
}

// Define types for stage preview
type StagePreviewItem = Awaited<ReturnType<typeof getTemplateStagePreview>>[0];

export function CreateTaskForm({
  projects: initialProjects,
  templates,
  teams,
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
  const [priority, setPriority] = useState<string>("MEDIUM");
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
  // Roteamento das etapas CORINGA: o template deixou a etapa sem time de
  // propósito, então o time (e só então o responsável) é escolhido aqui.
  const [stageTeams, setStageTeams] = useState<Record<string, string>>({});
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
  const handleProjectCreated = (_projectId: string) => {
    router.refresh();
  };

  // Handler for when the user selects a template
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setCheckedStages({});
    setStageAssignees({});
    setStageTeams({});
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
  const fmtDate = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });

  const includedCount = stagePreview.filter((s) => checkedStages[s.id] ?? !s.optional).length;
  const entryStageName = stagePreview.find((s) => s.id === entryStageId)?.name ?? "";
  const refDays = forecast ? Math.round(forecast.p85) : 0;

  // Viability card tone — comfortable=success, tight=warning, atRisk=danger.
  const viaTone =
    feasibility === "comfortable"
      ? {
          wrap: "border-success/40 bg-success-subtle",
          chip: "bg-success/15 text-success",
          word: "text-success",
        }
      : feasibility === "tight"
        ? {
            wrap: "border-warning/40 bg-warning-subtle",
            chip: "bg-warning/15 text-warning",
            word: "text-warning",
          }
        : {
            wrap: "border-danger/40 bg-danger-subtle",
            chip: "bg-danger/15 text-danger",
            word: "text-danger",
          };

  const canSubmit = projects.length > 0 && templates.length > 0;

  return (
    <form
      action={createTask}
      className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)] xl:items-start"
    >
      {/* ---------- LEFT: context + stage preview ---------- */}
      <div className="space-y-6">
        {/* Card: Contexto da demanda */}
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-6">
            <h2 className="text-lg font-semibold text-foreground">{t("create.contextTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("create.contextSubtitle")}</p>
          </div>
          <div className="space-y-6 p-6">
            {/* Title */}
            <div>
              <FieldLabel htmlFor="title" required>
                {t("create.labels.title")}
              </FieldLabel>
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
              <FieldLabel htmlFor="description">{t("create.labels.description")}</FieldLabel>
              <Textarea
                id="description"
                name="description"
                rows={4}
                placeholder={t("create.descriptionPlaceholder")}
              />
            </div>

            {/* Project Selection */}
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <FieldLabel htmlFor="projectId" required className="mb-0">
                  {t("create.labels.project")}
                </FieldLabel>
                <div className="flex items-center gap-2">
                  <QuickCreateProject
                    clients={clients}
                    variant="ghost"
                    size="sm"
                    onProjectCreated={handleProjectCreated}
                  />
                  <QuickCreateClient
                    variant="ghost"
                    size="sm"
                    onClientCreated={() => router.refresh()}
                  />
                </div>
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
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t("create.noProjectsAvailable")}</span>
                </p>
              )}
            </div>

            {/* Template + Priority */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="templateId" required>
                  {t("create.labels.template")}
                </FieldLabel>
                <Select name="templateId" required onValueChange={handleTemplateChange}>
                  <SelectTrigger id="templateId">
                    <SelectValue placeholder={t("create.templatePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} (
                        {t("create.templateStages", { count: template._count.stages })})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templates.length === 0 && (
                  <p className="mt-2 text-sm text-destructive font-medium">
                    {t("create.noTemplatesAvailable")}
                  </p>
                )}
              </div>

              <div>
                <FieldLabel htmlFor="priority">{t("create.labels.priority")}</FieldLabel>
                <Select name="priority" required value={priority} onValueChange={setPriority}>
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
            </div>

            {/* Due Date */}
            <div>
              <FieldLabel htmlFor="dueDate" required>
                {t("create.labels.dueDate")}
              </FieldLabel>
              <Input
                type="date"
                id="dueDate"
                name="dueDate"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Card: Pré-visualização das etapas */}
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-border p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ListChecks className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {t("create.previewTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedTemplate?.description ?? t("create.stagePreviewEmpty")}
                </p>
              </div>
            </div>
            {stagePreview.length > 0 && (
              <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {t("create.previewIncluded", { count: includedCount })}
              </span>
            )}
          </div>

          <div className="p-6">
            {isPreviewLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("create.stagePreviewLoading")}
              </div>
            )}

            {!isPreviewLoading && stagePreview.length === 0 && (
              <div className="text-sm text-muted-foreground">{t("create.stagePreviewEmpty")}</div>
            )}

            {!isPreviewLoading && stagePreview.length > 0 && (
              <>
                <ol className="divide-y divide-border">
                  {stagePreview.map((stage, index) => {
                    const isChecked = checkedStages[stage.id] ?? !stage.optional;
                    const isEntry = stage.id === entryStageId;
                    // Coringa = o template deixou a etapa sem time padrão. É uma
                    // decisão do template ("este passo existe, quem faz depende
                    // da demanda"), não uma configuração faltando.
                    const isFlexible = !stage.defaultTeam;
                    const chosenTeam = isFlexible
                      ? (teams.find((tm) => tm.id === stageTeams[stage.id]) ?? null)
                      : null;
                    const dimmed = stage.optional && !isChecked;
                    return (
                      <li
                        key={stage.id}
                        className={`grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_14rem] ${
                          isFlexible ? "sm:items-start" : "sm:items-center"
                        } ${dimmed ? "opacity-60" : ""}`}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {stage.name}
                              </span>
                              {stage.optional && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                  {t("create.optionalBadge")}
                                </span>
                              )}
                              {isFlexible && (
                                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                                  {t("create.flexibleBadge")}
                                </span>
                              )}
                              {isEntry && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  {t("create.entryBadge")}
                                </span>
                              )}
                            </div>
                            {stage.optional ? (
                              <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                                <input
                                  type="checkbox"
                                  name={`stage:${stage.id}`}
                                  checked={isChecked}
                                  onChange={(e) =>
                                    setCheckedStages((prev) => ({
                                      ...prev,
                                      [stage.id]: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 shrink-0 accent-primary"
                                  aria-label={stage.name}
                                />
                                {t("create.includeStage")}
                              </label>
                            ) : (
                              <input type="hidden" name={`stage:${stage.id}`} value="on" />
                            )}
                          </div>
                        </div>
                        <div className="space-y-3">
                          {/* Etapa coringa: o template não nomeia o time, então
                              o roteamento é escolhido aqui. Sem isto a etapa
                              nasceria fora da fila de todos os times. */}
                          {isFlexible && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                {t("create.teamLabel")}
                              </p>
                              <select
                                name={`team:${stage.id}`}
                                value={chosenTeam?.id ?? ""}
                                disabled={!isChecked}
                                aria-label={t("create.teamAriaLabel", { stage: stage.name })}
                                onChange={(e) => {
                                  const teamId = e.target.value;
                                  setStageTeams((prev) => ({ ...prev, [stage.id]: teamId }));
                                  // Trocar de time invalida quem já estava escolhido:
                                  // a pessoa pode não pertencer ao time novo.
                                  setStageAssignees((prev) => ({ ...prev, [stage.id]: "" }));
                                }}
                                className="h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-60"
                              >
                                <option value="">{t("create.teamPlaceholder")}</option>
                                {teams.map((team) => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted-foreground">
                              {t("create.responsibleLabel")}
                            </p>
                            {isFlexible && !chosenTeam ? (
                              <p className="text-xs text-muted-foreground">
                                {t("create.chooseTeamFirst")}
                              </p>
                            ) : (
                              <StageAssigneeSelect
                                // Remonta ao trocar de time: sem isto o <select>
                                // não-controlado guardaria o responsável antigo.
                                key={chosenTeam?.id ?? "default"}
                                stageId={stage.id}
                                teamName={chosenTeam?.name ?? stage.defaultTeam?.name ?? null}
                                members={chosenTeam?.members ?? stage.defaultTeam?.members ?? []}
                                className="w-full"
                                disabled={!isChecked}
                                onChange={(v: string) =>
                                  setStageAssignees((prev) => ({ ...prev, [stage.id]: v }))
                                }
                              />
                            )}
                          </div>
                        </div>

                        {/* "Apoio" não diz nada sozinho: numa etapa coringa,
                            quem pega precisa ler o que exatamente é para fazer. */}
                        {isFlexible && (
                          <div className="sm:col-span-2">
                            <p className="mb-1 text-xs font-medium text-muted-foreground">
                              {t("create.instructionsLabel")}
                            </p>
                            <Textarea
                              name={`instructions:${stage.id}`}
                              rows={2}
                              disabled={!isChecked}
                              placeholder={t("create.instructionsPlaceholder")}
                              aria-label={t("create.instructionsAriaLabel", { stage: stage.name })}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <p className="-mx-6 -mb-6 mt-4 flex items-start gap-2 border-t border-border bg-muted/40 px-6 py-3 text-sm text-muted-foreground">
                  {entryStageName ? (
                    <>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>
                        {t.rich("create.entryFooter", {
                          stage: entryStageName,
                          b: (chunks) => (
                            <span className="font-semibold text-foreground">{chunks}</span>
                          ),
                        })}
                      </span>
                    </>
                  ) : (
                    t("create.entryFooterNone")
                  )}
                </p>
              </>
            )}
          </div>
        </section>
      </div>

      {/* ---------- RIGHT: sticky summary ---------- */}
      <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
        {/* Tipo selecionado */}
        {selectedTemplate ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("create.typeSelected")}
                </p>
                <p className="text-base font-semibold text-foreground">{selectedTemplate.name}</p>
                {forecast && forecast.count > 0 && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t("create.reference", {
                      p50: forecast.p50.toFixed(0),
                      p85: forecast.p85.toFixed(0),
                    })}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t("create.priorityShort")}
              </span>
              <StatusBadge
                tone={priorityTone(priority)}
                label={tPriority(priority.toLowerCase())}
              />
            </div>
          </section>
        ) : (
          <EmptyState
            variant="card"
            icon={Box}
            title={t("create.waitingTemplateTitle")}
            description={t("create.waitingTemplateDesc")}
          />
        )}

        {/* Checagem de viabilidade */}
        {feasibility !== "unknown" && selectedTemplate && forecast ? (
          <section className={`rounded-xl border p-5 shadow-sm ${viaTone.wrap}`}>
            <div className="flex items-start gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${viaTone.chip}`}
              >
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("create.viabilityLabel")}
                </p>
                <p className={`text-lg font-bold ${viaTone.word}`}>
                  {t(`create.feasibilityShort.${feasibility}`)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-foreground/80">
              {t("create.viabilitySentence", {
                days: Number.isFinite(daysAvailable) ? daysAvailable : 0,
                ref: refDays,
              })}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">{t("create.daysAvailableLabel")}</p>
                <p className="text-base font-semibold text-foreground">
                  {t("create.daysShort", {
                    days: Number.isFinite(daysAvailable) ? daysAvailable : 0,
                  })}
                </p>
              </div>
              {idealStart && (
                <div className="rounded-lg bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground">{t("create.idealStartLabel")}</p>
                  <p className="text-base font-semibold text-foreground">
                    {fmtDate.format(idealStart)}
                  </p>
                </div>
              )}
            </div>
            {(forecast.lowConfidence ||
              (entryAssigneeId && entryExperienced === false) ||
              idealStartPassed) && (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {forecast.lowConfidence && (
                  <p>{t("create.feasibility.lowConfidence", { count: forecast.count })}</p>
                )}
                {entryAssigneeId && entryExperienced === false && (
                  <p>{t("create.feasibility.newToTypeNote", { days: Math.ceil(band) })}</p>
                )}
                {idealStartPassed && <p>{t("create.idealStartPassedNote")}</p>}
              </div>
            )}
            <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              {t("create.viabilityFootnote")}
            </p>
          </section>
        ) : (
          <EmptyState
            variant="card"
            icon={CalendarDays}
            title={t("create.waitingFeasibilityTitle")}
            description={t("create.waitingFeasibilityDesc")}
          />
        )}

        {/* Criação */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("create.creationLabel")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{t("create.creationNote")}</p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-5 w-5" />
            {t("create.createButton")}
          </button>
          <a
            href="/admin/tasks"
            className="mt-2 block text-center text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("create.cancelButton")}
          </a>
        </section>
      </div>
    </form>
  );
}
