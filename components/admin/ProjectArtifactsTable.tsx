"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, FileText, Image, Video, Figma, File, Search } from "lucide-react";

export type ProjectArtifact = {
  id: string;
  title: string;
  url: string | null;
  type: "DOCUMENT" | "IMAGE" | "VIDEO" | "FIGMA" | "OTHER";
  createdAt: string; // ISO
  taskId: string;
  taskTitle: string;
  userName: string;
};

const typeConfig: Record<ProjectArtifact["type"], { icon: typeof File; color: string }> = {
  DOCUMENT: { icon: FileText, color: "text-blue-500" },
  IMAGE: { icon: Image, color: "text-green-500" },
  VIDEO: { icon: Video, color: "text-purple-500" },
  FIGMA: { icon: Figma, color: "text-pink-500" },
  OTHER: { icon: File, color: "text-gray-500" },
};

export function ProjectArtifactsTable({ artifacts }: { artifacts: ProjectArtifact[] }) {
  const t = useTranslations("admin.projects.detail");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return artifacts;
    return artifacts.filter((a) =>
      [a.title, a.taskTitle, a.userName, t(`artifactTypes.${a.type}`)]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [artifacts, query, t]);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchArtifacts")}
            className="w-full h-10 pl-9 pr-3 rounded-lg border-2 border-input-border bg-input text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("artifactTitle")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("artifactType")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("artifactTask")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("artifactUser")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("artifactDate")}
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {filtered.map((a) => {
              const { icon: Icon, color } = typeConfig[a.type];
              return (
                <tr key={a.id} className="hover:bg-accent transition-colors">
                  <td className="px-6 py-4">
                    <a
                      href={a.url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-1 group"
                    >
                      <span className="truncate max-w-[280px]">{a.title}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-50 group-hover:opacity-100" />
                    </a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Icon className={`h-4 w-4 ${color}`} />
                      {t(`artifactTypes.${a.type}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/admin/tasks/${a.taskId}`}
                      className="text-sm text-primary hover:text-primary/80"
                    >
                      {a.taskTitle}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">{a.userName}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  {artifacts.length === 0 ? t("noArtifacts") : t("noArtifactsMatch")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
