"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  CalendarDays,
  DoorOpen,
  Repeat2,
  Search,
  Share2,
  Users,
  UserSearch,
} from "lucide-react";
import { isStaticExport, GITHUB_PAGES_SITE } from "@/lib/runtime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageBody, PageHeader, ScheduleGate } from "@/components/page-chrome";
import { useSchedule } from "@/components/schedule-provider";
import { SCHOOL_NAME, SCHOOL_YEAR, dayLabel, formatTimeRange, periodLabel } from "@/lib/constants";
import { currentDay, currentPeriodId, isTeachingPeriod } from "@/lib/clock";
import { classNames, freeTeachers, roomName, stats, teacherNames } from "@/lib/queries";

const LINKS = [
  {
    href: "/share",
    title: "給同事使用",
    desc: "複製校內網址，貼去 WhatsApp／電郵。同事唔使安裝，用手機或電腦瀏覽器打開。",
    icon: Share2,
  },
  {
    href: "/teachers",
    title: "搜尋老師時間表",
    desc: "用姓名或簡稱（例如「華」「真」）查看一週授課、地點與班別。",
    icon: Search,
  },
  {
    href: "/status",
    title: "查詢課堂狀態",
    desc: "指定星期與節次，即時睇該老師喺邊個室、教邊班。",
    icon: UserSearch,
  },
  {
    href: "/free",
    title: "該時段空閒老師",
    desc: "列出該堂無課老師，並按代課指引排序（少於 7 節、同科、任教該班優先）。",
    icon: Users,
  },
  {
    href: "/common-free",
    title: "一組老師共同空閒",
    desc: "選多位老師，找出大家一齊得閒嘅節次，方便開會或調堂。",
    icon: CalendarDays,
  },
  {
    href: "/classes",
    title: "班別課堂與地點",
    desc: "查 1A 至 6E 每節科目、老師同上課地點。",
    icon: DoorOpen,
  },
  {
    href: "/swap",
    title: "調堂安排",
    desc: "病假／事假／公假多日調堂；可即時揀建議轉入紀錄。公假不計 ±。IAL 一拼調，選修並行不可單獨調。",
    icon: ArrowLeftRight,
  },
  {
    href: "/cover",
    title: "代堂編配",
    desc: "勾選請假同事並標明病假／事假／公假；公假不計 ±。按負數結餘優先組當日代堂方案。",
    icon: Repeat2,
  },
];

export default function HomePage() {
  return (
    <PageBody>
      <PageHeader
        title={`${SCHOOL_NAME} ${SCHOOL_YEAR} 課表`}
        description={
          isStaticExport
            ? "學務發展部課表查詢。可查老師／班別／空閒，亦可做調堂同代堂編配。"
            : "學務發展部課表網站。同事喺校網用瀏覽器打開即可；按側欄「給同事」複製網址。"
        }
      />
      <ScheduleGate>
        <DashboardInner />
      </ScheduleGate>
    </PageBody>
  );
}

function DashboardInner() {
  const { data } = useSchedule();
  const day = currentDay();
  const periodId = currentPeriodId();
  const nowLessons =
    data && day && isTeachingPeriod(periodId)
      ? data.lessons.filter((l) => l.day === day && l.periodId === periodId)
      : [];

  if (!data) return null;
  const s = stats(data);
  const freeNow =
    day && isTeachingPeriod(periodId) ? freeTeachers(data, day, periodId).length : null;

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="老師" value={s.teachers} />
        <Stat label="班別" value={s.classes} />
        <Stat label="課堂紀錄" value={s.lessons} />
        <Stat label="特別室" value={s.specialRooms} />
      </div>

      {isStaticExport ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">網上地址</CardTitle>
            <CardDescription>同事用瀏覽器打開即可查課表（唯讀）。</CardDescription>
          </CardHeader>
          <CardContent>
            <a className="font-mono text-sm underline-offset-2 hover:underline" href={GITHUB_PAGES_SITE}>
              {GITHUB_PAGES_SITE}
            </a>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>而家呢一節</CardTitle>
          <CardDescription>
            以香港時間計算。星期六、日或非上課時段會顯示為休息。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!day ? (
            <p className="text-sm text-muted-foreground">今日唔係上課日。</p>
          ) : !isTeachingPeriod(periodId) ? (
            <p className="text-sm text-muted-foreground">
              今日係{dayLabel(day)}，而家唔係授課節（小息／午膳／早會等）。
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{dayLabel(day)}</Badge>
                <Badge variant="secondary">
                  {periodLabel(periodId)} {formatTimeRange(day, periodId)}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {nowLessons.length} 堂進行中 · {freeNow} 位老師空閒
                </span>
              </div>
              {nowLessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">呢一節未有課堂紀錄。</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {nowLessons.slice(0, 9).map((l) => (
                    <div key={l.id} className="rounded-lg border px-3 py-2 text-sm">
                      <div className="font-medium">
                        {classNames(data, l.classIds)} · {l.subject}
                      </div>
                      <div className="text-muted-foreground">
                        {roomName(data, l.roomId)} · {teacherNames(data, l.teacherIds)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {(isStaticExport ? LINKS.filter((item) => item.href !== "/share") : LINKS).map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition hover:border-[color:var(--school-navy)] hover:shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <item.icon className="size-4" />
                  {item.title}
                </CardTitle>
                <CardDescription>{item.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        資料來源：{data.meta.source} · 更新於 {new Date(data.meta.updatedAt).toLocaleString("zh-HK")}
        {" · "}作息：星期一至四每堂 35 分鐘，星期五 30 分鐘 · 每週 44 堂（含自主學習）
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
