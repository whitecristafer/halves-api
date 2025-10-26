import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { requireAuth } from "../utils/auth";

const GenderEnum = z.enum(["male", "female", "other"]);

const PrefsPatchSchema = z
  .object({
    ageMin: z.number().int().min(18).max(99).optional(),
    ageMax: z.number().int().min(18).max(99).optional(),
    distanceKm: z.number().int().min(1).max(500).optional(),
    showGenders: z.array(GenderEnum).min(1).max(3).optional(),
    onlyVerified: z.boolean().optional(),
  })
  .refine((data) => {
    if (data.ageMin !== undefined && data.ageMax !== undefined) {
      return data.ageMin <= data.ageMax;
    }
    return true;
  }, { message: "ageMin must be <= ageMax" });

export const preferencesRoutes: FastifyPluginAsync = async (app) => {
  // GET /me/preferences
  app.get("/me/preferences", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });

    let prefs = await app.prisma.preferences.findUnique({
      where: { userId },
      select: { ageMin: true, ageMax: true, distanceKm: true, showGenders: true, onlyVerified: true },
    });

    if (!prefs) {
      prefs = await app.prisma.preferences.create({
        data: { userId, showGenders: ["male", "female", "other"] as any },
        select: { ageMin: true, ageMax: true, distanceKm: true, showGenders: true, onlyVerified: true },
      });
    }

    return reply.send(prefs);
  });

  // PATCH /me/preferences
  app.patch("/me/preferences", { preHandler: requireAuth }, async (req: any, reply) => {
    const parsed = PrefsPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ code: "BAD_INPUT", message: fromZodError(parsed.error as any).message });
    }
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });

    const current = await app.prisma.preferences.findUnique({ where: { userId } });
    const merged = {
      ageMin: parsed.data.ageMin ?? current?.ageMin ?? 18,
      ageMax: parsed.data.ageMax ?? current?.ageMax ?? 60,
      distanceKm: parsed.data.distanceKm ?? current?.distanceKm ?? 100,
      showGenders: (parsed.data.showGenders ?? current?.showGenders ?? ["male", "female", "other"]) as any,
      onlyVerified: parsed.data.onlyVerified ?? current?.onlyVerified ?? false,
    };

    if (merged.ageMin > merged.ageMax) {
      return reply.code(400).send({ code: "BAD_INPUT", message: "ageMin must be <= ageMax" });
    }

    const updated = await app.prisma.preferences.upsert({
      where: { userId },
      update: merged,
      create: { userId, ...merged },
      select: { ageMin: true, ageMax: true, distanceKm: true, showGenders: true, onlyVerified: true },
    });

    return reply.send(updated);
  });
};
