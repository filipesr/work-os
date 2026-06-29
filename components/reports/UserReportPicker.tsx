"use client";

import { useRouter } from "next/navigation";

/**
 * Collaborator selector on the reports index — navigates to that user's
 * dedicated productivity report on selection.
 */
export function UserReportPicker({
  users,
  placeholder,
}: {
  users: { id: string; name: string }[];
  placeholder: string;
}) {
  const router = useRouter();

  return (
    <select
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) router.push(`/reports/user/${e.target.value}`);
      }}
      className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 text-base font-medium text-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
