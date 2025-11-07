import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { getTranslations } from "next-intl/server";

export default async function AccountPage() {
  const session = await auth();
  const t = await getTranslations("account");

  if (!session?.user) {
    // Should be handled by layout, but good to double-check
    return null;
  }

  // Fetch full user data to include the team name
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      team: { select: { name: true } },
    },
  });

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">{t("userNotFound")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
          <CardDescription>
            {t("subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* User Avatar */}
          <div className="flex justify-center">
            {user.image ? (
              <Image
                src={getProxiedImageUrl(user.image) || "/default-avatar.png"}
                alt={user.name || "User avatar"}
                width={120}
                height={120}
                className="rounded-full border-4 border-border shadow-lg"
              />
            ) : (
              <div className="w-[120px] h-[120px] rounded-full bg-muted flex items-center justify-center border-4 border-border shadow-lg">
                <span className="text-4xl font-bold text-muted-foreground">
                  {user.name?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
            )}
          </div>

          {/* User Information */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {/* Name */}
              <div className="border-b border-border pb-3">
                <dt className="text-sm font-medium text-muted-foreground mb-1">
                  {t("fields.name")}
                </dt>
                <dd className="text-base font-semibold text-foreground">
                  {user.name || t("noInfo")}
                </dd>
              </div>

              {/* Email */}
              <div className="border-b border-border pb-3">
                <dt className="text-sm font-medium text-muted-foreground mb-1">
                  {t("fields.email")}
                </dt>
                <dd className="text-base font-semibold text-foreground">
                  {user.email || t("noInfo")}
                </dd>
              </div>

              {/* Role */}
              <div className="border-b border-border pb-3">
                <dt className="text-sm font-medium text-muted-foreground mb-1">
                  {t("fields.role")}
                </dt>
                <dd className="text-base font-semibold text-foreground">
                  {t(`roles.${user.role}`)}
                </dd>
              </div>

              {/* Team */}
              <div className="border-b border-border pb-3">
                <dt className="text-sm font-medium text-muted-foreground mb-1">
                  {t("fields.team")}
                </dt>
                <dd className="text-base font-semibold text-foreground">
                  {user.team?.name || t("noTeam")}
                </dd>
              </div>

              {/* Language */}
              <div className="border-b border-border pb-3">
                <dt className="text-sm font-medium text-muted-foreground mb-1">
                  {t("fields.language")}
                </dt>
                <dd className="text-base font-semibold text-foreground">
                  <LanguageSwitcher />
                </dd>
              </div>
            </div>

            {/* Google Sync Notice */}
            <div className="bg-muted/50 border border-border rounded-lg p-4 mt-6">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold">{t("googleSyncNote.label")}</span> {t("googleSyncNote.message")}
              </p>
            </div>
          </div>

          {/* Sign Out Button */}
          <div className="flex justify-center pt-4">
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
