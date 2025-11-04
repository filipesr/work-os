"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/auth/signin' })}
      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold py-2 px-6 rounded-md transition-colors"
    >
      Sair (Logout)
    </button>
  );
}
