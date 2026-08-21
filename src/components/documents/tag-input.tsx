"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Plus } from "lucide-react";

// Tag bebas diisi sesuai kebutuhan pengguna — mengetik nama yang belum ada
// akan membuat tag baru (lihat attachTag di tag.service.ts), bukan dibatasi
// ke daftar tetap.
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
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAllTags)
      .catch(() => {});
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const available = allTags.filter((t) => !tags.some((tg) => tg.name === t.name));
  const filtered = useMemo(
    () => (normalizedQuery ? available.filter((t) => t.name.includes(normalizedQuery)) : available),
    [available, normalizedQuery]
  );
  const exactMatchExists = available.some((t) => t.name === normalizedQuery) || tags.some((t) => t.name === normalizedQuery);

  function addAndClose(name: string) {
    onAdd(name);
    setQuery("");
    setOpen(false);
  }

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
            <Plus className="h-3 w-3" /> Tambah Tag
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-md">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && normalizedQuery && !exactMatchExists) {
                      e.preventDefault();
                      addAndClose(normalizedQuery);
                    }
                    if (e.key === "Escape") setOpen(false);
                  }}
                  placeholder="Cari atau ketik tag baru..."
                  className="w-full border-b border-gray-100 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none"
                />
                <div className="max-h-48 overflow-y-auto py-1">
                  {normalizedQuery && !exactMatchExists && (
                    <button
                      type="button"
                      onClick={() => addAndClose(normalizedQuery)}
                      className="flex w-full items-center gap-1 px-2.5 py-1.5 text-left text-xs text-blue-600 hover:bg-blue-50 focus:outline-none focus:bg-blue-50"
                    >
                      <Plus className="h-3 w-3" /> Buat tag &quot;{normalizedQuery}&quot;
                    </button>
                  )}
                  {filtered.length === 0 && !normalizedQuery ? (
                    <p className="px-2.5 py-1.5 text-xs text-gray-400">Semua tag sudah ditambahkan</p>
                  ) : (
                    filtered.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => addAndClose(t.name)}
                        className="flex w-full items-center px-2.5 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 focus:outline-none focus:bg-gray-100"
                      >
                        {t.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
