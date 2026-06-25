"use client";

import { useState } from "react";
import { UserRole } from "@prisma/client";
import { useTranslations } from "next-intl";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  teams: { id: string; name: string }[];
  birthday: string | null; // yyyy-mm-dd
  admissionDate: string | null; // yyyy-mm-dd
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

export default function EditUserButton({ user, teams, updateUser }: EditUserButtonProps) {
  const t = useTranslations("admin.users.edit");
  const tRoles = useTranslations("admin.users.roles");
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState(user.role);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(
    new Set(user.teams.map((tm) => tm.id))
  );
  const [birthday, setBirthday] = useState(user.birthday ?? "");
  const [admissionDate, setAdmissionDate] = useState(user.admissionDate ?? "");

  const toggleTeam = (id: string) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await updateUser(formData);
    setIsOpen(false);
  };

  const fieldClass =
    "w-full rounded-lg border-2 border-input-border bg-input text-foreground shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 px-3 py-2 transition-colors";

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-primary hover:text-primary/80 font-semibold transition-colors"
      >
        {t("button")}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
            className="relative top-12 mx-auto p-6 border-2 border-border w-[26rem] max-w-[92vw] shadow-lg rounded-xl bg-card"
          >
            <div className="mt-3">
              <h3 id="edit-user-title" className="text-lg leading-6 font-bold text-foreground mb-4">
                {t("title")} {user.name || user.email}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="hidden" name="id" value={user.id} />

                {/* Role */}
                <div>
                  <label
                    htmlFor="role"
                    className="block text-sm font-semibold text-foreground mb-2"
                  >
                    {t("roleLabel")}
                  </label>
                  <select
                    id="role"
                    name="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    required
                    className={fieldClass}
                  >
                    <option value={UserRole.ADMIN}>{tRoles("admin")}</option>
                    <option value={UserRole.MANAGER}>{tRoles("manager")}</option>
                    <option value={UserRole.SUPERVISOR}>{tRoles("supervisor")}</option>
                    <option value={UserRole.MEMBER}>{tRoles("member")}</option>
                    <option value={UserRole.CLIENT}>{tRoles("client")}</option>
                  </select>
                </div>

                {/* Birthday + Admission */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="birthday"
                      className="block text-sm font-semibold text-foreground mb-2"
                    >
                      {t("birthdayLabel")}
                    </label>
                    <input
                      id="birthday"
                      name="birthday"
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="admissionDate"
                      className="block text-sm font-semibold text-foreground mb-2"
                    >
                      {t("admissionLabel")}
                    </label>
                    <input
                      id="admissionDate"
                      name="admissionDate"
                      type="date"
                      value={admissionDate}
                      onChange={(e) => setAdmissionDate(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>

                {/* Teams (multi-select) */}
                <div>
                  <span className="block text-sm font-semibold text-foreground mb-2">
                    {t("teamsLabel")}
                  </span>
                  <div className="max-h-44 overflow-y-auto rounded-lg border-2 border-input-border p-2 space-y-1">
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

                {/* Buttons */}
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 bg-muted text-muted-foreground font-semibold rounded-lg hover:bg-muted/80 transition-colors"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-md"
                  >
                    {t("saveChanges")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
