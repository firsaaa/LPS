import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("📝 Adding notulen & action items to demo projects...\n");

  const budi  = await prisma.user.findUniqueOrThrow({ where: { email: "budi.leader@lps-edms.com" } });
  const rina  = await prisma.user.findUniqueOrThrow({ where: { email: "rina.engineer@lps-edms.com" } });
  const dhani = await prisma.user.findUniqueOrThrow({ where: { email: "dhani.inspector@lps-edms.com" } });

  // ─── Apartemen Skyline Jakarta ───────────────────────────────────────────────
  {
    const p = await prisma.project.findFirst({ where: { name: "Apartemen Skyline Jakarta" } });
    if (!p) { console.log("⚠ Apartemen Skyline tidak ditemukan, skip."); }
    else {
      const existing = await prisma.notulen.count({ where: { projectId: p.id } });
      if (existing > 0) {
        console.log(`ℹ Skyline sudah punya ${existing} notulen, skip.`);
      } else {
        // 1. Kick-off meeting
        const n1 = await prisma.notulen.create({ data: {
          projectId: p.id, createdById: budi.id,
          title: "Kick-off Meeting Proyek LPS Apartemen Skyline Jakarta",
          meetingDate: new Date("2025-03-05"),
          location: "Ruang Rapat Skyline Tower, Lt. 2",
          attendees: "Budi Santoso (Team Leader), Rina Wulandari (Engineer), Ahmad Yani (Klien), Dhani Pratama (Inspector)",
          discussion: "Pembahasan ruang lingkup proyek LPS untuk 32 lantai, jadwal pelaksanaan, dan pembagian tugas tim. Klien menyampaikan kebutuhan khusus untuk lantai basement. Disepakati bahwa assessment risiko dimulai minggu depan.",
        }});
        await prisma.actionItem.createMany({ data: [
          {
            notulenId: n1.id, assignedToId: rina.id,
            description: "Lakukan site survey dan kumpulkan data teknis bangunan (luas, tinggi, material atap)",
            deadline: new Date("2025-03-12"), status: "CLOSED",
            closedAt: new Date("2025-03-11"),
            closedNote: "Site survey selesai, data dikumpulkan dan didokumentasikan.",
          },
          {
            notulenId: n1.id, assignedToId: budi.id,
            description: "Kirim draft jadwal proyek ke klien untuk konfirmasi",
            deadline: new Date("2025-03-10"), status: "CLOSED",
            closedAt: new Date("2025-03-09"),
            closedNote: "Jadwal sudah dikirim dan dikonfirmasi klien via email.",
          },
          {
            notulenId: n1.id, assignedToId: dhani.id,
            description: "Siapkan form checklist inspeksi awal",
            deadline: new Date("2025-03-15"), status: "CLOSED",
            closedAt: new Date("2025-03-14"),
            closedNote: "Form checklist sudah disiapkan dan dibagikan ke tim.",
          },
        ]});

        // 2. Design review meeting
        const n2 = await prisma.notulen.create({ data: {
          projectId: p.id, createdById: budi.id,
          title: "Rapat Review Desain LPS Skyline",
          meetingDate: new Date("2025-05-08"),
          location: "Online via Google Meet",
          attendees: "Budi Santoso (Team Leader), Rina Wulandari (Engineer), Dhani Pratama (Inspector)",
          discussion: "Review dokumen desain LPS yang sudah dibuat Rina. Ditemukan bahwa perhitungan rolling sphere perlu penyesuaian untuk area rooftop karena ada penambahan struktur antena. Grounding layout sudah sesuai standar IEC 62305. Desain disetujui setelah revisi minor.",
        }});
        await prisma.actionItem.createMany({ data: [
          {
            notulenId: n2.id, assignedToId: rina.id,
            description: "Revisi perhitungan rolling sphere untuk area rooftop — sesuaikan dengan posisi antena baru",
            deadline: new Date("2025-05-11"), status: "CLOSED",
            closedAt: new Date("2025-05-10"),
            closedNote: "Perhitungan sudah direvisi dan diupload ulang versi terbaru.",
          },
          {
            notulenId: n2.id, assignedToId: dhani.id,
            description: "Validasi grounding layout dengan kondisi lapangan sebelum implementasi",
            deadline: new Date("2025-05-20"), status: "CLOSED",
            closedAt: new Date("2025-05-18"),
            closedNote: "Validasi lapangan selesai, tidak ada perbedaan signifikan.",
          },
        ]});

        // 3. Commissioning meeting
        const n3 = await prisma.notulen.create({ data: {
          projectId: p.id, createdById: budi.id,
          title: "Rapat Commissioning & Serah Terima LPS Skyline",
          meetingDate: new Date("2025-10-03"),
          location: "Ruang Rapat Skyline Tower, Lt. 2",
          attendees: "Budi Santoso (Team Leader), Rina Wulandari (Engineer), Dhani Pratama (Inspector), Ahmad Yani (Klien)",
          discussion: "Presentasi hasil pengujian commissioning kepada klien. Semua titik grounding menunjukkan tahanan di bawah 5 Ohm sesuai standar. Klien puas dengan hasil dan menyetujui serah terima. As-built drawing sudah sesuai kondisi aktual. Dokumen akhir diserahkan kepada klien.",
        }});
        await prisma.actionItem.createMany({ data: [
          {
            notulenId: n3.id, assignedToId: budi.id,
            description: "Serahkan bundle dokumen akhir proyek (kontrak, as-built, log commissioning) ke klien",
            deadline: new Date("2025-10-10"), status: "CLOSED",
            closedAt: new Date("2025-10-08"),
            closedNote: "Bundle dokumen sudah diserahkan dan ditandatangani klien.",
          },
          {
            notulenId: n3.id, assignedToId: dhani.id,
            description: "Jadwalkan inspeksi berkala pertama di bulan Desember 2025",
            deadline: new Date("2025-10-15"), status: "CLOSED",
            closedAt: new Date("2025-10-12"),
            closedNote: "Inspeksi berkala dijadwalkan 8 Desember 2025.",
          },
        ]});

        console.log(`✓ Apartemen Skyline Jakarta — 3 notulen, 7 action items (semua CLOSED)`);
      }
    }
  }

  // ─── Mall Bintang Utara — tambah 2 notulen lagi ─────────────────────────────
  {
    const p = await prisma.project.findFirst({ where: { name: "Mall Bintang Utara" } });
    if (!p) { console.log("⚠ Mall Bintang Utara tidak ditemukan, skip."); }
    else {
      const existing = await prisma.notulen.count({ where: { projectId: p.id } });
      if (existing >= 3) {
        console.log(`ℹ Mall Bintang Utara sudah punya ${existing} notulen, skip.`);
      } else {
        // Hapus yang sudah ada lalu buat ulang agar urutan tanggal benar
        if (existing > 0) {
          await prisma.notulen.deleteMany({ where: { projectId: p.id } });
        }

        // 1. Kick-off meeting
        const n1 = await prisma.notulen.create({ data: {
          projectId: p.id, createdById: budi.id,
          title: "Kick-off Meeting Proyek LPS Mall Bintang Utara",
          meetingDate: new Date("2026-02-05"),
          location: "Ruang Meeting PT Mitra Niaga Sejahtera",
          attendees: "Budi Santoso (Team Leader), Rina Wulandari (Engineer), Dhani Pratama (Inspector)",
          discussion: "Pembahasan awal proyek LPS untuk mall 5 lantai. Disepakati timeline: assessment selesai Maret, desain April, implementasi Mei–Juli, commissioning Agustus–Oktober. Kebutuhan khusus: sistem penangkal petir harus terintegrasi dengan sistem fire alarm yang sudah ada.",
        }});
        await prisma.actionItem.createMany({ data: [
          {
            notulenId: n1.id, assignedToId: rina.id,
            description: "Koordinasi dengan kontraktor fire alarm untuk skema integrasi sistem",
            deadline: new Date("2026-02-15"), status: "CLOSED",
            closedAt: new Date("2026-02-13"),
            closedNote: "Koordinasi selesai, didapat skema integrasi dari kontraktor fire alarm.",
          },
          {
            notulenId: n1.id, assignedToId: budi.id,
            description: "Ajukan proposal dan timeline ke manajemen PT Mitra Niaga Sejahtera",
            deadline: new Date("2026-02-12"), status: "CLOSED",
            closedAt: new Date("2026-02-11"),
            closedNote: "Proposal diterima dan disetujui manajemen.",
          },
        ]});

        // 2. Design review meeting
        const n2 = await prisma.notulen.create({ data: {
          projectId: p.id, createdById: budi.id,
          title: "Rapat Review Desain & Persiapan Implementasi Mall Bintang Utara",
          meetingDate: new Date("2026-04-20"),
          location: "Online via Zoom",
          attendees: "Budi Santoso (Team Leader), Rina Wulandari (Engineer), Dhani Pratama (Inspector)",
          discussion: "Semua dokumen desain sudah selesai dan disetujui. Pembahasan jadwal mobilisasi alat dan material untuk implementasi. Rina melaporkan kebutuhan material: kabel BC 50mm² sebanyak 120 meter, 6 titik pentanahan. Dhani akan mulai inspeksi lapangan paralel selama implementasi.",
        }});
        await prisma.actionItem.createMany({ data: [
          {
            notulenId: n2.id, assignedToId: rina.id,
            description: "Buat purchase order material (kabel BC, rod grounding, klem)",
            deadline: new Date("2026-04-25"), status: "CLOSED",
            closedAt: new Date("2026-04-24"),
            closedNote: "PO sudah dibuat dan material dijadwalkan tiba 30 April.",
          },
          {
            notulenId: n2.id, assignedToId: dhani.id,
            description: "Siapkan form inspeksi lapangan mingguan selama periode implementasi",
            deadline: new Date("2026-04-28"), status: "CLOSED",
            closedAt: new Date("2026-04-27"),
            closedNote: "Form inspeksi mingguan sudah disiapkan.",
          },
        ]});

        // 3. Commissioning progress meeting (sudah ada di demo sebelumnya, buat versi lengkap)
        const n3 = await prisma.notulen.create({ data: {
          projectId: p.id, createdById: budi.id,
          title: "Rapat Progres Commissioning Mall Bintang Utara",
          meetingDate: new Date("2026-07-10"),
          location: "Site Mall Bintang Utara, Bekasi",
          attendees: "Budi Santoso (Team Leader), Rina Wulandari (Engineer), Dhani Pratama (Inspector)",
          discussion: "Update progres commissioning: pengujian tahanan grounding sudah dilakukan di 4 dari 6 titik. Titik 3 dan 5 menunjukkan nilai >10 Ohm, perlu perbaikan. Log commissioning sedang dalam review. Rina diminta segera menyelesaikan as-built drawing. Dhani diminta upload checklist verifikasi setelah semua titik lulus uji.",
        }});
        await prisma.actionItem.createMany({ data: [
          {
            notulenId: n3.id, assignedToId: rina.id,
            description: "Selesaikan As-Built Drawing dan upload ke sistem sebelum 20 Juli",
            deadline: new Date("2026-07-20"), status: "OPEN",
          },
          {
            notulenId: n3.id, assignedToId: dhani.id,
            description: "Upload Checklist Verifikasi setelah semua titik grounding lulus uji",
            deadline: new Date("2026-07-18"), status: "OPEN",
          },
          {
            notulenId: n3.id, assignedToId: rina.id,
            description: "Perbaiki grounding titik 3 dan 5 — tambah kedalaman rod agar tahanan < 5 Ohm",
            deadline: new Date("2026-07-15"), status: "OPEN",
          },
        ]});

        console.log(`✓ Mall Bintang Utara — 3 notulen, 7 action items (2 CLOSED, 3 OPEN)`);
      }
    }
  }

  // ─── Gedung Dinas PU Bandung — kick-off meeting ──────────────────────────────
  {
    const p = await prisma.project.findFirst({ where: { name: "Gedung Dinas PU Bandung" } });
    if (!p) { console.log("⚠ Gedung Dinas PU Bandung tidak ditemukan, skip."); }
    else {
      const existing = await prisma.notulen.count({ where: { projectId: p.id } });
      if (existing > 0) {
        console.log(`ℹ Gedung Dinas PU sudah punya ${existing} notulen, skip.`);
      } else {
        const n1 = await prisma.notulen.create({ data: {
          projectId: p.id, createdById: budi.id,
          title: "Rapat Awal Proyek LPS Gedung Dinas PU Bandung",
          meetingDate: new Date("2026-07-03"),
          location: "Ruang Rapat Dinas PU Kota Bandung",
          attendees: "Budi Santoso (Team Leader), Rina Wulandari (Engineer), Perwakilan Dinas PU (2 orang)",
          discussion: "Pemaparan ruang lingkup pekerjaan LPS untuk gedung kantor pemerintahan 8 lantai. Pihak Dinas PU menyampaikan bahwa proyek harus mengikuti regulasi pemerintah daerah terkait K3. Kontrak sedang dalam proses review oleh bagian hukum Dinas. Assessment risiko akan dimulai setelah kontrak ditandatangani.",
        }});
        await prisma.actionItem.createMany({ data: [
          {
            notulenId: n1.id, assignedToId: budi.id,
            description: "Follow up status review kontrak ke bagian hukum Dinas PU",
            deadline: new Date("2026-07-17"), status: "OPEN",
          },
          {
            notulenId: n1.id, assignedToId: rina.id,
            description: "Kumpulkan denah dan data teknis bangunan dari arsip Dinas PU",
            deadline: new Date("2026-07-20"), status: "OPEN",
          },
        ]});

        console.log(`✓ Gedung Dinas PU Bandung — 1 notulen, 2 action items (OPEN)`);
      }
    }
  }

  // ─── LPS Gedung Mewah Tower A — tambah notulen ──────────────────────────────
  {
    const p = await prisma.project.findFirst({ where: { name: "LPS Gedung Mewah Tower A" } });
    if (!p) { console.log("⚠ LPS Gedung Mewah Tower A tidak ditemukan, skip."); }
    else {
      const existing = await prisma.notulen.count({ where: { projectId: p.id } });
      if (existing > 0) {
        console.log(`ℹ Gedung Mewah sudah punya ${existing} notulen, skip.`);
      } else {
        const n1 = await prisma.notulen.create({ data: {
          projectId: p.id, createdById: budi.id,
          title: "Rapat Review Assessment Risiko LPS Tower A",
          meetingDate: new Date("2026-02-12"),
          location: "Kantor PT Gedung Mewah Properti",
          attendees: "Budi Santoso (Team Leader), Rina Wulandari (Engineer), Dhani Pratama (Inspector), Ahmad Yani (Klien)",
          discussion: "Presentasi hasil assessment risiko LPS Tower A kepada klien. Ng = 8.5 flash/km²/year, LPL yang diperlukan adalah Level II. Klien meminta penjelasan mengenai implikasi LPL II terhadap biaya dan spesifikasi material. Klien menyetujui rekomendasi dan meminta desain segera dimulai.",
        }});
        await prisma.actionItem.createMany({ data: [
          {
            notulenId: n1.id, assignedToId: rina.id,
            description: "Mulai draft dokumen desain LPS berdasarkan hasil assessment — LPL Level II",
            deadline: new Date("2026-03-01"), status: "OPEN",
          },
          {
            notulenId: n1.id, assignedToId: dhani.id,
            description: "Review spesifikasi material LPL II dan siapkan list material untuk procurement",
            deadline: new Date("2026-02-25"), status: "OPEN",
          },
          {
            notulenId: n1.id, assignedToId: budi.id,
            description: "Kirim ringkasan assessment ke klien sebagai laporan resmi",
            deadline: new Date("2026-02-18"), status: "CLOSED",
            closedAt: new Date("2026-02-16"),
            closedNote: "Laporan assessment sudah dikirim dan diterima klien.",
          },
        ]});

        console.log(`✓ LPS Gedung Mewah Tower A — 1 notulen, 3 action items`);
      }
    }
  }

  console.log("\n✅ Selesai!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => (prisma as any).$disconnect());
