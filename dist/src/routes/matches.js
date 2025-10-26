import { z } from "zod";
import { encodeCursor, decodeCursor } from "../utils/cursor";
import { requireAuth } from "../utils/auth";
const QuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().optional(),
});
// cursor helpers moved to ../utils/cursor
export const matchesRoutes = async (app) => {
    app.get("/matches", { preHandler: requireAuth }, async (req, reply) => {
        const parsed = QuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return reply.code(400).send({ code: "BAD_INPUT", message: "Invalid query" });
        }
        const { limit, cursor } = parsed.data;
        const me = req.user?.sub;
        if (!me)
            return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });
        let prismaCursor;
        if (cursor) {
            const c = decodeCursor(cursor);
            if (c?.id)
                prismaCursor = { id: c.id };
        }
        const matches = await app.prisma.match.findMany({
            where: { OR: [{ userAId: me }, { userBId: me }] },
            select: { id: true, userAId: true, userBId: true },
            orderBy: { id: "asc" },
            ...(prismaCursor ? { cursor: prismaCursor, skip: 1 } : {}),
            take: limit,
        });
        const matchIds = matches.map((m) => m.id);
        const peerIds = matches.map((m) => (m.userAId === me ? m.userBId : m.userAId));
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
        const peerMap = new Map();
        peers.forEach((p) => peerMap.set(p.id, p));
        // Compute lastMessageAt per match via groupBy
        const groups = await app.prisma.message.groupBy({
            by: ["matchId"],
            where: { matchId: { in: matchIds } },
            _max: { createdAt: true },
        });
        const lastMap = new Map();
        groups.forEach((g) => {
            if (g._max?.createdAt)
                lastMap.set(g.matchId, g._max.createdAt);
        });
        const items = matches.map((m) => {
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
