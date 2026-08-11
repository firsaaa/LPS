import type {
  Role,
  ProjectStatus,
  LpsPhase,
  DocumentStatus,
  DocumentVisibility,
  DocumentType,
  AuditAction,
} from "@prisma/client";

export type {
  Role,
  ProjectStatus,
  LpsPhase,
  DocumentStatus,
  DocumentVisibility,
  DocumentType,
  AuditAction,
};

/** Project-scoped roles assignable via UserRole with a non-null projectId. */
export type ProjectRole = Extract<Role, "TEAM_LEADER" | "ENGINEER" | "CLIENT">;

/** Global-scope roles assignable via UserRole with projectId = NULL. */
export type GlobalRole = Extract<Role, "SUPERADMIN" | "INSPECTOR">;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  isSuperadmin: boolean;
  isGlobalInspector: boolean;
  canLeadProject: boolean;
}

export const LPS_PHASES: { phase: LpsPhase; label: string; order: number }[] = [
  { phase: "INISIASI", label: "Inisiasi", order: 1 },
  { phase: "ASSESSMENT", label: "Assessment", order: 2 },
  { phase: "DESIGN", label: "Desain", order: 3 },
  { phase: "IMPLEMENTASI", label: "Implementasi", order: 4 },
  { phase: "COMMISSIONING", label: "Commissioning", order: 5 },
  { phase: "INSPEKSI_BERKALA", label: "Inspeksi Berkala", order: 6 },
];

/** Roles assignable to a specific project (INSPECTOR is global-only, see GLOBAL_ROLE_LABELS). */
export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  TEAM_LEADER: "Team Leader",
  ENGINEER: "Engineer",
  CLIENT: "Client",
};

/** Roles with project_id = NULL in user_roles — apply across all projects. */
export const GLOBAL_ROLE_LABELS: Record<GlobalRole, string> = {
  SUPERADMIN: "Super Admin",
  INSPECTOR: "Inspector",
};

/** Display label for a session user's global-scope role, or undefined if none. */
export function getGlobalRoleLabel(user: { isSuperadmin: boolean; isGlobalInspector: boolean }): string | undefined {
  if (user.isSuperadmin) return GLOBAL_ROLE_LABELS.SUPERADMIN;
  if (user.isGlobalInspector) return GLOBAL_ROLE_LABELS.INSPECTOR;
  return undefined;
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Super Admin",
  TEAM_LEADER: "Team Leader",
  ENGINEER: "Engineer",
  INSPECTOR: "Inspector",
  CLIENT: "Client",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Perencanaan",
  ACTIVE: "Aktif",
  DELAYED: "Terlambat",
  COMPLETED: "Selesai",
  ARCHIVED: "Diarsipkan",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: "Draft",
  UNDER_REVIEW: "Sedang Direview",
  APPROVED: "Disetujui",
  REVISION_REQUESTED: "Perlu Revisi",
  REJECTED: "Ditolak",
  ARCHIVED: "Diarsipkan",
};

export const DOCUMENT_STATUS_VARIANT: Record<DocumentStatus, "secondary" | "info" | "success" | "warning" | "destructive"> = {
  DRAFT: "secondary",
  UNDER_REVIEW: "info",
  APPROVED: "success",
  REVISION_REQUESTED: "warning",
  REJECTED: "destructive",
  ARCHIVED: "secondary",
};

// Dokumen otomatis "Internal" (Team Leader + Engineer) saat diupload; Team
// Leader lalu bisa menyalakan dua toggle independen (Auditor, Client) untuk
// menambah akses — bukan memilih dari daftar bertingkat. Label di bawah ini
// hanya dipakai untuk MENAMPILKAN hasil akhir kombinasi keduanya (mis. di
// halaman auditor), bukan untuk UI pemilihan itu sendiri.
export const DOCUMENT_VISIBILITY_LABELS: Record<DocumentVisibility, string> = {
  INTERNAL: "Internal",
  AUDITOR_ACCESSIBLE: "Internal + Auditor",
  CLIENT_ACCESSIBLE: "Internal + Klien",
  ALL_ACCESSIBLE: "Semua Pihak",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  LAPORAN_ASSESSMENT_RISIKO: "Laporan Assessment Risiko",
  LOG_COMMISSIONING: "Log Commissioning",
  LAPORAN_INSPEKSI_BERKALA: "Laporan Inspeksi Berkala",
  FILE_UPLOAD: "File Upload",
};

// Extension-based (not MIME-based) — browsers/OSes frequently report an empty
// or generic MIME type for CAD formats (.dwg, .catpart, …), so `file.type`
// can't be trusted for this allowlist. Checked both client-side (the upload
// dialog's `accept` attribute) and server-side (actual enforcement — the
// client-side check alone is trivially bypassed).
export const ALLOWED_UPLOAD_EXTENSIONS = [
  // Dokumen
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  // Gambar
  "jpg", "jpeg", "png", "gif", "webp",
  // Gambar teknik / CAD
  "dwg", "dxf", "skp", "psd", "ai", "svg",
  // CATIA (native) + format pertukaran netral yang umum menyertainya
  "catpart", "catproduct", "catdrawing", "step", "stp", "iges", "igs",
  // Arsip
  "zip", "rar",
];

// 50MB was too tight for real LPS deliverables — a single CATIA assembly
// (.catproduct) or an as-built drawing with embedded raster scans routinely
// lands well above that. 200MB comfortably covers those while still keeping
// a ceiling (uploads are stored on local disk, not object storage).
export const MAX_UPLOAD_SIZE_BYTES = 200 * 1024 * 1024; // 200MB
