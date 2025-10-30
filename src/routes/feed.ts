import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { encodeCursor, decodeCursor } from "../utils/cursor";
import { requireAuth } from "../utils/auth";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

// cursor helpers moved to ../utils/cursor

export const feedRoutes: FastifyPluginAsync = async (app) => {
  app.get("/feed", { preHandler: requireAuth }, async (req: any, reply) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ code: "BAD_INPUT", message: "Invalid query" });
    }
    const { limit, cursor } = parsed.data;
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });

    // Load my preferences (with defaults)
    const prefs = await app.prisma.preferences.findUnique({ where: { userId } });
    const ageMin = prefs?.ageMin ?? 18;
    const ageMax = prefs?.ageMax ?? 60;
    const showGenders = (prefs?.showGenders ?? ["male", "female", "other"]) as string[];
    const onlyVerified = prefs?.onlyVerified ?? false;

    // Compute DOB bounds for age filter if birthday present
    const now = new Date();
    const toDate = new Date(now); // youngest allowed (ageMin)
    toDate.setFullYear(toDate.getFullYear() - ageMin);
    const fromDate = new Date(now); // oldest allowed (ageMax)
    fromDate.setFullYear(fromDate.getFullYear() - ageMax);

  // Block filters (both directions) and recent seen window
  const dedupMs = 30 * 1000; // 30 seconds
  const recentCutoff = new Date(Date.now() - dedupMs);

    const [blockedByMe, blockedMe, seen] = await Promise.all([
      app.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      app.prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
      app.prisma.feedSeen.findMany({
        where: { viewerId: userId, seenAt: { gt: recentCutoff } },
        select: { seenUserId: true },
      }),
    ]);
    const excludeIds = new Set<string>();
  blockedByMe.forEach((b: any) => excludeIds.add(b.blockedId));
  blockedMe.forEach((b: any) => excludeIds.add(b.blockerId));
    (seen as any[]).forEach((s: any) => excludeIds.add(s.seenUserId));

    // Cursor
    let prismaCursor: any | undefined;
    if (cursor) {
      const c = decodeCursor(cursor);
      if (c?.id) prismaCursor = { id: c.id as string };
    }

    const where: any = {
      id: { not: userId, notIn: Array.from(excludeIds) },
      gender: { in: showGenders },
      ...(onlyVerified ? { isVerified: true } : {}),
      // Users without birthday are excluded from feed
      birthday: {
        gte: fromDate,
        lte: toDate,
      },
    };

    const users = await app.prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        name: true,
        city: true,
        isVerified: true,
        birthday: true,
        photos: { select: { url: true, order: true }, orderBy: { order: "asc" } },
      },
      orderBy: { id: "asc" },
      ...(prismaCursor ? { cursor: prismaCursor, skip: 1 } : {}),
      take: limit,
    });

    // shape + age compute
    const items = users.map((u: any) => {
      let age: number | undefined = undefined;
      if (u.birthday) {
        const diff = new Date().getTime() - u.birthday.getTime();
        age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
      }
      return {
        id: u.id,
        username: u.username,
        name: u.name ?? null,
        city: u.city ?? null,
        photos: u.photos,
        isVerified: u.isVerified,
        age,
      };
    });

    // Mark shown users as seen (upsert with current timestamp)
    if (users.length > 0) {
      const now = new Date();
      await Promise.all(
        users.map((u: any) =>
          app.prisma.feedSeen.upsert({
            where: { viewerId_seenUserId: { viewerId: userId, seenUserId: u.id } },
            update: { seenAt: now },
            create: { viewerId: userId, seenUserId: u.id, seenAt: now },
          })
        )
      );
    }

    const nextCursor = users.length === limit ? encodeCursor({ id: users[users.length - 1].id }) : undefined;

    // If empty due to exhaustion (seen filter), hint client to retry later
    const exhausted = users.length === 0;
  const retryAfterSec = exhausted ? Math.floor(dedupMs / 1000) : undefined;

    return reply.send({ items, nextCursor, exhausted, retryAfterSec });
  });
};
