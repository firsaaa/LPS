"use client";

import { useState } from "react";
import { cn, parseErrorMessage } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Wording for SUPERSEDED/OBSOLETE is a placeholder pending a clearer pass.
export const VERSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "Sedang Ditinjau",
  APPROVED: "Disetujui",
  SUPERSEDED: "Digantikan",
  OBSOLETE: "Tidak Berlaku",
};

const VERSION_STATUSES = Object.keys(VERSION_STATUS_LABELS);

const VERSION_STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  IN_REVIEW: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  SUPERSEDED: "bg-gray-100 text-gray-500 line-through",
  OBSOLETE: "bg-red-800 text-white",
};

export function VersionStatusBadge({
  documentId,
  status,
  canChange,
  onChanged,
}: {
  documentId: string;
  status: string;
  canChange: boolean;
  onChanged?: (status: string) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function changeStatus(next: string) {
    setOpen(false);
    if (next === status) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        onChanged?.(next);
        toast({ title: `Status diubah ke ${VERSION_STATUS_LABELS[next]}`, variant: "success" });
      } else {
        toast({ title: "Gagal mengubah status", description: await parseErrorMessage(res), variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }

  const label = VERSION_STATUS_LABELS[status] ?? status;
  const style = VERSION_STATUS_STYLE[status] ?? "bg-gray-100 text-gray-600";

  if (!canChange) {
    return (
      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", style)}>
        {label}
      </span>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50",
          style
        )}
      >
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="listbox" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} className="absolute z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-md">
            {VERSION_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={s === status}
                onClick={() => changeStatus(s)}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 focus:outline-none focus:bg-gray-100"
              >
                {VERSION_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
