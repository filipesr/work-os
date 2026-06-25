"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";

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

export default function ManageTeamMembers({
  teamId,
  teamName,
  users,
  currentMemberIds,
  setMembers,
}: ManageTeamMembersProps) {
  const t = useTranslations("admin.teams.detail");
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentMemberIds));
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    await setMembers(formData);
    setIsSaving(false);
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelected(new Set(currentMemberIds));
          setSearch("");
          setIsOpen(true);
        }}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-sm hover:shadow-md transition-all"
      >
        <UserPlus className="h-4 w-4" />
        {t("manageMembers")}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="relative mt-12 w-full max-w-lg rounded-xl border-2 border-border bg-card p-6 shadow-lg"
          >
            <h3 className="text-lg font-bold text-foreground">
              {t("manageMembersTitle", { team: teamName })}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("manageMembersSubtitle")}</p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={teamId} />

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchUsers")}
                className="h-10 w-full rounded-lg border-2 border-input-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 transition-all"
              />

              <div className="text-xs text-muted-foreground">
                {t("selectedCount", { count: selected.size })}
              </div>

              <div className="max-h-[50vh] space-y-1 overflow-y-auto rounded-lg border-2 border-border p-2">
                {filtered.map((user) => (
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
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2 bg-muted text-muted-foreground font-semibold rounded-lg hover:bg-muted/80 transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-md transition-colors disabled:opacity-60"
                >
                  {t("saveMembers")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
