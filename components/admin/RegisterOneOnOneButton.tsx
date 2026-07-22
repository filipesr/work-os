"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { logOneOnOne } from "@/lib/actions/one-on-one";

// Register-a-1:1 button with a confirm dialog. On success it refreshes the
// route, so the server re-fetches: the just-registered member is no longer
// overdue and drops off the cadence list (the next overdue takes its place).
export default function RegisterOneOnOneButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const t = useTranslations("admin.health.oneOnOne");

  return (
    <ConfirmActionButton
      action={() => logOneOnOne(userId)}
      title={t("confirmTitle")}
      description={t("confirmDesc", { name })}
      confirmLabel={t("confirmYes")}
      successMessage={t("logged")}
      onSuccess={() => router.refresh()}
      trigger={
        <button
          type="button"
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
        >
          {t("logButton")}
        </button>
      }
    />
  );
}
