import type { DocumentStatus } from "@prisma/client";

// Diekstrak dari src/app/api/documents/[id]/approve/route.ts (sebelumnya
// didefinisikan inline di file route itu) supaya bisa diuji sebagai unit test
// murni tanpa memuat runtime Next.js/Prisma. Tidak ada perubahan nilai/logika —
// isinya identik dengan definisi lama.
//
// Alur: DRAFT -> UNDER_REVIEW -> APPROVED -> ARCHIVED. "submit" memindahkan
// DRAFT langsung ke UNDER_REVIEW (tidak ada status SUBMITTED terpisah lagi).
// REVISION_REQUESTED dan REJECTED sama-sama kembali lewat "submit" setelah
// diperbaiki — bedanya di makna: revisi = arahnya sudah benar tinggal
// diperbaiki, ditolak = perlu ditinjau ulang dari awal.
export const VALID_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  DRAFT: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "REVISION_REQUESTED", "REJECTED"],
  APPROVED: ["ARCHIVED"],
  REVISION_REQUESTED: ["UNDER_REVIEW"],
  REJECTED: ["UNDER_REVIEW"],
  ARCHIVED: [],
};

export const ACTION_MAP: Record<string, DocumentStatus> = {
  submit: "UNDER_REVIEW",
  approve: "APPROVED",
  revise: "REVISION_REQUESTED",
  reject: "REJECTED",
  archive: "ARCHIVED",
};

export const STATUS_LABEL_ID: Record<DocumentStatus, string> = {
  DRAFT: "Draft",
  UNDER_REVIEW: "Sedang Direview",
  APPROVED: "Disetujui",
  REVISION_REQUESTED: "Perlu Revisi",
  REJECTED: "Ditolak",
  ARCHIVED: "Diarsipkan",
};

/**
 * Aman terhadap status di luar 6 nilai enum DocumentStatus (mis. data lama/korup)
 * — mengembalikan false alih-alih melempar TypeError seperti akses langsung
 * `VALID_TRANSITIONS[from].includes(to)` (temuan UT-33). doc.status yang datang
 * dari database selalu salah satu dari 6 nilai enum yang sah, jadi ini tidak
 * pernah tereksekusi lewat API manapun — murni pengaman.
 */
export function isValidTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS as Record<string, DocumentStatus[]>)[from]?.includes(to as DocumentStatus) ?? false;
}
