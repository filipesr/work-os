import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyAllStages } from "@/lib/actions/task";
import { MyStagesPageClient } from "@/components/my-stages/MyStagesPageClient";

export const metadata: Metadata = {
  title: "Tarefas",
};

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const t = await getTranslations("myStages");
  const initialData = await getMyAllStages({ status: "ACTIVE" });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <MyStagesPageClient initialData={initialData} />
    </div>
  );
}
