"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText, CheckCircle2, AlertTriangle, Clock,
  RefreshCw, TrendingUp, AlertCircle, Info
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LPS_PHASES, PROJECT_STATUS_LABELS } from "@/types";
import { formatRelative, formatDate } from "@/lib/utils";

type Period = "today" | "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hari Ini",
  week: "7 Hari Terakhir",
  month: "30 Hari Terakhir",
  all: "Semua Waktu",
};

export function LaporanClient({ userId }: { userId: string }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.ok ? r.json() : [])
      .then((ps) => {
        const list = Array.isArray(ps) ? ps : [];
        setProjects(list);
        if (list.length > 0) {
          // Default to project with most active phases (proxy for most activity)
          const best = [...list].sort((a, b) => {
            const aActive = (a.phases ?? []).filter((p: any) => p.isActive).length;
            const bActive = (b.phases ?? []).filter((p: any) => p.isActive).length;
            return bActive - aActive;
          });
          setSelectedProjectId(best[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/laporan?projectId=${selectedProjectId}&period=${period}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, period]);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary;
  const byPhase: any[] = data?.byPhase ?? [];
  const insights: any[] = data?.insights ?? [];
  const uploaderBreakdown: any[] = data?.uploaderBreakdown ?? [];
  const recentActivity: any[] = data?.recentActivity ?? [];
  const cadence = data?.cadence;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Laporan & Insight</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Ringkasan aktivitas dokumen dan kelengkapan per fase
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {projects.length > 0 && (
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
          <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-r last:border-r-0 border-gray-200 ${
                  period === p
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : !data?.project ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-100 py-20">
          <FileText className="h-12 w-12 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">Tidak ada data proyek</p>
        </div>
      ) : (
        <>
          {/* Project info strip */}
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-5 py-3">
            <div>
              <p className="font-semibold text-gray-900">{data.project.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">Klien: {data.project.client}</p>
            </div>
            <Badge variant={
              data.project.status === "ACTIVE" ? "info" :
              data.project.status === "COMPLETED" ? "success" :
              data.project.status === "DELAYED" ? "warning" : "secondary"
            }>
              {PROJECT_STATUS_LABELS[data.project.status as keyof typeof PROJECT_STATUS_LABELS]}
            </Badge>
          </div>

          {/* Summary metrics */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="Total Dokumen"
                value={summary.totalDocuments}
                icon={<FileText className="h-4 w-4 text-blue-500" />}
                bg="bg-blue-50"
              />
              <MetricCard
                label="Disetujui"
                value={summary.approved}
                icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
                bg="bg-green-50"
                valueColor="text-green-700"
              />
              <MetricCard
                label="Menunggu Review"
                value={summary.pendingAction}
                icon={<Clock className="h-4 w-4 text-amber-500" />}
                bg="bg-amber-50"
                valueColor={summary.pendingAction > 0 ? "text-amber-700" : "text-gray-700"}
              />
              <MetricCard
                label="Perlu Revisi"
                value={summary.revisionRequired}
                icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
                bg="bg-red-50"
                valueColor={summary.revisionRequired > 0 ? "text-red-700" : "text-gray-700"}
              />
            </div>
          )}

          {/* Diupload periode ini */}
          {summary && period !== "all" && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-3 flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <span className="text-sm font-semibold text-blue-900">{summary.uploadedThisPeriod} dokumen</span>
                <span className="text-sm text-blue-700"> diupload {PERIOD_LABELS[period].toLowerCase()}</span>
                {uploaderBreakdown.length > 0 && (
                  <span className="text-sm text-blue-600">
                    {" "}— {uploaderBreakdown.map((u) => `${u.name} (${u.count})`).join(", ")}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Insight Otomatis</p>
              {insights.map((ins, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
                  ins.type === "warning"
                    ? "bg-amber-50 border-amber-200"
                    : ins.type === "success"
                    ? "bg-green-50 border-green-200"
                    : "bg-gray-50 border-gray-200"
                }`}>
                  {ins.type === "warning" ? (
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : ins.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm text-gray-700">{ins.message}</p>
                </div>
              ))}
            </div>
          )}


          {/* Phase breakdown */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">Kelengkapan per Fase</p>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              {byPhase.map((ph, i) => {
                const meta = LPS_PHASES.find((l) => l.phase === ph.phase);
                const isLast = i === byPhase.length - 1;
                return (
                  <div key={ph.phase} className={`px-5 py-4 bg-white ${!isLast ? "border-b border-gray-100" : ""}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${ph.isSkipped ? "text-gray-400 line-through" : "text-gray-800"}`}>{meta?.label ?? ph.phase}</span>
                        {ph.isSkipped ? (
                          <span className="text-xs text-gray-500 bg-gray-200 rounded px-1.5 py-0.5">Tidak Dikerjakan</span>
                        ) : !ph.isActive && (
                          <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Nonaktif</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{ph.total} dokumen</span>
                        {ph.isSkipped ? (
                          <span className="text-gray-400 italic">tidak dalam scope</span>
                        ) : !ph.isActive && ph.total === 0 ? (
                          <span className="text-gray-400">belum dimulai</span>
                        ) : ph.requiredCount > 0 ? (
                          <span className={`font-medium ${ph.percent === 100 ? "text-green-600" : ph.percent > 50 ? "text-blue-600" : "text-amber-600"}`}>
                            {ph.fulfilledCount}/{ph.requiredCount} wajib ({ph.percent}%)
                          </span>
                        ) : (
                          <span className="text-gray-400">tidak ada dokumen wajib</span>
                        )}
                        {ph.pending > 0 && (
                          <span className="text-amber-600">{ph.pending} pending</span>
                        )}
                      </div>
                    </div>
                    {!ph.isSkipped && ph.isActive && ph.requiredCount > 0 && (
                      <div className="h-1.5 w-full rounded-full bg-gray-100">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            ph.percent === 100 ? "bg-green-500" :
                            ph.percent > 50 ? "bg-blue-500" : "bg-amber-500"
                          }`}
                          style={{ width: `${ph.percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kontribusi uploader */}
          {uploaderBreakdown.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">
                Kontribusi Anggota Tim ({PERIOD_LABELS[period]})
              </p>
              <Card>
                <CardContent className="p-4 space-y-3">
                  {uploaderBreakdown.map((u) => {
                    const max = uploaderBreakdown[0].count;
                    return (
                      <div key={u.name} className="flex items-center gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                          {u.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-700 truncate">{u.name}</span>
                            <span className="text-xs font-semibold text-gray-600 ml-2">{u.count}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-gray-100">
                            <div
                              className="h-1.5 rounded-full bg-blue-400 transition-all"
                              style={{ width: `${Math.round((u.count / max) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Recent activity */}
          {recentActivity.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">
                Riwayat Aktivitas ({PERIOD_LABELS[period]})
              </p>
              <Card>
                <CardContent className="p-4 divide-y divide-gray-50">
                  {recentActivity.map((a: any) => (
                    <div key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 mt-0.5">
                        <span className="text-[10px] font-bold text-blue-600">
                          {a.actor?.name?.charAt(0) ?? "?"}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">{a.actor?.name ?? "Sistem"}</span>{" "}
                          <span className="text-gray-500">{actionLabel(a.action)}</span>{" "}
                          <span className="text-gray-500">{entityLabel(a.entity)}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatRelative(a.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MetricCard({ label, value, icon, bg, valueColor = "text-gray-900" }: {
  label: string; value: number; icon: React.ReactNode; bg: string; valueColor?: string;
}) {
  return (
    <Card className="border-gray-100">
      <CardContent className="p-4">
        <div className={`inline-flex items-center justify-center rounded-lg p-2 mb-3 ${bg}`}>
          {icon}
        </div>
        <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    CREATE: "menambahkan",
    EDIT: "mengubah",
    DELETE: "menghapus",
    SUBMIT: "mengirim",
    REVIEW: "mereview",
    APPROVE: "menyetujui",
    REVISE: "meminta revisi",
    PHASE_CHANGE: "mengubah status fase",
  };
  return map[action] ?? action.toLowerCase();
}

function entityLabel(entity: string) {
  const map: Record<string, string> = {
    document: "dokumen",
    project: "proyek",
    project_phase: "fase proyek",
    user: "user",
  };
  return map[entity] ?? entity;
}
