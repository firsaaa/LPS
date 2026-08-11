"use client";

import { useEffect, useState } from "react";
import {
  FileText, ExternalLink, RefreshCw, Building2,
  CheckCircle2, Clock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LPS_PHASES, PROJECT_STATUS_LABELS, DOCUMENT_STATUS_LABELS } from "@/types";
import type { DocumentStatus } from "@/types";
import { formatDate, formatRelative } from "@/lib/utils";

export function ClientPortalClient({ userId }: { userId: string }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectDetail, setProjectDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.ok ? r.json() : [])
      .then((ps) => {
        const list = Array.isArray(ps) ? ps : [];
        setProjects(list);
        if (list.length > 0) setSelectedProjectId(list[0].id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoading(true);
    fetch(`/api/projects/${selectedProjectId}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setProjectDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  // The API already filters documents server-side to what this viewer's role
  // is allowed to see (visibilityAllowlist in getProjectById) — no client-visible
  // check needed here, everything the payload contains is already permitted.
  const allDocs: Array<{ doc: any; phase: string; phaseLabel: string }> = [];
  for (const phase of projectDetail?.phases ?? []) {
    const phaseMeta = LPS_PHASES.find((p) => p.phase === phase.phase);
    for (const doc of phase.documents ?? []) {
      allDocs.push({ doc, phase: phase.phase, phaseLabel: phaseMeta?.label ?? phase.phase });
    }
  }

  const approvedDocs = allDocs.filter((d) => d.doc.status === "APPROVED");
  const pendingDocs = allDocs.filter((d) => d.doc.status !== "APPROVED");

  const progress = projectDetail?.phases ? (() => {
    const activePhases = (projectDetail.phases as any[]).filter((p) => p.isActive && !p.isSkipped);
    const complete = activePhases.filter((p: any) => p.completeness?.isComplete).length;
    return { complete, total: activePhases.length, percent: activePhases.length ? Math.round((complete / activePhases.length) * 100) : 0 };
  })() : { complete: 0, total: 0, percent: 0 };

  if (projects.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-24">
        <Building2 className="h-14 w-14 text-gray-200 mb-4" />
        <p className="text-base font-medium text-gray-500">Anda belum terdaftar sebagai client</p>
        <p className="text-sm text-gray-400 mt-1">Hubungi Team Leader proyek untuk mendapatkan akses.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Portal Client</h2>
          <p className="text-sm text-gray-500 mt-0.5">Dokumen proyek LPS yang dibagikan kepada Anda</p>
        </div>
        {projects.length > 1 && (
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Pilih proyek" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : projectDetail ? (
        <>
          {/* Project summary card */}
          <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-white">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{projectDetail.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Klien: <span className="font-medium text-gray-700">{projectDetail.client}</span>
                  </p>
                </div>
                <Badge variant={
                  projectDetail.status === "ACTIVE" ? "info" :
                  projectDetail.status === "COMPLETED" ? "success" :
                  projectDetail.status === "DELAYED" ? "warning" : "secondary"
                } className="text-xs">
                  {PROJECT_STATUS_LABELS[projectDetail.status as keyof typeof PROJECT_STATUS_LABELS]}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
                {projectDetail.startDate && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Mulai</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{formatDate(projectDetail.startDate)}</p>
                  </div>
                )}
                {projectDetail.targetEndDate && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Target Selesai</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{formatDate(projectDetail.targetEndDate)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Dokumen Tersedia</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{allDocs.length} dokumen</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Sudah Disetujui</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{approvedDocs.length} dokumen</p>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Progress keseluruhan</span>
                  <span className="font-medium">{progress.complete}/{progress.total} fase selesai</span>
                </div>
                <div className="h-2 w-full rounded-full bg-blue-100">
                  <div
                    className="h-2 rounded-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* No documents */}
          {allDocs.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-100 py-16">
              <Clock className="h-12 w-12 text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Belum ada dokumen yang dibagikan</p>
              <p className="text-xs text-gray-400 mt-1">
                Tim proyek belum menandai dokumen apapun sebagai &quot;Untuk Client&quot;.
              </p>
            </div>
          )}

          {/* Approved documents */}
          {approvedDocs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <h3 className="text-sm font-semibold text-gray-700">
                  Dokumen Tersedia ({approvedDocs.length})
                </h3>
              </div>
              <div className="space-y-2">
                {approvedDocs.map(({ doc, phaseLabel }) => {
                  const filePath = doc.versions?.[0]?.filePath ?? doc.filePath;
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-5 py-4 hover:border-blue-200 hover:shadow-sm transition-all"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50">
                        <FileText className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{doc.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                          <span>{phaseLabel}</span>
                          <span>·</span>
                          <span>v{doc.versions?.[0]?.versionNumber ?? 1}</span>
                          {doc.reviewedAt && (
                            <>
                              <span>·</span>
                              <span>Disetujui {formatRelative(doc.reviewedAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {filePath ? (
                          <a href={filePath} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="h-8 text-xs">
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              Buka
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400 px-2">File tidak tersedia</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending documents */}
          {pendingDocs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-gray-700">
                  Sedang Diproses ({pendingDocs.length})
                </h3>
              </div>
              <div className="space-y-2">
                {pendingDocs.map(({ doc, phaseLabel }) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-5 py-4 opacity-70"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                      <FileText className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-700 truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        <span>{phaseLabel}</span>
                        <span>·</span>
                        <span>{DOCUMENT_STATUS_LABELS[doc.status as DocumentStatus] ?? doc.status}</span>
                      </div>
                    </div>
                    <Badge variant="warning" className="text-xs shrink-0">Proses</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
