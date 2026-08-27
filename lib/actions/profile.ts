"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";
import { normalizeDisplayName, validateDisplayName } from "@/lib/display-name";

/**
 * Edição do PRÓPRIO perfil. Separado de `lib/actions/user.ts`, que é todo `requireAdmin`: aqui a
 * autorização é "ser você mesmo", e misturar as duas coisas no mesmo arquivo é como uma acaba
 * herdando a permissão errada da outra.
 */

/** Troca o nome de exibição — o que aparece em comentários, etapas e relatórios.
 *
 *  A validação é a mesma da tela (`lib/display-name.ts`), repetida aqui de propósito: a checagem do
 *  cliente é conveniência, a que vale é esta. Mensagens vêm do dicionário, não fixas em português —
 *  o app é bilíngue e um erro só em pt-BR é meio recurso. */
export async function updateDisplayName(formData: FormData) {
  const me = await getSessionUser();
  if (!me?.id) return { error: "unauthorized" };

  const t = await getTranslations("errors.profile");
  const raw = String(formData.get("name") ?? "");
  const problem = validateDisplayName(raw);
  if (problem) return { error: t(`name.${problem}`) };

  await prisma.user.update({
    where: { id: me.id },
    data: { name: normalizeDisplayName(raw) },
  });

  // O nome aparece em muitos lugares; estes são os que a pessoa olha logo depois de trocar.
  revalidatePath("/account");
  revalidatePath("/dashboard");
  return { success: true as const };
}
