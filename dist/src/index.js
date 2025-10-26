import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { env } from "./env";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { prismaPlugin } from "./plugins/prisma";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { photosRoutes } from "./routes/photos";
import { preferencesRoutes } from "./routes/preferences";
async function createLogger() {
    if (process.env.NODE_ENV === "production")
        return true;
    try {
        await import("pino-pretty");
        return {
            transport: {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: "HH:MM:ss",
                    ignore: "pid,hostname",
                },
            },
        };
    }
    catch {
        return true;
    }
}
async function bootstrap() {
    const logger = await createLogger();
    const app = Fastify({ logger });
    await app.register(cors, {
        origin: env.CORS_ORIGIN,
        credentials: true,
    });
    await app.register(jwt, {
        secret: env.JWT_ACCESS_SECRET,
        sign: { expiresIn: env.JWT_ACCESS_TTL },
    });
    await app.register(multipart, {
        limits: { fileSize: 10 * 1024 * 1024, files: 4 },
    });
    if (!existsSync(env.UPLOAD_DIR))
        mkdirSync(env.UPLOAD_DIR, { recursive: true });
    await app.register(fastifyStatic, {
        root: join(process.cwd(), env.UPLOAD_DIR),
        prefix: "/uploads/",
    });
    await app.register(prismaPlugin);
    app.get("/health", async () => ({ ok: true }));
    await app.register(authRoutes, { prefix: "/auth" });
    await app.register(meRoutes);
    await app.register(photosRoutes);
    await app.register(preferencesRoutes);
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`API on http://localhost:${port}`);
}
bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
