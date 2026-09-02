"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  CalendarDays,
  DoorOpen,
  FileSpreadsheet,
  LayoutGrid,
  Repeat2,
  Search,
  Users,
  UserSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHOOL_NAME, SCHOOL_YEAR } from "@/lib/constants";
import { isStaticExport } from "@/lib/runtime";

const NAV = [
  { href: "/", label: "總覽", icon: LayoutGrid },
  { href: "/teachers", label: "老師時間表", icon: Search },
  { href: "/status", label: "課堂狀態", icon: UserSearch },
  { href: "/free", label: "空閒老師", icon: Users },
  { href: "/common-free", label: "共同空閒", icon: CalendarDays },
  { href: "/classes", label: "班別課表", icon: DoorOpen },
  { href: "/swap", label: "調堂", icon: ArrowLeftRight },
  { href: "/cover", label: "代堂", icon: Repeat2 },
  { href: "/import", label: "匯入 Excel", icon: FileSpreadsheet },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-full flex-col bg-background lg:flex-row">
      <header className="border-b bg-[color:var(--school-navy)] text-white lg:hidden">
        <div className="px-4 py-3">
          <p className="text-xs tracking-wide text-white/70">{SCHOOL_YEAR} 學務發展部</p>
          <h1 className="text-base font-semibold">{SCHOOL_NAME}課表查詢</h1>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs",
                  active ? "bg-white text-[color:var(--school-navy)]" : "bg-white/10 text-white",
                )}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <aside className="hidden w-60 shrink-0 flex-col bg-[color:var(--school-navy)] text-white lg:flex">
        <div className="border-b border-white/10 px-5 py-6">
          <p className="text-xs tracking-widest text-amber-200">{SCHOOL_YEAR}</p>
          <h1 className="mt-1 text-lg font-semibold leading-snug">{SCHOOL_NAME}</h1>
          <p className="mt-1 text-sm text-white/70">學務發展部 · 課表查詢</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                  active ? "bg-white text-[color:var(--school-navy)]" : "text-white/80 hover:bg-white/10",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="px-5 py-4 text-xs text-white/50">
          {isStaticExport ? "網上唯讀版 · GitHub Pages" : "本機試用 · timetable.mkpkc.local"}
        </p>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
