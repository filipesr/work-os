"use client";

import { useRouter, usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { locales, localeLabels, LocaleType } from "@/lib/i18n";
import { setStoredLocale } from "@/lib/locale-storage";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale() as LocaleType;

  const switchLocale = (newLocale: LocaleType) => {
    // Store the preference
    setStoredLocale(newLocale);

    // Get the current path without locale prefix
    const segments = pathname.split("/");
    const isLocaleInPath = locales.includes(segments[1] as LocaleType);

    let pathWithoutLocale = pathname;
    if (isLocaleInPath) {
      pathWithoutLocale = "/" + segments.slice(2).join("/");
    }

    // Navigate to the new locale path
    router.push(`/${newLocale}${pathWithoutLocale}`);
    router.refresh();
  };

  const trigger = (
    <Button variant="ghost" size="sm" className="gap-2">
      <Languages className="h-4 w-4" />
      <span className="hidden sm:inline">{localeLabels[currentLocale]}</span>
    </Button>
  );

  return (
    <DropdownMenu trigger={trigger}>
      {locales.map((locale) => (
        <DropdownMenuItem
          key={locale}
          onClick={() => switchLocale(locale)}
          className={currentLocale === locale ? "bg-accent" : ""}
        >
          {localeLabels[locale]}
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}
