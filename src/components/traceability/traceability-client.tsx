"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck, FileText, RefreshCw, Search,
  CheckCircle2, AlertTriangle, ExternalLink, ChevronDown, ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LPS_PHASES, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_VARIANT } from "@/types";
import type { DocumentStatus } from "@/types";
import { formatDate, formatRelative } from "@/lib/utils";

export function TraceabilityClient() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [documents, setDocuments] = useState<any[]>([]);
  const [requiredDocs, setRequiredDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.ok ? r.json() : [])
      .then((ps) => {
        const list = Array.isArray(ps) ? ps : [];
        setProjects(list);
        if (list.length > 0) setSelectedProjectId(list[0].id);
      });
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/projects/${selectedProjectId}/documents`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/document-types`).then((r) => r.ok ? r.json() : []),
    ])
      .then(([docs, dtypes]) => {
        setDocuments(Array.isArray(docs) ? docs : []);
        setRequiredDocs(Array.isArray(dtypes) ? dtypes : []);
      })
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  const filtered = documents.filter((d: any) =>
    !query || d.title?.toLowerCase().includes(query.toLowerCase())
  );

  // Group by phase
  const byPhase: Record<string, any[]> = {};
  for (const d of filtered) {
    const phase = d.projectPhase?.phase ?? "UNKNOWN";
    if (!byPhase[phase]) byPhase[phase] = [];
    byPhase[phase].push(d);
  }

  // Completeness: required docs per phase vs approved
  const completeness = LPS_PHASES.map(({ phase, label }) => {
    const required = requiredDocs.filter((r: any) => r.phase === phase && !r.isOptional);
    const phaseDocs = documents.filter((d: any) => d.projectPhase?.phase === phase);
    const approvedTypes = new Set(phaseDocs.filter((d: any) => d.status === "APPROVED").map((d: any) => d.documentType));
    const fulfilled = required.filter((r: any) => approvedTypes.has(r.documentType)).length;
    const projectPhase = (projects.find((p: any) => p.id === selectedProjectId)?.phases ?? []).find((ph: any) => ph.phase === phase);
    const isActive = phaseDocs.length > 0 || projectPhase?.isActive;
    const isSkipped = projectPhase?.isSkipped === true;
    return {
      phase, label, required: required.length, fulfilled,
      percent: required.length === 0 ? 100 : Math.round((fulfilled / required.length) * 100),
      isComplete: required.length === 0 || fulfilled === required.length,
      isActive,
      isSkipped,
      missingLabels: required.filter((r: any) => !approvedTypes.has(r.documentType)).map((r: any) => r.label),
    };
  });

  const activeCompleteness = completeness.filter((c) => c.isActive && !c.isSkipped);
  const totalRequired = activeCompleteness.reduce((s, c) => s + c.required, 0);
  const totalFulfilled = activeCompleteness.reduce((s, c) => s + c.fulfilled, 0);
  const overallPercent = totalRequired === 0 ? 100 : Math.round((totalFulfilled / totalRequired) * 100);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Traceability Dokumen</h2>
          <p className="text-sm text-gray-500">Verifikasi kelengkapan dan keterlacakan dokumen proyek LPS (IEC 62305)</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => setSelectedProjectId((id) => id)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Pilih proyek" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Cari dokumen..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><RefreshCw className="h-5 w-5 animate-spin text-blue-600" /></div>
      ) : !selectedProjectId ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16">
          <ShieldCheck className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Pilih proyek untuk melihat traceability</p>
        </div>
      ) : (
        <>
          {/* Completeness summary */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">Kelengkapan Dokumen Wajib</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{totalFulfilled}/{totalRequired}</span>
                  <span className={`text-sm font-semibold ${overallPercent === 100 ? "text-green-600" : overallPercent > 50 ? "text-blue-600" : "text-amber-600"}`}>
                    ({overallPercent}%)
                  </span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100 mb-4">
                <div
                  className={`h-2 rounded-full transition-all ${overallPercent === 100 ? "bg-green-500" : overallPercent > 50 ? "bg-blue-500" : "bg-amber-500"}`}
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {completeness.map(({ phase, label, required, fulfilled, isComplete, percent, isActive, isSkipped }) => {
                  const inactive = !isActive && !isSkipped;
                  return (
                    <div key={phase} className={`rounded-lg border p-2.5 text-center ${
                      isSkipped ? "border-gray-100 bg-gray-100 opacity-50" :
                      inactive ? "border-gray-100 bg-gray-50 opacity-50" :
                      required === 0 ? "border-gray-100 bg-gray-50 opacity-60" :
                      isComplete ? "border-green-200 bg-green-50" :
                      percent > 0 ? "border-blue-200 bg-blue-50" :
                      "border-gray-100 bg-gray-50"
                    }`}>
                      <div className="flex justify-center mb-1">
                        {isSkipped || inactive || required === 0
                          ? <div className="h-4 w-4" />
                          : isComplete
                          ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                          : <AlertTriangle className="h-4 w-4 text-amber-400" />
                        }
                      </div>
                      <p className={`text-xs font-medium leading-tight ${isSkipped ? "text-gray-400 line-through" : "text-gray-700"}`}>{label}</p>
                      <p className={`text-xs mt-0.5 ${
                        isSkipped ? "text-gray-300" :
                        inactive ? "text-gray-300" :
                        required === 0 ? "text-gray-300" :
                        isComplete ? "text-green-600" : "text-gray-500"
                      }`}>
                        {isSkipped ? "skip" : inactive ? "—" : required === 0 ? "—" : `${fulfilled}/${required}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Documents by phase */}
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-12">
              <FileText className="h-10 w-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">Belum ada dokumen di proyek ini</p>
            </div>
          ) : (
            <div className="space-y-3">
              {LPS_PHASES.map(({ phase, label, order }) => {
                const docs = byPhase[phase];
                if (!docs?.length) return null;
                return (
                  <PhaseDocSection
                    key={phase}
                    phase={phase}
                    label={label}
                    order={order}
                    docs={docs}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PhaseDocSection({ phase, label, order, docs }: { phase: string; label: string; order: number; docs: any[] }) {
  const [expanded, setExpanded] = useState(true);
  const approvedCount = docs.filter((d: any) => d.status === "APPROVED").length;

  return (
    <Card>
      <CardHeader className="p-0">
        <button
          className="flex items-center justify-between w-full px-5 py-3 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
            <CardTitle className="text-sm font-semibold text-gray-700">
              {label}
            </CardTitle>
            <Badge variant="secondary" className="font-normal">{docs.length} dokumen</Badge>
            {approvedCount > 0 && (
              <Badge variant="success" className="font-normal">{approvedCount} disetujui</Badge>
            )}
          </div>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-b bg-gray-50/60">
                  <th className="px-5 py-2 text-left font-medium text-gray-500 text-xs">Judul Dokumen</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs">Versi</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs">Diunggah Oleh</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs">Direview Oleh</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs">Tanggal</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {docs.map((d: any) => {
                  const ver = d.versions?.[0];
                  const filePath = ver?.filePath ?? d.filePath;
                  return (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900 max-w-xs">
                        <p className="truncate">{d.title}</p>
                        {d.description && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{d.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={DOCUMENT_STATUS_VARIANT[d.status as DocumentStatus] ?? "secondary"} className="text-xs">
                          {DOCUMENT_STATUS_LABELS[d.status as DocumentStatus] ?? d.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {ver ? `v${ver.versionNumber}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{d.uploadedBy?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{d.reviewedBy?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {d.createdAt ? formatDate(d.createdAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {filePath ? (
                          <a
                            href={filePath}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Buka
                          </a>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
