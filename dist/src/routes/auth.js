import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import argon2 from "argon2";
// Note: Prisma enum values align to string literals in DB; use literals here to avoid enum import friction
const RegisterSchema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(24),
    password: z.string().min(8).max(72),
});
const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(72),
});
export const authRoutes = async (app) => {
    app.post("/register", async (req, reply) => {
        const parsed = RegisterSchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.code(400).send({ code: "BAD_INPUT", message: fromZodError(parsed.error).message });
        }
        const { email, username, password } = parsed.data;
        const exists = await app.prisma.user.findFirst({
            where: { OR: [{ email }, { username }] },
            select: { id: true },
        });
        if (exists) {
            return reply.code(409).send({ code: "ALREADY_EXISTS", message: "Email or username in use" });
        }
        const passwordHash = await argon2.hash(password);
        const user = await app.prisma.user.create({
            data: {
                email,
                username,
                passwordHash,
                preferences: {
                    create: {
                        showGenders: ["male", "female", "other"],
                    },
                },
            },
            select: { id: true, email: true, username: true, onboardingDone: true },
        });
        const access = await app.jwt.sign({ sub: user.id }, { expiresIn: process.env.JWT_ACCESS_TTL ?? "15m" });
        return reply.code(201).send({ user, access });
    });
    app.post("/login", async (req, reply) => {
        const parsed = LoginSchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.code(400).send({ code: "BAD_INPUT", message: fromZodError(parsed.error).message });
        }
        const { email, password } = parsed.data;
        const user = await app.prisma.user.findUnique({ where: { email } });
        if (!user) {
            return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "Wrong email or password" });
        }
        const ok = await argon2.verify(user.passwordHash, password);
        if (!ok) {
            return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "Wrong email or password" });
        }
        const access = await app.jwt.sign({ sub: user.id }, { expiresIn: process.env.JWT_ACCESS_TTL ?? "15m" });
        return reply.send({
            user: { id: user.id, email: user.email, username: user.username, onboardingDone: user.onboardingDone },
            access,
        });
    });
};
