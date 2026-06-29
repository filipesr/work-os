"use client";

import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Download } from "lucide-react";
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

  if (rows.length === 0) return null;

  const downloadCsv = () => {
    const data = rows.map((r) =>
      Object.fromEntries(columns.map((c) => [c.header, r[c.key] ?? ""]))
    );
    const csv = Papa.unparse(data);
    triggerDownload(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
  };

  const downloadPdf = () => {
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
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border-2 border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors";

  return (
    <div className="flex gap-2">
      <button type="button" onClick={downloadCsv} className={btn}>
        <Download className="h-4 w-4" /> {t("csv")}
      </button>
      <button type="button" onClick={downloadPdf} className={btn}>
        <Download className="h-4 w-4" /> {t("pdf")}
      </button>
    </div>
  );
}
