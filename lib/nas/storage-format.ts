// Tipos + formatação de armazenamento — SEM dependências de servidor (prisma), para o componente de
// UI poder ser usado tanto em server components quanto em client components.

export interface StorageRow {
  key: string;
  label: string;
  bytes: number;
  files: number;
}
export interface StorageStats {
  rows: StorageRow[];
  totalBytes: number;
  totalFiles: number;
}

/** B/KB/MB/GB/TB legível (base 1024). */
export function formatBytes(bytes: bigint | number): string {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  const dec = i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(dec)} ${units[i]}`;
}
