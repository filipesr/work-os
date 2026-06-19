import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  basePath: string;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

export async function Pagination({ basePath, page, totalPages, total, pageSize }: PaginationProps) {
  const t = await getTranslations("common.pagination");

  if (total === 0 || totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const prevHref = `${basePath}?page=${Math.max(1, page - 1)}`;
  const nextHref = `${basePath}?page=${Math.min(totalPages, page + 1)}`;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const linkClasses =
    "inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border-2 border-border bg-card text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 transition-all";
  const disabledClasses =
    "inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border-2 border-border bg-muted text-muted-foreground cursor-not-allowed";

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between px-6 py-4 border-t border-border bg-card"
    >
      <p className="text-sm text-muted-foreground">{t("showing", { from, to, total })}</p>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {t("page", { current: page, total: totalPages })}
        </span>
        {hasPrev ? (
          <Link href={prevHref} className={linkClasses} rel="prev">
            <ChevronLeft className="h-4 w-4" />
            {t("previous")}
          </Link>
        ) : (
          <span className={disabledClasses} aria-disabled="true">
            <ChevronLeft className="h-4 w-4" />
            {t("previous")}
          </span>
        )}
        {hasNext ? (
          <Link href={nextHref} className={linkClasses} rel="next">
            {t("next")}
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className={disabledClasses} aria-disabled="true">
            {t("next")}
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
