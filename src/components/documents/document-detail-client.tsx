"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ShieldAlert, ExternalLink, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LPS_PHASES, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_VARIANT, DOCUMENT_VISIBILITY_LABELS } from "@/types";
import type { DocumentVisibility, DocumentStatus } from "@/types";
import { formatDate, parseErrorMessage } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { VersionStatusBadge, VERSION_STATUS_LABELS } from "@/components/documents/version-status-badge";
import { TagInput } from "@/components/documents/tag-input";
import { DocumentTitle } from "@/components/documents/document-title";
import { handleSessionExpired } from "@/lib/session-expired";

const RETENTION_TRIGGER_LABELS: Record<string, string> = {
  PROJECT_COMPLETION: "Setelah proyek selesai",
  SYSTEM_END_OF_LIFE: "Selama sistem masih beroperasi",
};

// Dokumen selalu Internal (Team Leader + Engineer) secara default — dua
// toggle di bawah cuma MENAMBAH akses di atas baseline itu, tidak pernah
// menggantikannya, jadi disederhanakan jadi dua flag independen di UI
// alih-alih daftar 4 pilihan bertingkat.
function visibilityToFlags(visibility: DocumentVisibility) {
  return {
    auditor: visibility === "AUDITOR_ACCESSIBLE" || visibility === "ALL_ACCESSIBLE",
    client: visibility === "CLIENT_ACCESSIBLE" || visibility === "ALL_ACCESSIBLE",
  };
}
function flagsToVisibility(auditor: boolean, client: boolean): DocumentVisibility {
  if (auditor && client) return "ALL_ACCESSIBLE";
  if (auditor) return "AUDITOR_ACCESSIBLE";
  if (client) return "CLIENT_ACCESSIBLE";
  return "INTERNAL";
}

export function DocumentDetailClient({ documentId, userId }: { documentId: string; userId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`);
      if (res.status === 401) { handleSessionExpired(); return; }
      if (!res.ok) { router.push("/documents"); return; }
      setDoc(await res.json());
    } finally {
      setLoading(false);
    }
  }, [documentId, router]);

  useEffect(() => { load(); }, [load]);

  // OCR runs in the background after upload — poll briefly so the "sedang
  // diproses" notice clears on its own once it's done, no manual refresh needed.
  useEffect(() => {
    if (!doc?.contentTextPending) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [doc?.contentTextPending, load]);

  async function setVisibilityFlags(auditor: boolean, client: boolean) {
    const visibility = flagsToVisibility(auditor, client);
    const res = await fetch(`/api/documents/${documentId}/visibility`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    if (res.ok) { load(); toast({ title: `Visibilitas diubah ke "${DOCUMENT_VISIBILITY_LABELS[visibility]}"`, variant: "success" }); }
    else { toast({ title: "Gagal mengubah visibilitas", description: await parseErrorMessage(res), variant: "destructive" }); }
  }

  async function addTag(name: string) {
    const res = await fetch(`/api/documents/${documentId}/tags`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) load();
    else { toast({ title: "Gagal menambah tag", description: await parseErrorMessage(res), variant: "destructive" }); }
  }

  async function removeTag(tag: { id?: string; name: string }) {
    if (!tag.id) return;
    const res = await fetch(`/api/documents/${documentId}/tags`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId: tag.id }),
    });
    if (res.ok) load();
  }

  async function deleteOrArchive(isDraft: boolean) {
    const confirmed = window.confirm(
      isDraft
        ? "Hapus dokumen ini secara permanen? Draft belum menjadi bagian dari rekaman resmi, jadi tindakan ini tidak dapat dibatalkan."
        : "Arsipkan dokumen ini? Dokumen tidak akan terhapus — riwayat versi dan jejak audit tetap tersimpan, hanya dipindahkan ke status Diarsipkan."
    );
    if (!confirmed) return;

    const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: isDraft ? "Dokumen dihapus" : "Dokumen diarsipkan", variant: "success" });
      if (isDraft) router.push("/documents"); else load();
    } else {
      toast({ title: "Gagal menghapus/mengarsipkan", description: await parseErrorMessage(res), variant: "destructive" });
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }
  if (!doc) return null;

  const canTag = doc.viewerRole === "ENGINEER" || doc.viewerRole === "TEAM_LEADER";
  const canChangeStatus = doc.viewerRole === "TEAM_LEADER";
  const isDraft = doc.status === "DRAFT";
  const canDelete = doc.viewerRole === "TEAM_LEADER" || (isDraft && doc.uploadedBy?.id === userId);
  const phaseMeta = LPS_PHASES.find((p) => p.phase === doc.projectPhase?.phase);
  const currentVersion = doc.versions?.find((v: any) => v.isCurrent) ?? doc.versions?.[0];

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Kembali">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            <DocumentTitle code={doc.documentCode} title={doc.title} />
          </h2>
        </div>
        <Badge variant={DOCUMENT_STATUS_VARIANT[doc.status as DocumentStatus] ?? "secondary"} className="text-xs shrink-0">
          {DOCUMENT_STATUS_LABELS[doc.status as DocumentStatus] ?? doc.status}
        </Badge>
        {canDelete && doc.status !== "ARCHIVED" && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
            onClick={() => deleteOrArchive(isDraft)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> {isDraft ? "Hapus" : "Arsipkan"}
          </Button>
        )}
      </div>

      {doc.filePath && doc.contentTextPending && (
        <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <Loader2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5 animate-spin" />
          <p className="text-sm text-blue-800">
            Dokumen ini terdeteksi hasil scan — sedang diproses OCR di latar belakang supaya isinya bisa dicari.
            Halaman ini akan otomatis memperbarui begitu selesai (biasanya beberapa puluh detik, tergantung jumlah halaman).
          </p>
        </div>
      )}

      {doc.filePath && !doc.contentTextPending && !doc.contentText?.trim() && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Isi file ini tidak dapat diindeks untuk pencarian — dokumen hasil scan ini tidak mengandung teks yang cukup jelas setelah dicoba diproses OCR, atau formatnya belum didukung.
            Dokumen tetap bisa dibuka & diunduh seperti biasa, tapi tidak akan muncul saat mencari berdasarkan kata dari isinya.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Proyek" value={doc.projectPhase?.project?.name} />
          <Field label="Fase" value={phaseMeta?.label ?? doc.projectPhase?.phase} />
          <Field label="Jenis Dokumen" value={doc.documentTypeMaster?.name ?? "—"} />
          {doc.viewerRole === "TEAM_LEADER" ? (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Visibilitas</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Secara default hanya dapat diakses oleh Team Leader dan Engineer. Berikan akses tambahan kepada:
              </p>
              <div className="mt-2 flex flex-wrap gap-4">
                {(() => {
                  const flags = visibilityToFlags(doc.visibility as DocumentVisibility);
                  return (
                    <>
                      <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
                        <Switch checked={flags.auditor} onCheckedChange={(v) => setVisibilityFlags(v, flags.client)} />
                        Auditor
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
                        <Switch checked={flags.client} onCheckedChange={(v) => setVisibilityFlags(flags.auditor, v)} />
                        Klien
                      </label>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <Field label="Visibilitas" value={DOCUMENT_VISIBILITY_LABELS[doc.visibility as DocumentVisibility] ?? doc.visibility} />
          )}
          <Field label="Diupload oleh" value={doc.uploadedBy?.name} />
          <Field label="Direview oleh" value={doc.reviewedBy?.name ?? "—"} />
          {doc.description && <Field label="Deskripsi" value={doc.description} span />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Status Versi Aktif</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {currentVersion ? (
            <VersionStatusBadge
              documentId={documentId}
              status={currentVersion.status ?? "DRAFT"}
              canChange={canChangeStatus}
              onChanged={load}
            />
          ) : (
            <span className="text-xs text-gray-400">Belum ada versi</span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tag</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <TagInput
            tags={(doc.tags ?? []).map((dt: any) => ({ id: dt.tag.id, name: dt.tag.name }))}
            onAdd={addTag}
            onRemove={removeTag}
            readOnly={!canTag}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-gray-400" /> Informasi Retensi
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Periode Retensi" value={doc.documentTypeMaster?.retentionPeriodYears ? `${doc.documentTypeMaster.retentionPeriodYears} tahun` : "Tidak ditentukan"} />
          <Field label="Pemicu Retensi" value={doc.documentTypeMaster?.retentionTrigger ? RETENTION_TRIGGER_LABELS[doc.documentTypeMaster.retentionTrigger] ?? doc.documentTypeMaster.retentionTrigger : "—"} />
          <Field label="Tanggal Batas Retensi" value={doc.retentionUntil ? formatDate(doc.retentionUntil) : "Disimpan tanpa batas waktu"} />
          <Field label="Status Penahanan (Legal Hold)" value={doc.legalHold ? "Ditahan — tidak boleh dihapus" : "Tidak ditahan"} />
          <p className="text-xs text-gray-400 sm:col-span-2 pt-1 border-t border-gray-100">
            Pemusnahan dokumen tidak diotomasi oleh sistem — tanggal di atas hanya sebagai acuan.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Riwayat Versi</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {(doc.versions ?? []).map((v: any) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">v{v.versionNumber}</span>
                  <span className="font-mono text-xs text-gray-400">{doc.documentCode}</span>
                  {v.isCurrent && <Badge variant="info" className="text-xs">Terkini</Badge>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {v.createdBy?.name} · {formatDate(v.createdAt)}
                  {v.approvedBy?.name && <> · Disetujui oleh {v.approvedBy.name}</>}
                </p>
                {v.changeNotes && <p className="text-xs text-gray-400 mt-0.5">{v.changeNotes}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{VERSION_STATUS_LABELS[v.status] ?? v.status}</span>
                {v.filePath && (
                  <a href={v.filePath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <ExternalLink className="h-3 w-3" /> Buka
                  </a>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, span }: { label: string; value?: string | null; span?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value || "—"}</p>
    </div>
  );
}
