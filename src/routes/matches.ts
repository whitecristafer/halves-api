import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

async function requireAuth(req: any, reply: any) {
  try {
    await req.jwtVerify();
  } catch (err: any) {
    const code = err?.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" ? "NO_TOKEN" : "INVALID_TOKEN";
    return reply.code(401).send({ code, message: "Unauthorized" });
  }
}

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

function encodeCursor(obj: any) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function decodeCursor(str: string) {
  try {
    return JSON.parse(Buffer.from(str, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export const matchesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/matches", { preHandler: requireAuth }, async (req: any, reply) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ code: "BAD_INPUT", message: "Invalid query" });
    }
    const { limit, cursor } = parsed.data;
    const me = req.user?.sub as string | undefined;
    if (!me) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });

    let prismaCursor: any | undefined;
    if (cursor) {
      const c = decodeCursor(cursor);
      if (c?.id) prismaCursor = { id: c.id as string };
    }

    const matches = await app.prisma.match.findMany({
      where: { OR: [{ userAId: me }, { userBId: me }] },
      select: { id: true, userAId: true, userBId: true },
      orderBy: { id: "asc" },
      ...(prismaCursor ? { cursor: prismaCursor, skip: 1 } : {}),
      take: limit,
    });

  const matchIds = matches.map((m: any) => m.id);
  const peerIds = matches.map((m: any) => (m.userAId === me ? m.userBId : m.userAId));

    // Load peers in one query with photos
    const peers = await app.prisma.user.findMany({
      where: { id: { in: peerIds } },
      select: {
        id: true,
        username: true,
        name: true,
        photos: { select: { url: true, order: true }, orderBy: { order: "asc" } },
      },
    });
    const peerMap = new Map<string, any>();
    peers.forEach((p: any) => peerMap.set(p.id, p));

    // Compute lastMessageAt per match via groupBy
    const groups = await app.prisma.message.groupBy({
      by: ["matchId"],
      where: { matchId: { in: matchIds } },
      _max: { createdAt: true },
    });
    const lastMap = new Map<string, Date>();
    groups.forEach((g: any) => {
      if (g._max?.createdAt) lastMap.set(g.matchId, g._max.createdAt as Date);
    });

  const items = matches.map((m: any) => {
      const peerId = m.userAId === me ? m.userBId : m.userAId;
      const peer = peerMap.get(peerId);
      const lastMessageAt = lastMap.get(m.id)?.toISOString() ?? null;
      return {
        id: m.id,
        peer: peer ? { id: peer.id, username: peer.username, name: peer.name ?? null, photos: peer.photos } : null,
        lastMessageAt,
      };
    });

    const nextCursor = matches.length === limit ? encodeCursor({ id: matches[matches.length - 1].id }) : undefined;
    return reply.send({ items, nextCursor });
  });
};
