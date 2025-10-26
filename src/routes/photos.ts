import { FastifyPluginAsync } from "fastify";
import { pipeline } from "node:stream/promises";
import { createWriteStream, unlinkSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { env } from "../env";
import { requireAuth } from "../utils/auth";

export const photosRoutes: FastifyPluginAsync = async (app) => {
  // GET /me/photos
  app.get("/me/photos", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });

    const photos = await app.prisma.photo.findMany({
      where: { userId },
      select: { id: true, url: true, order: true },
      orderBy: { order: "asc" },
    });
    return reply.send({ photos });
  });

  // POST /me/photos (multipart/form-data)
  app.post("/me/photos", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });

    const count = await app.prisma.photo.count({ where: { userId } });
    if (count >= 4) {
      return reply.code(400).send({ code: "BAD_INPUT", message: "Max 4 photos allowed" });
    }

    const file = await req.file();
    if (!file) return reply.code(400).send({ code: "BAD_INPUT", message: "File 'photo' is required" });
    const { filename: origName, mimetype, file: stream } = file as any;
    if (!mimetype?.startsWith("image/")) {
      return reply.code(400).send({ code: "BAD_INPUT", message: "Only image files are allowed" });
    }

  const ext = (origName?.includes(".") ? "." + origName.split(".").pop() : "") || "";
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
  const absPath = join(process.cwd(), env.UPLOAD_DIR, name);

    await pipeline(stream, createWriteStream(absPath));
    const url = `/uploads/${name}`;

    const nextOrder = count; // 0-based ordering
    const photo = await app.prisma.photo.create({
      data: { userId, url, order: nextOrder },
      select: { id: true, url: true, order: true },
    });

    return reply.code(201).send({ photo });
  });

  // DELETE /me/photos/:id
  app.delete("/me/photos/:id", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });
    const { id } = req.params as { id: string };

    const photo = await app.prisma.photo.findFirst({ where: { id, userId } });
    if (!photo) return reply.code(404).send({ code: "NOT_FOUND", message: "Photo not found" });

    // Delete DB record first
    await app.prisma.photo.delete({ where: { id } });

    // Remove file if exists
    try {
      const filename = basename(photo.url);
      const abs = join(process.cwd(), env.UPLOAD_DIR, filename);
      if (existsSync(abs)) unlinkSync(abs);
    } catch {}

    // Resequence remaining orders without conflicts
  await app.prisma.$transaction(async (tx: any) => {
      const remaining = await tx.photo.findMany({
        where: { userId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      // bump to safe range
      for (let i = 0; i < remaining.length; i++) {
        await tx.photo.update({ where: { id: remaining[i].id }, data: { order: i + 1000 } });
      }
      // assign final sequential
      for (let i = 0; i < remaining.length; i++) {
        await tx.photo.update({ where: { id: remaining[i].id }, data: { order: i } });
      }
    });

    return reply.code(204).send();
  });
};
