"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Globe, Share2, Wifi } from "lucide-react";
import { PageBody, PageHeader } from "@/components/page-chrome";
import { StaticModeBanner } from "@/components/static-mode-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isStaticExport } from "@/lib/runtime";

type ShareInfo = {
  port: number;
  lanUrls: string[];
  localUrl: string;
};

export default function SharePage() {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isStaticExport) return;
    fetch("/api/share-info", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("無法讀取共用網址");
        return (await res.json()) as ShareInfo;
      })
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"));
  }, []);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("已複製網址，可貼去 WhatsApp／電郵俾同事");
    } catch {
      toast.error("複製失敗，請人手反白網址");
    }
  };

  return (
    <PageBody>
      <PageHeader
        title="給同事使用"
        description="學務部呢部電腦做網站主機，同一校網嘅同事用瀏覽器打開網址即可，唔使安裝。"
      />
      <div className="space-y-6">
        <StaticModeBanner feature="校內共用網址" />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wifi className="size-4" />
              校內網址（推薦）
            </CardTitle>
            <CardDescription>
              請保持呢個視窗／「共用啟動」開住。同事要連學校 Wi‑Fi 或有線校網。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isStaticExport ? (
              <p className="text-sm text-muted-foreground">
                呢個係靜態示範頁。請喺學務部電腦雙擊「共用啟動」，再開本頁複製網址。
              </p>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : !info ? (
              <p className="text-sm text-muted-foreground">正在偵測校內 IP…</p>
            ) : info.lanUrls.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                未偵測到校內 IP。請用 {info.localUrl}（只限呢部電腦）。
              </p>
            ) : (
              info.lanUrls.map((url) => (
                <div
                  key={url}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <a className="font-mono text-sm underline-offset-2 hover:underline" href={url}>
                    {url}
                  </a>
                  <Button size="sm" variant="outline" onClick={() => void copy(url)}>
                    <Copy />
                    複製俾同事
                  </Button>
                </div>
              ))
            )}
            {info ? (
              <p className="text-xs text-muted-foreground">
                本機自己開：{info.localUrl}　·　代堂：在網址後面加 /cover
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Share2 className="size-4" />
              同事可以做咩
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <p>查自己或同事一週課表（姓名／簡稱）</p>
            <p>查而家邊個空閒、邊班喺邊個室</p>
            <p>搵一組老師共同空閒（開會）</p>
            <p>學務部可做調堂確認同代堂編配</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="size-4" />
              開唔到？
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. 主機要開住（Windows 雙擊「共用啟動.bat」，唔好閂黑窗）。</p>
            <p>2. 同事電腦要同一校網；家用網絡開唔到。</p>
            <p>
              3. Windows 若被防火牆擋住，以系統管理員執行「開啟校內共用防火牆.bat」。
            </p>
            <p>
              4. 倉庫係私人的，公開 GitHub 網站未開啟——課表有老師姓名，唔會放上公開網。
            </p>
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
