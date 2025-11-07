import { Locale } from "@/i18n";

/**
 * Loads all translation messages for a given locale
 */
export async function getMessages(locale: Locale) {
  return {
    common: (await import(`@/locales/${locale}/common.json`)).default,
    auth: (await import(`@/locales/${locale}/auth.json`)).default,
    dashboard: (await import(`@/locales/${locale}/dashboard.json`)).default,
    tasks: (await import(`@/locales/${locale}/tasks.json`)).default,
    forms: (await import(`@/locales/${locale}/forms.json`)).default,
    admin: (await import(`@/locales/${locale}/admin.json`)).default,
    reports: (await import(`@/locales/${locale}/reports.json`)).default,
    reportsNavigation: (await import(`@/locales/${locale}/reportsNavigation.json`)).default,
    reportsProductivity: (await import(`@/locales/${locale}/reportsProductivity.json`)).default,
    reportsPerformance: (await import(`@/locales/${locale}/reportsPerformance.json`)).default,
    errors: (await import(`@/locales/${locale}/errors.json`)).default,
    toasts: (await import(`@/locales/${locale}/toasts.json`)).default,
    account: (await import(`@/locales/${locale}/account.json`)).default,
    projects: (await import(`@/locales/${locale}/projects.json`)).default,
    template: (await import(`@/locales/${locale}/template.json`)).default,
    quickCreate: (await import(`@/locales/${locale}/quickCreate.json`)).default,
    delete: (await import(`@/locales/${locale}/delete.json`)).default,
    taskFlow: (await import(`@/locales/${locale}/taskFlow.json`)).default,
  };
}

/**
 * Available locales
 */
export const locales = ["pt-BR", "es-ES"] as const;
export type LocaleType = (typeof locales)[number];

/**
 * Default locale
 */
export const defaultLocale: LocaleType = "pt-BR";

/**
 * Locale labels for display
 */
export const localeLabels: Record<LocaleType, string> = {
  "pt-BR": "Português (BR)",
  "es-ES": "Español",
};
