"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronDown,
  Menu,
  X,
  Moon,
  Sun,
  Globe,
  User as UserIcon,
  LogOut,
  HelpCircle,
  TrendingUp,
} from "lucide-react";
import { getNavItems, isNavGroup, roleLabelKey, homeHref, type AppRole } from "@/lib/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { locales, localeLabels, type LocaleType } from "@/lib/i18n";
import { setStoredLocale } from "@/lib/locale-storage";
import { signOutAction } from "@/lib/actions/auth";

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Remove o prefixo de locale (`/pt-BR/...`) do pathname. */
function delocalize(pathname: string): string {
  const segs = pathname.split("/");
  if (locales.includes(segs[1] as LocaleType)) {
    const rest = "/" + segs.slice(2).join("/");
    return rest === "/" ? "/" : rest.replace(/\/$/, "");
  }
  return pathname === "/" ? "/" : pathname.replace(/\/$/, "");
}

export function PrimaryNav({ role, userName }: { role: AppRole; userName: string | null }) {
  const t = useTranslations("common.nav");
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale() as LocaleType;
  const avatarMenuId = useId();

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const items = getNavItems(role);

  // Fecha dropdowns ao clicar fora.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
        setAvatarOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Fecha tudo ao navegar.
  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
    setAvatarOpen(false);
  }, [pathname]);

  // Item ativo = link cujo href é o maior prefixo do caminho atual.
  const path = delocalize(pathname);
  const allLinks = items.flatMap((i) => (isNavGroup(i) ? i.children : [i]));
  let activeId: string | null = null;
  let bestLen = -1;
  for (const l of allLinks) {
    if (path === l.href || path.startsWith(l.href + "/")) {
      if (l.href.length > bestLen) {
        bestLen = l.href.length;
        activeId = l.id;
      }
    }
  }

  const switchLocale = (loc: LocaleType) => {
    setStoredLocale(loc);
    router.push(`/${loc}${path === "/" ? "" : path}`);
    router.refresh();
  };
  const otherLocale = locales.find((l) => l !== currentLocale) ?? currentLocale;
  const isDark = theme === "dark";

  const linkBase =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const linkActive = "bg-primary/10 text-primary";
  const linkIdle = "text-muted-foreground hover:bg-accent hover:text-foreground";

  return (
    <header
      ref={navRef}
      className="sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur"
    >
      <nav
        aria-label={t("mainNav")}
        className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8"
      >
        {/* Marca / home */}
        <Link
          href={homeHref(role)}
          aria-label={t("goHome")}
          className="flex shrink-0 items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-extrabold tracking-tight text-primary-foreground">
            W
          </span>
          <span className="hidden text-base font-bold tracking-tight text-foreground sm:block">
            WorkOS
          </span>
        </Link>

        {/* Itens primários (desktop) */}
        <div className="relative hidden min-w-0 items-center gap-1 lg:flex">
          {items.map((item) => {
            if (!isNavGroup(item)) {
              const Icon = item.icon;
              const active = item.id === activeId;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`${linkBase} ${active ? linkActive : linkIdle}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t(item.labelKey)}
                </Link>
              );
            }
            const groupOpen = openGroup === item.id;
            const groupActive = item.children.some((c) => c.id === activeId);
            return (
              <div key={item.id} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenGroup(groupOpen ? null : item.id)}
                  aria-haspopup="menu"
                  aria-expanded={groupOpen}
                  className={`${linkBase} ${groupActive || groupOpen ? linkActive : linkIdle}`}
                >
                  {t(item.labelKey)}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${groupOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {groupOpen && (
                  <div
                    role="menu"
                    aria-label={t(item.labelKey)}
                    className="absolute left-0 top-[calc(100%+0.5rem)] w-60 rounded-xl border border-border bg-card p-1.5 shadow-lg"
                  >
                    {item.children.map((child) => {
                      const Icon = child.icon;
                      const active = child.id === activeId;
                      return (
                        <Link
                          key={child.id}
                          href={child.href}
                          role="menuitem"
                          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                            active
                              ? "bg-primary/10 font-semibold text-primary"
                              : "text-foreground hover:bg-accent"
                          }`}
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          {t(child.labelKey)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Direita: mobile toggle + avatar */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMobileOpen((o) => !o);
              setAvatarOpen(false);
            }}
            aria-label={mobileOpen ? t("closeNav") : t("openNav")}
            aria-expanded={mobileOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setAvatarOpen((o) => !o);
                setMobileOpen(false);
              }}
              aria-label={t("openProfile")}
              aria-expanded={avatarOpen}
              aria-controls={avatarMenuId}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {initials(userName)}
            </button>
            {avatarOpen && (
              <div
                id={avatarMenuId}
                role="menu"
                aria-label={t("openProfile")}
                className="absolute right-0 top-[calc(100%+0.5rem)] w-64 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-lg"
              >
                <div className="px-3 py-2.5">
                  <p className="text-sm font-semibold text-foreground">{userName}</p>
                  <p className="text-xs text-muted-foreground">{t(roleLabelKey(role))}</p>
                </div>
                <div className="my-1 border-t border-border" />
                <Link href="/account" role="menuitem" className="nav-menu-item">
                  <UserIcon className="h-4 w-4" aria-hidden="true" />
                  {t("myAccount")}
                </Link>
                <Link href="/minha-evolucao" role="menuitem" className="nav-menu-item">
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                  {t("minhaEvolucao")}
                </Link>
                <Link href="/help" role="menuitem" className="nav-menu-item">
                  <HelpCircle className="h-4 w-4" aria-hidden="true" />
                  {t("help")}
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={toggleTheme}
                  className="nav-menu-item"
                >
                  {isDark ? (
                    <Sun className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Moon className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isDark ? t("themeLight") : t("themeDark")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => switchLocale(otherLocale)}
                  className="nav-menu-item"
                >
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  {t("language")}: {localeLabels[currentLocale]}
                </button>
                <div className="my-1 border-t border-border" />
                <form action={signOutAction}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-destructive"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {t("signOut")}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Menu mobile */}
      {mobileOpen && (
        <div className="border-t border-border bg-card px-4 py-3 lg:hidden">
          <div className="mx-auto max-w-7xl space-y-1">
            {items.map((item) =>
              isNavGroup(item) ? (
                <MobileGroup key={item.id} item={item} activeId={activeId} labelOf={t} />
              ) : (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={item.id === activeId ? "page" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                    item.id === activeId
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {t(item.labelKey)}
                </Link>
              )
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function MobileGroup({
  item,
  activeId,
  labelOf,
}: {
  item: import("@/lib/navigation").NavGroup;
  activeId: string | null;
  labelOf: (key: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const groupActive = item.children.some((c) => c.id === activeId);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
          groupActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
        }`}
      >
        {labelOf(item.labelKey)}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="ml-4 border-l border-border py-1 pl-2">
          {item.children.map((child) => (
            <Link
              key={child.id}
              href={child.href}
              aria-current={child.id === activeId ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm ${
                child.id === activeId
                  ? "font-semibold text-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <child.icon className="h-4 w-4" aria-hidden="true" />
              {labelOf(child.labelKey)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
