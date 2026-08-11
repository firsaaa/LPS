"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FolderKanban, FileText, RefreshCw, AlertCircle,
  CheckCircle2, ShieldCheck, RotateCcw, CalendarClock,
  ListTodo, ArrowRight, Clock, ChevronRight, ClipboardList
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECT_STATUS_LABELS, LPS_PHASES } from "@/types";
import { formatDate } from "@/lib/utils";
import { handleSessionExpired } from "@/lib/session-expired";
import { DocumentTitle } from "@/components/documents/document-title";

export function DashboardClient({ userId, canLeadProject }: { userId: string; canLeadProject: boolean }) {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects").then(async (r) => {
      if (r.status === 401) { handleSessionExpired(); return []; }
      return r.ok ? r.json() : [];
    }).then((ps) => {
      const list = Array.isArray(ps) ? ps : [];
      setProjects(list);
      if (list.length > 0) {
        const best = [...list].sort((a, b) => {
          const aActive = (a.phases ?? []).filter((p: any) => p.isActive).length;
          const bActive = (b.phases ?? []).filter((p: any) => p.isActive).length;
          return bActive - aActive;
        });
        setSelectedProjectId(best[0].id);
      } else {
        // No projects — load() never fires (it's gated on selectedProjectId),
        // so the initial loading=true would otherwise spin forever.
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  const load = useCallback(async (projectId: string) => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?projectId=${projectId}`);
      if (res.status === 401) { handleSessionExpired(); return; }
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedProjectId) load(selectedProjectId); }, [selectedProjectId, load]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-20">
        <FolderKanban className="h-12 w-12 text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">Anda belum tergabung dalam proyek apapun</p>
      </div>
    );
  }

  const project = data?.project;
  const pendingReview: any[] = data?.pendingReview ?? [];
  const needsRevision: any[] = data?.needsRevision ?? [];
  const actionItems: any[] = data?.actionItems ?? [];
  const missingDocs: any[] = data?.missingDocs ?? [];
  const cadence = data?.cadence;
  const warnings: any[] = data?.warnings ?? [];

  const totalActions = pendingReview.length + needsRevision.length + actionItems.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Proyek</h2>
          <p className="text-sm text-gray-500">Yang perlu ditindaklanjuti hari ini</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Pilih proyek" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => load(selectedProjectId)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Project strip */}
      {project && (
        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-5 py-3">
          <div>
            <p className="font-semibold text-gray-900">{project.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">Klien: {project.client}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={
              project.status === "ACTIVE" ? "info" :
              project.status === "COMPLETED" ? "success" :
              project.status === "DELAYED" ? "warning" : "secondary"
            }>
              {PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS]}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => router.push(`/projects/${project.id}`)}>
              Buka Proyek <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Deadline warnings */}
      {warnings.map((w, i) => (
        <div key={i} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
          w.type === "DEADLINE_OVERDUE" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
        }`}>
          <AlertCircle className={`h-4 w-4 shrink-0 ${w.type === "DEADLINE_OVERDUE" ? "text-red-600" : "text-amber-600"}`} />
          <p className="text-sm text-gray-700">{w.message}</p>
        </div>
      ))}

      {/* Cadence strip */}
      {cadence && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Laporan harian */}
          {(() => {
            const days = cadence.daysSinceImplementasiUpload;
            const active = cadence.implementasiIsActive;
            const color = !active ? "border-gray-100 bg-gray-50" :
              days === null ? "border-amber-200 bg-amber-50" :
              days === 0 ? "border-green-200 bg-green-50" :
              days <= 2 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
            const text = !active ? "Fase Implementasi belum aktif" :
              days === null ? "Belum ada laporan harian diupload" :
              days === 0 ? "Laporan harian sudah diupload hari ini ✓" :
              `Laporan harian terakhir ${days} hari lalu`;
            const icon = !active || days === 0 ? "text-green-600" : days !== null && days <= 2 ? "text-amber-600" : "text-red-600";
            return (
              <div className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
                <CalendarClock className={`h-5 w-5 shrink-0 ${icon}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">Laporan Harian</p>
                  <p className={`text-xs mt-0.5 ${icon}`}>{text}</p>
                </div>
                <Link href="/laporan" className="text-xs text-blue-600 hover:underline shrink-0 flex items-center gap-0.5">
                  Detail <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            );
          })()}

          {/* Notulen */}
          {(() => {
            const days = cadence.daysSinceNotulen;
            const open = cadence.openActionItemCount ?? 0;
            const color = days === null ? "border-gray-100 bg-gray-50" :
              days <= 7 ? "border-green-200 bg-green-50" :
              days <= 14 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
            const icon = days === null || days > 14 ? "text-red-500" : days <= 7 ? "text-green-600" : "text-amber-600";
            const text = days === null ? "Belum ada notulen rapat" :
              days === 0 ? "Notulen dicatat hari ini ✓" : `Notulen terakhir ${days} hari lalu`;
            return (
              <div className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
                <ListTodo className={`h-5 w-5 shrink-0 ${icon}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">Notulen Rapat</p>
                  <p className={`text-xs mt-0.5 ${icon}`}>{text}</p>
                  {open > 0 && <p className="text-xs text-amber-700 mt-0.5">{open} action item belum selesai</p>}
                </div>
                {project && (
                  <Link href={`/projects/${project.id}?tab=notulen`} className="text-xs text-blue-600 hover:underline shrink-0 flex items-center gap-0.5">
                    Detail <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Empty state when nothing needs action */}
      {!loading && project && totalActions === 0 && missingDocs.length === 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-6 flex items-center gap-4">
          <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
          <div>
            <p className="font-semibold text-green-800">Semua beres!</p>
            <p className="text-sm text-green-700 mt-0.5">Tidak ada dokumen pending, revisi, atau action item terbuka saat ini.</p>
          </div>
        </div>
      )}

      {/* Pending review */}
      {pendingReview.length > 0 && (
        <ActionSection
          title="Menunggu Review"
          count={pendingReview.length}
          icon={<ShieldCheck className="h-4 w-4 text-purple-600" />}
          color="purple"
        >
          {pendingReview.map((doc: any) => {
            const phaseMeta = LPS_PHASES.find((p) => p.phase === doc.projectPhase?.phase);
            return (
              <DocActionRow
                key={doc.id}
                title={doc.title}
                code={doc.documentCode}
                subtitle={`${phaseMeta?.label ?? doc.projectPhase?.phase} · Diupload oleh ${doc.uploadedBy?.name}`}
                badge={{ label: "Sedang Direview", variant: "info" }}
                action={
                  <Button size="sm" variant="outline" className="h-7 text-xs text-purple-700 border-purple-300 shrink-0"
                    onClick={() => router.push(`/projects/${project.id}`)}>
                    Review →
                  </Button>
                }
              />
            );
          })}
        </ActionSection>
      )}

      {/* Needs revision upload */}
      {needsRevision.length > 0 && (
        <ActionSection
          title="Perlu Upload Revisi"
          count={needsRevision.length}
          icon={<RotateCcw className="h-4 w-4 text-amber-600" />}
          color="amber"
        >
          {needsRevision.map((doc: any) => {
            const phaseMeta = LPS_PHASES.find((p) => p.phase === doc.projectPhase?.phase);
            return (
              <DocActionRow
                key={doc.id}
                title={doc.title}
                code={doc.documentCode}
                subtitle={`${phaseMeta?.label ?? doc.projectPhase?.phase} · Direview oleh ${doc.reviewedBy?.name ?? "—"}`}
                badge={{ label: "Perlu Revisi", variant: "warning" }}
                action={
                  <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700 border-amber-300 shrink-0"
                    onClick={() => router.push(`/projects/${project.id}`)}>
                    Upload Revisi →
                  </Button>
                }
              />
            );
          })}
        </ActionSection>
      )}

      {/* Open action items */}
      {actionItems.length > 0 && (
        <ActionSection
          title="Action Item Notulen"
          count={actionItems.length}
          icon={<ClipboardList className="h-4 w-4 text-blue-600" />}
          color="blue"
        >
          {actionItems.map((item: any) => {
            const overdue = item.deadline && new Date(item.deadline) < new Date();
            return (
              <DocActionRow
                key={item.id}
                title={item.description}
                subtitle={`${item.notulen?.title} · ${item.assignedTo?.name ?? "Belum ditugaskan"}`}
                badge={
                  item.deadline
                    ? { label: overdue ? `Terlambat ${formatDate(item.deadline)}` : `Deadline ${formatDate(item.deadline)}`, variant: overdue ? "destructive" : "secondary" }
                    : undefined
                }
                action={
                  <Link href={`/projects/${project.id}?tab=notulen`}
                    className="shrink-0 text-xs text-blue-600 hover:underline">
                    Lihat →
                  </Link>
                }
              />
            );
          })}
        </ActionSection>
      )}

      {/* Missing required docs */}
      {missingDocs.length > 0 && (
        <ActionSection
          title="Dokumen Wajib Belum Lengkap"
          count={missingDocs.length}
          icon={<FileText className="h-4 w-4 text-gray-500" />}
          color="gray"
        >
          {missingDocs.map((d: any, i: number) => {
            const phaseMeta = LPS_PHASES.find((p) => p.phase === d.phase);
            return (
              <DocActionRow
                key={i}
                title={d.label}
                subtitle={phaseMeta?.label ?? d.phase}
                action={
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600 shrink-0"
                    onClick={() => router.push(`/projects/${project.id}`)}>
                    Upload →
                  </Button>
                }
              />
            );
          })}
        </ActionSection>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ActionSection({ title, count, icon, color, children }: {
  title: string; count: number; icon: React.ReactNode; color: string; children: React.ReactNode;
}) {
  const border: Record<string, string> = {
    purple: "border-purple-100", amber: "border-amber-100",
    blue: "border-blue-100", red: "border-red-100", gray: "border-gray-100",
  };
  return (
    <Card className={border[color] ?? "border-gray-100"}>
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-sm font-semibold text-gray-800">{title}</CardTitle>
          <span className="ml-auto text-xs font-medium text-gray-400">{count} item</span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-2">{children}</CardContent>
    </Card>
  );
}

function DocActionRow({ title, code, subtitle, badge, action }: {
  title: string; code?: string | null; subtitle: string; badge?: { label: string; variant: any }; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate"><DocumentTitle code={code} title={title} /></p>
        <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>}
        {action}
      </div>
    </div>
  );
}
