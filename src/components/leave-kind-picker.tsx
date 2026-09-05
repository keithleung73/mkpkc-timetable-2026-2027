"use client";

import { Button } from "@/components/ui/button";
import { LEAVE_KIND_OPTIONS, type LeaveKind } from "@/lib/leave";
import { cn } from "@/lib/utils";

export function LeaveKindPicker({
  value,
  onChange,
  disabled,
  showOfficialHint = true,
  className,
}: {
  value: LeaveKind;
  onChange: (value: LeaveKind) => void;
  disabled?: boolean;
  showOfficialHint?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {LEAVE_KIND_OPTIONS.map((opt) => (
        <Button
          key={opt.id}
          type="button"
          size="sm"
          variant={value === opt.id ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
          {showOfficialHint && opt.id === "official" ? " · 不計±" : ""}
        </Button>
      ))}
    </div>
  );
}
