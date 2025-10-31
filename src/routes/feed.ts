import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { Gender as GenderEnum } from "@prisma/client";
import { encodeCursor, decodeCursor } from "../utils/cursor";
import { requireAuth } from "../utils/auth";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
  // Optional mode: list (default, paginated list) or sticky (single random candidate kept until decision)
  mode: z.enum(["list", "sticky"]).default("list").optional(),
  debug: z.coerce.boolean().optional(),
});

// cursor helpers moved to ../utils/cursor

export const feedRoutes: FastifyPluginAsync = async (app) => {
  app.get("/feed", { preHandler: requireAuth }, async (req: any, reply) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ code: "BAD_INPUT", message: "Invalid query" });
    }
  const { limit, cursor, mode = "list", debug = false } = parsed.data as any;
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

    const [blockedByMe, blockedMe, seen, myMatches] = await Promise.all([
      app.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      app.prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
      app.prisma.feedSeen.findMany({
        where: { viewerId: userId, seenAt: { gt: recentCutoff } },
        select: { seenUserId: true },
      }),
      app.prisma.match.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        select: { userAId: true, userBId: true },
      }),
    ]);
    const excludeIds = new Set<string>();
  blockedByMe.forEach((b: any) => excludeIds.add(b.blockedId));
  blockedMe.forEach((b: any) => excludeIds.add(b.blockerId));
    (seen as any[]).forEach((s: any) => excludeIds.add(s.seenUserId));
    // Exclude users with whom we already have a match
    (myMatches as any[]).forEach((m: any) => {
      const other = m.userAId === userId ? m.userBId : m.userAId;
      excludeIds.add(other);
    });

    const whereBase: any = {
      id: { not: userId, notIn: Array.from(excludeIds) },
      gender: { in: showGenders },
      ...(onlyVerified ? { isVerified: true } : {}),
      // Users without birthday are excluded from feed
      birthday: {
        gte: fromDate,
        lte: toDate,
      },
    };
    // Fallback when no users match preferences: show any available profiles (except self/blocked/seen)
    const whereFallback: any = {
      id: { not: userId, notIn: Array.from(excludeIds) },
      // Deliberately no gender/age/verified/birthday constraints
    };
    // Optional debug meta: compute totals to help troubleshoot empty feeds
    // Compute eligibleTotal (ignoring recent seen and blocks) to decide whether to fallback
    const eligibleTotal = await app.prisma.user.count({
      where: {
        id: { not: userId },
        gender: { in: (showGenders as unknown as GenderEnum[]) },
        ...(onlyVerified ? { isVerified: true } : {}),
        birthday: { gte: fromDate, lte: toDate },
      },
    });

    const meta: any = debug
      ? {
          debug: {
            viewerId: userId,
            prefs: { ageMin, ageMax, showGenders, onlyVerified },
            excludeCounts: {
              blockedByMe: blockedByMe.length,
              blockedMe: blockedMe.length,
              seenRecent: (seen as any[]).length,
              matchedPeers: (myMatches as any[]).length,
            },
            eligibleTotal,
          },
        }
      : {};
    // Sticky mode: return exactly one candidate; keep it until user makes a decision (via /like)
    if (mode === "sticky") {
      // 1) Try to return the last recently served candidate that has no decision yet
      const recentServed = await app.prisma.feedSeen.findFirst({
        where: { viewerId: userId, seenAt: { gt: recentCutoff } },
        orderBy: { seenAt: "desc" },
        select: { seenUserId: true },
      });
      let candidate: any | null = null;
      if (recentServed?.seenUserId) {
        // Check there's no decision yet from me to this user
        const decided = await app.prisma.interaction.findUnique({
          where: { fromUserId_toUserId: { fromUserId: userId, toUserId: recentServed.seenUserId } },
          select: { id: true },
        });
        if (!decided) {
          // Ensure candidate still meets filters and not blocked
          candidate = await app.prisma.user.findFirst({
            where: { ...whereBase, id: recentServed.seenUserId },
            select: {
              id: true,
              username: true,
              name: true,
              city: true,
              isVerified: true,
              birthday: true,
              photos: { select: { url: true, order: true }, orderBy: { order: "asc" } },
            },
          });
        }
      }

      if (!candidate) {
        // 2) Pick a new random candidate among eligible users
        const total = await app.prisma.user.count({ where: whereBase });
        let usedFallback = false;
        if (total === 0) {
          // Try fallback pool
          if (eligibleTotal === 0) {
            const totalFallback = await app.prisma.user.count({ where: whereFallback });
            if (totalFallback === 0) {
              return reply.send({ items: [], nextCursor: undefined, exhausted: true, retryAfterSec: Math.floor(dedupMs / 1000), ...meta });
            }
            const offsetFb = Math.floor(Math.random() * totalFallback);
            const pickedFb = await app.prisma.user.findMany({
              where: whereFallback,
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
              skip: offsetFb,
              take: 1,
            });
            candidate = pickedFb[0] ?? null;
            usedFallback = !!candidate;
            if (candidate && debug) {
              (meta.debug ??= {}).usedFallback = true;
            }
          } else {
            // There are eligible users overall, but none available due to recent seen/blocks → exhausted (no fallback)
            return reply.send({ items: [], nextCursor: undefined, exhausted: true, retryAfterSec: Math.floor(dedupMs / 1000), ...meta });
          }
        } else {
          const offset = Math.floor(Math.random() * total);
          const picked = await app.prisma.user.findMany({
            where: whereBase,
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
            skip: offset,
            take: 1,
          });
          candidate = picked[0] ?? null;
        }

        if (candidate) {
          // Mark as served (so we can keep it sticky). We'll still return it until there's a decision.
          const now = new Date();
          await app.prisma.feedSeen.upsert({
            where: { viewerId_seenUserId: { viewerId: userId, seenUserId: candidate.id } },
            update: { seenAt: now },
            create: { viewerId: userId, seenUserId: candidate.id, seenAt: now },
          });
        }
      }

      if (!candidate) {
        return reply.send({ items: [], nextCursor: undefined, exhausted: true, retryAfterSec: Math.floor(dedupMs / 1000), ...meta });
      }

      const items = [
        {
          id: candidate.id,
          username: candidate.username,
          name: candidate.name ?? null,
          city: candidate.city ?? null,
          photos: candidate.photos,
          isVerified: candidate.isVerified,
          age: candidate.birthday ? Math.floor((Date.now() - candidate.birthday.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined,
        },
      ];
      return reply.send({ items, nextCursor: undefined, exhausted: false, ...meta });
    }

    // List mode (default): paginated list with cursor
    // Cursor
    let prismaCursor: any | undefined;
    if (cursor) {
      const c = decodeCursor(cursor);
      if (c?.id) prismaCursor = { id: c.id as string };
    }

    const where = whereBase;
    let users = await app.prisma.user.findMany({
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

    // Fallback list if nothing matched preferences
    let usedFallbackList = false;
    if (users.length === 0 && eligibleTotal === 0) {
      // Only fallback when truly no eligible users by preferences
      users = await app.prisma.user.findMany({
        where: whereFallback,
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
        take: limit,
      });
      usedFallbackList = users.length > 0;
      if (usedFallbackList && debug) {
        (meta.debug ??= {}).usedFallback = true;
      }
    }

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

    // Mark shown users as seen (upsert with current timestamp) for list mode
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

    return reply.send({ items, nextCursor, exhausted, retryAfterSec, ...meta });
  });
};
