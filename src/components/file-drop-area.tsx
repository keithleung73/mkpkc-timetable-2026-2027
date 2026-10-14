"use client";

import { useRef, useState, type ReactNode } from "react";
import { fileMatchesAccept } from "@/lib/file-accept";
import { cn } from "@/lib/utils";

export { EXCEL_ACCEPT, RECORDS_UPLOAD_ACCEPT, fileMatchesAccept } from "@/lib/file-accept";

export function FileDropArea({
  accept,
  multiple,
  disabled,
  className,
  onFiles,
  children,
}: {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  onFiles: (files: File[]) => void;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | File[] | null) => {
    const all = list ? Array.from(list) : [];
    const matched = all.filter((file) => fileMatchesAccept(file, accept));
    if (matched.length) onFiles(matched);
    else if (all.length) onFiles(all);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      className={cn("relative", over && "ring-2 ring-ring/40", className)}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = disabled ? "none" : "copy";
        if (!disabled) setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        title="選擇檔案"
        aria-label="選擇檔案"
        onChange={(e) => take(e.target.files)}
      />
      {children}
    </div>
  );
}
