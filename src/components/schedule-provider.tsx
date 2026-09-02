"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ScheduleData } from "@/lib/types";

type Ctx = {
  data: ScheduleData | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const ScheduleContext = createContext<Ctx>({
  data: null,
  loading: true,
  error: null,
  reload: async () => {},
});

async function fetchSchedule(): Promise<ScheduleData> {
  const res = await fetch("/api/schedule", { cache: "no-store" });
  if (!res.ok) throw new Error("無法載入課表");
  return res.json();
}

export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSchedule());
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSchedule()
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "載入失敗");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ data, loading, error, reload }),
    [data, loading, error, reload],
  );
  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  return useContext(ScheduleContext);
}
