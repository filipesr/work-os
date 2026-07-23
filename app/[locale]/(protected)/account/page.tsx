import type { Metadata } from "next";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { ThemeControl } from "./ThemeControl";

export const metadata: Metadata = { title: "Conta" };

function formatDate(value: Date | string): string {
  const d = new Date(value);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export default async function AccountPage() {
  const session = await auth();
  const t = await getTranslations("account");

  if (!session?.user) {
    // Should be handled by layout, but good to double-check
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      teams: { select: { name: true }, orderBy: { name: "asc" } },
    },
  });

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <SectionCard>
          <p className="text-center text-muted-foreground">{t("userNotFound")}</p>
        </SectionCard>
      </div>
    );
  }

  const fields: Array<{ label: string; value: string }> = [
    { label: t("fields.name"), value: user.name || t("noInfo") },
    { label: t("fields.email"), value: user.email || t("noInfo") },
    { label: t("fields.role"), value: t(`roles.${user.role}`) },
    {
      label: t("fields.team"),
      value: user.teams.length > 0 ? user.teams.map((tm) => tm.name).join(", ") : t("noTeam"),
    },
    { label: t("fields.birthday"), value: user.birthday ? formatDate(user.birthday) : t("noInfo") },
    {
      label: t("fields.admission"),
      value: user.admissionDate ? formatDate(user.admissionDate) : t("noInfo"),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<SignOutButton />}
      />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Perfil */}
        <SectionCard>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            {user.image ? (
              <Image
                src={getProxiedImageUrl(user.image) || "/default-avatar.png"}
                alt={user.name || "User avatar"}
                width={96}
                height={96}
                className="rounded-full border border-border shadow-sm"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-border bg-muted shadow-sm">
                <span className="text-3xl font-bold text-muted-foreground">
                  {user.name?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
            )}
            <div className="text-center sm:text-left">
              <p className="text-lg font-semibold text-foreground">{user.name || t("noInfo")}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <dl className="mt-6 divide-y divide-border">
            {fields.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-sm font-medium text-muted-foreground">{f.label}</dt>
                <dd className="text-right text-sm font-semibold text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{t("googleSyncNote.label")}</span>{" "}
              {t("googleSyncNote.message")}
            </p>
          </div>
        </SectionCard>

        {/* Preferências: idioma + tema (§3.1) */}
        <SectionCard title={t("preferences.title")} subtitle={t("preferences.subtitle")}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{t("fields.language")}</p>
              <LanguageSwitcher />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground">{t("theme.field")}</p>
              <ThemeControl />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
