"use client";

import { useRouter } from "next/navigation";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { logOneOnOne } from "@/lib/actions/one-on-one";

// "Register a 1:1 today" — a minimal one-click log; notes can be added later.
export default function LogOneOnOneButton({
  userId,
  label,
  successMessage,
}: {
  userId: string;
  label: string;
  successMessage: string;
}) {
  const router = useRouter();
  const { run, isPending } = useServerAction(logOneOnOne, {
    successMessage,
    onSuccess: () => router.refresh(),
  });

  return (
    <button
      type="button"
      onClick={() => run(userId)}
      disabled={isPending}
      className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
    >
      {label}
    </button>
  );
}
