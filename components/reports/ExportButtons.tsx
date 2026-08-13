"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export type ExportColumn<T> = { key: keyof T & string; header: string };

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Client-side CSV/PDF export for a tabular dataset. The server page already has
 * the rows, so it passes them (plus a column map) straight to these buttons —
 * no extra server round-trip. CSV is produced with PapaParse (BOM-prefixed for
 * Excel), PDF with jsPDF + autotable.
 */
export function ExportButtons<T extends Record<string, unknown>>({
  filename,
  columns,
  rows,
  title,
}: {
  filename: string;
  columns: ExportColumn<T>[];
  rows: T[];
  title?: string;
}) {
  const t = useTranslations("reports.export");
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  if (rows.length === 0) return null;

  // PapaParse e jsPDF entram no bundle só QUANDO o usuário exporta. Importados
  // estaticamente, somavam ~140 kB ao primeiro carregamento das três telas de
  // relatório (271 kB contra ~120 kB das demais) — para uma ação que a maioria
  // das visitas nunca dispara.
  const downloadCsv = async () => {
    setBusy("csv");
    try {
      const { default: Papa } = await import("papaparse");
      const data = rows.map((r) =>
        Object.fromEntries(columns.map((c) => [c.header, r[c.key] ?? ""]))
      );
      const csv = Papa.unparse(data);
      triggerDownload(
        new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }),
        `${filename}.csv`
      );
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    setBusy("pdf");
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF();
      if (title) doc.text(title, 14, 16);
      autoTable(doc, {
        startY: title ? 22 : 14,
        head: [columns.map((c) => c.header)],
        body: rows.map((r) => columns.map((c) => String(r[c.key] ?? ""))),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
      });
      doc.save(`${filename}.pdf`);
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors";

  return (
    <div className="flex gap-2">
      <button type="button" onClick={downloadCsv} disabled={busy !== null} className={btn}>
        {busy === "csv" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}{" "}
        {t("csv")}
      </button>
      <button type="button" onClick={downloadPdf} disabled={busy !== null} className={btn}>
        {busy === "pdf" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}{" "}
        {t("pdf")}
      </button>
    </div>
  );
}
