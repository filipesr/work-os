"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function TaskDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.general");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container mx-auto py-12 px-4 text-center">
      <div className="max-w-md mx-auto space-y-4">
        <h2 className="text-2xl font-bold text-foreground">{t("somethingWentWrong")}</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={reset}>{t("tryAgain")}</Button>
      </div>
    </div>
  );
}
