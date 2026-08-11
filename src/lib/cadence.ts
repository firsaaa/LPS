// Pure cadence-detection helpers — extracted out of dashboard.service.ts so they
// can be unit-tested in isolation (no DB/Prisma access needed). Thresholds must
// stay in sync with the inline insight messages in getProjectDashboard().

/** Fase Implementasi butuh laporan harian — dianggap basi bila tidak ada unggahan >= 3 hari. */
export function isStaleDailyReport(daysSinceUpload: number | null): boolean {
  return daysSinceUpload !== null && daysSinceUpload >= 3;
}

/** Proyek aktif tanpa notulen rapat >= 7 hari dianggap ada jeda rapat. */
export function isMeetingGapWarning(daysSinceNotulen: number | null): boolean {
  return daysSinceNotulen !== null && daysSinceNotulen >= 7;
}

/** Action item OPEN dengan deadline yang sudah lewat dianggap overdue; CLOSED tidak pernah overdue. */
export function isActionItemOverdue(item: { status: string; deadline: Date | string | null }): boolean {
  if (item.status !== "OPEN" || !item.deadline) return false;
  return new Date(item.deadline) < new Date();
}
