"use client";

import { UserRole } from "@prisma/client";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, User, LogOut, Settings, BarChart3, TrendingUp, Activity, GitBranch } from "lucide-react";
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

      <DropdownMenuSeparator />

      <DropdownMenuItem href="/task-flow">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <span>{t("nav.taskFlow")}</span>
        </div>
      </DropdownMenuItem>

      {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("nav.reports")}</DropdownMenuLabel>
          <DropdownMenuItem href="/reports/productivity">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span>{t("nav.productivity")}</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem href="/reports/performance">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>{t("nav.performance")}</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem href="/reports/live-activity">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span>{t("nav.liveActivity")}</span>
            </div>
          </DropdownMenuItem>
        </>
      )}

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
