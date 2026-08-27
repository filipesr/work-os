"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Button } from "@/components/ui/button";
import { inviteUser } from "@/lib/actions/user";
import { useServerAction } from "@/lib/hooks/useServerAction";

const ROLES = ["MEMBER", "SUPERVISOR", "MANAGER", "ADMIN"] as const;

/** Cadastra alguém que ainda não entrou.
 *
 *  Virou obrigatório quando o login passou a ser por convite: sem um caminho para criar o usuário
 *  ANTES do primeiro login, ninguém novo entraria nunca mais. Não há senha aqui — o vínculo com o
 *  Google nasce sozinho no primeiro acesso, por e-mail verificado.
 */
export function InviteUserButton({ teams }: { teams: { id: string; name: string }[] }) {
  const t = useTranslations("admin.users.invite");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { run, isPending } = useServerAction(inviteUser, {
    successMessage: t("success"),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button type="button" variant="default" className="gap-2">
          <UserPlus className="h-4 w-4" />
          {t("trigger")}
        </Button>
      }
      title={t("title")}
      description={t("description")}
      formId="invite-user-form"
      submitLabel={t("submit")}
      isPending={isPending}
    >
      <form
        id="invite-user-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (!String(fd.get("email") ?? "").includes("@")) {
            toast.error(t("invalidEmail"));
            return;
          }
          run(fd);
        }}
      >
        <div>
          <FieldLabel htmlFor="invite-email" required>
            {t("emailLabel")}
          </FieldLabel>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder={t("emailPlaceholder")}
          />
          {/* O e-mail é a chave: é por ele que o Google reconhece a pessoa no primeiro login. */}
          <p className="mt-1 text-xs text-muted-foreground">{t("emailHint")}</p>
        </div>

        <div>
          <FieldLabel htmlFor="invite-name">{t("nameLabel")}</FieldLabel>
          <Input id="invite-name" name="name" type="text" placeholder={t("namePlaceholder")} />
          <p className="mt-1 text-xs text-muted-foreground">{t("nameHint")}</p>
        </div>

        <div>
          <FieldLabel htmlFor="invite-role" required>
            {t("roleLabel")}
          </FieldLabel>
          <select
            id="invite-role"
            name="role"
            defaultValue="MEMBER"
            className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r.toLowerCase()}`)}
              </option>
            ))}
          </select>
        </div>

        {teams.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-foreground">
              {t("teamsLabel")}
            </legend>
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-border p-3">
              {teams.map((team) => (
                <label key={team.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="teamIds"
                    value={team.id}
                    className="h-4 w-4 accent-primary"
                  />
                  {team.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </form>
    </FormDialog>
  );
}
