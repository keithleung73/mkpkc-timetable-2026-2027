"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SCHOOL_NAME, SCHOOL_YEAR } from "@/lib/constants";

export function SiteLockScreen({
  message,
  busy,
  onUnlock,
}: {
  message: string | null;
  busy: boolean;
  onUnlock: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onUnlock(code);
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-[color:var(--school-navy)] text-white">
          <LockKeyhole className="size-6" />
        </div>
        <p className="text-xs tracking-wide text-muted-foreground">
          {SCHOOL_YEAR} · {SCHOOL_NAME}學務發展部
        </p>
        <h1 className="mt-2 text-xl font-semibold">此網上版只接受學務部提供的連結</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          課表資料已加密，唔會喺 GitHub 公開顯示。請用 WhatsApp／電郵收到嘅完整網址打開（網址後面有{" "}
          <code className="rounded bg-muted px-1">#k=</code>）。
        </p>
        <form className="mt-6 space-y-3" onSubmit={(e) => void submit(e)}>
          <label className="block text-sm font-medium" htmlFor="site-access-code">
            或輸入開啟碼
          </label>
          <Input
            id="site-access-code"
            autoComplete="off"
            spellCheck={false}
            placeholder="mkpkc-……"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || !code.trim()}>
            {busy ? "正在開啟…" : "開啟課表"}
          </Button>
        </form>
      </div>
    </div>
  );
}
