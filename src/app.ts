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
import { feedRoutes } from "./routes/feed";
import { likeRoutes } from "./routes/like";
import { matchesRoutes } from "./routes/matches";
import { messagesRoutes } from "./routes/messages";
import { blocksRoutes } from "./routes/blocks";
import { reportsRoutes } from "./routes/reports";

export async function createLogger() {
  if (process.env.NODE_ENV === "production") return true as any;
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
    } as any;
  } catch {
    return true as any;
  }
}

export async function buildApp() {
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

  // Tolerate empty JSON bodies when Content-Type: application/json is sent
  // This prevents Fastify from throwing FST_ERR_CTP_EMPTY_JSON_BODY for DELETEs without a body
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    function (_req, body: string, done) {
      if (body === "" || body === undefined || body === null) {
        // Treat empty body as undefined, letting routes handle it as missing body
        done(null, undefined);
        return;
      }
      try {
        const json = JSON.parse(body);
        done(null, json);
      } catch (err) {
        done(err as any, undefined);
      }
    }
  );

  if (!existsSync(env.UPLOAD_DIR)) mkdirSync(env.UPLOAD_DIR, { recursive: true });
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
  await app.register(feedRoutes);
  await app.register(likeRoutes);
  await app.register(matchesRoutes);
  await app.register(messagesRoutes);
  await app.register(blocksRoutes);
  await app.register(reportsRoutes);

  return app;
}
