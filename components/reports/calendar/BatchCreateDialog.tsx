"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import type { MonthEvent, ProjectOption, TemplateOption } from "./monthly-types";

interface BatchCreateDialogProps {
  event: MonthEvent;
  projects: ProjectOption[];
  templates: TemplateOption[];
  onClose: () => void;
}

export function BatchCreateDialog({ event, projects, templates, onClose }: BatchCreateDialogProps) {
  const t = useTranslations("reportsCalendar.monthly.batch");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [dueDate, setDueDate] = useState(event.iso);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const inputClass =
    "h-10 w-full rounded-lg border-2 border-input-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all";

  // Auto-fill the title from template + event until the user edits it.
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!titleDirty) {
      const tpl = templates.find((x) => x.id === id);
      setTitle(tpl ? `${tpl.name} — ${event.title}` : "");
    }
  };

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, { clientName: string; projects: ProjectOption[] }>();
    for (const p of projects) {
      if (
        term &&
        !p.name.toLowerCase().includes(term) &&
        !p.clientName.toLowerCase().includes(term)
      ) {
        continue;
      }
      if (!map.has(p.clientId)) map.set(p.clientId, { clientName: p.clientName, projects: [] });
      map.get(p.clientId)!.projects.push(p);
    }
    return Array.from(map.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [projects, search]);

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

  const canSubmit =
    templateId !== "" && title.trim() !== "" && dueDate !== "" && selected.size > 0 && !isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      try {
        const result = await createTasksBatch({
          projectIds: [...selected],
          templateId,
          title: title.trim(),
          dueDate,
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
          <DialogTitle>{t("title", { event: event.title })}</DialogTitle>
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
              <Label htmlFor="batch-due">{t("dueDateLabel")}</Label>
              <Input
                id="batch-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

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

            {projects.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("noProjects")}</p>
            ) : (
              <div className="max-h-[34vh] space-y-3 overflow-y-auto rounded-lg border border-border p-3">
                {groups.map((group) => (
                  <div key={group.clientName}>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {group.clientName}
                    </p>
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
