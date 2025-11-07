"use client";

import { LocaleType, defaultLocale } from "./i18n";

const LOCALE_STORAGE_KEY = "preferred-locale";

/**
 * Gets the preferred locale from localStorage
 */
export function getStoredLocale(): LocaleType | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored as LocaleType | null;
  } catch (error) {
    console.error("Failed to get stored locale:", error);
    return null;
  }
}

/**
 * Sets the preferred locale in localStorage
 */
export function setStoredLocale(locale: LocaleType): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch (error) {
    console.error("Failed to set stored locale:", error);
  }
}

/**
 * Gets the locale to use, prioritizing stored preference
 */
export function getPreferredLocale(): LocaleType {
  const stored = getStoredLocale();
  if (stored) return stored;

  // Try to detect from browser
  if (typeof window !== "undefined" && navigator.language) {
    const browserLang = navigator.language;
    if (browserLang.startsWith("pt")) return "pt-BR";
    if (browserLang.startsWith("es")) return "es-ES";
  }

  return defaultLocale;
}
