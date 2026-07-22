"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { classifyReworkEvent } from "@/lib/actions/rework-classify";

export default function ReworkClassifyToggle({
  reworkEventId,
  current,
}: {
  reworkEventId: string;
  current: "DEFECT" | "LEGITIMATE" | null;
}) {
  const t = useTranslations("admin.users.quality");
  const router = useRouter();
  const { run, isPending } = useServerAction(classifyReworkEvent, {
    onSuccess: () => router.refresh(),
  });
  return (
    <div className="flex gap-1">
      {(["DEFECT", "LEGITIMATE"] as const).map((c) => (
        <button
          key={c}
          type="button"
          disabled={isPending}
          aria-pressed={current === c}
          onClick={() => run(reworkEventId, c)}
          className={`rounded px-2 py-0.5 text-[11px] font-medium border disabled:opacity-50 ${
            current === c
              ? c === "DEFECT"
                ? "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300"
                : "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {t(c === "DEFECT" ? "classDefect" : "classLegitimate")}
        </button>
      ))}
    </div>
  );
}
