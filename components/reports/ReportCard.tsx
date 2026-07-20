import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ReportCardProps {
  href: string;
  /** Icon svg node, including its own `h-6 w-6 <accent text color>` classes. */
  icon: ReactNode;
  /** Background accent for the icon container, e.g. "bg-primary/10". */
  iconBgClass: string;
  /** Accent text color for the feature bullets, e.g. "text-primary". */
  accentTextClass: string;
  title: string;
  description: string;
  features: [string, string, string];
}

export function ReportCard({
  href,
  icon,
  iconBgClass,
  accentTextClass,
  title,
  description,
  features,
}: ReportCardProps) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-xl hover:border-primary transition-all duration-200 cursor-pointer h-full">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-3 ${iconBgClass} rounded-lg`}>{icon}</div>
            <div className="flex-1">
              <CardTitle>{title}</CardTitle>
            </div>
            <svg
              className="h-5 w-5 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {features.map((feature, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`${accentTextClass} font-bold`}>•</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Link>
  );
}
