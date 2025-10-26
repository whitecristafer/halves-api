import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { requireAuth } from "../utils/auth";
const BlockSchema = z.object({
    blockedUserId: z.string().min(1),
});
export const blocksRoutes = async (app) => {
    // POST /blocks
    app.post("/blocks", { preHandler: requireAuth }, async (req, reply) => {
        const parsed = BlockSchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.code(400).send({ code: "BAD_INPUT", message: fromZodError(parsed.error).message });
        }
        const me = req.user?.sub;
        if (!me)
            return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });
        const { blockedUserId } = parsed.data;
        if (me === blockedUserId)
            return reply.code(400).send({ code: "BAD_INPUT", message: "Cannot block yourself" });
        const existsUser = await app.prisma.user.findUnique({ where: { id: blockedUserId }, select: { id: true } });
        if (!existsUser)
            return reply.code(404).send({ code: "NOT_FOUND", message: "User not found" });
        const exists = await app.prisma.block.findUnique({
            where: { blockerId_blockedId: { blockerId: me, blockedId: blockedUserId } },
            select: { id: true },
        });
        if (exists)
            return reply.code(409).send({ code: "ALREADY_EXISTS", message: "Already blocked" });
        const block = await app.prisma.block.create({
            data: { blockerId: me, blockedId: blockedUserId },
            select: { id: true, blockedId: true },
        });
        return reply.code(201).send({ id: block.id, blockedUserId: block.blockedId });
    });
    // DELETE /blocks/:blockedUserId
    app.delete("/blocks/:blockedUserId", { preHandler: requireAuth }, async (req, reply) => {
        const me = req.user?.sub;
        if (!me)
            return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });
        const { blockedUserId } = req.params;
        await app.prisma.block.deleteMany({ where: { blockerId: me, blockedId: blockedUserId } });
        return reply.code(204).send();
    });
};
