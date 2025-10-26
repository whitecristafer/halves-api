import { z } from "zod";
async function requireAuth(req, reply) {
    try {
        await req.jwtVerify();
    }
    catch (err) {
        const code = err?.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" ? "NO_TOKEN" : "INVALID_TOKEN";
        return reply.code(401).send({ code, message: "Unauthorized" });
    }
}
const GetQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: z.string().optional(),
});
const BodySchema = z.object({ text: z.string().min(1).max(2000) });
function encodeCursor(obj) {
    return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function decodeCursor(str) {
    try {
        return JSON.parse(Buffer.from(str, "base64url").toString("utf8"));
    }
    catch {
        return null;
    }
}
export const messagesRoutes = async (app) => {
    // GET /matches/:id/messages
    app.get("/matches/:id/messages", { preHandler: requireAuth }, async (req, reply) => {
        const { id } = req.params;
        const parsed = GetQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return reply.code(400).send({ code: "BAD_INPUT", message: "Invalid query" });
        const { limit, cursor } = parsed.data;
        const me = req.user?.sub;
        if (!me)
            return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });
        const match = await app.prisma.match.findUnique({ where: { id }, select: { userAId: true, userBId: true } });
        if (!match || (match.userAId !== me && match.userBId !== me)) {
            return reply.code(404).send({ code: "NOT_FOUND", message: "Match not found" });
        }
        let prismaCursor;
        if (cursor) {
            const c = decodeCursor(cursor);
            if (c?.createdAt)
                prismaCursor = { matchId_createdAt: { matchId: id, createdAt: new Date(c.createdAt) } };
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
    app.post("/matches/:id/messages", { preHandler: requireAuth }, async (req, reply) => {
        const { id } = req.params;
        const parsed = BodySchema.safeParse(req.body);
        if (!parsed.success)
            return reply.code(400).send({ code: "BAD_INPUT", message: "Invalid body" });
        const me = req.user?.sub;
        if (!me)
            return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });
        const match = await app.prisma.match.findUnique({ where: { id }, select: { userAId: true, userBId: true } });
        if (!match || (match.userAId !== me && match.userBId !== me)) {
            return reply.code(404).send({ code: "NOT_FOUND", message: "Match not found" });
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
        if (blocked)
            return reply.code(403).send({ code: "FORBIDDEN", message: "Messaging is blocked" });
        const msg = await app.prisma.message.create({
            data: { matchId: id, senderId: me, text: parsed.data.text },
            select: { id: true, senderId: true, text: true, createdAt: true },
        });
        return reply.code(201).send(msg);
    });
};
