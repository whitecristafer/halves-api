import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";
export const prismaPlugin = fp(async (app) => {
    const prisma = new PrismaClient();
    await prisma.$connect();
    app.decorate("prisma", prisma);
    app.addHook("onClose", async () => {
        await prisma.$disconnect();
    });
});
