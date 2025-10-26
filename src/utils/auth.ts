// Shared JWT auth preHandler for Fastify routes
export async function requireAuth(req: any, reply: any) {
  try {
    await req.jwtVerify();
  } catch (err: any) {
    const code = err?.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" ? "NO_TOKEN" : "INVALID_TOKEN";
    return reply.code(401).send({ code, message: "Unauthorized" });
  }
}
