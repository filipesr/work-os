"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ActiveStageStatus } from "@prisma/client";
import { getMyAllStages } from "@/lib/actions/task";
import type { MyAllStagesResult, ActiveStageWithDetails } from "@/lib/actions/task";
import { MyStagesFilters } from "./MyStagesFilters";
import { MyStagesKPIs } from "./MyStagesKPIs";
import { MyStagesTable } from "./MyStagesTable";
import { StageDetailModal } from "./StageDetailModal";

interface MyStagesPageClientProps {
  initialData: MyAllStagesResult;
}

export function MyStagesPageClient({ initialData }: MyStagesPageClientProps) {
  const t = useTranslations("myStages");
  const [data, setData] = useState<MyAllStagesResult>(initialData);
  const [isPending, startTransition] = useTransition();

  // Filter state
  const [onlyMine, setOnlyMine] = useState(true);
  const [status, setStatus] = useState<ActiveStageStatus | null>("ACTIVE");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal state
  const [selectedStage, setSelectedStage] = useState<ActiveStageWithDetails | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = (
    newOnlyMine: boolean,
    newStatus: ActiveStageStatus | null,
    newStartDate: string,
    newEndDate: string
  ) => {
    startTransition(async () => {
      const result = await getMyAllStages({
        onlyMine: newOnlyMine,
        status: newStatus,
        startDate: newStartDate || null,
        endDate: newEndDate || null,
      });
      setData(result);
    });
  };

  const handleOwnershipChange = (newOnlyMine: boolean) => {
    setOnlyMine(newOnlyMine);
    fetchData(newOnlyMine, status, startDate, endDate);
  };

  const handleStatusChange = (newStatus: ActiveStageStatus | null) => {
    setStatus(newStatus);
    fetchData(onlyMine, newStatus, startDate, endDate);
  };

  const handleStartDateChange = (date: string) => {
    setStartDate(date);
    fetchData(onlyMine, status, date, endDate);
  };

  const handleEndDateChange = (date: string) => {
    setEndDate(date);
    fetchData(onlyMine, status, startDate, date);
  };

  const handleClearAll = () => {
    setOnlyMine(true);
    setStatus(null);
    setStartDate("");
    setEndDate("");
    fetchData(true, null, "", "");
  };

  const handleRowClick = (stage: ActiveStageWithDetails) => {
    setSelectedStage(stage);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <MyStagesFilters
        onlyMine={onlyMine}
        onOwnershipChange={handleOwnershipChange}
        status={status}
        startDate={startDate}
        endDate={endDate}
        onStatusChange={handleStatusChange}
        onStartDateChange={handleStartDateChange}
        onEndDateChange={handleEndDateChange}
        onClearAll={handleClearAll}
      />

      {/* KPIs */}
      <MyStagesKPIs stats={data.stats} />

      {/* Table */}
      <div className={`bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden ${isPending ? "opacity-60" : ""}`}>
        {data.stages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">{t("emptyState")}</p>
          </div>
        ) : (
          <MyStagesTable stages={data.stages} showAssignee={!onlyMine} onRowClick={handleRowClick} />
        )}
      </div>

      {/* Detail Modal */}
      <StageDetailModal
        stage={selectedStage}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
