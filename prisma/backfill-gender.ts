import { PrismaClient, Gender } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const res = await prisma.user.updateMany({
    where: { gender: null },
    data: { gender: Gender.other },
  });
  console.log(`Backfilled gender for ${res.count} users (set to 'other')`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
