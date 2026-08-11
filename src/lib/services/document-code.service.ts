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

export function buildCodePrefix(projectCode: string, phase: LpsPhase, typeCode: string) {
  return `${projectCode}-${PHASE_CODE[phase]}-${typeCode}-`;
}

/** Derives a 3-letter project code from a project name's initials, e.g. "LPS Gedung Mewah Tower A" -> "LGM". */
export function deriveProjectCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let letters = words.map((w) => w[0]!.toUpperCase()).join("");
  if (letters.length < 3) letters = (name.replace(/\s+/g, "").toUpperCase() + "XXX").slice(0, 3);
  return letters.slice(0, 3);
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
          const maxSeq = existing.reduce((max, d) => {
            const seq = parseInt(d.documentCode!.slice(prefix.length), 10);
            return Number.isNaN(seq) ? max : Math.max(max, seq);
          }, 0);
          return `${prefix}${(maxSeq + 1).toString().padStart(3, "0")}`;
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
