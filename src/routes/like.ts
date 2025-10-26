import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { requireAuth } from "../utils/auth";
import { badInput, notFound } from "../utils/errors";

const LikeSchema = z.object({
  toUserId: z.string().min(1),
  isLike: z.boolean(),
});

export const likeRoutes: FastifyPluginAsync = async (app) => {
  app.post("/like", { preHandler: requireAuth }, async (req: any, reply) => {
    const parsed = LikeSchema.safeParse(req.body);
    if (!parsed.success) {
      return badInput(reply, fromZodError(parsed.error as any).message);
    }
    const { toUserId, isLike } = parsed.data;
    const fromUserId = req.user?.sub as string | undefined;
  if (!fromUserId) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });
  if (fromUserId === toUserId) return badInput(reply, "Cannot like yourself");

    const existsTo = await app.prisma.user.findUnique({ where: { id: toUserId }, select: { id: true } });
  if (!existsTo) return notFound(reply, "User not found");

    // Create or toggle interaction
    const existing = await app.prisma.interaction.findUnique({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
    });

    if (!existing) {
      await app.prisma.interaction.create({ data: { fromUserId, toUserId, isLike } });
    } else if (existing.isLike !== isLike) {
      await app.prisma.interaction.update({
        where: { fromUserId_toUserId: { fromUserId, toUserId } },
        data: { isLike },
      });
    }

    // Check for mutual like and create match if needed
    let matched = false;
    let matchId: string | undefined;
    if (isLike) {
      const otherLike = await app.prisma.interaction.findUnique({
        where: { fromUserId_toUserId: { fromUserId: toUserId, toUserId: fromUserId } },
        select: { isLike: true },
      });
      if (otherLike?.isLike) {
        const a = fromUserId < toUserId ? fromUserId : toUserId;
        const b = fromUserId < toUserId ? toUserId : fromUserId;
        const match = await app.prisma.match.upsert({
          where: { userAId_userBId: { userAId: a, userBId: b } },
          update: {},
          create: { userAId: a, userBId: b },
          select: { id: true },
        });
        matched = true;
        matchId = match.id;
      }
    }

    return reply.send({ ok: true, matched, matchId });
  });
};
