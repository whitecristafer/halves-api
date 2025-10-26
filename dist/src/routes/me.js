import { z } from "zod";
import { fromZodError } from "zod-validation-error";
// Minimal auth preHandler: verifies JWT and maps errors to API codes
async function requireAuth(req, reply) {
    try {
        await req.jwtVerify();
    }
    catch (err) {
        const code = err?.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" ? "NO_TOKEN" : "INVALID_TOKEN";
        return reply.code(401).send({ code, message: "Unauthorized" });
    }
}
const PatchMeSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    bio: z.string().min(1).max(1000).optional(),
    city: z.string().min(1).max(100).optional(),
});
export const meRoutes = async (app) => {
    app.get("/me", { preHandler: requireAuth }, async (req, reply) => {
        const userId = req.user?.sub;
        if (!userId)
            return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });
        const user = await app.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                username: true,
                name: true,
                bio: true,
                city: true,
                onboardingDone: true,
            },
        });
        if (!user)
            return reply.code(404).send({ code: "NOT_FOUND", message: "User not found" });
        return reply.send({ user });
    });
    app.patch("/me", { preHandler: requireAuth }, async (req, reply) => {
        const parsed = PatchMeSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return reply.code(400).send({ code: "BAD_INPUT", message: fromZodError(parsed.error).message });
        }
        const userId = req.user?.sub;
        if (!userId)
            return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });
        try {
            const updated = await app.prisma.user.update({
                where: { id: userId },
                data: parsed.data,
                select: {
                    id: true,
                    email: true,
                    username: true,
                    name: true,
                    bio: true,
                    city: true,
                    onboardingDone: true,
                },
            });
            return reply.send({ user: updated });
        }
        catch (e) {
            // If user not found
            return reply.code(404).send({ code: "NOT_FOUND", message: "User not found" });
        }
    });
};
