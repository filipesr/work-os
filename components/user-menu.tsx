"use client";

import { UserRole } from "@prisma/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  User,
  LogOut,
  Settings,
  BarChart3,
  TrendingUp,
  Activity,
  GitBranch,
  Calendar,
  CalendarRange,
  Users,
  Sun,
  Moon,
  BookOpen,
} from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/ThemeProvider";

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
  const { theme, toggle: toggleTheme } = useTheme();

  const labelClassName = "px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider";
  const itemClassName = "px-4 py-2";
  const separatorClassName = "bg-border";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer">
          <User className="h-4 w-4" />
          <span>{userName}</span>
          <span className="text-xs text-muted-foreground">({userRole})</span>
          <ChevronDown className="h-4 w-4" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56 bg-card shadow-lg px-0">
        <DropdownMenuLabel className={labelClassName}>{t("nav.myAccount")}</DropdownMenuLabel>
        <DropdownMenuItem asChild className={itemClassName}>
          <a href="/account">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>{t("nav.settings")}</span>
            </div>
          </a>
        </DropdownMenuItem>

        {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
          <>
            <DropdownMenuSeparator className={separatorClassName} />
            <DropdownMenuLabel className={labelClassName}>{t("nav.reports")}</DropdownMenuLabel>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/reports/productivity">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  <span>{t("nav.productivity")}</span>
                </div>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/reports/performance">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span>{t("nav.performance")}</span>
                </div>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/reports/live-activity">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  <span>{t("nav.liveActivity")}</span>
                </div>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/reports/calendar">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{t("nav.calendar")}</span>
                </div>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/reports/calendar/monthly">
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4" />
                  <span>{t("nav.calendarMonthly")}</span>
                </div>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/reports/team-productivity">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{t("nav.teamProductivity")}</span>
                </div>
              </a>
            </DropdownMenuItem>
          </>
        )}

        {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
          <>
            <DropdownMenuSeparator className={separatorClassName} />
            <DropdownMenuLabel className={labelClassName}>
              {tAdmin("nav.overview")}
            </DropdownMenuLabel>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/admin">{t("nav.adminDashboard")}</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/dashboard">{t("nav.dashboard")}</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/admin/clients">{tAdmin("nav.clients")}</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/admin/tasks">{tAdmin("nav.tasks")}</a>
            </DropdownMenuItem>
          </>
        )}

        {userRole === UserRole.ADMIN && (
          <>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/admin/teams">{tAdmin("nav.teams")}</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/admin/users">{tAdmin("nav.users")}</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={itemClassName}>
              <a href="/admin/templates">{tAdmin("nav.workflows")}</a>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator className={separatorClassName} />

        <DropdownMenuLabel className={labelClassName}>Help</DropdownMenuLabel>
        <DropdownMenuItem asChild className={itemClassName}>
          <a href="/help">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span>{t("nav.help")}</span>
            </div>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClassName}>
          <a href="/next">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span>{t("nav.taskFlow")}</span>
            </div>
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator className={separatorClassName} />

        <button
          type="button"
          onClick={toggleTheme}
          aria-pressed={theme === "dark"}
          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span>{t(theme === "dark" ? "theme.light" : "theme.dark")}</span>
        </button>

        <DropdownMenuSeparator className={separatorClassName} />
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors text-left"
          >
            <LogOut className="h-4 w-4" />
            <span>{t("nav.signOut")}</span>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
