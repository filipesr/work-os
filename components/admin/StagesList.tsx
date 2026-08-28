"use client";

import { useState, useEffect } from "react";
import { deleteTemplateStage } from "@/lib/actions/stage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { StageEditForm } from "./StageEditForm";
import { useTranslations } from "next-intl";
import type { Stage } from "@/lib/types/stages";
import { canDeleteStage } from "@/lib/template-invariants";

interface StagesListProps {
  stages: Stage[];
  templateId: string;
  teams: Array<{ id: string; name: string }>;
}

export function StagesList({ stages, templateId, teams }: StagesListProps) {
  const t = useTranslations("admin.workflows.stagesList");
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingDeps, setEditingDeps] = useState<Set<string>>(new Set());

  const handleToggleDep = (stageId: string) => {
    const newSelected = new Set(editingDeps);
    if (newSelected.has(stageId)) {
      newSelected.delete(stageId);
    } else {
      newSelected.add(stageId);
    }
    setEditingDeps(newSelected);
  };

  useEffect(() => {
    if (editingStageId) {
      const stage = stages.find((s) => s.id === editingStageId);
      if (stage) {
        const deps = stage.dependents.map((d) => d.dependsOnStageId);
        setEditingDeps(new Set(deps));
      }
    } else {
      setEditingDeps(new Set());
    }
  }, [editingStageId, stages]);

  if (stages.length === 0) {
    return <div className="text-center text-muted-foreground py-8">{t("empty")}</div>;
  }

  // Template sem etapa não deve existir — a mesma invariante que o servidor garante. Com uma etapa
  // só, excluir fica indisponível para as duas (não é "a última etapa é especial", é "não sobra
  // nenhuma"), com o motivo ao lado: confirmar o diálogo e só então levar erro é aprender a regra
  // do jeito pior.
  const podeExcluir = canDeleteStage(stages.length);

  return (
    <div className="space-y-4">
      {stages.map((stage) => {
        const isEditing = editingStageId === stage.id;

        return (
          <div key={stage.id} className="border border-border rounded-lg p-4 bg-card shadow-sm">
            {isEditing ? (
              <StageEditForm
                stage={stage}
                templateId={templateId}
                teams={teams}
                stages={stages}
                selectedDeps={editingDeps}
                onToggleDep={handleToggleDep}
                onClose={() => {
                  setEditingStageId(null);
                  setEditingDeps(new Set());
                }}
              />
            ) : (
              // Display Mode
              <>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {stage.order}
                      </span>
                      <h3 className="text-lg font-bold text-foreground">{stage.name}</h3>
                    </div>
                    <div className="ml-11 space-y-1">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{t("team")}</span>{" "}
                        {stage.defaultTeam?.name || t("noTeamAssigned")}
                      </p>
                      {stage.dependents.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">{t("dependsOn")}</span>{" "}
                          {stage.dependents.map((dep) => dep.dependsOn.name).join(", ")}
                        </p>
                      )}
                      {/* SLA, teto de WIP e opcionalidade ficavam visíveis só
                          DENTRO do formulário de edição. Configuração invisível
                          é configuração esquecida: o SLA alimenta o
                          envelhecimento e o WIP limita o pull — quem abre o
                          fluxo precisa ver o que está valendo sem clicar em
                          Editar em cada etapa. Ausente = não configurado, que é
                          diferente de zero. */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <StatusBadge
                          tone={stage.expectedDurationHours ? "info" : "neutral"}
                          label={
                            stage.expectedDurationHours
                              ? t("slaBadge", { hours: stage.expectedDurationHours })
                              : t("slaUnset")
                          }
                        />
                        <StatusBadge
                          tone={stage.wipLimit ? "info" : "neutral"}
                          label={
                            stage.wipLimit
                              ? t("wipBadge", { limit: stage.wipLimit })
                              : t("wipUnset")
                          }
                        />
                        {stage.optional && (
                          <StatusBadge tone="warning" label={t("optionalBadge")} />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => setEditingStageId(stage.id)}
                      className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-sm"
                    >
                      {t("editButton")}
                    </button>
                    <div>
                      <ConfirmActionButton
                        action={() => deleteTemplateStage(stage.id, templateId)}
                        title={t("deleteConfirmTitle")}
                        description={t("deleteConfirmMessage", { stageName: stage.name })}
                        confirmLabel={t("deleteConfirmButton")}
                        cancelLabel={t("cancel")}
                        confirmVariant="destructive"
                        trigger={
                          <button
                            disabled={!podeExcluir}
                            className="px-4 py-2 text-sm font-semibold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {t("deleteButton")}
                          </button>
                        }
                      />
                      {/* O motivo ao lado do botão desabilitado, igual ao que "adicionar etapa" já
                          faz em CreateStageForm — botão cinza sem explicação vira chamado de
                          suporte. */}
                      {!podeExcluir && (
                        <p className="mt-1 max-w-[10rem] text-right text-xs text-muted-foreground">
                          {t("lastStageBlocked")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
