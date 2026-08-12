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
  // Segue onde o componente passou a viver (PersonAnalytics), não onde nasceu.
  const t = useTranslations("people.quality");
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
                ? "bg-danger-subtle text-danger border-danger/40"
                : "bg-success-subtle text-success border-success/40"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {t(c === "DEFECT" ? "classDefect" : "classLegitimate")}
        </button>
      ))}
    </div>
  );
}
