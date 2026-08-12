"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";

interface UserOption {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

interface ManageTeamMembersProps {
  teamId: string;
  teamName: string;
  users: UserOption[];
  currentMemberIds: string[];
  setMembers: (formData: FormData) => Promise<void>;
}

const FORM_ID = "manage-team-members-form";

/**
 * Gestão de membros do time: busca + seleção por checkbox.
 *
 * Migrado de um modal artesanal para o `FormDialog` padrão (ESC, trava de foco,
 * restauração do foco, scroll do fundo bloqueado).
 *
 * A busca filtra em memória de propósito: a lista de pessoas de uma agência é
 * pequena e já veio inteira do servidor. Ir ao banco a cada tecla aqui só
 * adicionaria latência — diferente das listas de clientes/projetos, que crescem
 * sem teto e filtram no banco.
 */
export default function ManageTeamMembers({
  teamId,
  teamName,
  users,
  currentMemberIds,
  setMembers,
}: ManageTeamMembersProps) {
  const t = useTranslations("admin.teams.detail");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set(currentMemberIds));
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(term) || (u.email ?? "").toLowerCase().includes(term)
    );
  }, [users, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Reabrir descarta edições não salvas: o diálogo sempre parte do que está no
  // banco, nunca de uma seleção meio-feita de uma tentativa anterior.
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setSelected(new Set(currentMemberIds));
      setSearch("");
    }
    setIsOpen(open);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await setMembers(formData);
      setIsOpen(false);
    });
  };

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
        >
          <UserPlus className="h-4 w-4" />
          {t("manageMembers")}
        </button>
      }
      title={t("manageMembersTitle", { team: teamName })}
      description={t("manageMembersSubtitle")}
      formId={FORM_ID}
      submitLabel={t("saveMembers")}
      isPending={isPending}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-3">
        <input type="hidden" name="id" value={teamId} />

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchUsers")}
          aria-label={t("searchUsers")}
          className="h-10 w-full rounded-lg border-2 border-input-border bg-input px-3 text-sm text-foreground transition-all placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
        />

        <div className="text-xs text-muted-foreground" aria-live="polite">
          {t("selectedCount", { count: selected.size })}
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {t("noUsersFound")}
            </p>
          ) : (
            filtered.map((user) => (
              <label
                key={user.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60"
              >
                <input
                  type="checkbox"
                  name="userIds"
                  value={user.id}
                  checked={selected.has(user.id)}
                  onChange={() => toggle(user.id)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {user.name || user.email}
                  </span>
                  {user.name && user.email && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  )}
                </span>
              </label>
            ))
          )}
        </div>

        {/* Quem foi filtrado pela busca continua selecionado — os checkboxes
            ocultos não existem no DOM, então a seleção viaja por estes hidden.
            Sem isso, salvar com um filtro ativo REMOVERIA todo mundo que não
            estivesse visível na hora. */}
        {Array.from(selected)
          .filter((id) => !filtered.some((u) => u.id === id))
          .map((id) => (
            <input key={id} type="hidden" name="userIds" value={id} />
          ))}
      </form>
    </FormDialog>
  );
}
