import { prisma } from "@/lib/prisma";
import type { LpsPhase } from "@prisma/client";

// 3 huruf per fase, dipilih supaya tidak bentrok satu sama lain MAUPUN dengan
// kata umum Bahasa Indonesia yang bisa bikin kode terbaca aneh di sekilas mata
// (mis. singkatan literal INISIASI -> "INI" terbaca sebagai kata "ini", bukan
// nama fase — makanya dipakai "AWL" dari "Awal" alih-alih singkatan literal).
const PHASE_CODE: Record<LpsPhase, string> = {
  INISIASI: "AWL",
  ASSESSMENT: "ASM",
  DESIGN: "DES",
  IMPLEMENTASI: "IMP",
  COMMISSIONING: "CMS",
  INSPEKSI_BERKALA: "INS",
};

/**
 * Melempar error (bukan menghasilkan kode cacat seperti tanda hubung ganda
 * atau literal "undefined") kalau salah satu komponen kosong/tidak dikenal —
 * temuan UT-38. Tidak pernah tereksekusi lewat alur upload normal (projectCode
 * dijamin ada oleh findUniqueOrThrow di generateDocumentCode(), phase dijamin
 * enum Prisma, typeCode dijamin NOT NULL+UNIQUE dari DocumentTypeMaster) —
 * murni pengaman kalau fungsi ini dipakai ulang di konteks lain tanpa jaminan yang sama.
 */
export function buildCodePrefix(projectCode: string, phase: LpsPhase, typeCode: string) {
  if (!projectCode) throw new Error("buildCodePrefix: projectCode tidak boleh kosong");
  if (!typeCode) throw new Error("buildCodePrefix: typeCode tidak boleh kosong");
  const phaseCode = PHASE_CODE[phase];
  if (!phaseCode) throw new Error(`buildCodePrefix: fase tidak dikenal: "${phase}"`);
  return `${projectCode}-${phaseCode}-${typeCode}-`;
}

/** Derives a 3-letter project code from a project name's initials, e.g. "LPS Gedung Mewah Tower A" -> "LGM". */
export function deriveProjectCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let letters = words.map((w) => w[0]!.toUpperCase()).join("");
  if (letters.length < 3) letters = (name.replace(/\s+/g, "").toUpperCase() + "XXX").slice(0, 3);
  return letters.slice(0, 3);
}

/**
 * Pure: derives the next sequence number for a code prefix from the full list
 * of existing document codes sharing that prefix — highest existing sequence
 * + 1 (not existingCodes.length + 1, so a deleted middle entry never causes a
 * collision). Extracted from generateDocumentCode() so this part of the logic
 * is unit-testable without a database.
 */
export function nextSequenceForPrefix(existingCodesWithPrefix: string[], prefix: string): number {
  const maxSeq = existingCodesWithPrefix.reduce((max, code) => {
    const seq = parseInt(code.slice(prefix.length), 10);
    return Number.isNaN(seq) ? max : Math.max(max, seq);
  }, 0);
  return maxSeq + 1;
}

/** Pure: zero-pads a sequence number to 3 digits (1 -> "001", 42 -> "042"). */
export function formatSequence(seq: number): string {
  return seq.toString().padStart(3, "0");
}

/**
 * Generates the next sequential document code for a project+phase+type combination.
 * Race conditions in the sequence number are handled with a serializable transaction
 * plus retry-on-conflict — two concurrent uploads to the same project/phase/type
 * will not receive the same number.
 */
export async function generateDocumentCode(projectId: string, phase: LpsPhase, typeCode: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!project.projectCode) throw new Error("Proyek belum memiliki project_code");
  const prefix = buildCodePrefix(project.projectCode, phase, typeCode);

  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.document.findMany({
            where: { documentCode: { startsWith: prefix } },
            select: { documentCode: true },
          });
          const seq = nextSequenceForPrefix(existing.map((d) => d.documentCode!), prefix);
          return `${prefix}${formatSequence(seq)}`;
        },
        { isolationLevel: "Serializable" }
      );
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      // Serialization failure (concurrent write to the same prefix) — retry with a fresh read.
    }
  }
  throw new Error("Gagal membangkitkan kode dokumen setelah beberapa percobaan");
}
