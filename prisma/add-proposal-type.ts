// One-off, idempotent addition of the "Proposal" document type to an already-
// running database — NOT a full reseed, so it doesn't wipe whatever the user
// has been testing live. Mirrors the same row this type gets in seed.ts.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const existing = await prisma.documentTypeMaster.findUnique({ where: { typeCode: "PRP" } });
  const typeMaster = existing ?? await prisma.documentTypeMaster.create({
    data: {
      typeCode: "PRP",
      name: "Proposal Teknis & Penawaran",
      retentionPeriodYears: 10,
      retentionTrigger: "PROJECT_COMPLETION",
    },
  });
  console.log(existing ? "✓ PRP type already exists" : "✓ PRP document type created");

  const requiredDocExists = await prisma.phaseRequiredDocument.findFirst({
    where: { phase: "INISIASI", documentTypeId: typeMaster.id },
  });
  if (!requiredDocExists) {
    await prisma.phaseRequiredDocument.create({
      data: {
        phase: "INISIASI",
        documentType: "FILE_UPLOAD",
        documentTypeId: typeMaster.id,
        label: "Proposal Teknis & Penawaran",
        isOptional: false,
      },
    });
    console.log("✓ Added as a required document for fase Inisiasi");
  } else {
    console.log("✓ Already wired as a required document for fase Inisiasi");
  }

  const tagExists = await prisma.tag.findUnique({ where: { name: "proposal" } });
  if (!tagExists) {
    await prisma.tag.create({ data: { name: "proposal" } });
    console.log("✓ 'proposal' tag created");
  } else {
    console.log("✓ 'proposal' tag already exists");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
