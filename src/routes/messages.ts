import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { encodeCursor, decodeCursor } from "../utils/cursor";
import { requireAuth } from "../utils/auth";
import { badInput, forbidden, notFound } from "../utils/errors";

const GetQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

const BodySchema = z.object({ text: z.string().min(1).max(2000) });

// cursor helpers moved to ../utils/cursor

export const messagesRoutes: FastifyPluginAsync = async (app) => {
  // GET /matches/:id/messages
  app.get("/matches/:id/messages", { preHandler: requireAuth }, async (req: any, reply) => {
    const { id } = req.params as { id: string };
    const parsed = GetQuerySchema.safeParse(req.query);
  if (!parsed.success) return badInput(reply, "Invalid query");
    const { limit, cursor } = parsed.data;
    const me = req.user?.sub as string | undefined;
    if (!me) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });

    const match = await app.prisma.match.findUnique({ where: { id }, select: { userAId: true, userBId: true } });
    if (!match || (match.userAId !== me && match.userBId !== me)) {
      return notFound(reply, "Match not found");
    }

    let prismaCursor: any | undefined;
    if (cursor) {
      const c = decodeCursor(cursor);
      if (c?.createdAt) prismaCursor = { matchId_createdAt: { matchId: id, createdAt: new Date(c.createdAt) } } as any;
    }

    const messages = await app.prisma.message.findMany({
      where: { matchId: id },
      orderBy: { createdAt: "asc" },
      ...(prismaCursor ? { cursor: prismaCursor, skip: 1 } : {}),
      take: limit,
      select: { id: true, senderId: true, text: true, createdAt: true },
    });
    const nextCursor = messages.length === limit ? encodeCursor({ createdAt: messages[messages.length - 1].createdAt }) : undefined;
    return reply.send({ items: messages, nextCursor });
  });

  // POST /matches/:id/messages
  app.post("/matches/:id/messages", { preHandler: requireAuth }, async (req: any, reply) => {
    const { id } = req.params as { id: string };
    const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return badInput(reply, "Invalid body");
    const me = req.user?.sub as string | undefined;
    if (!me) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });

    const match = await app.prisma.match.findUnique({ where: { id }, select: { userAId: true, userBId: true } });
    if (!match || (match.userAId !== me && match.userBId !== me)) {
      return notFound(reply, "Match not found");
    }

    // Blocks: disallow new messages if either participant blocked the other
    const otherId = match.userAId === me ? match.userBId : match.userAId;
    const blocked = await app.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: me, blockedId: otherId },
          { blockerId: otherId, blockedId: me },
        ],
      },
      select: { id: true },
    });
  if (blocked) return forbidden(reply, "Messaging is blocked");

    const msg = await app.prisma.message.create({
      data: { matchId: id, senderId: me, text: parsed.data.text },
      select: { id: true, senderId: true, text: true, createdAt: true },
    });
    return reply.code(201).send(msg);
  });
};
