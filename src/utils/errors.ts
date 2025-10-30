export function badInput(reply: any, message: string) {
  return reply.code(400).send({ code: "BAD_INPUT", message });
}

export function unauthorized(reply: any, message = "Unauthorized", code: "NO_TOKEN" | "INVALID_TOKEN" = "INVALID_TOKEN") {
  return reply.code(401).send({ code, message });
}

export function forbidden(reply: any, message = "Forbidden") {
  return reply.code(403).send({ code: "FORBIDDEN", message });
}

export function notFound(reply: any, message = "Not found") {
  return reply.code(404).send({ code: "NOT_FOUND", message });
}

export function conflict(reply: any, message = "Conflict") {
  return reply.code(409).send({ code: "ALREADY_EXISTS", message });
}

export function internal(reply: any, message = "Internal error") {
  return reply.code(500).send({ code: "INTERNAL", message });
}

export function zodBadInput(reply: any, zodError: unknown) {
  try {
    const err: any = zodError as any;
    const issues: any[] = Array.isArray(err?.issues) ? err.issues : Array.isArray(err?.errors) ? err.errors : [];
    if (!issues.length) return badInput(reply, "Invalid input");
    const msg = issues
      .map((i: any) => {
        const path = Array.isArray(i?.path) ? i.path.join(".") : "";
        return path ? `${path}: ${i?.message}` : `${i?.message}`;
      })
      .join("; ");
    return badInput(reply, msg || "Invalid input");
  } catch {
    return badInput(reply, "Invalid input");
  }
}
