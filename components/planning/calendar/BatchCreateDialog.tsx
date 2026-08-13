"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTasksBatch } from "@/lib/actions/task";
import { createProject } from "@/lib/actions/project";
import { daysBetweenIso, planningChain } from "@/lib/calendar/planning-dates";
import {
  isoToDisplay,
  type ClientOption,
  type ProjectOption,
  type TemplateOption,
} from "./monthly-types";

interface BatchCreateDialogProps {
  date: string;
  eventTitle?: string;
  /** Data do calendário de origem. Quando presente, as demandas nascem
   *  VINCULADAS a ela — é o que alimenta a cobertura em /planning/dates. */
  occurrenceId?: string;
  /** Projetos já marcados ao abrir. Usado quando o gatilho é um CLIENTE
   *  específico ("este está sem demanda"): sem isso o diálogo abriria vazio e
   *  obrigaria a reencontrar o cliente que acabou de ser clicado. */
  preselectedProjectIds?: string[];
  clients: ClientOption[];
  projects: ProjectOption[];
  templates: TemplateOption[];
  onClose: () => void;
}

export function BatchCreateDialog({
  date,
  eventTitle,
  occurrenceId,
  preselectedProjectIds,
  clients,
  projects,
  templates,
  onClose,
}: BatchCreateDialogProps) {
  const t = useTranslations("reportsCalendar.monthly.batch");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [projectList, setProjectList] = useState<ProjectOption[]>(projects);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  // ANTECEDÊNCIA, em dias, entre a conclusão da demanda e a data em que o
  // material é usado (publicado, instalado, apresentado). Começa VAZIA de
  // propósito: quanto tempo o material precisa estar pronto antes é julgamento
  // do gestor e varia por campanha — um padrão viraria resposta automática.
  //
  // Antes não existia: `dueDate` nascia na própria data do evento, ou seja, a
  // demanda vencia no dia do Natal em vez de estar pronta antes dele. Editável,
  // mas ninguém corrige um padrão que parece certo.
  const [leadDays, setLeadDays] = useState("");

  const totalHoras = templates.find((x) => x.id === templateId)?.totalDurationHours ?? null;

  // A cadeia inteira: evento → entrega → conclusão → início. Fica visível toda,
  // porque julgar um início sem ver de onde ele saiu é confiar num número.
  const chain = useMemo(
    () => planningChain({ eventoIso: date, antecedenciaDias: leadDays, totalHoras }),
    [date, leadDays, totalHoras]
  );

  // O prazo GRAVADO é a conclusão — a data em que o trabalho precisa estar
  // pronto, já descontada a gordura. Não a entrega: entregar e concluir no mesmo
  // dia é não ter folga nenhuma, que é o que a gordura existe para evitar.
  const dueDate = chain.conclusao;
  const suggestedStart = chain.inicio;

  // Início EDITÁVEL. Segue a sugestão enquanto o gestor não a contraria; a partir
  // do momento em que ele digita, é a escolha dele que manda — mudar template ou
  // prazo depois disso não deve sobrescrever uma decisão consciente.
  const [startDirty, setStartDirty] = useState(false);
  const [plannedStart, setPlannedStart] = useState("");
  const effectiveStart = startDirty ? plannedStart : suggestedStart;

  // Começar DEPOIS do sugerido = espremer o cronograma: menos tempo de execução
  // do que as etapas declaram precisar. Não é proibido — prazo de cliente às
  // vezes obriga — mas não pode passar despercebido.
  const compressedDays =
    startDirty && plannedStart && suggestedStart
      ? (daysBetweenIso(suggestedStart, plannedStart) ?? 0)
      : 0;
  const isCompressed = compressedDays > 0;
  const [acceptedCompression, setAcceptedCompression] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(preselectedProjectIds ?? []));

  // Inline "create project for client" state
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [savingProject, setSavingProject] = useState(false);

  const inputClass =
    "h-10 w-full rounded-lg border-2 border-input-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all";

  // Auto-fill the title from template (+ event) until the user edits it.
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!titleDirty) {
      const tpl = templates.find((x) => x.id === id);
      if (!tpl) setTitle("");
      else setTitle(eventTitle ? `${tpl.name} — ${eventTitle}` : tpl.name);
    }
  };

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byClient = new Map<string, ProjectOption[]>();
    for (const p of projectList) {
      if (!byClient.has(p.clientId)) byClient.set(p.clientId, []);
      byClient.get(p.clientId)!.push(p);
    }
    return clients
      .map((c) => {
        const all = (byClient.get(c.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
        const clientMatch = !term || c.name.toLowerCase().includes(term);
        const visibleProjects =
          term && !clientMatch ? all.filter((p) => p.name.toLowerCase().includes(term)) : all;
        return {
          clientId: c.id,
          clientName: c.name,
          projects: visibleProjects,
          visible: clientMatch || visibleProjects.length > 0,
        };
      })
      .filter((g) => g.visible)
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [clients, projectList, search]);

  const visibleIds = useMemo(() => groups.flatMap((g) => g.projects.map((p) => p.id)), [groups]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected((prev) => new Set([...prev, ...visibleIds]));
  const clearSelection = () => setSelected(new Set());

  const handleCreateProject = async (clientId: string) => {
    const name = newProjectName.trim();
    if (!name) return;
    setSavingProject(true);
    const result = await createProject({ name, clientId });
    setSavingProject(false);
    if (result.error || !result.project) {
      toast.error(result.error ?? t("projectError"));
      return;
    }
    const p = result.project;
    const option: ProjectOption = {
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      clientName: p.client.name,
    };
    setProjectList((prev) => [...prev, option]);
    setSelected((prev) => new Set([...prev, p.id]));
    setNewProjectName("");
    setCreatingFor(null);
    toast.success(t("projectCreated"));
  };

  const canSubmit =
    templateId !== "" &&
    title.trim() !== "" &&
    dueDate !== "" &&
    selected.size > 0 &&
    !isPending &&
    // O aceite é a "confirmação com alerta": não basta ver o aviso, é preciso
    // marcar que se está assumindo o cronograma comprimido.
    (!isCompressed || acceptedCompression);

  const handleSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      try {
        const result = await createTasksBatch({
          projectIds: [...selected],
          templateId,
          title: title.trim(),
          dueDate,
          plannedStartAt: effectiveStart || undefined,
          calendarOccurrenceId: occurrenceId,
        });
        toast.success(t("success", { count: result.created }));
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {eventTitle
              ? t("title", { event: eventTitle })
              : t("titleForDay", { date: isoToDisplay(date) })}
          </DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="batch-template">{t("templateLabel")}</Label>
              <select
                id="batch-template"
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className={inputClass}
              >
                <option value="">{t("templatePlaceholder")}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-lead">{t("leadDaysLabel")}</Label>
              <Input
                id="batch-lead"
                type="number"
                min={0}
                inputMode="numeric"
                value={leadDays}
                onChange={(e) => setLeadDays(e.target.value)}
                placeholder={t("leadDaysPlaceholder")}
                aria-describedby="batch-lead-hint"
              />
            </div>
          </div>

          {/* A conta, à vista. O campo pede dias; o que o gestor precisa julgar é
              a DATA que sai deles — mostrá-la aqui é o que transforma um número
              abstrato numa decisão verificável. */}
          {/* A cadeia à vista. Cada linha responde a uma pergunta diferente, e
              mostrar os passos é o que permite ao gestor discordar de um deles em
              vez de aceitar ou rejeitar o resultado inteiro. */}
          {chain.entrega ? (
            <dl
              id="batch-lead-hint"
              className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs"
            >
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("chainEvent")}</dt>
                <dd className="font-medium text-foreground">{isoToDisplay(date)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("chainDelivery")}</dt>
                <dd className="font-medium text-foreground">{isoToDisplay(chain.entrega)}</dd>
              </div>
              {chain.conclusao && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">
                    {t("chainDone", { buffer: chain.gorduraDias })}
                  </dt>
                  <dd className="font-semibold text-foreground">{isoToDisplay(chain.conclusao)}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p id="batch-lead-hint" className="text-xs text-muted-foreground">
              {t("leadDaysHint", { usage: isoToDisplay(date) })}
            </p>
          )}

          {/* Início planejado. Só aparece quando há prazo — antes disso não há o
              que recuar, e um campo vazio pediria uma data sem referência. */}
          {dueDate && (
            <div className="space-y-1.5">
              <Label htmlFor="batch-start">{t("startLabel")}</Label>
              <Input
                id="batch-start"
                type="date"
                value={effectiveStart}
                onChange={(e) => {
                  setStartDirty(true);
                  setPlannedStart(e.target.value);
                  setAcceptedCompression(false);
                }}
                aria-describedby="batch-start-hint"
              />
              <p id="batch-start-hint" className="text-xs text-muted-foreground">
                {suggestedStart
                  ? t("startSuggested", { date: isoToDisplay(suggestedStart) })
                  : /* Sem previsão nas etapas do fluxo não há o que sugerir. Dizer
                       isso é melhor que um campo mudo: aponta o que configurar. */
                    t("startNoEstimate")}
              </p>

              {isCompressed && (
                <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3">
                  <p className="text-xs font-semibold text-foreground">
                    {t("compressedTitle", { days: compressedDays })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("compressedBody", {
                      suggested: isoToDisplay(suggestedStart),
                      chosen: isoToDisplay(plannedStart),
                    })}
                  </p>
                  <label className="mt-2 flex items-start gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={acceptedCompression}
                      onChange={(e) => setAcceptedCompression(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>{t("compressedAccept")}</span>
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="batch-title">{t("titleLabel")}</Label>
            <Input
              id="batch-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleDirty(true);
              }}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{t("projectsLabel")}</Label>
              <span className="text-xs text-muted-foreground">
                {t("selectedCount", { count: selected.size })}
              </span>
            </div>
            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={selectAll}
                className="font-medium text-primary hover:underline"
              >
                {t("selectAll")}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="font-medium text-muted-foreground hover:underline"
              >
                {t("clearSelection")}
              </button>
            </div>

            {clients.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("noProjects")}</p>
            ) : (
              <div className="max-h-[34vh] space-y-3 overflow-y-auto rounded-lg border border-border p-3">
                {groups.map((group) => (
                  <div key={group.clientId}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {group.clientName}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingFor(creatingFor === group.clientId ? null : group.clientId);
                          setNewProjectName("");
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t("addProject")}
                      </button>
                    </div>

                    {creatingFor === group.clientId && (
                      <div className="mb-2 flex items-center gap-2">
                        <Input
                          autoFocus
                          value={newProjectName}
                          placeholder={t("newProjectPlaceholder")}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleCreateProject(group.clientId);
                            }
                          }}
                          className="h-8"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingProject || newProjectName.trim() === ""}
                          onClick={() => void handleCreateProject(group.clientId)}
                        >
                          {t("saveProject")}
                        </Button>
                      </div>
                    )}

                    <div className="space-y-1">
                      {group.projects.map((p) => (
                        <label
                          key={p.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggle(p.id)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="text-sm text-foreground">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {isPending ? t("creating") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
