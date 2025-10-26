import { fromZodError } from "zod-validation-error";
export function badInput(reply, message) {
    return reply.code(400).send({ code: "BAD_INPUT", message });
}
export function unauthorized(reply, message = "Unauthorized", code = "INVALID_TOKEN") {
    return reply.code(401).send({ code, message });
}
export function forbidden(reply, message = "Forbidden") {
    return reply.code(403).send({ code: "FORBIDDEN", message });
}
export function notFound(reply, message = "Not found") {
    return reply.code(404).send({ code: "NOT_FOUND", message });
}
export function conflict(reply, message = "Conflict") {
    return reply.code(409).send({ code: "ALREADY_EXISTS", message });
}
export function internal(reply, message = "Internal error") {
    return reply.code(500).send({ code: "INTERNAL", message });
}
export function zodBadInput(reply, zodError) {
    const message = fromZodError(zodError).message;
    return badInput(reply, message);
}
