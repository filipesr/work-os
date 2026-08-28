/** Segunda a sábado. Sábado é coluna normal — recebe se o gestor colocar; o sistema não tem escala
 *  cadastrada e não sabe quem trabalha no sábado. Vive fora das ações porque as três telas da
 *  programação (mesa, minha semana e carga por cliente) precisam recortar a MESMA semana. */
export function weekDays(mondayISO: string): string[] {
  const base = Date.parse(`${mondayISO}T00:00:00Z`);
  return Array.from({ length: 6 }, (_, i) =>
    new Date(base + i * 86_400_000).toISOString().slice(0, 10)
  );
}
