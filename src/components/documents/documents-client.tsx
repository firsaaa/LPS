"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, FileText, Loader2, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LPS_PHASES, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_VARIANT } from "@/types";
import type { DocumentStatus } from "@/types";
import { formatDate } from "@/lib/utils";
import { VERSION_STATUS_LABELS } from "@/components/documents/version-status-badge";
import { DocumentTitle } from "@/components/documents/document-title";
import { handleSessionExpired } from "@/lib/session-expired";

export function DocumentsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Dibaca sekali saat mount (lazy initializer) — nilai selanjutnya dikelola
  // oleh state seperti biasa, URL cuma disinkronkan SATU ARAH (state -> URL)
  // di efek pencarian di bawah supaya tidak saling menimpa.
  const initial = useRef(searchParams).current;

  const [docs, setDocs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState(() => initial.get("keyword") ?? "");
  const [projectId, setProjectId] = useState(() => initial.get("project_id") ?? "all");
  const [phase, setPhase] = useState(() => initial.get("phase") ?? "all");
  const [documentTypeId, setDocumentTypeId] = useState(() => initial.get("document_type_id") ?? "all");
  const [dateFrom, setDateFrom] = useState(() => initial.get("date_from") ?? "");
  const [dateTo, setDateTo] = useState(() => initial.get("date_to") ?? "");
  const [dueDateFrom, setDueDateFrom] = useState(() => initial.get("due_date_from") ?? "");
  const [dueDateTo, setDueDateTo] = useState(() => initial.get("due_date_to") ?? "");
  const [documentCode, setDocumentCode] = useState(() => initial.get("document_code") ?? "");
  const [tags, setTags] = useState(() => initial.getAll("tags").join(", "));
  const [status, setStatus] = useState(() => initial.get("status") ?? "all");
  const [uploaderName, setUploaderName] = useState(() => initial.get("uploader") ?? "");
  const [showAdvanced, setShowAdvanced] = useState(() =>
    !!(initial.get("date_from") || initial.get("date_to") || initial.get("due_date_from") || initial.get("due_date_to")
      || initial.get("document_code") || initial.get("uploader") || (initial.get("status") && initial.get("status") !== "all"))
  );

  useEffect(() => {
    fetch("/api/projects").then((r) => (r.ok ? r.json() : [])).then(setProjects).catch(() => {});
    fetch("/api/document-type-master").then((r) => (r.ok ? r.json() : [])).then(setTypes).catch(() => {});
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set("keyword", keyword);
      if (projectId !== "all") params.set("project_id", projectId);
      if (phase !== "all") params.set("phase", phase);
      if (documentTypeId !== "all") params.set("document_type_id", documentTypeId);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (dueDateFrom) params.set("due_date_from", dueDateFrom);
      if (dueDateTo) params.set("due_date_to", dueDateTo);
      if (documentCode) params.set("document_code", documentCode);
      if (status !== "all") params.set("status", status);
      if (uploaderName) params.set("uploader", uploaderName);
      tags.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => params.append("tags", t));

      // Simpan filter ke URL supaya bertahan lewat navigasi (buka dokumen lalu
      // kembali lewat tombol back) dan reload halaman — bukan cuma state lokal
      // komponen ini yang reset tiap kali di-mount ulang.
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

      const res = await fetch(`/api/documents/search?${params}`);
      if (res.status === 401) { handleSessionExpired(); return; }
      if (res.ok) {
        const data = await res.json();
        setDocs(data.results ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [keyword, projectId, phase, documentTypeId, dateFrom, dateTo, dueDateFrom, dueDateTo, documentCode, status, uploaderName, tags, router, pathname]);

  useEffect(() => {
    const t = setTimeout(search, 400);
    return () => clearTimeout(t);
  }, [search]);

  const advancedFilterCount = [dateFrom, dateTo, dueDateFrom, dueDateTo, documentCode, uploaderName, tags].filter(Boolean).length
    + (status !== "all" ? 1 : 0);
  const hasFilters = keyword || projectId !== "all" || phase !== "all" || documentTypeId !== "all" || advancedFilterCount > 0;

  function resetFilters() {
    setKeyword(""); setProjectId("all"); setPhase("all"); setDocumentTypeId("all");
    setDateFrom(""); setDateTo(""); setDueDateFrom(""); setDueDateTo(""); setDocumentCode("");
    setStatus("all"); setUploaderName(""); setTags("");
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Pencarian Dokumen</h2>
        <p className="text-sm text-gray-500">
          Cari dokumen dari seluruh proyek yang dapat Anda akses
        </p>
      </div>

      {/* Search panel — essentials always visible, rest tucked behind Filter Lanjutan */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="f-keyword" className="text-xs text-gray-500">Kata Kunci</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <Input id="f-keyword" placeholder="Judul, kode, tag, isi dokumen..." value={keyword} onChange={(e) => setKeyword(e.target.value)} className="pl-8 h-9" />
            </div>
            <p className="text-[10px] text-gray-400">Termasuk mencari di dalam isi dokumen (PDF/Word/Excel/PPT)</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Proyek</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Semua Proyek" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Proyek</SelectItem>
                {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Fase</Label>
            <Select value={phase} onValueChange={setPhase}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Semua Fase" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Fase</SelectItem>
                {LPS_PHASES.map((p) => <SelectItem key={p.phase} value={p.phase}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Jenis Dokumen</Label>
            <Select value={documentTypeId} onValueChange={setDocumentTypeId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Semua Jenis" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Jenis</SelectItem>
                {types.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Filter Lanjutan
          {advancedFilterCount > 0 && <Badge variant="info" className="text-[10px]">{advancedFilterCount}</Badge>}
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-gray-100 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-from" className="text-xs text-gray-500">Tanggal Dibuat: Dari</Label>
              <Input id="f-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-to" className="text-xs text-gray-500">Tanggal Dibuat: Sampai</Label>
              <Input id="f-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-due-from" className="text-xs text-gray-500">Tenggat: Dari</Label>
              <Input id="f-due-from" type="date" value={dueDateFrom} onChange={(e) => setDueDateFrom(e.target.value)} className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-due-to" className="text-xs text-gray-500">Tenggat: Sampai</Label>
              <Input id="f-due-to" type="date" value={dueDateTo} onChange={(e) => setDueDateTo(e.target.value)} className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-code" className="text-xs text-gray-500">Kode Dokumen</Label>
              <Input id="f-code" placeholder="mis. LGM-CMS-LOG" value={documentCode} onChange={(e) => setDocumentCode(e.target.value)} className="h-9 font-mono" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-tags" className="text-xs text-gray-500">Tag (pisahkan dengan koma)</Label>
              <Input id="f-tags" placeholder="mis. urgent, revisi" value={tags} onChange={(e) => setTags(e.target.value)} className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Semua Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  {(Object.keys(DOCUMENT_STATUS_LABELS) as DocumentStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{DOCUMENT_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-uploader" className="text-xs text-gray-500">Diupload oleh</Label>
              <Input id="f-uploader" placeholder="Nama pengunggah" value={uploaderName} onChange={(e) => setUploaderName(e.target.value)} className="h-9" />
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-100 py-16">
          <FileText className="h-12 w-12 text-gray-200 mb-3" />
          <p className="text-sm text-gray-500">Tidak ada dokumen ditemukan</p>
          {hasFilters && (
            <button onClick={resetFilters} className="mt-2 text-xs text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
              Reset filter
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {docs.length} dokumen cocok
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {docs.map((doc: any) => {
              const currentVersion = doc.versions?.[0];
              const filePath = currentVersion?.filePath ?? doc.filePath;
              const phaseMeta = LPS_PHASES.find((p) => p.phase === doc.projectPhase?.phase);
              return (
                <div key={doc.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100">
                    <FileText className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/documents/${doc.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                        <DocumentTitle code={doc.documentCode} title={doc.title} />
                      </Link>
                      <Badge variant={DOCUMENT_STATUS_VARIANT[doc.status as DocumentStatus] ?? "secondary"} className="text-xs shrink-0">
                        {DOCUMENT_STATUS_LABELS[doc.status as DocumentStatus] ?? doc.status}
                      </Badge>
                      {currentVersion?.status && (
                        <span className="text-xs text-gray-400 shrink-0">
                          {VERSION_STATUS_LABELS[currentVersion.status] ?? currentVersion.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>
                        {doc.projectPhase?.project?.name ?? "—"}
                        {phaseMeta && <> · {phaseMeta.label}</>}
                        {doc.uploadedBy?.name && <> · {doc.uploadedBy.name}</>}
                        {doc.createdAt && <> · {formatDate(doc.createdAt)}</>}
                      </span>
                    </p>
                    {doc.tags?.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {doc.tags.map((dt: any) => (
                          <span key={dt.tag.id} className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                            {dt.tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {doc.contentSnippet && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-gray-500 italic">
                        <Search className="h-3 w-3 shrink-0 mt-0.5 text-gray-400" />
                        <HighlightedText text={doc.contentSnippet} keyword={keyword} />
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <Link href={`/documents/${doc.id}`} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      Detail
                    </Link>
                    {filePath ? (
                      <a
                        href={filePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <ExternalLink className="h-3 w-3" /> Buka
                      </a>
                    ) : (
                      <span className="text-xs text-gray-300 px-2">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Bolds the matched keyword inside a snippet, so it's obvious at a glance why a document matched. */
function HighlightedText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword.trim()) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.trim().toLowerCase()
          ? <strong key={i} className="text-gray-800 not-italic">{part}</strong>
          : part
      )}
    </span>
  );
}
