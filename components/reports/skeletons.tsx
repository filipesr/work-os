import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-24 bg-muted rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

export function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="h-12 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SummarySkeleton() {
  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-indigo-50 dark:from-indigo-950 dark:to-indigo-950">
      <CardContent className="pt-6">
        <div className="h-12 w-48 bg-muted rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}
