import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { env } from "../env";
import argon2 from "argon2";

const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(24),
  password: z.string().min(8).max(72),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  function ttlToMs(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl);
    if (!m) return 30 * 24 * 60 * 60 * 1000; // fallback 30d
    const n = Number(m[1]);
    const unit = m[2];
    const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
    return n * mult;
  }
  app.post("/register", async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "BAD_INPUT", message: fromZodError(parsed.error as any).message });
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
            showGenders: ["male", "female", "other"] as any,
          },
        },
      },
      select: { id: true, email: true, username: true, onboardingDone: true },
    });

    const access = await app.jwt.sign({ sub: user.id }, { expiresIn: env.JWT_ACCESS_TTL });
  const refresh = await app.jwt.sign({ sub: user.id }, { expiresIn: env.JWT_REFRESH_TTL });
    const expiresAt = new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL));
    await app.prisma.refreshToken.create({ data: { userId: user.id, token: refresh, expiresAt } });
    return reply.code(201).send({ user, access, refresh });
  });

  app.post("/login", async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "BAD_INPUT", message: fromZodError(parsed.error as any).message });
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

    const access = await app.jwt.sign({ sub: user.id }, { expiresIn: env.JWT_ACCESS_TTL });
  const refresh = await app.jwt.sign({ sub: user.id }, { expiresIn: env.JWT_REFRESH_TTL });
    const expiresAt = new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL));
    await app.prisma.refreshToken.create({ data: { userId: user.id, token: refresh, expiresAt } });
    return reply.send({
      user: { id: user.id, email: user.email, username: user.username, onboardingDone: user.onboardingDone },
      access,
      refresh,
    });
  });

  const RefreshSchema = z.object({ refresh: z.string().min(10) });

  app.post("/refresh", async (req, reply) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "BAD_INPUT", message: fromZodError(parsed.error as any).message });
    }
    const { refresh } = parsed.data;
    try {
      await app.jwt.verify(refresh);
    } catch {
      return reply.code(401).send({ code: "INVALID_TOKEN", message: "Invalid refresh token" });
    }
    const row = await app.prisma.refreshToken.findUnique({ where: { token: refresh }, select: { userId: true, expiresAt: true } });
    if (!row) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Refresh token not found" });
    if (row.expiresAt.getTime() < Date.now()) {
      // cleanup expired
      await app.prisma.refreshToken.deleteMany({ where: { token: refresh } });
      return reply.code(401).send({ code: "INVALID_TOKEN", message: "Refresh token expired" });
    }
    const access = await app.jwt.sign({ sub: row.userId }, { expiresIn: env.JWT_ACCESS_TTL });
    return reply.send({ access });
  });

  app.post("/logout", async (req, reply) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "BAD_INPUT", message: fromZodError(parsed.error as any).message });
    }
    const { refresh } = parsed.data;
    await app.prisma.refreshToken.deleteMany({ where: { token: refresh } });
    return reply.code(204).send();
  });
};