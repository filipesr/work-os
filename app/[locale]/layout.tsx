import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@/lib/i18n";
import { Locale } from "@/i18n";
import { notFound } from "next/navigation";
import { locales } from "@/lib/i18n";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Await params (Next.js 15 requirement)
  const { locale } = await params;

  // Ensure the locale is valid
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Load all messages for the locale
  const messages = await getMessages(locale as Locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
