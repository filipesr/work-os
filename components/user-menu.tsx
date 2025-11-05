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

interface UserMenuProps {
  userName: string | null;
  userRole: UserRole;
}

export function UserMenu({ userName, userRole }: UserMenuProps) {
  const handleSignOut = async () => {
    await signOutAction();
  };

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
      <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
      <DropdownMenuItem href="/account">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span>Configurações</span>
        </div>
      </DropdownMenuItem>

      {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Administração</DropdownMenuLabel>
          <DropdownMenuItem href="/admin">Admin Dashboard</DropdownMenuItem>
          <DropdownMenuItem href="/admin/clients">Clientes</DropdownMenuItem>
          <DropdownMenuItem href="/admin/projects">Projetos</DropdownMenuItem>
        </>
      )}

      {userRole === UserRole.ADMIN && (
        <>
          <DropdownMenuItem href="/admin/teams">Times</DropdownMenuItem>
          <DropdownMenuItem href="/admin/users">Usuários</DropdownMenuItem>
          <DropdownMenuItem href="/admin/templates">Templates</DropdownMenuItem>
        </>
      )}

      <DropdownMenuSeparator />
      <form action={signOutAction}>
        <button
          type="submit"
          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors text-left"
        >
          <LogOut className="h-4 w-4" />
          <span>Sair</span>
        </button>
      </form>
    </DropdownMenu>
  );
}
