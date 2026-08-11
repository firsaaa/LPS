"use client";

import { useEffect, useState } from "react";
import { RefreshCw, FileText, CheckSquare, Clock, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { DocumentTitle } from "@/components/documents/document-title";
import { DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_VARIANT } from "@/types";
import type { DocumentStatus } from "@/types";

const PHASE_LABELS: Record<string, string> = {
  INISIASI: "Inisiasi", ASSESSMENT: "Assessment", DESIGN: "Desain",
  IMPLEMENTASI: "Implementasi", COMMISSIONING: "Commissioning", INSPEKSI_BERKALA: "Inspeksi Berkala",
};

function StatChip({ icon: Icon, count, label, tone }: { icon: any; count: number; label: string; tone: "blue" | "amber" | "red" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    red: "bg-red-50 text-red-700 ring-red-100",
  };
  return (
    <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 ring-1 ${tones[tone]}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <div className="leading-tight">
        <p className="text-lg font-bold tabular-nums">{count}</p>
        <p className="text-[11px] font-medium opacity-80">{label}</p>
      </div>
    </div>
  );
}

export function NotificationsClient() {
  const router = useRouter();
  const [data, setData] = useState<{ assignedDocs: any[]; openActionItems: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/me/tasks");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="flex justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }

  const assignedDocs = data?.assignedDocs ?? [];
  const actionItems = data?.openActionItems ?? [];
  const overdueCount = actionItems.filter((i: any) => i.deadline && new Date(i.deadline) < new Date()).length;
  const totalOpen = assignedDocs.length + actionItems.length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Notifikasi</h2>
          <p className="text-sm text-gray-500 mt-0.5">Dokumen yang perlu ditindaklanjuti dan tindak lanjut dari notulen rapat</p>
        </div>
        <Button variant="outline" size="icon" onClick={load} aria-label="Muat ulang">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {totalOpen === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 mb-3">
            <CheckCircle2 className="h-7 w-7 text-green-500" />
          </div>
          <p className="text-sm font-medium text-gray-700">Semua sudah beres</p>
          <p className="text-xs text-gray-400 mt-1">Tidak ada dokumen atau tindak lanjut yang menunggu Anda</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <StatChip icon={FileText} count={assignedDocs.length} label="Dokumen ditugaskan" tone="blue" />
          <StatChip icon={CheckSquare} count={actionItems.length} label="Tindak lanjut terbuka" tone="amber" />
          <StatChip icon={AlertTriangle} count={overdueCount} label="Terlambat" tone="red" />
        </div>
      )}

      {/* Dokumen di-assign ke saya */}
      {assignedDocs.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Dokumen yang Ditugaskan ke Saya
              <Badge variant="secondary" className="ml-auto">{assignedDocs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {assignedDocs.map((doc: any) => {
                const phase = doc.projectPhase?.phase;
                const project = doc.projectPhase?.project;
                return (
                  <div key={doc.id} className="flex items-start gap-3 border-l-2 border-l-blue-300 px-5 py-3.5 hover:bg-blue-50/40 transition-colors">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 mt-0.5">
                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        <DocumentTitle code={doc.documentCode} title={doc.title} />
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {project?.name} · {phase ? PHASE_LABELS[phase] ?? phase : "—"}
                        {doc.versions?.[0] && ` · v${doc.versions[0].versionNumber}`}
                      </p>
                      <p className="text-xs text-gray-400">Diunggah oleh {doc.uploadedBy?.name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={DOCUMENT_STATUS_VARIANT[doc.status as DocumentStatus] ?? "secondary"} className="text-xs">
                        {DOCUMENT_STATUS_LABELS[doc.status as DocumentStatus] ?? doc.status}
                      </Badge>
                      {project?.id && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600"
                          onClick={() => router.push(`/projects/${project.id}`)}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Buka
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action items dari notulen */}
      {actionItems.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-amber-600" />
              Tindak Lanjut dari Notulen Rapat
              <Badge variant="warning" className="ml-auto">{actionItems.length} terbuka</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {actionItems.map((item: any) => {
                const isOverdue = item.deadline && new Date(item.deadline) < new Date();
                const project = item.notulen?.project;
                return (
                  <div key={item.id} className={`flex items-start gap-3 border-l-2 px-5 py-3.5 transition-colors ${isOverdue ? "border-l-red-300 hover:bg-red-50/40" : "border-l-amber-300 hover:bg-amber-50/40"}`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5 ${isOverdue ? "bg-red-50" : "bg-amber-50"}`}>
                      {isOverdue ? <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> : <CheckSquare className="h-3.5 w-3.5 text-amber-600" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.description}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {project?.name} · {item.notulen?.title}
                      </p>
                      {item.linkedDocument && (
                        <p className="text-xs text-blue-600 mt-0.5">
                          Terkait: {item.linkedDocument.title}
                        </p>
                      )}
                      {(item.requiredDocumentType || item.requiredPhase) && (
                        <p className="text-xs text-amber-700 mt-0.5 font-medium">
                          Perlu upload{item.requiredDocumentType ? `: ${item.requiredDocumentType.name}` : ""}
                          {item.requiredPhase ? ` (${PHASE_LABELS[item.requiredPhase] ?? item.requiredPhase})` : ""}
                        </p>
                      )}
                      {item.deadline && (
                        <div className={`flex items-center gap-1 mt-1 text-xs ${isOverdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                          {isOverdue
                            ? <AlertTriangle className="h-3 w-3" />
                            : <Clock className="h-3 w-3" />
                          }
                          Tenggat: {formatDate(item.deadline)}
                          {isOverdue && " (terlambat)"}
                        </div>
                      )}
                    </div>
                    {project?.id && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600 shrink-0"
                        onClick={() => router.push(`/projects/${project.id}?tab=notulen`)}>
                        <ExternalLink className="h-3 w-3 mr-1" /> Buka
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
