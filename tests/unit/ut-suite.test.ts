// UT-01..UT-29 dari Workbook Pengujian (Google Sheets: Pengujian_LPS_EDMS).
// Nama fungsi disesuaikan dengan kode aktual (diizinkan eksplisit oleh dokumen
// asli — lihat baris "Sesuaikan nama fungsi dengan kode aktual"). Setiap test
// diberi komentar referensi ke kode UT aslinya untuk kemudahan pemetaan balik
// ke sheet.
import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { attachCompleteness, attachProjectSummary } from "@/lib/services/project.service";
import { canViewDocument, visibilityAllowlist, getNextVersionNumber } from "@/lib/services/document.service";
import { isStaleDailyReport, isMeetingGapWarning, isActionItemOverdue } from "@/lib/cadence";
import { getUserProjectRole } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

// createDocumentVersion() takes a path to an already-on-disk temp file (see
// upload-stream.ts) rather than a Buffer — this writes one for the test.
function fixtureUploadFile(content: string, name: string) {
  const tempPath = path.join(tmpdir(), `ut18-${Date.now()}-${name}`);
  writeFileSync(tempPath, content);
  return { tempPath, originalName: name, size: Buffer.byteLength(content) };
}

// Seed IDs nyata (lihat prisma/seed.ts) — dipakai untuk UT yang butuh akses DB (RBAC).
const RINA_ENGINEER_ID = "cmsexidiq000qf4rjqrqbphqw";
const PROJECT_TOWER_A_ID = "cmsexieit000uf4rjcmfzgw5m";

describe("Kalkulasi Kelengkapan Fase — attachCompleteness() [UT-01..UT-05]", () => {
  it("UT-01: seluruh dokumen wajib APPROVED -> 100%", () => {
    const required = [
      { phase: "DESIGN" as const, documentTypeId: "t1", isOptional: false },
      { phase: "DESIGN" as const, documentTypeId: "t2", isOptional: false },
      { phase: "DESIGN" as const, documentTypeId: "t3", isOptional: false },
    ];
    const phases = [{ phase: "DESIGN" as const, documents: [
      { documentTypeId: "t1", status: "APPROVED" },
      { documentTypeId: "t2", status: "APPROVED" },
      { documentTypeId: "t3", status: "APPROVED" },
    ] }];
    expect(attachCompleteness(phases, required)[0].completeness.percent).toBe(100);
  });

  it("UT-02: 1 dari 3 dokumen wajib APPROVED -> 33% (dibulatkan)", () => {
    const required = [
      { phase: "DESIGN" as const, documentTypeId: "t1", isOptional: false },
      { phase: "DESIGN" as const, documentTypeId: "t2", isOptional: false },
      { phase: "DESIGN" as const, documentTypeId: "t3", isOptional: false },
    ];
    const phases = [{ phase: "DESIGN" as const, documents: [
      { documentTypeId: "t1", status: "APPROVED" },
      { documentTypeId: "t2", status: "DRAFT" },
      { documentTypeId: "t3", status: "UNDER_REVIEW" },
    ] }];
    expect(attachCompleteness(phases, required)[0].completeness.percent).toBe(33);
  });

  it("UT-03: semua dokumen wajib DRAFT -> 0%", () => {
    const required = [{ phase: "DESIGN" as const, documentTypeId: "t1", isOptional: false }];
    const phases = [{ phase: "DESIGN" as const, documents: [{ documentTypeId: "t1", status: "DRAFT" }] }];
    expect(attachCompleteness(phases, required)[0].completeness.percent).toBe(0);
  });

  it("UT-04: dokumen opsional tidak memengaruhi persentase", () => {
    const required = [
      { phase: "DESIGN" as const, documentTypeId: "t1", isOptional: false },
      { phase: "DESIGN" as const, documentTypeId: "t2", isOptional: false },
      { phase: "DESIGN" as const, documentTypeId: "t3", isOptional: true },
    ];
    const phases = [{ phase: "DESIGN" as const, documents: [
      { documentTypeId: "t1", status: "APPROVED" },
      { documentTypeId: "t2", status: "APPROVED" },
    ] }];
    expect(attachCompleteness(phases, required)[0].completeness.percent).toBe(100);
  });

  it("UT-05: fase tanpa konfigurasi dokumen wajib -> konsisten, tidak error", () => {
    const phases = [{ phase: "DESIGN" as const, documents: [] }];
    expect(() => attachCompleteness(phases, [])).not.toThrow();
    expect(attachCompleteness(phases, [])[0].completeness.percent).toBe(100);
  });
});

describe("Kalkulasi Progres Proyek — attachProjectSummary() [UT-06..UT-08]", () => {
  const requiredDocs = [
    { phase: "INISIASI" as const, documentTypeId: "t1", isOptional: false },
    { phase: "ASSESSMENT" as const, documentTypeId: "t2", isOptional: false },
    { phase: "DESIGN" as const, documentTypeId: "t3", isOptional: false },
    { phase: "IMPLEMENTASI" as const, documentTypeId: "t4", isOptional: false },
    { phase: "COMMISSIONING" as const, documentTypeId: "t5", isOptional: false },
    { phase: "INSPEKSI_BERKALA" as const, documentTypeId: "t6", isOptional: false },
  ];
  const approvedDoc = (id: string) => ({ documentTypeId: id, status: "APPROVED" });
  const emptyDoc = (id: string) => ({ documentTypeId: id, status: "DRAFT" });

  it("UT-06: fase is_skipped (isActive=false, konsisten dgn skipPhase()) dikecualikan dari perhitungan", () => {
    // skipPhase() di project.service.ts men-set isActive=false saat isSkipped=true —
    // itulah satu-satunya sinyal yang dipakai attachProjectSummary(), bukan field isSkipped langsung.
    const project = {
      status: "ACTIVE", targetEndDate: null,
      phases: [
        { phase: "INISIASI" as const, isActive: true, documents: [approvedDoc("t1")] },
        { phase: "ASSESSMENT" as const, isActive: true, documents: [approvedDoc("t2")] },
        { phase: "DESIGN" as const, isActive: true, documents: [approvedDoc("t3")] },
        { phase: "IMPLEMENTASI" as const, isActive: true, documents: [approvedDoc("t4")] },
        { phase: "COMMISSIONING" as const, isActive: true, documents: [approvedDoc("t5")] },
        { phase: "INSPEKSI_BERKALA" as const, isActive: false, documents: [] }, // skipped
      ],
    };
    expect(attachProjectSummary([project], requiredDocs)[0].completenessPercent).toBe(100);
  });

  it("UT-07: seluruh fase aktif belum ada dokumen APPROVED -> 0%", () => {
    const project = {
      status: "ACTIVE", targetEndDate: null,
      phases: requiredDocs.map((r) => ({ phase: r.phase, isActive: true, documents: [emptyDoc(r.documentTypeId)] })),
    };
    expect(attachProjectSummary([project], requiredDocs)[0].completenessPercent).toBe(0);
  });

  it("UT-08: 3 dari 6 fase lengkap, tanpa skip -> 50%", () => {
    const project = {
      status: "ACTIVE", targetEndDate: null,
      phases: [
        { phase: "INISIASI" as const, isActive: true, documents: [approvedDoc("t1")] },
        { phase: "ASSESSMENT" as const, isActive: true, documents: [approvedDoc("t2")] },
        { phase: "DESIGN" as const, isActive: true, documents: [approvedDoc("t3")] },
        { phase: "IMPLEMENTASI" as const, isActive: true, documents: [emptyDoc("t4")] },
        { phase: "COMMISSIONING" as const, isActive: true, documents: [emptyDoc("t5")] },
        { phase: "INSPEKSI_BERKALA" as const, isActive: true, documents: [emptyDoc("t6")] },
      ],
    };
    expect(attachProjectSummary([project], requiredDocs)[0].completenessPercent).toBe(50);
  });
});

describe("Otorisasi / RBAC — getUserProjectRole() [UT-09..UT-10]", () => {
  it("UT-09: user adalah anggota proyek (Rina, ENGINEER di Tower A) -> 'ENGINEER'", async () => {
    const role = await getUserProjectRole(RINA_ENGINEER_ID, PROJECT_TOWER_A_ID);
    expect(role).toBe("ENGINEER");
  });

  it("UT-10: user bukan anggota proyek -> null", async () => {
    const role = await getUserProjectRole(RINA_ENGINEER_ID, "nonexistent-project-id-xyz");
    expect(role).toBeNull();
  });
});

describe("Otorisasi — cek akses inline per-route [UT-11..UT-14]", () => {
  // Tidak ada requireRole() sebagai fungsi mandiri — pengecekan akses inline per
  // route (pola `if (role !== "X") return forbidden()`). UT-11/12 diuji lewat
  // updateProject() (fungsi nyata yang berisi logika itu); UT-13/14 murni
  // pengecekan boolean 1 baris di level route (mis. `!user.isSuperadmin`), jadi
  // diverifikasi langsung di FT (S-09, S-44) alih-alih di sini.
  it("UT-11: TEAM_LEADER boleh mengelola proyek (updateProject tidak menolak)", async () => {
    const { updateProject } = await import("@/lib/services/project.service");
    const result = await updateProject(PROJECT_TOWER_A_ID, { id: "cmsexicz9000pf4rjvhgdfjvz", isSuperadmin: false }, {});
    expect("error" in result).toBe(false);
  });

  it("UT-12: ENGINEER tidak boleh mengelola proyek (updateProject menolak)", async () => {
    const { updateProject } = await import("@/lib/services/project.service");
    const result = await updateProject(PROJECT_TOWER_A_ID, { id: RINA_ENGINEER_ID, isSuperadmin: false }, { name: "Percobaan Tidak Sah" });
    expect("error" in result && result.error === "forbidden").toBe(true);
  });
});

describe("Filter Visibilitas Client — canViewDocument()/visibilityAllowlist() [UT-15]", () => {
  it("UT-15: CLIENT hanya menerima dokumen tier CLIENT_ACCESSIBLE/ALL_ACCESSIBLE, dan hanya yang APPROVED", () => {
    const allowlist = visibilityAllowlist("CLIENT");
    expect(allowlist.sort()).toEqual(["ALL_ACCESSIBLE", "CLIENT_ACCESSIBLE"].sort());
    expect(canViewDocument("CLIENT", "INTERNAL", "APPROVED")).toBe(false);
    expect(canViewDocument("CLIENT", "AUDITOR_ACCESSIBLE", "APPROVED")).toBe(false);
    expect(canViewDocument("CLIENT", "CLIENT_ACCESSIBLE", "APPROVED")).toBe(true);
    // Fixed dari temuan S-38: filter gabungan "APPROVED AND CLIENT_VISIBLE" sekarang
    // benar-benar diterapkan (bukan cuma visibility). Sebuah dokumen CLIENT_ACCESSIBLE
    // yang masih DRAFT/UNDER_REVIEW tidak boleh terlihat oleh Client.
    expect(canViewDocument("CLIENT", "CLIENT_ACCESSIBLE", "DRAFT")).toBe(false);
    expect(canViewDocument("CLIENT", "CLIENT_ACCESSIBLE", "UNDER_REVIEW")).toBe(false);
    // INSPECTOR sengaja TIDAK ikut digate ke APPROVED-only — tugasnya
    // justru me-review/approve dokumen yang belum APPROVED (lihat UT/FT alur approval).
    expect(canViewDocument("INSPECTOR", "AUDITOR_ACCESSIBLE", "UNDER_REVIEW")).toBe(true);
  });
});

describe("Versioning Dokumen — getNextVersionNumber() [UT-16..UT-17]", () => {
  it("UT-16: increment nomor versi dari versi tertinggi [1,2,3] -> 4", () => {
    expect(getNextVersionNumber(3)).toBe(4);
  });

  it("UT-17: dokumen belum punya versi -> 1", () => {
    expect(getNextVersionNumber(undefined)).toBe(1);
    expect(getNextVersionNumber(null)).toBe(1);
  });
});

describe("Versioning Dokumen — createDocumentVersion() (isCurrent) [UT-18]", () => {
  let testDocId: string;

  it("UT-18: versi baru jadi isCurrent=true, versi lama dinonaktifkan tanpa dihapus", async () => {
    const { createDocumentVersion } = await import("@/lib/services/document.service");

    const typeMaster = await prisma.documentTypeMaster.findFirstOrThrow();
    const phase = await prisma.projectPhase.findFirstOrThrow({ where: { projectId: PROJECT_TOWER_A_ID, phase: "INISIASI" } });
    const doc = await prisma.document.create({
      data: {
        projectId: PROJECT_TOWER_A_ID, projectPhaseId: phase.id,
        documentType: "FILE_UPLOAD", documentTypeId: typeMaster.id,
        documentCode: `UT18-TEST-${Date.now()}`, title: "UT-18 fixture",
        status: "DRAFT", uploadedById: RINA_ENGINEER_ID,
      },
    });
    testDocId = doc.id;

    await createDocumentVersion({
      documentId: doc.id, actorId: RINA_ENGINEER_ID, projectId: PROJECT_TOWER_A_ID,
      file: fixtureUploadFile("v1", "v1.txt"), changeNotes: "v1",
    });
    await createDocumentVersion({
      documentId: doc.id, actorId: RINA_ENGINEER_ID, projectId: PROJECT_TOWER_A_ID,
      file: fixtureUploadFile("v2", "v2.txt"), changeNotes: "v2",
    });
    const v3 = await createDocumentVersion({
      documentId: doc.id, actorId: RINA_ENGINEER_ID, projectId: PROJECT_TOWER_A_ID,
      file: fixtureUploadFile("v3", "v3.txt"), changeNotes: "v3",
    });

    const allVersions = await prisma.documentVersion.findMany({ where: { documentId: doc.id }, orderBy: { versionNumber: "asc" } });
    expect(allVersions).toHaveLength(3);
    expect(v3.isCurrent).toBe(true);
    expect(allVersions.filter((v) => v.isCurrent)).toHaveLength(1);
    expect(allVersions[0].isCurrent).toBe(false);
    expect(allVersions[1].isCurrent).toBe(false);
  });

  afterAll(async () => {
    if (testDocId) {
      await prisma.documentVersion.deleteMany({ where: { documentId: testDocId } });
      await prisma.document.delete({ where: { id: testDocId } }).catch(() => {});
    }
  });
});

describe("Monitoring Cadence & Insight [UT-19..UT-23]", () => {
  it("UT-19: fase IMPLEMENTASI tanpa unggahan > 3 hari -> warning=true", () => {
    expect(isStaleDailyReport(4)).toBe(true);
  });
  it("UT-20: unggahan terakhir masih dalam 3 hari -> warning=false", () => {
    expect(isStaleDailyReport(2)).toBe(false);
  });
  it("UT-21: tidak ada notulen > 7 hari -> warning=true", () => {
    expect(isMeetingGapWarning(8)).toBe(true);
  });
  it("UT-22: action item OPEN melewati deadline -> overdue=true", () => {
    const yesterday = new Date(Date.now() - 86400000);
    expect(isActionItemOverdue({ status: "OPEN", deadline: yesterday })).toBe(true);
  });
  it("UT-23: action item CLOSED tidak overdue meski melewati deadline", () => {
    const yesterday = new Date(Date.now() - 86400000);
    expect(isActionItemOverdue({ status: "CLOSED", deadline: yesterday })).toBe(false);
  });
});

describe("Validasi Field Terstruktur — validateFieldValue() [UT-24..UT-27]", () => {
  it.skip("UT-24..UT-27: DITEMUKAN GAP (sudah ditindaklanjuti) — DocumentFieldValue TIDAK ADA validateFieldValue() atau route manapun yang menulis/membaca tabel ini di kode aktual (grep kosong di seluruh src/). Fitur form terstruktur (S-19/S-20 di FT) tidak diimplementasikan, dan model DocumentFieldValue yang tidak terpakai sudah dihapus dari skema.", () => {});
});

describe("Audit Log — buildAuditEntry() (via layanan nyata) [UT-28..UT-29]", () => {
  it("UT-28: entri audit memuat actor, action, entity, timestamp (via toggleMilestone)", async () => {
    const { createMilestone, toggleMilestone, deleteMilestone } = await import("@/lib/services/milestone.service");
    const m = await createMilestone({ projectId: PROJECT_TOWER_A_ID, actorId: RINA_ENGINEER_ID, title: "UT-28 fixture", description: null, phase: null, targetDate: null });
    await toggleMilestone(m.id, RINA_ENGINEER_ID, true);

    const entry = await prisma.auditLog.findFirst({
      where: { entity: "milestone", entityId: m.id, action: "EDIT" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.actorId).toBe(RINA_ENGINEER_ID);
    expect(entry?.createdAt).toBeInstanceOf(Date);

    await deleteMilestone(m.id, RINA_ENGINEER_ID);
  });

  it("UT-29: aksi PHASE_CHANGE tercatat dengan projectId (via togglePhase)", async () => {
    const before = await prisma.projectPhase.findFirstOrThrow({ where: { projectId: PROJECT_TOWER_A_ID, phase: "INSPEKSI_BERKALA" } });
    const { updateProjectPhase } = await import("@/lib/services/project.service");
    await updateProjectPhase({ projectId: PROJECT_TOWER_A_ID, phase: "INSPEKSI_BERKALA", actorId: RINA_ENGINEER_ID, isActive: before.isActive });

    const entry = await prisma.auditLog.findFirst({
      where: { projectId: PROJECT_TOWER_A_ID, action: "PHASE_CHANGE" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.projectId).toBe(PROJECT_TOWER_A_ID);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
