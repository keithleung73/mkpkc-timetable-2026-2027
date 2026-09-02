import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { ScheduleProvider } from "@/components/schedule-provider";
import { SCHOOL_NAME, SCHOOL_YEAR } from "@/lib/constants";
import "./globals.css";

const noto = Noto_Sans_TC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: `${SCHOOL_NAME}課表查詢`,
  description: `${SCHOOL_YEAR} 學務發展部老師／班別時間表本機查詢系統`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${noto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <TooltipProvider>
          <ScheduleProvider>
            <AppShell>{children}</AppShell>
          </ScheduleProvider>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
