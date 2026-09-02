"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSchedule } from "@/components/schedule-provider";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function ScheduleGate({ children }: { children: React.ReactNode }) {
  const { data, loading, error, reload } = useSchedule();
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">
        正在載入課表資料…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start gap-2 text-destructive">
          <AlertCircle className="mt-0.5 size-4" />
          <div>
            <p className="font-medium">無法載入課表</p>
            <p className="mt-1 text-sm">{error ?? "沒有資料"}</p>
            <Button className="mt-3" size="sm" onClick={() => void reload()}>
              再試一次
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="p-4 md:p-8">{children}</div>;
}
