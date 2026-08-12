"use client";

import { useState, useTransition } from "react";
import { UserRole } from "@prisma/client";
import { useTranslations } from "next-intl";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  teams: { id: string; name: string }[];
  birthday: string | null; // yyyy-mm-dd
  admissionDate: string | null; // yyyy-mm-dd
  weeklyCapacityHours: number | null;
}

interface Team {
  id: string;
  name: string;
}

interface EditUserButtonProps {
  user: User;
  teams: Team[];
  updateUser: (formData: FormData) => Promise<void>;
}

const FORM_ID = "edit-user-form";

/**
 * CRUD do usuário: papel, times, nascimento, admissão e capacidade semanal.
 * **Só isso** — a analítica da pessoa (throughput/utilização/qualidade) vive em
 * `/reports/user/[id]`, guardada por P1/P2.
 *
 * Migrado de um modal artesanal (`fixed inset-0` à mão) para o `FormDialog`
 * padrão: ganha ESC, trava de foco, restauração do foco no gatilho e bloqueio de
 * scroll do fundo, que a versão manual não tinha.
 */
export default function EditUserButton({ user, teams, updateUser }: EditUserButtonProps) {
  const t = useTranslations("admin.users.edit");
  const tRoles = useTranslations("admin.users.roles");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(
    new Set(user.teams.map((tm) => tm.id))
  );

  const toggleTeam = (id: string) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateUser(formData);
      setIsOpen(false);
    });
  };

  const fieldClass =
    "w-full rounded-lg border-2 border-input-border bg-input px-3 py-2 text-foreground shadow-sm transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <button
          type="button"
          className="font-semibold text-primary transition-colors hover:text-primary/80"
        >
          {t("button")}
        </button>
      }
      title={`${t("title")} ${user.name || user.email}`}
      description={t("description")}
      formId={FORM_ID}
      submitLabel={t("saveChanges")}
      isPending={isPending}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="id" value={user.id} />

        <div>
          <FieldLabel htmlFor="role" required>
            {t("roleLabel")}
          </FieldLabel>
          <select id="role" name="role" defaultValue={user.role} required className={fieldClass}>
            <option value={UserRole.ADMIN}>{tRoles("admin")}</option>
            <option value={UserRole.MANAGER}>{tRoles("manager")}</option>
            <option value={UserRole.SUPERVISOR}>{tRoles("supervisor")}</option>
            <option value={UserRole.MEMBER}>{tRoles("member")}</option>
            <option value={UserRole.CLIENT}>{tRoles("client")}</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="birthday">{t("birthdayLabel")}</FieldLabel>
            <input
              id="birthday"
              name="birthday"
              type="date"
              defaultValue={user.birthday ?? ""}
              className={fieldClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="admissionDate">{t("admissionLabel")}</FieldLabel>
            <input
              id="admissionDate"
              name="admissionDate"
              type="date"
              defaultValue={user.admissionDate ?? ""}
              className={fieldClass}
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="weeklyCapacityHours">{t("capacityLabel")}</FieldLabel>
            <input
              id="weeklyCapacityHours"
              name="weeklyCapacityHours"
              type="number"
              min="1"
              defaultValue={user.weeklyCapacityHours ?? ""}
              placeholder={t("capacityPlaceholder")}
              className={fieldClass}
            />
            {/* A capacidade é o DENOMINADOR da utilização e dos sinais de
                sobrecarga; sem ela os dois ficam nulos, não zero. */}
            <p className="mt-1 text-xs text-muted-foreground">{t("capacityHint")}</p>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm font-semibold text-foreground">
            {t("teamsLabel")}
          </span>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border-2 border-input-border p-2">
            {teams.map((team) => (
              <label
                key={team.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60"
              >
                <input
                  type="checkbox"
                  name="teamIds"
                  value={team.id}
                  checked={selectedTeams.has(team.id)}
                  onChange={() => toggleTeam(team.id)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-foreground">{team.name}</span>
              </label>
            ))}
          </div>
        </div>
      </form>
    </FormDialog>
  );
}
