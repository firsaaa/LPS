"use client";

import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Info, Users, FileText, Activity,
  Loader2, Plus, Upload, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, ExternalLink,
  Send, ShieldCheck, RotateCcw, ClipboardList, Calendar,
  CheckSquare, Square, X, UserPlus, Pencil
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_STATUS_LABELS, LPS_PHASES, PROJECT_ROLE_LABELS, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_VARIANT, ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_SIZE_BYTES } from "@/types";
import type { DocumentStatus, ProjectRole } from "@/types";
import { formatDate, formatRelative, formatBytes, parseErrorMessage } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { TagInput } from "@/components/documents/tag-input";
import { DocumentTitle } from "@/components/documents/document-title";
import { handleSessionExpired } from "@/lib/session-expired";

export function ProjectWorkspace({
  projectId, userId, isSuperadmin, isGlobalInspector, canLeadProject,
}: {
  projectId: string;
  userId: string;
  isSuperadmin: boolean;
  isGlobalInspector: boolean;
  canLeadProject: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<string | null>(null);
  const [addMemberDialog, setAddMemberDialog] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [versionDialog, setVersionDialog] = useState<{ docId: string; title: string } | null>(null);
  const [reviewDialog, setReviewDialog] = useState<{ docId: string; title: string; action: string } | null>(null);
  const [assignDialog, setAssignDialog] = useState<{ phase: string } | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<any[]>([]);
  const defaultTab = searchParams.get("tab") ?? "phases";

  const isAdmin = isSuperadmin;
  const isReadOnly = isAdmin; // superadmin can view but not operate
  const myMember = project?.userRoles?.find((m: any) => m.userId === userId);
  const myRole: ProjectRole | null = myMember?.role ?? null;
  const isLeader = myRole === "TEAM_LEADER";
  const isEngineer = myRole === "ENGINEER";
  const isInspector = isGlobalInspector;
  const isClient = myRole === "CLIENT";
  const canUpload = !isReadOnly && (isEngineer || isLeader);
  // Approval sits with the project's own Team Leader — Inspector's job is
  // cross-project compliance oversight (see /inspector), not sign-off on any
  // one project's documents.
  const canReview = !isReadOnly && isLeader;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.status === 401) { handleSessionExpired(); return; }
      if (!res.ok) { router.push("/projects"); return; }
      setProject(await res.json());
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Powers the "N penugasan menunggu" placeholder on each phase card — without
  // this, assigning a document (SC-07) shows a toast that vanishes and then
  // leaves no visible trace anywhere in this tab, which reads as "did that
  // actually work?" even though it did.
  const loadPendingAssignments = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/notulen`);
    if (!res.ok) return;
    const notulenList = await res.json();
    const openWithRequirement = notulenList.flatMap((n: any) =>
      (n.actionItems ?? [])
        .filter((a: any) => a.status === "OPEN" && a.requiredPhase)
        .map((a: any) => ({ ...a, notulenTitle: n.title }))
    );
    setPendingAssignments(openWithRequirement);
  }, [projectId]);

  useEffect(() => { loadPendingAssignments(); }, [loadPendingAssignments]);

  async function loadUsers() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
  }

  async function updateProjectStatus(status: string) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { load(); toast({ title: "Status proyek diperbarui", variant: "success" }); }
  }

  async function updateVisibilityDefault(field: "inspectorSeesAllDocuments" | "clientSeesAllDocuments", value: boolean) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      load();
      toast({ title: "Pengaturan visibilitas diperbarui", variant: "success" });
    } else {
      toast({ title: "Gagal memperbarui pengaturan visibilitas", description: await parseErrorMessage(res), variant: "destructive" });
    }
  }

  async function togglePhase(phase: string, isActive: boolean) {
    const res = await fetch(`/api/projects/${projectId}/phases`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, isActive }),
    });
    if (res.ok) {
      load();
      toast({ title: isActive ? `Fase ${phase} diaktifkan` : `Fase ${phase} dinonaktifkan`, variant: "success" });
    }
  }

  async function skipPhase(phase: string, isSkipped: boolean) {
    const res = await fetch(`/api/projects/${projectId}/phases`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, isSkipped }),
    });
    if (res.ok) {
      load();
      toast({ title: isSkipped ? "Fase ditandai tidak dikerjakan" : "Fase diaktifkan kembali", variant: "success" });
    }
  }

  async function removeMember(memberId: string) {
    await fetch(`/api/projects/${projectId}/members`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    load();
    toast({ title: "Anggota dihapus dari proyek", variant: "success" });
  }

  async function deleteThisProject() {
    const confirmed = window.confirm(
      `Hapus proyek "${project?.name}" secara permanen? Tindakan ini tidak dapat dibatalkan. Akan ditolak otomatis kalau proyek ini sudah punya dokumen berstatus selain Draft.`
    );
    if (!confirmed) return;
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Proyek dihapus", variant: "success" });
      router.push("/projects");
    } else {
      toast({ title: "Gagal menghapus proyek", description: await parseErrorMessage(res), variant: "destructive" });
    }
  }

  async function doDocAction(docId: string, action: string, notes?: string) {
    const res = await fetch(`/api/documents/${docId}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, notes }),
    });
    if (res.ok) {
      load();
      toast({ title: "Status dokumen diperbarui", variant: "success" });
    } else {
      toast({ title: "Gagal", description: await parseErrorMessage(res), variant: "destructive" });
    }
    setReviewDialog(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }
  if (!project) return null;

  const activeNonSkipped = (project.phases ?? []).filter((p: any) => p.isActive && !p.isSkipped);
  const activePhases = activeNonSkipped.length;
  // Only count phases that actually have required docs (required > 0) to avoid 0/0 = complete
  const phasesWithRequirements = activeNonSkipped.filter((p: any) => (p.completeness?.required ?? 0) > 0);
  const completedPhases = phasesWithRequirements.filter((p: any) => p.completeness?.isComplete).length;
  const docCount = project.phases?.reduce((n: number, p: any) => n + (p.documents?.length ?? 0), 0) ?? 0;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900 truncate">{project.name}</h2>
          {project.client && <p className="text-sm text-gray-500">Klien: {project.client}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {myRole && (
            <Badge variant="info" className="text-xs">
              {PROJECT_ROLE_LABELS[myRole]}
            </Badge>
          )}
          {isGlobalInspector && <Badge variant="purple" className="text-xs">Inspector</Badge>}
          {isAdmin && <Badge variant="destructive" className="text-xs">Super Admin — View Only</Badge>}
          <Badge variant={
            project.status === "ACTIVE" ? "info" :
            project.status === "COMPLETED" ? "success" :
            project.status === "DELAYED" ? "warning" : "secondary"
          }>
            {PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS]}
          </Badge>
          {isLeader && !isReadOnly && (
            <div className="flex flex-col items-end">
              <Select value={project.status} onValueChange={updateProjectStatus}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[10px] text-gray-400 mt-0.5">Ubah status proyek</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Kelengkapan Dokumen Wajib</span>
          <span className="text-sm font-semibold text-blue-600">
            {phasesWithRequirements.length === 0
              ? "Belum ada fase aktif"
              : `${completedPhases}/${phasesWithRequirements.length} fase aktif lengkap`}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: phasesWithRequirements.length === 0 ? "0%" : `${Math.round((completedPhases / phasesWithRequirements.length) * 100)}%` }}
          />
        </div>
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span>{docCount} dokumen total</span>
          <span>·</span>
          <span>{activePhases} fase aktif</span>
          {project.startDate && <><span>·</span><span>Mulai {formatDate(project.startDate)}</span></>}
        </div>
      </div>


      {/* Main tabs */}
      <Tabs defaultValue={defaultTab}>
        <TabsList className="w-full justify-start flex-wrap">
          <TabsTrigger value="phases"><FileText className="mr-1.5 h-3.5 w-3.5" />Fase & Dokumen</TabsTrigger>
          <TabsTrigger value="notulen"><ClipboardList className="mr-1.5 h-3.5 w-3.5" />Notulen Rapat</TabsTrigger>
          <TabsTrigger value="info"><Info className="mr-1.5 h-3.5 w-3.5" />Info Proyek</TabsTrigger>
          <TabsTrigger value="team"><Users className="mr-1.5 h-3.5 w-3.5" />Tim ({project.userRoles?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="mr-1.5 h-3.5 w-3.5" />Riwayat</TabsTrigger>
        </TabsList>

        {/* PHASES TAB */}
        <TabsContent value="phases" className="space-y-3 mt-4">
          {[...(project.phases ?? [])].sort((a: any, b: any) => {
            const order = ["INISIASI","ASSESSMENT","DESIGN","IMPLEMENTASI","COMMISSIONING","INSPEKSI_BERKALA"];
            return order.indexOf(a.phase) - order.indexOf(b.phase);
          }).map((phase: any) => (
            <PhaseSection
              key={phase.phase}
              phase={phase}
              canUpload={canUpload}
              canReview={canReview}
              isLeader={isLeader}
              userId={userId}
              onUpload={() => { setUploadPhase(phase.phase); setUploadDialog(true); }}
              onNewVersion={(docId: string, title: string) => setVersionDialog({ docId, title })}
              onDocAction={(docId: string, title: string, action: string) => {
                if (action === "submit" || action === "archive") {
                  doDocAction(docId, action);
                } else {
                  setReviewDialog({ docId, title, action });
                }
              }}
              onTogglePhase={(isActive: boolean) => togglePhase(phase.phase, isActive)}
              onSkipPhase={(isSkipped: boolean) => skipPhase(phase.phase, isSkipped)}
              onAssign={isLeader ? () => setAssignDialog({ phase: phase.phase }) : undefined}
              pendingAssignments={pendingAssignments.filter((a: any) => a.requiredPhase === phase.phase)}
            />
          ))}
        </TabsContent>

        {/* NOTULEN TAB */}
        <TabsContent value="notulen" className="mt-4">
          <NotulenTab
            projectId={projectId}
            canCreate={!isReadOnly && (isLeader || isEngineer || isInspector)}
            teamMembers={project.userRoles ?? []}
            projectDocuments={
              (project.phases ?? []).flatMap((ph: any) =>
                (ph.documents ?? []).map((d: any) => ({ ...d, phaseName: ph.phase }))
              )
            }
          />
        </TabsContent>

        {/* MILESTONES TAB — hidden from UI for now (feature dropped from
            scope), component/API/service left intact in case it comes back. */}

        {/* INFO TAB */}
        <TabsContent value="info" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField label="Nama Proyek" value={project.name} />
              <InfoField label="Klien" value={project.client} />
              <InfoField label="Lokasi" value={project.location} />
              <InfoField label="Status" value={PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS]} />
              <InfoField label="Tanggal Mulai" value={project.startDate ? formatDate(project.startDate) : undefined} />
              <InfoField label="Target Selesai" value={project.targetEndDate ? formatDate(project.targetEndDate) : undefined} />
              <InfoField label="Dibuat oleh" value={project.createdBy?.name} />
              <InfoField label="Deskripsi" value={project.description} span={2} />
            </CardContent>
          </Card>

          <DocumentStatusRollup phases={project.phases} />

          {isLeader && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Visibilitas Dokumen</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <p className="text-xs text-gray-500">
                  Saklar di bawah berlaku untuk SEMUA dokumen di proyek ini sekaligus. Matikan kalau mau atur akses per dokumen satu per satu (lewat tombol visibilitas di halaman masing-masing dokumen).
                </p>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Perlihatkan semua dokumen ke Inspector</p>
                    <p className="text-xs text-gray-500">Default: menyala. Inspector langsung bisa lihat seluruh dokumen proyek ini tanpa diatur satu-satu.</p>
                  </div>
                  <Switch
                    checked={project.inspectorSeesAllDocuments}
                    onCheckedChange={(v: boolean) => updateVisibilityDefault("inspectorSeesAllDocuments", v)}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Perlihatkan semua dokumen ke Client</p>
                    <p className="text-xs text-gray-500">Default: mati. Kalau mati, Client tidak lihat dokumen apa pun sampai diberi akses satu-satu.</p>
                  </div>
                  <Switch
                    checked={project.clientSeesAllDocuments}
                    onCheckedChange={(v: boolean) => updateVisibilityDefault("clientSeesAllDocuments", v)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {isLeader && (
            <Card className="border-red-100">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-red-700">Hapus Proyek</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <p className="text-xs text-gray-500">
                  Hanya bisa dihapus kalau proyek ini belum punya dokumen berstatus selain Draft (dan tidak ada yang ditandai wajib-simpan). Kalau sudah ada riwayat, arsipkan proyeknya lewat menu Status di atas alih-alih menghapus.
                </p>
                <Button
                  variant="outline" size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={deleteThisProject}
                >
                  Hapus Proyek
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TEAM TAB */}
        <TabsContent value="team" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Anggota Tim</CardTitle>
              {isLeader && (
                <Button size="sm" onClick={() => { setAddMemberDialog(true); loadUsers(); }}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Tambah Anggota
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {project.userRoles?.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Belum ada anggota</p>}
              {project.userRoles?.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                      {m.user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.user.name}</p>
                      <p className="text-xs text-gray-500">{m.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="info" className="text-xs">
                      {PROJECT_ROLE_LABELS[m.role as keyof typeof PROJECT_ROLE_LABELS] ?? m.role}
                    </Badge>
                    {isLeader && m.userId !== userId && (
                      <Button
                        variant="ghost" size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeMember(m.id)}
                      >
                        Hapus
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTIVITY TAB */}
        <TabsContent value="activity" className="mt-4">
          <ActivityLog projectId={projectId} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {uploadDialog && (
        <UploadDocumentDialog
          projectId={projectId}
          initialPhase={uploadPhase}
          phases={(project.phases ?? []).filter((p: any) => !p.isSkipped)}
          onClose={() => setUploadDialog(false)}
          onSuccess={() => { setUploadDialog(false); load(); }}
        />
      )}
      {addMemberDialog && (
        <AddMemberDialog
          projectId={projectId}
          users={users}
          isSuperadmin={isSuperadmin}
          onClose={() => setAddMemberDialog(false)}
          onSuccess={() => { setAddMemberDialog(false); load(); }}
        />
      )}
      {versionDialog && (
        <NewVersionDialog
          docId={versionDialog.docId}
          docTitle={versionDialog.title}
          onClose={() => setVersionDialog(null)}
          onSuccess={() => { setVersionDialog(null); load(); }}
        />
      )}
      {reviewDialog && (
        <ReviewDialog
          docId={reviewDialog.docId}
          docTitle={reviewDialog.title}
          initialAction={reviewDialog.action}
          onClose={() => setReviewDialog(null)}
          onAction={doDocAction}
        />
      )}
      {assignDialog && (
        <AssignDocumentDialog
          projectId={projectId}
          initialPhase={assignDialog.phase}
          engineers={(project.userRoles ?? []).filter((m: any) => m.role === "ENGINEER" || m.role === "TEAM_LEADER")}
          onClose={() => setAssignDialog(null)}
          onSuccess={() => { setAssignDialog(null); load(); loadPendingAssignments(); toast({ title: "Dokumen berhasil ditugaskan", variant: "success" }); }}
        />
      )}
    </div>
  );
}

// ─── PhaseSection ─────────────────────────────────────────────────────────────

function PhaseSection({ phase, canUpload, canReview, isLeader, userId, onUpload, onNewVersion, onDocAction, onTogglePhase, onSkipPhase, onAssign, pendingAssignments }: any) {
  const docs: any[] = phase.documents ?? [];
  const requiredDocs: any[] = phase.requiredDocs ?? [];
  const [expanded, setExpanded] = useState(phase.isActive || docs.length > 0);

  // documentTypeId (13-type master) — not the legacy documentType enum, which
  // collapses several distinct required types (e.g. DES/RSF/GRD) into "FILE_UPLOAD".
  const approvedTypes = new Set(docs.filter((d: any) => d.status === "APPROVED").map((d: any) => d.documentTypeId));
  const missingDocs = requiredDocs.filter((r: any) => !approvedTypes.has(r.documentTypeId));
  const isComplete = requiredDocs.length > 0 && missingDocs.length === 0;
  const isSkipped = phase.isSkipped === true;

  const phaseMeta = LPS_PHASES.find((p) => p.phase === phase.phase);

  return (
    <Card className={
      isSkipped ? "opacity-50 border-gray-100 bg-gray-50" :
      !phase.isActive ? "opacity-60 border-gray-100" :
      isComplete ? "border-green-200" :
      docs.length > 0 ? "border-blue-200" : ""
    }>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2 text-left flex-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold ${isSkipped ? "text-gray-400 line-through" : "text-gray-900"}`}>{phaseMeta?.label ?? phase.phase}</span>
              {isSkipped && (
                <span className="text-xs text-gray-500 bg-gray-200 rounded px-1.5 py-0.5">Tidak Dikerjakan</span>
              )}
              {!isSkipped && !phase.isActive && (
                <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Tidak aktif</span>
              )}
              <span className="text-xs text-gray-400">· {docs.length} dokumen</span>
              {!isSkipped && requiredDocs.length > 0 && (
                <span className="text-xs text-gray-400">
                  · {requiredDocs.length - missingDocs.length}/{requiredDocs.length} dokumen wajib
                </span>
              )}
              {pendingAssignments?.length > 0 && (
                <span className="text-xs text-amber-600 font-medium">
                  · {pendingAssignments.length} penugasan menunggu
                </span>
              )}
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {!isSkipped && isComplete && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {!isSkipped && !isComplete && missingDocs.length > 0 && phase.isActive && <AlertTriangle className="h-4 w-4 text-amber-500" />}
            {isLeader && isSkipped && (
              <Button size="sm" variant="ghost" onClick={() => onSkipPhase(false)} className="h-7 text-xs text-gray-500">
                Aktifkan Kembali
              </Button>
            )}
            {onAssign && !isSkipped && (
              <Button size="sm" variant="outline" onClick={onAssign} className="h-7 text-xs">
                <UserPlus className="mr-1 h-3 w-3" /> Tugaskan
              </Button>
            )}
            {/* An Engineer can't activate a phase (only a Team Leader's upload
                does that implicitly) — hide the button rather than let them
                click it and hit a "fase belum aktif" error after the fact. */}
            {!isSkipped && canUpload && (phase.isActive || isLeader) && (
              <Button size="sm" variant="outline" onClick={onUpload} className="h-7 text-xs">
                <Upload className="mr-1 h-3 w-3" /> Upload
              </Button>
            )}
          </div>
        </div>

        {/* Leader control — always-visible switch, not a conditionally-appearing button */}
        {isLeader && !isSkipped && (
          <div className="mt-2 flex items-center gap-4 border-t border-gray-100 pt-2 pl-6">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <Switch checked={phase.isActive} onCheckedChange={(v: boolean) => onTogglePhase(v)} />
              Fase Aktif
            </label>
            {!phase.isActive && docs.length === 0 && (
              <button
                onClick={() => onSkipPhase(true)}
                className="ml-auto text-xs text-gray-400 hover:text-red-500 hover:underline"
              >
                Lewati fase ini
              </button>
            )}
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Pending "Tugaskan" assignments — persistent proof the assignment really happened, not just a toast that disappears */}
          {pendingAssignments?.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Menunggu Diupload</p>
              {pendingAssignments.map((a: any) => (
                <div key={a.id} className="flex items-center gap-1.5 text-xs text-amber-800">
                  <UserPlus className="h-3 w-3 shrink-0" />
                  <span>
                    <b>{a.assignedTo?.name ?? "Belum ditugaskan"}</b> diminta upload{a.requiredDocumentType ? ` ${a.requiredDocumentType.name}` : ""}
                    {a.deadline && <> · tenggat {formatDate(a.deadline)}</>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Required doc types */}
          {requiredDocs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {requiredDocs.map((r: any) => {
                const fulfilled = approvedTypes.has(r.documentTypeId);
                return (
                  <span key={r.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs border ${
                    fulfilled
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}>
                    {fulfilled ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {r.label}
                  </span>
                );
              })}
            </div>
          )}

          {docs.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-100 py-6 text-center">
              <p className="text-sm text-gray-400">Belum ada dokumen di fase ini</p>
              {canUpload && (
                <Button variant="ghost" size="sm" className="mt-2 text-blue-600" onClick={onUpload}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Upload dokumen pertama
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc: any) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  canUpload={canUpload}
                  canReview={canReview}
                  isLeader={isLeader}
                  onNewVersion={() => onNewVersion(doc.id, doc.title)}
                  onAction={(action: string) => onDocAction(doc.id, doc.title, action)}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── DocumentRow ──────────────────────────────────────────────────────────────

function DocumentRow({ doc, canUpload, canReview, isLeader, onNewVersion, onAction }: any) {
  const currentVersion = doc.versions?.[0];
  const filePath = currentVersion?.filePath ?? doc.filePath;

  return (
    <div className="flex items-start justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 gap-3">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <FileText className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <DocumentTitle code={doc.documentCode} title={doc.title} className="text-sm font-medium text-gray-900 truncate" />
            <Badge variant={DOCUMENT_STATUS_VARIANT[doc.status as DocumentStatus] ?? "secondary"} className="text-xs shrink-0">
              {DOCUMENT_STATUS_LABELS[doc.status as DocumentStatus] ?? doc.status}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>
              {currentVersion ? `v${currentVersion.versionNumber} · ` : ""}
              {doc.uploadedBy?.name}
            </span>
          </p>
          {doc.reviewedBy && (
            <p className="text-xs text-gray-400">
              Direview oleh {doc.reviewedBy.name}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        <Link href={`/documents/${doc.id}`} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          Detail
        </Link>
        {filePath && (
          <a
            href={filePath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline px-2 py-1 rounded hover:bg-blue-50"
          >
            <ExternalLink className="h-3 w-3" /> Buka
          </a>
        )}

        {/* Role-based actions */}
        {canUpload && doc.status === "DRAFT" && (
          <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => onAction("submit")}>
            <Send className="h-3 w-3 mr-1" /> Submit
          </Button>
        )}
        {canUpload && doc.status === "REVISION_REQUESTED" && (
          <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
            onClick={onNewVersion}>
            <RotateCcw className="h-3 w-3 mr-1" /> Upload Revisi
          </Button>
        )}
        {canReview && doc.status === "UNDER_REVIEW" && (
          <Button size="sm" variant="outline" className="h-7 text-xs text-purple-700 border-purple-300 hover:bg-purple-50"
            onClick={() => onAction("")}>
            <ShieldCheck className="h-3 w-3 mr-1" /> Review
          </Button>
        )}
        {isLeader && doc.status === "APPROVED" && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500" onClick={() => onAction("archive")}>
            Arsipkan
          </Button>
        )}
        {canUpload && (doc.status === "DRAFT") && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500" onClick={onNewVersion}>
            Revisi
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── InfoField ────────────────────────────────────────────────────────────────

function InfoField({ label, value, span }: { label: string; value?: string | null; span?: number }) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-sm text-gray-900">{value ?? "—"}</p>
    </div>
  );
}

// ─── DocumentStatusRollup ───────────────────────────────────────────────────────
// Consolidated view of where every document in the project stands, at a glance —
// per-document status is already visible in the Fase & Dokumen tab, but nothing
// summed it up across the whole project until now.

const STATUS_ORDER: (keyof typeof DOCUMENT_STATUS_LABELS)[] = [
  "DRAFT", "UNDER_REVIEW", "APPROVED", "REVISION_REQUESTED", "REJECTED", "ARCHIVED",
];

function DocumentStatusRollup({ phases }: { phases: any[] }) {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const ph of phases ?? []) {
    for (const doc of ph.documents ?? []) {
      counts[doc.status] = (counts[doc.status] ?? 0) + 1;
      total++;
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Ringkasan Status Dokumen ({total})</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {total === 0 ? (
          <p className="text-xs text-gray-400">Belum ada dokumen di proyek ini.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {STATUS_ORDER.map((s) => (
              <div key={s} className="rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{counts[s] ?? 0}</p>
                <Badge variant={DOCUMENT_STATUS_VARIANT[s]} className="mt-1 text-xs">
                  {DOCUMENT_STATUS_LABELS[s]}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ActivityLog ──────────────────────────────────────────────────────────────

function ActivityLog({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/audit-logs?projectId=${projectId}`).then(async (r) => {
      if (r.ok) setLogs(await r.json());
    }).finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        {logs.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Belum ada aktivitas</p>}
        {logs.map((log: any) => (
          <div key={log.id} className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50">
              <Activity className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                <span className="font-medium">{log.actor?.name ?? "Sistem"}</span>{" "}
                <span className="text-gray-500 capitalize">{log.action.toLowerCase()}</span>{" "}
                <span className="text-gray-500">{log.entity}</span>
              </p>
              <p className="text-xs text-gray-400">{formatRelative(log.createdAt)}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── UploadDocumentDialog ─────────────────────────────────────────────────────

// Server (isAllowedUploadFilename, api-helpers.ts) is the actual enforcement —
// this is a UX hint so the file picker doesn't offer types that'll get rejected.
const ACCEPTED_FILE_TYPES = ALLOWED_UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(",");

function UploadDocumentDialog({ projectId, initialPhase, phases, onClose, onSuccess }: any) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [selectedPhase, setSelectedPhase] = useState(initialPhase ?? phases?.[0]?.phase ?? "");
  const [docTypes, setDocTypes] = useState<any[]>([]);
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [pendingTags, setPendingTags] = useState<{ name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/document-type-master").then((r) => (r.ok ? r.json() : [])).then(setDocTypes).catch(() => {});
  }, []);

  // Auto-detect: first unfulfilled required doc in the phase (by documentTypeId,
  // not the legacy documentType enum, which collapses distinct types together).
  // Falls back to "Dokumen Umum / Lainnya" once the type master has loaded.
  function autoDocType(phaseKey: string, types: any[]) {
    const ph = phases?.find((p: any) => p.phase === phaseKey);
    const docs: any[] = ph?.documents ?? [];
    const required: any[] = ph?.requiredDocs ?? [];
    const approvedTypes = new Set(docs.filter((d: any) => d.status === "APPROVED").map((d: any) => d.documentTypeId));
    const unfulfilled = required.filter((r: any) => r.documentTypeId && !approvedTypes.has(r.documentTypeId));
    if (unfulfilled.length > 0) return { typeId: unfulfilled[0].documentTypeId as string, label: unfulfilled[0].label as string };
    const fallback = types.find((t: any) => t.typeCode === "DOC");
    return { typeId: fallback?.id ?? "", label: "Dokumen Tambahan" };
  }

  // Title is always the detected label — user can edit it
  const [title, setTitle] = useState(() => autoDocType(initialPhase ?? phases?.[0]?.phase ?? "", []).label);

  useEffect(() => {
    if (docTypes.length === 0) return;
    const detected = autoDocType(selectedPhase, docTypes);
    if (detected.typeId) setDocumentTypeId(detected.typeId);
  }, [docTypes.length]); // resolve once the type master has loaded

  function handlePhaseChange(v: string) {
    setSelectedPhase(v);
    const detected = autoDocType(v, docTypes);
    setTitle(detected.label);
    if (detected.typeId) setDocumentTypeId(detected.typeId);
  }

  async function submit() {
    if (!title.trim() || !selectedPhase || !documentTypeId) {
      toast({ title: "Judul, fase, dan jenis dokumen wajib diisi", variant: "destructive" });
      return;
    }
    if (file && file.size > MAX_UPLOAD_SIZE_BYTES) {
      toast({ title: "File terlalu besar", description: `Ukuran maksimal ${formatBytes(MAX_UPLOAD_SIZE_BYTES)}`, variant: "destructive" });
      return;
    }
    setLoading(true);
    const fd = new FormData();
    if (file) fd.append("file", file);
    fd.append("title", title.trim());
    fd.append("documentTypeId", documentTypeId);
    fd.append("phase", selectedPhase);

    const res = await fetch(`/api/projects/${projectId}/documents`, { method: "POST", body: fd });
    if (res.ok) {
      const newDoc = await res.json();
      for (const tag of pendingTags) {
        await fetch(`/api/documents/${newDoc.id}/tags`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tag.name }),
        });
      }
      setLoading(false);
      toast({ title: "Dokumen berhasil ditambahkan", variant: "success" });
      onSuccess();
    } else {
      setLoading(false);
      toast({ title: "Gagal", description: await parseErrorMessage(res), variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Dokumen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Phase selector */}
          <div className="space-y-2">
            <Label>Fase</Label>
            <Select value={selectedPhase} onValueChange={handlePhaseChange}>
              <SelectTrigger><SelectValue placeholder="Pilih fase" /></SelectTrigger>
              <SelectContent>
                {phases?.map((p: any) => {
                  const meta = LPS_PHASES.find((l) => l.phase === p.phase);
                  return <SelectItem key={p.phase} value={p.phase}>{meta?.label ?? p.phase}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Document type — full 13-type master, not just an auto-guess */}
          <div className="space-y-2">
            <Label>Jenis Dokumen *</Label>
            <Select value={documentTypeId} onValueChange={setDocumentTypeId}>
              <SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
              <SelectContent>
                {docTypes.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-400">Tidak sesuai daftar? Pilih "Dokumen Umum / Lainnya" lalu sesuaikan judulnya di bawah.</p>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>Judul Dokumen *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nama dokumen"
            />
          </div>

          {/* File drop */}
          <div className="space-y-1">
            <Label>File</Label>
            <div
              className="rounded-lg border-2 border-dashed border-gray-200 p-5 text-center hover:border-blue-300 cursor-pointer transition-colors"
              onClick={() => document.getElementById("file-input-upload")?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                  </div>
                  <button className="ml-2 text-gray-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Klik atau drag file ke sini</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, DWG, CATIA, gambar, dan lainnya (maks {formatBytes(MAX_UPLOAD_SIZE_BYTES)})</p>
                </div>
              )}
            </div>
            <input
              id="file-input-upload" type="file" className="hidden"
              accept={ACCEPTED_FILE_TYPES}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1">
            <Label>Tag</Label>
            <TagInput
              tags={pendingTags}
              onAdd={(name) => setPendingTags((t) => [...t, { name }])}
              onRemove={(tag) => setPendingTags((t) => t.filter((x) => x.name !== tag.name))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={loading || !title.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Dokumen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AddMemberDialog ──────────────────────────────────────────────────────────

function AddMemberDialog({ projectId, users, isSuperadmin, onClose, onSuccess }: any) {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ProjectRole | "">("");
  const [loading, setLoading] = useState(false);
  // Only Super Admin can appoint a Team Leader (see /api/projects/[id]/members) —
  // don't offer an option here that the server will always reject.
  const assignableRoles: ProjectRole[] = isSuperadmin
    ? ["TEAM_LEADER", "ENGINEER", "CLIENT"]
    : ["ENGINEER", "CLIENT"];

  async function submit() {
    if (!userId || !role) { toast({ title: "Pilih user dan role", variant: "destructive" }); return; }
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    setLoading(false);
    if (res.ok) { toast({ title: "Anggota berhasil ditambahkan", variant: "success" }); onSuccess(); }
    else { toast({ title: "Gagal", description: await parseErrorMessage(res), variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tambah Anggota Tim</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Pilih user" /></SelectTrigger>
              <SelectContent>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role dalam Proyek</Label>
            <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
              <SelectTrigger><SelectValue placeholder="Pilih role" /></SelectTrigger>
              <SelectContent>
                {assignableRoles.map((r) => (
                  <SelectItem key={r} value={r}>{PROJECT_ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tambah
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AssignDocumentDialog ───────────────────────────────────────────────────────
// Direct "Team Leader assigns a document upload to an Engineer" shortcut —
// avoids the indirection of recording a full meeting (notulen) just to task
// someone with a document. Shows up in the assignee's Notifikasi.

function AssignDocumentDialog({ projectId, initialPhase, engineers, onClose, onSuccess }: any) {
  const { toast } = useToast();
  const [docTypes, setDocTypes] = useState<any[]>([]);
  const [phase, setPhase] = useState(initialPhase ?? "");
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/document-type-master").then((r) => (r.ok ? r.json() : [])).then(setDocTypes).catch(() => {});
  }, []);

  async function submit() {
    if (!assignedToId || !phase || !documentTypeId) {
      toast({ title: "Engineer, fase, dan jenis dokumen wajib diisi", variant: "destructive" });
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/documents/assign`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToId, phase, documentTypeId, deadline: deadline || null, note: note || null }),
    });
    setLoading(false);
    if (res.ok) onSuccess();
    else { toast({ title: "Gagal menugaskan dokumen", description: await parseErrorMessage(res), variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tugaskan Dokumen ke Engineer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Engineer *</Label>
            <Select value={assignedToId} onValueChange={setAssignedToId}>
              <SelectTrigger><SelectValue placeholder="Pilih engineer" /></SelectTrigger>
              <SelectContent>
                {engineers.map((m: any) => (
                  <SelectItem key={m.userId} value={m.userId}>{m.user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Fase *</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger><SelectValue placeholder="Pilih fase" /></SelectTrigger>
                <SelectContent>
                  {LPS_PHASES.map((p) => <SelectItem key={p.phase} value={p.phase}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Jenis Dokumen *</Label>
              <Select value={documentTypeId} onValueChange={setDocumentTypeId}>
                <SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                <SelectContent>
                  {docTypes.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tenggat Waktu</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>
              {docTypes.find((t: any) => t.id === documentTypeId)?.typeCode === "DOC"
                ? "Nama Dokumen *" : "Catatan (opsional)"}
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                docTypes.find((t: any) => t.id === documentTypeId)?.typeCode === "DOC"
                  ? "Jenis dokumen ini di luar daftar template — jelaskan di sini, mis. 'Upload surat izin lingkungan'"
                  : "Kosongkan untuk pesan default: 'Upload {jenis dokumen} untuk fase {fase}'"
              }
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <UserPlus className="mr-1.5 h-4 w-4" /> Tugaskan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── NewVersionDialog ─────────────────────────────────────────────────────────

function NewVersionDialog({ docId, docTitle, onClose, onSuccess }: any) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [changeNotes, setChangeNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!file) { toast({ title: "Pilih file revisi", variant: "destructive" }); return; }
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("changeNotes", changeNotes);
    const res = await fetch(`/api/documents/${docId}/version`, { method: "POST", body: fd });
    setLoading(false);
    if (res.ok) { toast({ title: "Revisi berhasil diupload", variant: "success" }); onSuccess(); }
    else { toast({ title: "Gagal", description: await parseErrorMessage(res), variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Revisi</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">{docTitle}</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Catatan Perubahan</Label>
            <Textarea value={changeNotes} onChange={(e) => setChangeNotes(e.target.value)}
              placeholder="Apa yang berubah di versi ini?" rows={3} />
          </div>
          <div className="space-y-2">
            <Label>File Revisi *</Label>
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center cursor-pointer hover:border-blue-300"
              onClick={() => document.getElementById("ver-file-input")?.click()}>
              {file ? (
                <p className="text-sm text-gray-900">{file.name} ({formatBytes(file.size)})</p>
              ) : (
                <p className="text-sm text-gray-400">Klik untuk pilih file revisi</p>
              )}
            </div>
            <input id="ver-file-input" type="file" className="hidden"
              accept={ACCEPTED_FILE_TYPES}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Upload Revisi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MilestonesTab ──────────────────────────────────────────────────────────────
// Free-form project checkpoints (e.g. "Serah Terima Lahan") — distinct from the
// 6 fixed IEC 62305 phases, which don't need a specific document to be "done".

const EMPTY_MILESTONE_FORM = { title: "", description: "", phase: "", targetDate: "" };

function MilestonesTab({ projectId, isLeader }: { projectId: string; isLeader: boolean }) {
  const { toast } = useToast();
  const [milestones, setMilestones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_MILESTONE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_MILESTONE_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`);
      if (res.status === 401) { handleSessionExpired(); return; }
      if (res.ok) setMilestones(await res.json());
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function addMilestone(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          phase: form.phase || null,
          targetDate: form.targetDate || null,
        }),
      });
      if (res.ok) {
        setForm(EMPTY_MILESTONE_FORM);
        load();
      } else {
        toast({ title: "Gagal menambah milestone", description: await parseErrorMessage(res), variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(m: any) {
    setEditingId(m.id);
    setEditForm({
      title: m.title,
      description: m.description ?? "",
      phase: m.phase ?? "",
      targetDate: m.targetDate ? m.targetDate.slice(0, 10) : "",
    });
  }

  async function saveEdit(id: string) {
    if (!editForm.title.trim()) return;
    const res = await fetch(`/api/milestones/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        phase: editForm.phase || null,
        targetDate: editForm.targetDate || null,
      }),
    });
    if (res.ok) { setEditingId(null); load(); }
    else toast({ title: "Gagal menyimpan perubahan", description: await parseErrorMessage(res), variant: "destructive" });
  }

  async function toggle(id: string, isCompleted: boolean) {
    const res = await fetch(`/api/milestones/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted }),
    });
    if (res.ok) load();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/milestones/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-4">
      {isLeader && (
        <form onSubmit={addMilestone} className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-48 space-y-1">
              <Label htmlFor="ms-title" className="text-xs text-gray-500">Milestone Baru</Label>
              <Input id="ms-title" placeholder="mis. Serah Terima Lahan" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ms-phase" className="text-xs text-gray-500">Terkait Fase (opsional)</Label>
              <Select value={form.phase} onValueChange={(v) => setForm({ ...form, phase: v })}>
                <SelectTrigger id="ms-phase" className="h-9 w-44"><SelectValue placeholder="Tidak terkait fase" /></SelectTrigger>
                <SelectContent>
                  {LPS_PHASES.map((p) => <SelectItem key={p.phase} value={p.phase}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ms-date" className="text-xs text-gray-500">Target Tanggal (opsional)</Label>
              <Input id="ms-date" type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} className="h-9" />
            </div>
            <Button type="submit" size="sm" disabled={submitting || !form.title.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Tambah
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms-desc" className="text-xs text-gray-500">Deskripsi — apa yang menandai milestone ini selesai? (opsional)</Label>
            <Textarea id="ms-desc" placeholder="mis. Semua dokumen fase Assessment disetujui dan diserahkan ke klien" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="text-sm" />
          </div>
        </form>
      )}

      {milestones.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
          <Calendar className="h-10 w-10 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">Belum ada milestone di proyek ini</p>
        </div>
      ) : (
        <div className="space-y-2">
          {milestones.map((m: any) => {
            const isOverdue = m.targetDate && !m.isCompleted && new Date(m.targetDate) < new Date();
            const phaseMeta = m.phase ? LPS_PHASES.find((p) => p.phase === m.phase) : null;

            if (editingId === m.id) {
              return (
                <div key={m.id} className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 px-4 py-3">
                  <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="h-9" placeholder="Judul milestone" />
                  <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="text-sm" placeholder="Deskripsi (opsional)" />
                  <div className="flex flex-wrap items-end gap-2">
                    <Select value={editForm.phase} onValueChange={(v) => setEditForm({ ...editForm, phase: v })}>
                      <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Tidak terkait fase" /></SelectTrigger>
                      <SelectContent>
                        {LPS_PHASES.map((p) => <SelectItem key={p.phase} value={p.phase}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="date" value={editForm.targetDate} onChange={(e) => setEditForm({ ...editForm, targetDate: e.target.value })} className="h-9" />
                    <Button size="sm" onClick={() => saveEdit(m.id)} disabled={!editForm.title.trim()}>Simpan</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Batal</Button>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${m.isCompleted ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-white"}`}>
                <button
                  onClick={() => isLeader && toggle(m.id, !m.isCompleted)}
                  disabled={!isLeader}
                  aria-label={m.isCompleted ? "Tandai belum selesai" : "Tandai selesai"}
                  className={`mt-0.5 ${isLeader ? "cursor-pointer" : "cursor-default"}`}
                >
                  {m.isCompleted
                    ? <CheckSquare className="h-5 w-5 text-green-600" />
                    : <Square className="h-5 w-5 text-gray-300" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className={`text-sm font-medium ${m.isCompleted ? "text-gray-400 line-through" : "text-gray-900"}`}>{m.title}</p>
                    {phaseMeta && <Badge variant="secondary" className="text-[10px]">{phaseMeta.label}</Badge>}
                  </div>
                  {m.description && <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>}
                  <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
                    {m.targetDate ? `Target: ${formatDate(m.targetDate)}` : "Tanpa target tanggal"}
                    {isOverdue && " — terlambat"}
                    {m.isCompleted && m.completedAt && ` · Selesai ${formatDate(m.completedAt)}`}
                    {" · dibuat oleh "}{m.createdBy?.name}
                  </p>
                </div>
                {isLeader && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => startEdit(m)} aria-label="Edit milestone" className="text-gray-300 hover:text-blue-500">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(m.id)} aria-label="Hapus milestone" className="text-gray-300 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── NotulenTab ───────────────────────────────────────────────────────────────

const MEETING_TYPE_PRESETS = ["Kickoff", "Progress Review", "Evaluasi", "Serah Terima", "Site Visit"];

function NotulenTab({ projectId, canCreate, teamMembers, projectDocuments }: any) {
  const { toast } = useToast();
  const [notulenList, setNotulenList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialog, setCreateDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [closeTarget, setCloseTarget] = useState<{ notulenId: string; item: any } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/notulen`);
    if (res.ok) setNotulenList(await res.json());
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function reopenItem(notulenId: string, itemId: string) {
    const res = await fetch(`/api/notulen/${notulenId}/action-items/${itemId}/close`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    if (res.ok) { load(); toast({ title: "Action item dibuka kembali", variant: "success" }); }
  }

  async function closeItem(notulenId: string, itemId: string, closedNote: string, linkedDocumentId: string) {
    const res = await fetch(`/api/notulen/${notulenId}/action-items/${itemId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closedNote: closedNote || null, linkedDocumentId: linkedDocumentId || null }),
    });
    if (res.ok) {
      load();
      toast({ title: "Action item ditandai selesai", variant: "success" });
      setCloseTarget(null);
    } else {
      toast({ title: "Gagal menutup action item", description: await parseErrorMessage(res), variant: "destructive" });
    }
  }

  const openItems = notulenList.flatMap((n) =>
    n.actionItems.filter((a: any) => a.status === "OPEN").map((a: any) => ({
      ...a, notulenId: n.id, notulenTitle: n.title,
    }))
  );

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Notulen Rapat</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Simpan dokumen & catatan rapat + tracking tindak lanjut berbasis dokumen
          </p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setCreateDialog(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Catat Notulen
          </Button>
        )}
      </div>

      {/* Open action items summary */}
      {openItems.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900 mb-3">
            {openItems.length} Tindak Lanjut Belum Selesai
          </p>
          <div className="space-y-2">
            {openItems.slice(0, 6).map((item: any) => (
              <div key={item.id} className="flex items-start gap-2">
                <button
                  onClick={() => setCloseTarget({ notulenId: item.notulenId, item })}
                  className="mt-0.5 shrink-0 text-gray-300 hover:text-green-600 transition-colors"
                >
                  <Square className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">{item.description}</p>
                  <p className="text-xs text-gray-500">
                    {item.notulenTitle}
                    {item.assignedTo && ` · ${item.assignedTo.name}`}
                    {item.deadline && (
                      <span className={new Date(item.deadline) < new Date() ? " · ⚠ Deadline terlewat: " + formatDate(item.deadline) : ` · Deadline: ${formatDate(item.deadline)}`} />
                    )}
                  </p>
                </div>
              </div>
            ))}
            {openItems.length > 6 && (
              <p className="text-xs text-amber-700 pl-6">+{openItems.length - 6} tindak lanjut lainnya</p>
            )}
          </div>
        </div>
      )}

      {/* Notulen list */}
      {notulenList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-100 py-16">
          <ClipboardList className="h-10 w-10 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">Belum ada notulen rapat</p>
          <p className="text-xs text-gray-400 mt-1">Upload dokumen notulen + catat tindak lanjutnya di sini</p>
          {canCreate && (
            <Button variant="ghost" size="sm" className="mt-3 text-blue-600" onClick={() => setCreateDialog(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Catat notulen pertama
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {notulenList.map((n: any) => (
            <NotulenCard
              key={n.id}
              notulen={n}
              canEdit={canCreate}
              onEdit={() => setEditTarget(n)}
              onCloseItem={(item: any) => setCloseTarget({ notulenId: n.id, item })}
              onReopenItem={(itemId: string) => reopenItem(n.id, itemId)}
            />
          ))}
        </div>
      )}

      {createDialog && (
        <CreateNotulenDialog
          projectId={projectId}
          teamMembers={teamMembers}
          onClose={() => setCreateDialog(false)}
          onSuccess={() => { setCreateDialog(false); load(); }}
        />
      )}

      {editTarget && (
        <EditNotulenDialog
          notulen={editTarget}
          teamMembers={teamMembers}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { setEditTarget(null); load(); }}
        />
      )}

      {closeTarget && (
        <CloseActionItemDialog
          item={closeTarget.item}
          notulenId={closeTarget.notulenId}
          projectDocuments={projectDocuments}
          onClose={() => setCloseTarget(null)}
          onConfirm={(closedNote: string, linkedDocumentId: string) =>
            closeItem(closeTarget.notulenId, closeTarget.item.id, closedNote, linkedDocumentId)
          }
        />
      )}
    </div>
  );
}

function NotulenCard({ notulen, canEdit, onEdit, onCloseItem, onReopenItem }: any) {
  const [expanded, setExpanded] = useState(false);
  const openCount = notulen.actionItems.filter((a: any) => a.status === "OPEN").length;
  const closedCount = notulen.actionItems.filter((a: any) => a.status === "CLOSED").length;

  return (
    <Card className={openCount > 0 ? "border-amber-200" : closedCount > 0 ? "border-green-200" : ""}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start gap-2">
          <button className="flex flex-1 min-w-0 items-start gap-2 text-left" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {notulen.meetingType && <Badge variant="secondary" className="text-[10px]">{notulen.meetingType}</Badge>}
                <p className="font-semibold text-gray-900 text-sm">{notulen.title}</p>
                {openCount > 0 && <Badge variant="warning" className="text-xs">{openCount} open</Badge>}
                {openCount === 0 && closedCount > 0 && <Badge variant="success" className="text-xs">Semua selesai</Badge>}
                {notulen.filePath && (
                  <a
                    href={notulen.filePath}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline px-1.5 py-0.5 rounded hover:bg-blue-50"
                  >
                    <ExternalLink className="h-3 w-3" /> Dokumen Notulen
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(notulen.meetingDate)}</span>
                {notulen.location && <span>{notulen.location}</span>}
                <span>oleh {notulen.createdBy?.name}</span>
              </div>
            </div>
          </button>
          {canEdit && (
            <button onClick={onEdit} aria-label="Edit notulen" className="mt-0.5 shrink-0 text-gray-300 hover:text-blue-500">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-3">
          {notulen.attendees && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Peserta</p>
              <p className="text-sm text-gray-700">{notulen.attendees}</p>
            </div>
          )}
          {notulen.discussion && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Pembahasan</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{notulen.discussion}</p>
            </div>
          )}
          {notulen.actionItems.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Tindak Lanjut — {closedCount}/{notulen.actionItems.length} selesai
              </p>
              <div className="space-y-2">
                {notulen.actionItems.map((item: any) => (
                  <div key={item.id} className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${
                    item.status === "CLOSED" ? "bg-green-50 border border-green-100" : "bg-gray-50 border border-gray-100"
                  }`}>
                    <button
                      onClick={() => item.status === "OPEN" ? onCloseItem(item) : onReopenItem(item.id)}
                      className={`mt-0.5 shrink-0 transition-colors ${
                        item.status === "CLOSED" ? "text-green-600 hover:text-gray-400" : "text-gray-300 hover:text-green-600"
                      }`}
                      title={item.status === "OPEN" ? "Tandai selesai" : "Buka kembali"}
                    >
                      {item.status === "CLOSED" ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${item.status === "CLOSED" ? "line-through text-gray-400" : "text-gray-800"}`}>
                        {item.description}
                      </p>
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                        {item.assignedTo && <span>{item.assignedTo.name}</span>}
                        {item.deadline && (
                          <span className={new Date(item.deadline) < new Date() && item.status === "OPEN" ? "text-red-600 font-medium" : ""}>
                            Deadline: {formatDate(item.deadline)}
                          </span>
                        )}
                        {item.status === "CLOSED" && item.closedAt && (
                          <span className="text-green-600">✓ Selesai {formatDate(item.closedAt)}</span>
                        )}
                        {item.closedNote && (
                          <span className="text-gray-400 italic">"{item.closedNote}"</span>
                        )}
                      </div>
                      {/* Document requirement — what the assignee still needs to upload */}
                      {item.status === "OPEN" && (item.requiredDocumentType || item.requiredPhase) && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <div className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 flex items-center gap-1.5">
                            <Upload className="h-3 w-3 text-amber-600 shrink-0" />
                            <span className="text-xs text-amber-800 font-medium">
                              Perlu upload{item.requiredDocumentType ? `: ${item.requiredDocumentType.name}` : ""}
                              {item.requiredPhase ? ` (${LPS_PHASES.find((p) => p.phase === item.requiredPhase)?.label ?? item.requiredPhase})` : ""}
                            </span>
                          </div>
                        </div>
                      )}
                      {/* Linked document — this is what makes it EDMS, not just a task tracker */}
                      {item.linkedDocument && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <div className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 flex items-center gap-1.5">
                            <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                            <span className="text-xs text-blue-700 font-medium">{item.linkedDocument.title}</span>
                            {item.linkedDocument.filePath && (
                              <a
                                href={item.linkedDocument.filePath}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-700"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function CloseActionItemDialog({ item, notulenId, projectDocuments, onClose, onConfirm }: any) {
  const [closedNote, setClosedNote] = useState("");
  const [linkedDocumentId, setLinkedDocumentId] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    await onConfirm(closedNote, linkedDocumentId);
    setLoading(false);
  }

  const approvedDocs = (projectDocuments ?? []).filter((d: any) => d.status === "APPROVED");
  const otherDocs = (projectDocuments ?? []).filter((d: any) => d.status !== "APPROVED");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tandai Tindak Lanjut Selesai</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <p className="text-sm font-medium text-gray-800">{item.description}</p>
            {item.assignedTo && <p className="text-xs text-gray-500 mt-0.5">PIC: {item.assignedTo.name}</p>}
          </div>

          <div className="space-y-2">
            <Label>Link Dokumen Tindak Lanjut</Label>
            <p className="text-xs text-gray-500">
              Pilih dokumen di sistem sebagai bukti penyelesaian — ini yang membedakan EDMS dari task tracker biasa
            </p>
            <Select value={linkedDocumentId} onValueChange={setLinkedDocumentId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih dokumen (opsional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tidak ada dokumen terkait</SelectItem>
                {approvedDocs.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-medium text-gray-500 uppercase">Sudah Disetujui</div>
                    {approvedDocs.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        ✓ {d.title}
                      </SelectItem>
                    ))}
                  </>
                )}
                {otherDocs.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-medium text-gray-500 uppercase">Dokumen Lain</div>
                    {otherDocs.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Catatan (opsional)</Label>
            <Textarea
              value={closedNote}
              onChange={(e) => setClosedNote(e.target.value)}
              placeholder="Catatan hasil penyelesaian..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
          <Button onClick={submit} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <CheckSquare className="mr-1.5 h-4 w-4" /> Tandai Selesai
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Team roster as checkboxes instead of free-typed names — matches what's
// actually selectable (the project's own team), with a shortcut for the
// common "everyone was there" case.
function AttendeesPicker({ teamMembers, selectedIds, onChange }: { teamMembers: any[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const allSelected = teamMembers.length > 0 && selectedIds.length === teamMembers.length;

  function toggle(userId: string) {
    onChange(selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Peserta</Label>
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : teamMembers.map((m: any) => m.userId))}
          className="text-xs text-blue-600 hover:underline"
        >
          {allSelected ? "Batal pilih semua" : "Pilih semua"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 p-2">
        {teamMembers.length === 0 && <p className="text-xs text-gray-400 px-1 py-1">Belum ada anggota tim</p>}
        {teamMembers.map((m: any) => {
          const checked = selectedIds.includes(m.userId);
          return (
            <button
              type="button"
              key={m.userId}
              onClick={() => toggle(m.userId)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                checked ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {checked ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
              {m.user.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreateNotulenDialog({ projectId, teamMembers, onClose, onSuccess }: any) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState("");
  const [meetingTypeOther, setMeetingTypeOther] = useState("");
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [discussion, setDiscussion] = useState("");
  const [docTypes, setDocTypes] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<{
    description: string; assignedToId: string; deadline: string;
    requiresDocument: boolean; requiredPhase: string; requiredDocumentTypeId: string;
  }[]>([
    { description: "", assignedToId: "", deadline: "", requiresDocument: false, requiredPhase: "", requiredDocumentTypeId: "" },
  ]);

  useEffect(() => {
    fetch("/api/document-type-master").then((r) => (r.ok ? r.json() : [])).then(setDocTypes).catch(() => {});
  }, []);

  function addActionItem() {
    setActionItems((prev) => [...prev, { description: "", assignedToId: "", deadline: "", requiresDocument: false, requiredPhase: "", requiredDocumentTypeId: "" }]);
  }
  function removeActionItem(idx: number) {
    setActionItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateActionItem(idx: number, field: string, value: string | boolean) {
    setActionItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function submit() {
    if (!title || !meetingDate) {
      toast({ title: "Judul dan tanggal rapat wajib diisi", variant: "destructive" });
      return;
    }
    // A row with an assignee/deadline/requirement but no description used to
    // be silently dropped on submit (see FT feedback: "action item ke Budi
    // ga muncul") — now it blocks submission with a clear reason instead.
    const incomplete = actionItems.some((a) => !a.description.trim() && (a.assignedToId || a.deadline || a.requiresDocument));
    if (incomplete) {
      toast({ title: "Ada tindak lanjut belum lengkap", description: "Isi kolom \"Apa yang harus dilakukan?\" untuk tindak lanjut yang sudah diisi PIC/deadline-nya, atau hapus barisnya.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const validItems = actionItems.filter((a) => a.description.trim());
    const attendeeNames = teamMembers.filter((m: any) => attendeeIds.includes(m.userId)).map((m: any) => m.user.name);
    const resolvedType = meetingType === "Lainnya" ? meetingTypeOther.trim() : meetingType;

    const fd = new FormData();
    fd.append("title", title);
    if (resolvedType) fd.append("meetingType", resolvedType);
    fd.append("meetingDate", meetingDate);
    if (location) fd.append("location", location);
    if (attendeeNames.length > 0) fd.append("attendees", attendeeNames.join(", "));
    if (discussion) fd.append("discussion", discussion);
    fd.append("actionItems", JSON.stringify(validItems.map((a) => ({
      description: a.description,
      assignedToId: a.assignedToId || null,
      deadline: a.deadline || null,
      requiredPhase: a.requiresDocument ? (a.requiredPhase || null) : null,
      requiredDocumentTypeId: a.requiresDocument ? (a.requiredDocumentTypeId || null) : null,
    }))));
    if (file) fd.append("file", file);

    const res = await fetch(`/api/projects/${projectId}/notulen`, { method: "POST", body: fd });
    setLoading(false);
    if (res.ok) {
      toast({ title: "Notulen berhasil dicatat", variant: "success" });
      onSuccess();
    } else {
      toast({ title: "Gagal", description: await parseErrorMessage(res), variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Catat Notulen Rapat</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* File upload — prominent, first section */}
          <div className="space-y-2">
            <Label>Dokumen Notulen (PDF / Word / Foto scan)</Label>
            <div
              className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
                file ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-blue-300"
              }`}
              onClick={() => document.getElementById("notulen-file-input")?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-blue-900">{file.name}</p>
                    <p className="text-xs text-blue-600">{formatBytes(file.size)} · Klik untuk ganti</p>
                  </div>
                </div>
              ) : (
                <div>
                  <Upload className="mx-auto h-7 w-7 text-gray-300 mb-1.5" />
                  <p className="text-sm text-gray-500">Klik untuk upload dokumen notulen asli</p>
                  <p className="text-xs text-gray-400 mt-0.5">PDF, Word, foto scan — opsional, bisa ditambah belakangan</p>
                </div>
              )}
            </div>
            <input
              id="notulen-file-input" type="file" className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Judul / Agenda Rapat *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Kick-off Meeting Proyek LPS Gedung A" />
            </div>
            <div className="space-y-2">
              <Label>Jenis Rapat</Label>
              <Select value={meetingType} onValueChange={setMeetingType}>
                <SelectTrigger><SelectValue placeholder="Pilih jenis rapat" /></SelectTrigger>
                <SelectContent>
                  {MEETING_TYPE_PRESETS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  <SelectItem value="Lainnya">Lainnya…</SelectItem>
                </SelectContent>
              </Select>
              {meetingType === "Lainnya" && (
                <Input value={meetingTypeOther} onChange={(e) => setMeetingTypeOther(e.target.value)} placeholder="Tulis jenis rapatnya" className="mt-1.5" />
              )}
            </div>
            <div className="space-y-2">
              <Label>Tanggal Rapat *</Label>
              <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Lokasi</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ruang rapat / online" />
            </div>
          </div>
          <AttendeesPicker teamMembers={teamMembers} selectedIds={attendeeIds} onChange={setAttendeeIds} />
          <div className="space-y-2">
            <Label>Ringkasan Pembahasan</Label>
            <Textarea value={discussion} onChange={(e) => setDiscussion(e.target.value)}
              placeholder="Poin penting, keputusan, kesimpulan rapat..." rows={3} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Tindak Lanjut</Label>
                <p className="text-xs text-gray-400 mt-0.5">Apa yang harus dilakukan, siapa PIC-nya, kapan deadline-nya</p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={addActionItem} className="text-blue-600 h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Tambah
              </Button>
            </div>
            <div className="space-y-2">
              {actionItems.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-gray-100 p-2 space-y-2">
                  <div className="grid grid-cols-[1fr_140px_130px_28px] gap-2 items-center">
                    <Input
                      value={item.description}
                      onChange={(e) => updateActionItem(idx, "description", e.target.value)}
                      placeholder="Apa yang harus dilakukan?"
                      className="text-sm"
                    />
                    <Select value={item.assignedToId} onValueChange={(v) => updateActionItem(idx, "assignedToId", v)}>
                      <SelectTrigger className="text-sm h-9">
                        <SelectValue placeholder="Siapa?" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((m: any) => (
                          <SelectItem key={m.userId} value={m.userId}>{m.user.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={item.deadline}
                      onChange={(e) => updateActionItem(idx, "deadline", e.target.value)}
                      className="text-sm h-9"
                    />
                    {actionItems.length > 1 && (
                      <button onClick={() => removeActionItem(idx)} className="text-gray-400 hover:text-red-500 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => updateActionItem(idx, "requiresDocument", !item.requiresDocument)}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {item.requiresDocument ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                    Perlu upload dokumen tertentu
                  </button>

                  {item.requiresDocument && (
                    <div className="grid grid-cols-2 gap-2 pl-1">
                      <Select value={item.requiredPhase} onValueChange={(v) => updateActionItem(idx, "requiredPhase", v)}>
                        <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Fase terkait" /></SelectTrigger>
                        <SelectContent>
                          {LPS_PHASES.map((p) => <SelectItem key={p.phase} value={p.phase}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={item.requiredDocumentTypeId} onValueChange={(v) => updateActionItem(idx, "requiredDocumentTypeId", v)}>
                        <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Jenis dokumen" /></SelectTrigger>
                        <SelectContent>
                          {docTypes.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              Tindak lanjut bisa di-close dengan link dokumen di sistem (bukan sekadar centang)
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Notulen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editing covers the notulen's own fields (title/type/date/location/peserta/
// pembahasan) — the file and tindak lanjut have their own lifecycle (upload
// once, close/reopen individually) and aren't part of this form.
function EditNotulenDialog({ notulen, teamMembers, onClose, onSuccess }: any) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(notulen.title);
  const initialType = notulen.meetingType && MEETING_TYPE_PRESETS.includes(notulen.meetingType) ? notulen.meetingType : (notulen.meetingType ? "Lainnya" : "");
  const [meetingType, setMeetingType] = useState(initialType);
  const [meetingTypeOther, setMeetingTypeOther] = useState(initialType === "Lainnya" ? notulen.meetingType : "");
  const [meetingDate, setMeetingDate] = useState(notulen.meetingDate.slice(0, 10));
  const [location, setLocation] = useState(notulen.location ?? "");
  const initialAttendeeNames = (notulen.attendees ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const [attendeeIds, setAttendeeIds] = useState<string[]>(
    teamMembers.filter((m: any) => initialAttendeeNames.includes(m.user.name)).map((m: any) => m.userId)
  );
  const [discussion, setDiscussion] = useState(notulen.discussion ?? "");

  async function submit() {
    if (!title.trim() || !meetingDate) {
      toast({ title: "Judul dan tanggal rapat wajib diisi", variant: "destructive" });
      return;
    }
    setLoading(true);
    const attendeeNames = teamMembers.filter((m: any) => attendeeIds.includes(m.userId)).map((m: any) => m.user.name);
    const resolvedType = meetingType === "Lainnya" ? meetingTypeOther.trim() : meetingType;
    const res = await fetch(`/api/notulen/${notulen.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        meetingType: resolvedType || null,
        meetingDate,
        location: location || null,
        attendees: attendeeNames.length > 0 ? attendeeNames.join(", ") : null,
        discussion: discussion || null,
      }),
    });
    setLoading(false);
    if (res.ok) {
      toast({ title: "Notulen berhasil diperbarui", variant: "success" });
      onSuccess();
    } else {
      toast({ title: "Gagal", description: await parseErrorMessage(res), variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Notulen</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Judul / Agenda Rapat *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Jenis Rapat</Label>
              <Select value={meetingType} onValueChange={setMeetingType}>
                <SelectTrigger><SelectValue placeholder="Pilih jenis rapat" /></SelectTrigger>
                <SelectContent>
                  {MEETING_TYPE_PRESETS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  <SelectItem value="Lainnya">Lainnya…</SelectItem>
                </SelectContent>
              </Select>
              {meetingType === "Lainnya" && (
                <Input value={meetingTypeOther} onChange={(e) => setMeetingTypeOther(e.target.value)} placeholder="Tulis jenis rapatnya" className="mt-1.5" />
              )}
            </div>
            <div className="space-y-2">
              <Label>Tanggal Rapat *</Label>
              <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Lokasi</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ruang rapat / online" />
            </div>
          </div>
          <AttendeesPicker teamMembers={teamMembers} selectedIds={attendeeIds} onChange={setAttendeeIds} />
          <div className="space-y-2">
            <Label>Ringkasan Pembahasan</Label>
            <Textarea value={discussion} onChange={(e) => setDiscussion(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Perubahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ReviewDialog ─────────────────────────────────────────────────────────────

function ReviewDialog({ docId, docTitle, initialAction, onClose, onAction }: any) {
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState(initialAction ?? "");
  const [loading, setLoading] = useState(false);

  const actionOptions = [
    { value: "approve", label: "Setujui", variant: "success" as const },
    { value: "revise", label: "Minta Revisi", variant: "warning" as const },
    { value: "reject", label: "Tolak", variant: "destructive" as const },
  ];

  async function submit() {
    if (!action) return;
    setLoading(true);
    await onAction(docId, action, notes);
    setLoading(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review Dokumen</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">{docTitle}</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Keputusan</Label>
            <div className="flex flex-wrap gap-2">
              {actionOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAction(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border-2 transition-colors ${
                    action === opt.value
                      ? opt.value === "approve" ? "border-green-500 bg-green-50 text-green-700"
                        : opt.value === "revise" ? "border-amber-500 bg-amber-50 text-amber-700"
                        : "border-red-500 bg-red-50 text-red-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Catatan (opsional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan untuk pengunggah..." rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
          <Button onClick={submit} disabled={loading || !action}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action === "approve" ? "Setujui" : action === "revise" ? "Minta Revisi" : "Konfirmasi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
