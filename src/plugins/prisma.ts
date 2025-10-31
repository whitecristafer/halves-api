import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(async (app) => {
  const prisma = new PrismaClient();
  await prisma.$connect();

  app.decorate("prisma", prisma);

  // Log basic DB info once connected (helps ensure we're writing to the expected database)
  try {
    const info: Array<{ current_database: string | null; current_user: string | null }>
      = await prisma.$queryRawUnsafe(
        'SELECT current_database() AS current_database, current_user AS current_user'
      );
    const row = info?.[0];
    app.log.info({ db: row?.current_database, user: row?.current_user }, "Connected to database");
  } catch (e) {
    app.log.warn({ err: e }, "Could not query database info");
  }

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
});