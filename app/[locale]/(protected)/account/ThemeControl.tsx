"use client";

import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Controle de tema para a tela de conta (§3.1: o tema saiu do dropdown do avatar
 * e mora aqui, junto do idioma). Segmentado claro/escuro sobre o `useTheme`.
 */
export function ThemeControl() {
  const t = useTranslations("account");
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  const base =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const active = "bg-card text-foreground shadow-sm";
  const idle = "text-muted-foreground hover:text-foreground";

  return (
    <div
      role="group"
      aria-label={t("theme.label")}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
    >
      <button
        type="button"
        onClick={() => {
          if (isDark) toggle();
        }}
        aria-pressed={!isDark}
        className={`${base} ${!isDark ? active : idle}`}
      >
        <Sun className="h-4 w-4" aria-hidden="true" />
        {t("theme.light")}
      </button>
      <button
        type="button"
        onClick={() => {
          if (!isDark) toggle();
        }}
        aria-pressed={isDark}
        className={`${base} ${isDark ? active : idle}`}
      >
        <Moon className="h-4 w-4" aria-hidden="true" />
        {t("theme.dark")}
      </button>
    </div>
  );
}
