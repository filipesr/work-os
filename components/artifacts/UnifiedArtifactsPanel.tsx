"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { removeScopedArtifact } from "@/lib/actions/artifact";
import { type UnifiedArtifactRow, sortRows } from "@/lib/artifacts/unify";
import { useArtifactVersions } from "@/lib/hooks/useArtifactVersions";
import { useNasReupload } from "@/lib/hooks/useNasReupload";
import { ArtifactRow } from "@/components/artifacts/ArtifactRow";
import { AddArtifactForm } from "@/components/artifacts/AddArtifactForm";

interface UnifiedArtifactsPanelProps {
  rows: UnifiedArtifactRow[];
  scope: "TASK" | "PROJECT" | "CLIENT";
  ownerIds: { taskId?: string; projectId?: string; clientId?: string };
  /** Esconde o selo de tarefa para linhas desta tarefa (tela da própria demanda). */
  currentTaskId?: string;
  /** Mostra o formulário de adicionar. */
  canAdd: boolean;
  /** Permite remover artefatos de projeto/cliente (MANAGER+). */
  canRemove: boolean;
}

export function UnifiedArtifactsPanel({
  rows,
  scope,
  ownerIds,
  currentTaskId,
  canAdd,
  canRemove,
}: UnifiedArtifactsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const versions = useArtifactVersions(startTransition);
  const reupload = useNasReupload({ scope, ownerIds, startTransition });

  const sorted = sortRows(rows);

  const handleRemove = (id: string) => {
    startTransition(async () => {
      const res = await removeScopedArtifact(id);
      if (res?.success) {
        toast.success("Artefato removido");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Erro ao remover");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Input escondido do "Reenviar" (um só, alvo via ref). */}
      <input
        ref={reupload.inputRef}
        type="file"
        className="hidden"
        onChange={reupload.onInputChange}
      />
      {/* Rows */}
      {sorted.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Nenhum artefato. Adicione links ou arquivos relevantes.
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((a) => (
            <ArtifactRow
              key={a.id}
              row={a}
              scope={scope}
              currentTaskId={currentTaskId}
              canAdd={canAdd}
              canRemove={canRemove}
              isPending={isPending}
              verId={versions.verId}
              onSetVerId={versions.setVerId}
              verUrl={versions.verUrl}
              onSetVerUrl={versions.setVerUrl}
              historyFor={versions.historyFor}
              history={versions.history}
              onNewVersion={versions.handleNewVersion}
              onToggleHistory={versions.toggleHistory}
              reenviarBusy={reupload.reenviarBusy}
              onReenviar={reupload.startReenviar}
              onRemoveFailed={reupload.handleRemoveFailed}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* Add form */}
      {canAdd && (
        <AddArtifactForm
          scope={scope}
          ownerIds={ownerIds}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
    </div>
  );
}
