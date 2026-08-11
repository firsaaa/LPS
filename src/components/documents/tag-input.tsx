"use client";

import { useState, useEffect } from "react";
import { X, Plus } from "lucide-react";

// Tags are picked from the existing, fixed list only — not free text. Every
// tag has one consistent meaning (a document's type category), so letting
// users type arbitrary new ones would immediately break that consistency.
export function TagInput({
  tags,
  onAdd,
  onRemove,
  readOnly = false,
}: {
  tags: { id?: string; name: string }[];
  onAdd: (name: string) => void;
  onRemove: (tag: { id?: string; name: string }) => void;
  readOnly?: boolean;
}) {
  const [allTags, setAllTags] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAllTags)
      .catch(() => {});
  }, []);

  const available = allTags.filter((t) => !tags.some((tg) => tg.name === t.name));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((t) => (
          <span
            key={t.id ?? t.name}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200"
          >
            {t.name}
            {!readOnly && (
              <button
                type="button"
                onClick={() => onRemove(t)}
                aria-label={`Hapus tag ${t.name}`}
                className="rounded-full hover:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {tags.length === 0 && readOnly && <span className="text-xs text-gray-400">Belum ada tag</span>}
      </div>
      {!readOnly && (
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Plus className="h-3 w-3" /> Pilih Tag
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute z-20 mt-1 w-56 max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-md">
                {available.length === 0 ? (
                  <p className="px-2.5 py-1.5 text-xs text-gray-400">Semua tag sudah ditambahkan</p>
                ) : (
                  available.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { onAdd(t.name); setOpen(false); }}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 focus:outline-none focus:bg-gray-100"
                    >
                      {t.name}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
