import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

async function requireAuth(req: any, reply: any) {
  try {
    await req.jwtVerify();
  } catch (err: any) {
    const code = err?.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" ? "NO_TOKEN" : "INVALID_TOKEN";
    return reply.code(401).send({ code, message: "Unauthorized" });
  }
}

const ReportSchema = z.object({
  reportedUserId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export const reportsRoutes: FastifyPluginAsync = async (app) => {
  // POST /reports
  app.post("/reports", { preHandler: requireAuth }, async (req: any, reply) => {
    const parsed = ReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "BAD_INPUT", message: fromZodError(parsed.error as any).message });
    }
    const me = req.user?.sub as string | undefined;
    if (!me) return reply.code(401).send({ code: "INVALID_TOKEN", message: "Unauthorized" });
    const { reportedUserId, reason } = parsed.data;
    if (me === reportedUserId) return reply.code(400).send({ code: "BAD_INPUT", message: "Cannot report yourself" });

    const existsUser = await app.prisma.user.findUnique({ where: { id: reportedUserId }, select: { id: true } });
    if (!existsUser) return reply.code(404).send({ code: "NOT_FOUND", message: "User not found" });

    const report = await app.prisma.report.create({
      data: { reporterId: me, reportedId: reportedUserId, reason },
      select: { id: true, reportedId: true, createdAt: true },
    });
    return reply.code(201).send({ id: report.id, reportedUserId: report.reportedId, createdAt: report.createdAt });
  });
};
