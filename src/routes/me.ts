import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { requireAuth } from "../utils/auth";
import { notFound, zodBadInput } from "../utils/errors";

const PatchMeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().min(1).max(1000).optional(),
  city: z.string().min(1).max(100).optional(),
});

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });

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
  if (!user) return notFound(reply, "User not found");
    return reply.send({ user });
  });

  app.patch("/me", { preHandler: requireAuth }, async (req: any, reply) => {
    const parsed = PatchMeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return zodBadInput(reply, parsed.error);
    }
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });

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
    } catch (e: any) {
      // If user not found
      return notFound(reply, "User not found");
    }
  });
};
