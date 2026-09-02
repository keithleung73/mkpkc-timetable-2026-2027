"use client";

import { useMemo, useState } from "react";
import type { Teacher } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterTeachers, teacherEnglishLabels } from "@/lib/search";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, X } from "lucide-react";

export function TeacherPicker({
  teachers,
  value,
  onChange,
  placeholder = "搜尋中文、簡稱或英文（如 Tang）",
}: {
  teachers: Teacher[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = teachers.find((t) => t.id === value);
  const filtered = useMemo(() => filterTeachers(teachers, q), [q, teachers]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between md:w-80")}
      >
        <span className={cn(!selected && "text-muted-foreground")}>
          {selected ? `${selected.name}（${selected.code}）` : placeholder}
        </span>
        <ChevronsUpDown className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="中文／簡稱／英文，例如 Tang、Chan、華"
        />
        <div className="mt-2 max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">找不到老師</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  "flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  value === t.id && "bg-muted",
                )}
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
              >
                <span>
                  {t.name} <span className="text-muted-foreground">（{t.code}）</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {[teacherEnglishLabels(t)[0], t.subjects.join("、")].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TeacherMultiPicker({
  teachers,
  value,
  onChange,
}: {
  teachers: Teacher[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => filterTeachers(teachers, q), [q, teachers]);

  return (
    <div className="space-y-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="中文／簡稱／英文，例如 Tang" />
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const t = teachers.find((x) => x.id === id);
            if (!t) return null;
            return (
              <button
                key={id}
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-[color:var(--school-navy)] px-2.5 py-1 text-xs text-white"
                onClick={() => onChange(value.filter((v) => v !== id))}
              >
                {t.name}（{t.code}）
                <X className="size-3" />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">尚未選擇老師</p>
      )}
      <div className="max-h-64 overflow-y-auto rounded-lg border">
        {filtered.map((t) => {
          const checked = value.includes(t.id);
          return (
            <label
              key={t.id}
              className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(checked ? value.filter((v) => v !== t.id) : [...value, t.id])
                }
              />
              <span className="text-sm">
                {t.name}（{t.code}）
                <span className="ml-2 text-xs text-muted-foreground">
                  {[teacherEnglishLabels(t)[0], t.subjects.join("、")].filter(Boolean).join(" · ")}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
