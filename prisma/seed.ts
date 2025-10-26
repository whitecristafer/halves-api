import { PrismaClient, Gender } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const pass = await argon2.hash("password123");

  // delete everything (dev led) — safe if the database is empty/test
  await prisma.message.deleteMany();
  await prisma.match.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.preferences.deleteMany();
  await prisma.block.deleteMany();
  await prisma.report.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const alice = await prisma.user.create({
    data: {
      email: "alice@example.com",
      username: "alice",
      passwordHash: pass,
      name: "Alice",
      birthday: new Date("1996-04-12"),
      gender: Gender.female,
      city: "Wonderland",
      interests: ["music", "art", "coffee"],
      photos: { create: [{ url: "https://picsum.photos/seed/alice/800/1200", order: 0 }] },
      preferences: {
        create: {
          ageMin: 18,
          ageMax: 60,
          distanceKm: 100,
          showGenders: [Gender.male, Gender.female, Gender.other],
          onlyVerified: false,
        },
      },
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: "bob@example.com",
      username: "bob",
      passwordHash: pass,
      name: "Bob",
      birthday: new Date("1992-09-30"),
      gender: Gender.male,
      city: "Moscow",
      interests: ["sport", "tech"],
      photos: { create: [{ url: "https://picsum.photos/seed/bob/800/1200", order: 0 }] },
      preferences: {
        create: {
          ageMin: 18,
          ageMax: 60,
          distanceKm: 100,
          showGenders: [Gender.female, Gender.male],
          onlyVerified: false,
        },
      },
    },
  });

  // demonstration of interactions
  await prisma.interaction.create({
    data: { fromUserId: alice.id, toUserId: bob.id, isLike: true },
  });
  await prisma.interaction.create({
    data: { fromUserId: bob.id, toUserId: alice.id, isLike: true },
  });

  // creating a match (arranging the pair)
  const [aId, bId] = alice.id < bob.id ? [alice.id, bob.id] : [bob.id, alice.id];
  const match = await prisma.match.upsert({
    where: { userAId_userBId: { userAId: aId, userBId: bId } },
    update: {},
    create: { userAId: aId, userBId: bId },
  });

  await prisma.message.create({
    data: { matchId: match.id, senderId: alice.id, text: "Hi Bob!" },
  });
  await prisma.message.create({
    data: { matchId: match.id, senderId: bob.id, text: "Hey Alice!" },
  });

  console.log("Seeded users:", alice.username, bob.username);
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