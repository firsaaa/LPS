"use client";

import { useState, useEffect } from "react";
import { Loader2, ShieldCheck, FileText, Activity, AlertCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECT_STATUS_LABELS, LPS_PHASES, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_VARIANT, DOCUMENT_VISIBILITY_LABELS } from "@/types";
import type { DocumentVisibility, DocumentStatus } from "@/types";
import { formatDate, formatRelative, formatBytes } from "@/lib/utils";
import { TraceabilityClient } from "@/components/traceability/traceability-client";

export function InspectorClient() {
  const [projects, setProjects] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState("all");

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      // advancedSearchDocuments (no filters = broad, up to 100 most recent
      // accessible documents) — richer shape than /api/documents (documentTypeMaster,
      // and already scoped per-project by the viewer's actual role there, not
      // a single flag for the whole cross-project result set).
      fetch("/api/documents/search").then((r) => r.json()),
      fetch("/api/audit-logs").then((r) => r.json()),
    ]).then(([p, d, l]) => {
      setProjects(Array.isArray(p) ? p : []);
      setDocs(Array.isArray(d?.results) ? d.results : []);
      setLogs(Array.isArray(l) ? l : []);
    }).finally(() => setLoading(false));
  }, []);

  const filteredDocs = selectedProject === "all" ? docs : docs.filter((d) => d.projectPhase?.project?.id === selectedProject);
  const pendingDocs = filteredDocs.filter((d) => d.status === "UNDER_REVIEW");

  // Compliance check: for each project, which phases are missing required doc types
  const complianceData = projects.map((p) => {
    const projectDocs = docs.filter((d) => d.projectPhase?.project?.id === p.id && d.status === "APPROVED");
    const missing: string[] = [];
    LPS_PHASES.forEach((ph) => {
      const phDocs = projectDocs.filter((d) => d.projectPhase?.phase === ph.phase);
      // Only flag active phases that have no approved documents
      const projectPhase = p.phases?.find((pp: any) => pp.phase === ph.phase);
      if (projectPhase?.isActive && !projectPhase?.isSkipped && phDocs.length === 0) {
        missing.push(ph.label);
      }
    });
    return { ...p, missingPhases: missing, approvedDocs: projectDocs.length, totalDocs: docs.filter((d) => d.projectPhase?.project?.id === p.id).length };
  });

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pusat Kepatuhan</h2>
          <p className="text-sm text-gray-500">Monitoring kepatuhan dokumen seluruh proyek LPS terhadap standar IEC 62305</p>
        </div>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filter proyek" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Proyek</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50"><ShieldCheck className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{projects.length}</p><p className="text-xs text-gray-500">Total Proyek</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50"><FileText className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{docs.filter((d) => d.status === "APPROVED").length}</p><p className="text-xs text-gray-500">Dokumen Disetujui</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50"><AlertCircle className="h-5 w-5 text-amber-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{pendingDocs.length}</p><p className="text-xs text-gray-500">Menunggu Review</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50"><AlertCircle className="h-5 w-5 text-red-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{complianceData.filter((p) => p.missingPhases.length > 0).length}</p><p className="text-xs text-gray-500">Proyek Tidak Lengkap</p></div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="compliance">
        <TabsList>
          <TabsTrigger value="compliance">Ringkasan Kepatuhan</TabsTrigger>
          <TabsTrigger value="traceability">Telusur per Proyek</TabsTrigger>
          <TabsTrigger value="pending">Menunggu Review ({pendingDocs.length})</TabsTrigger>
          <TabsTrigger value="documents">Semua Dokumen</TabsTrigger>
          <TabsTrigger value="activity">Riwayat Aktivitas</TabsTrigger>
        </TabsList>

        {/* COMPLIANCE TAB */}
        <TabsContent value="compliance" className="space-y-4 mt-4">
          {complianceData.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.client ?? "—"} · {PROJECT_STATUS_LABELS[p.status as keyof typeof PROJECT_STATUS_LABELS]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{p.approvedDocs}/{p.totalDocs} dokumen disetujui</span>
                    {p.missingPhases.length === 0
                      ? <Badge variant="success">Lengkap</Badge>
                      : <Badge variant="warning">{p.missingPhases.length} fase kurang</Badge>
                    }
                  </div>
                </div>
                {p.missingPhases.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs font-medium text-amber-700 mb-1">Fase yang belum memiliki dokumen approved:</p>
                    <div className="flex flex-wrap gap-1">
                      {p.missingPhases.map((f: string) => (
                        <Badge key={f} variant="warning" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* TRACEABILITY — single-project drill-down: exact missing document
            types per phase, not just "N fase kurang" like the compliance tab. */}
        <TabsContent value="traceability" className="mt-4">
          <TraceabilityClient />
        </TabsContent>

        {/* PENDING REVIEW */}
        <TabsContent value="pending" className="space-y-3 mt-4">
          {pendingDocs.length === 0 && (
            <div className="text-center py-12 text-gray-400">Tidak ada dokumen menunggu review</div>
          )}
          {pendingDocs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                  <p className="text-xs text-gray-500">{doc.projectPhase?.project?.name} · {doc.documentTypeMaster?.name ?? doc.documentType}</p>
                  <p className="text-xs text-gray-400">{doc.uploadedBy?.name} · {formatDate(doc.createdAt)}</p>
                </div>
                <Badge variant={DOCUMENT_STATUS_VARIANT[doc.status as DocumentStatus] ?? "secondary"} className="text-xs shrink-0 ml-3">
                  {DOCUMENT_STATUS_LABELS[doc.status as DocumentStatus] ?? doc.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ALL DOCUMENTS */}
        <TabsContent value="documents" className="space-y-3 mt-4">
          {filteredDocs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                    <p className="text-xs text-gray-500">{doc.projectPhase?.project?.name} · {doc.documentTypeMaster?.name ?? doc.documentType} · v{doc.versions?.[0]?.versionNumber ?? "—"}</p>
                    <p className="text-xs text-gray-400">Visibilitas: {DOCUMENT_VISIBILITY_LABELS[doc.visibility as DocumentVisibility] ?? doc.visibility} · {formatDate(doc.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <Badge variant={DOCUMENT_STATUS_VARIANT[doc.status as DocumentStatus] ?? "secondary"} className="text-xs">
                    {DOCUMENT_STATUS_LABELS[doc.status as DocumentStatus] ?? doc.status}
                  </Badge>
                  {doc.filePath && (
                    <a href={doc.filePath} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Unduh</a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* AUDIT TRAIL */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              {logs.length === 0 && <p className="text-center text-gray-400 py-4">Belum ada aktivitas</p>}
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 border-b border-gray-50 pb-3 last:border-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <Activity className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{log.actor?.name ?? "Sistem"}</span>{" "}
                      <span className="text-gray-500">{log.action}</span>{" "}
                      <span className="text-gray-500">{log.entity}</span>
                      {log.project && <span className="text-gray-500"> di <span className="font-medium text-gray-700">{log.project.name}</span></span>}
                    </p>
                    <p className="text-xs text-gray-400">{formatRelative(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
