import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/components/auth/SignOutButton";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountPage() {
  const session = await auth();

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
            <p className="text-center text-muted-foreground">Usuário não encontrado.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Map role enum to friendly display name
  const roleDisplayNames: Record<string, string> = {
    ADMIN: "Administrador",
    MANAGER: "Gerente",
    SUPERVISOR: "Supervisor",
    MEMBER: "Membro",
    CLIENT: "Cliente",
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">Minha Conta</CardTitle>
          <CardDescription>
            Visualize suas informações de perfil
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* User Avatar */}
          <div className="flex justify-center">
            {user.image ? (
              <Image
                src={user.image}
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
                  Nome
                </dt>
                <dd className="text-base font-semibold text-foreground">
                  {user.name || "Não informado"}
                </dd>
              </div>

              {/* Email */}
              <div className="border-b border-border pb-3">
                <dt className="text-sm font-medium text-muted-foreground mb-1">
                  Email
                </dt>
                <dd className="text-base font-semibold text-foreground">
                  {user.email || "Não informado"}
                </dd>
              </div>

              {/* Role */}
              <div className="border-b border-border pb-3">
                <dt className="text-sm font-medium text-muted-foreground mb-1">
                  Função
                </dt>
                <dd className="text-base font-semibold text-foreground">
                  {roleDisplayNames[user.role] || user.role}
                </dd>
              </div>

              {/* Team */}
              <div className="border-b border-border pb-3">
                <dt className="text-sm font-medium text-muted-foreground mb-1">
                  Equipe
                </dt>
                <dd className="text-base font-semibold text-foreground">
                  {user.team?.name || "Nenhuma equipe atribuída"}
                </dd>
              </div>
            </div>

            {/* Google Sync Notice */}
            <div className="bg-muted/50 border border-border rounded-lg p-4 mt-6">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold">ℹ️ Nota:</span> Seu nome e foto são sincronizados com sua Conta Google.
                Sua função e equipe são atribuídas por um administrador.
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
