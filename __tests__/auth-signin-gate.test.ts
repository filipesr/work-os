import { describe, it, expect, vi, beforeEach } from "vitest";

// O callback `signIn` é a porta de entrada do app inteiro. Antes dele, QUALQUER conta Google do
// mundo entrava e virava um MEMBER criado pelo adapter — e "desativar" alguém seria inócuo, porque
// bastaria entrar de novo. Um erro aqui tranca todo mundo para fora ou destranca para todos, então
// cada ramo tem teste.

vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique: vi.fn() } },
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/env", () => ({
  env: { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" },
}));

import prisma from "@/lib/prisma";
import { authConfig } from "@/auth.config";

const db = prisma as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } };

type SignInArgs = Parameters<NonNullable<NonNullable<typeof authConfig.callbacks>["signIn"]>>[0];

/** Chama o callback como o Auth.js chamaria, com o mínimo que ele usa. */
async function signIn(args: { email?: string | null; profileEmail?: string | null }) {
  const cb = authConfig.callbacks!.signIn!;
  return cb({
    user: { email: args.email ?? null },
    profile: args.profileEmail ? { email: args.profileEmail } : undefined,
  } as unknown as SignInArgs);
}

describe("callback signIn — porta de entrada", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deixa entrar quem já está cadastrado e ativo", async () => {
    db.user.findUnique.mockResolvedValue({ disabledAt: null });
    expect(await signIn({ email: "ana@empresa.com" })).toBe(true);
  });

  it("recusa quem não foi cadastrado por um admin", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await signIn({ email: "estranho@gmail.com" })).toBe("/auth/signin?error=NotInvited");
  });

  it("recusa quem foi desativado, com motivo próprio", async () => {
    // Motivo separado de propósito: "não foi cadastrado" e "seu acesso foi desativado" pedem
    // reações diferentes de quem lê a tela.
    db.user.findUnique.mockResolvedValue({ disabledAt: new Date("2026-08-01") });
    expect(await signIn({ email: "ex@empresa.com" })).toBe("/auth/signin?error=AccountDisabled");
  });

  it("recusa sem e-mail — é por ele que o app identifica a pessoa", async () => {
    expect(await signIn({ email: null })).toBe("/auth/signin?error=NoEmail");
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("cai para o e-mail do profile quando o user não traz", async () => {
    db.user.findUnique.mockResolvedValue({ disabledAt: null });
    expect(await signIn({ email: null, profileEmail: "ana@empresa.com" })).toBe(true);
  });

  it("normaliza caixa e espaços antes de procurar", async () => {
    // O Google pode devolver com maiúsculas; o cadastro é gravado em minúsculas. Sem normalizar,
    // a mesma pessoa seria "não cadastrada".
    db.user.findUnique.mockResolvedValue({ disabledAt: null });
    await signIn({ email: "  Ana@Empresa.com  " });
    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "ana@empresa.com" } })
    );
  });
});

describe("provedor Google", () => {
  it("permite vincular por e-mail verificado — é o que destrava o re-vínculo", () => {
    // Sem isto, um User sem linha em Account é intransponível (OAuthAccountNotLinked), que foi o
    // que travou vários acessos quando o banco foi perdido.
    const google = authConfig.providers[0] as unknown as {
      options?: { allowDangerousEmailAccountLinking?: boolean };
      allowDangerousEmailAccountLinking?: boolean;
    };
    const flag =
      google.allowDangerousEmailAccountLinking ?? google.options?.allowDangerousEmailAccountLinking;
    expect(flag).toBe(true);
  });
});
