"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function SignInError({
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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-bold text-foreground">{t("somethingWentWrong")}</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={reset}>{t("tryAgain")}</Button>
      </div>
    </div>
  );
}
