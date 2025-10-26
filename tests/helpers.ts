import { buildApp } from "../src/app";

export async function newTestApp() {
  const app = await buildApp();
  return app;
}

export async function resetDb(app: any) {
  // Truncate all tables to isolate tests
  const prisma = app.prisma as any;
  const tables = [
    '"RefreshToken"',
    '"FeedSeen"',
    '"Message"',
    '"Match"',
    '"Interaction"',
    '"Photo"',
    '"Preferences"',
    '"Block"',
    '"Report"',
    '"User"',
  ];
  const sql = `TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE;`;
  await prisma.$executeRawUnsafe(sql);
}
