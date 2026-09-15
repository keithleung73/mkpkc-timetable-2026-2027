"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isStaticExport, scheduleDataUrl, GITHUB_PAGES_SITE } from "@/lib/runtime";
import {
  SiteAccessError,
  captureAccessCodeFromLocation,
  decryptUtf8,
  githubPagesUnlockUrl,
  isEncryptedBlob,
  persistAccessCode,
} from "@/lib/site-access";
import { SiteLockScreen } from "@/components/site-lock-screen";
import type { ScheduleData } from "@/lib/types";

type Ctx = {
  data: ScheduleData | null;
  loading: boolean;
  error: string | null;
  locked: boolean;
  shareUrl: string | null;
  reload: () => Promise<void>;
  unlock: (code: string) => Promise<void>;
};

const ScheduleContext = createContext<Ctx>({
  data: null,
  loading: true,
  error: null,
  locked: false,
  shareUrl: null,
  reload: async () => {},
  unlock: async () => {},
});

async function fetchLocalSchedule(): Promise<ScheduleData> {
  const res = await fetch(scheduleDataUrl(), { cache: "no-store" });
  if (!res.ok) throw new Error("無法載入課表");
  return res.json() as Promise<ScheduleData>;
}

async function fetchEncryptedSchedule(code: string): Promise<ScheduleData> {
  const res = await fetch(scheduleDataUrl(), { cache: "no-store" });
  if (!res.ok) throw new Error("無法載入課表");
  const blob = await res.json();
  if (!isEncryptedBlob(blob)) {
    throw new SiteAccessError("網上課表檔案格式不正確。", "corrupt");
  }
  const plain = await decryptUtf8(blob, code);
    const json = JSON.parse(plain) as ScheduleData;
    if (!json || !Array.isArray(json.teachers) || !Array.isArray(json.lessons)) {
      throw new SiteAccessError("課表內容不正確。", "corrupt");
    }
    return json;
}

export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);

  const loadWithCode = useCallback(async (code: string | null) => {
    if (!isStaticExport) {
      setData(await fetchLocalSchedule());
      setLocked(false);
      setAccessCode(null);
      return;
    }
    if (!code) {
      setData(null);
      setLocked(true);
      setAccessCode(null);
      throw new SiteAccessError("請使用學務部提供的完整連結。", "missing");
    }
    const json = await fetchEncryptedSchedule(code);
    persistAccessCode(code);
    setAccessCode(code);
    setData(json);
    setLocked(false);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const code = isStaticExport ? captureAccessCodeFromLocation() : null;
      await loadWithCode(code);
    } catch (e) {
      setData(null);
      if (e instanceof SiteAccessError && (e.code === "missing" || e.code === "invalid")) {
        setLocked(true);
        setError(e.code === "missing" ? null : e.message);
      } else {
        setLocked(isStaticExport);
        setError(e instanceof Error ? e.message : "載入失敗");
      }
    } finally {
      setLoading(false);
    }
  }, [loadWithCode]);

  const unlock = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setLoading(true);
      setError(null);
      try {
        await loadWithCode(trimmed);
      } catch (e) {
        setData(null);
        setLocked(true);
        setError(e instanceof Error ? e.message : "開啟失敗");
      } finally {
        setLoading(false);
      }
    },
    [loadWithCode],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const shareUrl = accessCode ? githubPagesUnlockUrl(GITHUB_PAGES_SITE, accessCode) : null;

  const value = useMemo(
    () => ({ data, loading, error, locked, shareUrl, reload, unlock }),
    [data, loading, error, locked, shareUrl, reload, unlock],
  );

  if (isStaticExport && (locked || (loading && !data))) {
    return (
      <ScheduleContext.Provider value={value}>
        {locked && !loading ? (
          <SiteLockScreen message={error} busy={loading} onUnlock={unlock} />
        ) : (
          <div className="flex min-h-full items-center justify-center p-8 text-sm text-muted-foreground">
            正在載入課表資料…
          </div>
        )}
      </ScheduleContext.Provider>
    );
  }

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  return useContext(ScheduleContext);
}
