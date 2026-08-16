import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hash = await bcrypt.hash("password123", 12);
  const leader2 = await prisma.user.upsert({
    where: { email: "leader2@lps-edms-test.com" },
    update: {},
    create: { name: "Team Leader Kedua (Uji)", email: "leader2@lps-edms-test.com", passwordHash: hash, canLeadProject: true },
  });

  let project2 = await prisma.project.findFirst({ where: { name: "Proyek Uji Isolasi TL2" } });
  if (!project2) {
    project2 = await prisma.project.create({
      data: {
        name: "Proyek Uji Isolasi TL2",
        projectCode: "UJI2",
        client: "Klien Uji",
        status: "PLANNING",
        createdById: leader2.id,
      },
    });
    await prisma.userRole.create({ data: { userId: leader2.id, projectId: project2.id, role: "TEAM_LEADER" } });
    for (const phase of ["INISIASI", "ASSESSMENT", "DESIGN", "IMPLEMENTASI", "COMMISSIONING", "INSPEKSI_BERKALA"]) {
      await prisma.projectPhase.create({ data: { projectId: project2.id, phase, isActive: phase === "INISIASI" } });
    }
  }

  console.log(JSON.stringify({ leader2Id: leader2.id, project2Id: project2.id }, null, 2));
  await prisma.$disconnect();
}

main();
