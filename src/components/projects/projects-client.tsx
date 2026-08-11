"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, FolderKanban, Search, Filter, Loader2, LayoutGrid, List, AlertCircle, Clock, TrendingUp, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PROJECT_STATUS_LABELS, PROJECT_ROLE_LABELS } from "@/types";
import type { ProjectRole } from "@/types";
import { formatDate, parseErrorMessage } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { handleSessionExpired } from "@/lib/session-expired";

const schema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  description: z.string().optional(),
  client: z.string().min(1, "Nama klien wajib diisi"),
  location: z.string().optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const statusColors: Record<string, "default" | "success" | "warning" | "destructive" | "secondary" | "info"> = {
  PLANNING: "secondary",
  ACTIVE: "info",
  DELAYED: "warning",
  COMPLETED: "success",
  ARCHIVED: "secondary",
};

export function ProjectsClient({ userId, canLeadProject }: { userId: string; canLeadProject: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [view, setView] = useState<"card" | "list">("card");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Super Admin manages/oversees every project but doesn't lead one itself —
  // creating a project would make it that project's Team Leader.
  const canCreate = canLeadProject;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // /api/projects already attaches completenessPercent/deadlineStatus per
  // project (project.service.ts attachProjectSummary) — one fetch, same data,
  // same for every role, so card/list/progress all work identically for
  // Superadmin, Team Leader, Engineer, Inspector, and Client alike.
  async function loadProjects() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== "all") params.set("filter", roleFilter);
      const res = await fetch(`/api/projects?${params}`);
      if (res.status === 401) { handleSessionExpired(); return; }
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProjects(); }, [roleFilter]);

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast({ title: "Proyek berhasil dibuat", variant: "success" });
        setDialogOpen(false);
        reset();
        loadProjects();
      } else {
        toast({ title: "Gagal membuat proyek", description: await parseErrorMessage(res), variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = projects.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.client ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Same numbers the old separate "Overview Proyek" page showed, just derived
  // from the one list every role already has instead of a second, differently-
  // scoped endpoint.
  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === "ACTIVE").length,
    delayed: projects.filter((p) => p.status === "DELAYED").length,
    completed: projects.filter((p) => p.status === "COMPLETED").length,
    deadlineOverdue: projects.filter((p) => p.deadlineStatus === "overdue").length,
    // Already in the payload (phases -> documents.status, fetched for the
    // completeness calc) — no extra request needed for this count.
    pendingApproval: projects.reduce(
      (n: number, p: any) =>
        n + (p.phases?.reduce((m: number, ph: any) => m + (ph.documents?.filter((d: any) => d.status === "UNDER_REVIEW").length ?? 0), 0) ?? 0),
      0
    ),
  };

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Daftar Proyek LPS</h2>
          <p className="text-sm text-gray-500">{projects.length} proyek ditemukan</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadProjects} aria-label="Muat ulang">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canCreate && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Proyek Baru
            </Button>
          )}
        </div>
      </div>

      {/* Stats strip + deadline alert — same for every role now */}
      {projects.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "Total Proyek", value: stats.total, icon: FolderKanban, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Aktif", value: stats.active, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
              { label: "Terlambat / Delayed", value: stats.delayed, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
              { label: "Selesai", value: stats.completed, icon: CheckCircle2, color: "text-gray-600", bg: "bg-gray-50" },
              { label: "Menunggu Persetujuan", value: stats.pendingApproval, icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.bg}`}>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {stats.deadlineOverdue > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <p className="text-sm text-red-700">
                <span className="font-semibold">{stats.deadlineOverdue} proyek</span> melewati target deadline — perlu perhatian segera
              </p>
            </div>
          )}
        </>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cari proyek atau klien..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Filter peran" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Proyek</SelectItem>
            <SelectItem value="TEAM_LEADER">Proyek Saya (Team Leader)</SelectItem>
            <SelectItem value="ENGINEER">Proyek Saya (Engineer)</SelectItem>
            <SelectItem value="CLIENT">Proyek Saya (Client)</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => setView("card")}
            aria-pressed={view === "card"}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === "card" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Card
          </button>
          <button
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === "list" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
        </div>
      </div>

      {/* Project grid/list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16 text-center">
          <FolderKanban className="h-12 w-12 text-gray-300 mb-3" />
          <h3 className="text-sm font-medium text-gray-900">Belum ada proyek</h3>
          <p className="text-sm text-gray-500 mt-1">
            {canCreate ? "Buat proyek pertama Anda sekarang" : "Anda belum ditugaskan ke proyek apapun"}
          </p>
        </div>
      ) : view === "list" ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Proyek</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Kelengkapan Dokumen</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Target Selesai</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.client}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusColors[p.status] ?? "secondary"}>
                            {PROJECT_STATUS_LABELS[p.status as keyof typeof PROJECT_STATUS_LABELS]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {p.completenessPercent == null ? (
                            <span className="text-xs text-gray-400">Belum dimulai</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-28 rounded-full bg-gray-100">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${
                                    p.completenessPercent === 100 ? "bg-green-500" :
                                    p.completenessPercent > 50 ? "bg-blue-500" : "bg-amber-500"
                                  }`}
                                  style={{ width: `${p.completenessPercent}%` }}
                                />
                              </div>
                              <span className={`text-xs font-medium ${
                                p.completenessPercent === 100 ? "text-green-600" :
                                p.completenessPercent > 50 ? "text-blue-600" : "text-amber-600"
                              }`}>
                                {p.completenessPercent}%
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {p.deadlineStatus === "overdue" && <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                            {p.deadlineStatus === "approaching" && <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                            <span className={
                              p.deadlineStatus === "overdue" ? "text-red-600 font-medium text-xs" :
                              p.deadlineStatus === "approaching" ? "text-amber-600 font-medium text-xs" :
                              "text-gray-600 text-xs"
                            }>
                              {p.targetEndDate
                                ? new Date(p.targetEndDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
                                : "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-800 h-7 text-xs"
                            onClick={(e) => { e.stopPropagation(); router.push(`/projects/${p.id}`); }}>
                            Buka →
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const myRoles = p.userRoles?.filter((m: any) => m.userId === userId).map((m: any) => m.role) ?? [];
            const activePhaseCount = p.phases?.filter((ph: any) => ph.isActive && !ph.isSkipped).length ?? 0;
            const docCount = p.phases?.reduce((n: number, ph: any) => n + (ph.documents?.length ?? 0), 0) ?? 0;
            const memberCount = p.userRoles?.length ?? 0;
            const isOverdue = p.targetEndDate && new Date(p.targetEndDate) < new Date() && p.status !== "COMPLETED";
            return (
              <Card
                key={p.id}
                className="cursor-pointer hover:border-blue-200 hover:shadow-md transition-all"
                onClick={() => router.push(`/projects/${p.id}`)}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 leading-tight line-clamp-2">{p.name}</h3>
                    <Badge variant={statusColors[p.status] ?? "secondary"} className="shrink-0 text-xs">
                      {PROJECT_STATUS_LABELS[p.status as keyof typeof PROJECT_STATUS_LABELS]}
                    </Badge>
                  </div>
                  <div className="space-y-0.5">
                    {p.client && (
                      <p className="text-xs text-gray-600 truncate">
                        <span className="text-gray-400">Klien: </span>{p.client}
                      </p>
                    )}
                    {p.location && (
                      <p className="text-xs text-gray-400 truncate">{p.location}</p>
                    )}
                  </div>

                  {/* Key stats */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-gray-100">
                    <div className="text-center">
                      <p className="text-base font-bold text-gray-900">{activePhaseCount}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Fase Aktif</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-gray-900">{docCount}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Dokumen</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-gray-900">{memberCount}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Anggota</p>
                    </div>
                  </div>

                  {/* Progress */}
                  {p.completenessPercent != null && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                        <span>Kelengkapan Dokumen</span>
                        <span className={`font-semibold normal-case text-xs ${
                          p.completenessPercent === 100 ? "text-green-600" :
                          p.completenessPercent > 50 ? "text-blue-600" : "text-amber-600"
                        }`}>
                          {p.completenessPercent}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            p.completenessPercent === 100 ? "bg-green-500" :
                            p.completenessPercent > 50 ? "bg-blue-500" : "bg-amber-500"
                          }`}
                          style={{ width: `${p.completenessPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Dates */}
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    {p.startDate ? (
                      <span>Mulai {formatDate(p.startDate)}</span>
                    ) : <span />}
                    {p.targetEndDate && (
                      <span className={isOverdue ? "text-red-500 font-medium" : ""}>
                        {isOverdue ? "⚠ " : ""}Target {formatDate(p.targetEndDate)}
                      </span>
                    )}
                  </div>

                  {/* My role */}
                  {myRoles.length > 0 && (
                    <div className="flex gap-1 flex-wrap pt-0.5">
                      {myRoles.map((r: string) => (
                        <span key={r} className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                          {PROJECT_ROLE_LABELS[r as ProjectRole] ?? r}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create project dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buat Proyek Baru</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Proyek *</Label>
              <Input placeholder="Proteksi Petir Gedung A" {...register("name")} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Deskripsi</Label>
              <Textarea placeholder="Deskripsi singkat proyek..." rows={3} {...register("description")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nama Klien *</Label>
                <Input placeholder="PT. Contoh" {...register("client")} />
                {errors.client && <p className="text-xs text-red-500">{errors.client.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Lokasi</Label>
                <Input placeholder="Jakarta, Indonesia" {...register("location")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tanggal Mulai</Label>
                <Input type="date" {...register("startDate")} />
              </div>
              <div className="space-y-2">
                <Label>Target Selesai</Label>
                <Input type="date" {...register("targetEndDate")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Buat Proyek
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
