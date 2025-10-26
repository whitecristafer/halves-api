import { fromZodError } from "zod-validation-error";

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
  const message = fromZodError(zodError as any).message;
  return badInput(reply, message);
}
