"use client";

import { UserRole } from "@prisma/client";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, User, LogOut, Settings } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { useTranslations } from "next-intl";

interface UserMenuProps {
  userName: string | null;
  userRole: UserRole;
}

export function UserMenu({ userName, userRole }: UserMenuProps) {
  const handleSignOut = async () => {
    await signOutAction();
  };

  const t = useTranslations("common");
  const tAdmin = useTranslations("admin");

  return (
    <DropdownMenu
      trigger={
        <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors">
          <User className="h-4 w-4" />
          <span>{userName}</span>
          <span className="text-xs text-muted-foreground">({userRole})</span>
          <ChevronDown className="h-4 w-4" />
        </div>
      }
    >
      <DropdownMenuLabel>{t("nav.myAccount")}</DropdownMenuLabel>
      <DropdownMenuItem href="/account">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span>{t("nav.settings")}</span>
        </div>
      </DropdownMenuItem>

      {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{tAdmin("nav.overview")}</DropdownMenuLabel>
          <DropdownMenuItem href="/admin">{t("nav.adminDashboard")}</DropdownMenuItem>
          <DropdownMenuItem href="/admin/clients">{tAdmin("nav.clients")}</DropdownMenuItem>
          <DropdownMenuItem href="/admin/projects">{tAdmin("nav.projects")}</DropdownMenuItem>
        </>
      )}

      {userRole === UserRole.ADMIN && (
        <>
          <DropdownMenuItem href="/admin/teams">{tAdmin("nav.teams")}</DropdownMenuItem>
          <DropdownMenuItem href="/admin/users">{tAdmin("nav.users")}</DropdownMenuItem>
          <DropdownMenuItem href="/admin/templates">{tAdmin("nav.workflows")}</DropdownMenuItem>
        </>
      )}

      <DropdownMenuSeparator />
      <form action={signOutAction}>
        <button
          type="submit"
          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors text-left"
        >
          <LogOut className="h-4 w-4" />
          <span>{t("nav.signOut")}</span>
        </button>
      </form>
    </DropdownMenu>
  );
}
