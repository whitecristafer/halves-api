import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { newTestApp, resetDb } from "./helpers";

let app: any;

const PWD = "Aa1!aaaa";

async function register(app: any, payload: any) {
  const res = await app.inject({ method: "POST", url: "/auth/register", payload });
  expect(res.statusCode).toBe(201);
  return res.json() as { user: any; access: string; refresh: string };
}

async function like(app: any, access: string, toUserId: string, isLike = true) {
  const res = await app.inject({ method: "POST", url: "/like", headers: { authorization: `Bearer ${access}` }, payload: { toUserId, isLike } });
  expect(res.statusCode).toBe(200);
  return res.json() as { matched: boolean; matchId?: string };
}

describe("messages: negative cases and blocks", () => {
  beforeAll(async () => {
    app = await newTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it("returns 404 for non-existent match and when not a participant", async () => {
    const a = await register(app, { email: "a@example.com", username: "usera", name: "A", birthday: "1990-01-01", password: PWD });
    const b = await register(app, { email: "b@example.com", username: "userb", name: "B", birthday: "1990-01-01", password: PWD });
    const c = await register(app, { email: "c@example.com", username: "userc", name: "C", birthday: "1990-01-01", password: PWD });

    // Non-existent match
    const noMatch = await app.inject({ method: "POST", url: "/matches/nonexistent/messages", headers: { authorization: `Bearer ${a.access}` }, payload: { text: "hi" } });
    expect(noMatch.statusCode).toBe(404);

    // Create match A-B
    await like(app, a.access, b.user.id, true);
    const res = await like(app, b.access, a.user.id, true);
    expect(res.matched).toBe(true);
    const matchId = res.matchId!;

    // User C tries to send into A-B's match
    const notParticipant = await app.inject({ method: "POST", url: `/matches/${matchId}/messages`, headers: { authorization: `Bearer ${c.access}` }, payload: { text: "intrude" } });
    expect(notParticipant.statusCode).toBe(404);
  });

  it("rejects empty text (400) and blocks messaging after a block (403)", async () => {
    const a = await register(app, { email: "a2@example.com", username: "usera2", name: "A2", birthday: "1990-01-01", password: PWD });
    const b = await register(app, { email: "b2@example.com", username: "userb2", name: "B2", birthday: "1990-01-01", password: PWD });

    await like(app, a.access, b.user.id, true);
    const res = await like(app, b.access, a.user.id, true);
    const matchId = res.matchId!;

    // Empty text
    const empty = await app.inject({ method: "POST", url: `/matches/${matchId}/messages`, headers: { authorization: `Bearer ${a.access}` }, payload: { text: "" } });
    expect(empty.statusCode).toBe(400);

    // Block B by A, then try sending
    const block = await app.inject({ method: "POST", url: "/blocks", headers: { authorization: `Bearer ${a.access}` }, payload: { blockedUserId: b.user.id } });
    expect(block.statusCode).toBe(201);
    const afterBlock = await app.inject({ method: "POST", url: `/matches/${matchId}/messages`, headers: { authorization: `Bearer ${a.access}` }, payload: { text: "still?" } });
    expect(afterBlock.statusCode).toBe(403);

    // Also test reverse block stops B
    const reverseBlock = await app.inject({ method: "POST", url: "/blocks", headers: { authorization: `Bearer ${b.access}` }, payload: { blockedUserId: a.user.id } });
    expect(reverseBlock.statusCode).toBe(201);
    const bTry = await app.inject({ method: "POST", url: `/matches/${matchId}/messages`, headers: { authorization: `Bearer ${b.access}` }, payload: { text: "nope" } });
    expect(bTry.statusCode).toBe(403);
  });

  it("paginates messages with createdAt cursor (ascending, no overlaps)", async () => {
    const a = await register(app, { email: "pg@example.com", username: "pgusera", name: "PA", birthday: "1990-01-01", password: PWD });
    const b = await register(app, { email: "pgb@example.com", username: "pguserb", name: "PB", birthday: "1990-01-01", password: PWD });

    await like(app, a.access, b.user.id, true);
    const res = await like(app, b.access, a.user.id, true);
    const matchId = res.matchId!;

    // Send 5 messages alternating senders
    const send = async (who: any, text: string) =>
      app.inject({ method: "POST", url: `/matches/${matchId}/messages`, headers: { authorization: `Bearer ${who.access}` }, payload: { text } });
    await (await send(a, "m1")).json();
    await (await send(b, "m2")).json();
    await (await send(a, "m3")).json();
    await (await send(b, "m4")).json();
    await (await send(a, "m5")).json();

    // Page 1: limit 2
    const p1 = await app.inject({ method: "GET", url: `/matches/${matchId}/messages?limit=2`, headers: { authorization: `Bearer ${a.access}` } });
    expect(p1.statusCode).toBe(200);
    const b1 = p1.json();
    expect(b1.items.map((m: any) => m.text)).toEqual(["m1", "m2"]);
    expect(b1.nextCursor).toBeTruthy();

    // Page 2
    const p2 = await app.inject({ method: "GET", url: `/matches/${matchId}/messages?limit=2&cursor=${encodeURIComponent(b1.nextCursor)}`, headers: { authorization: `Bearer ${a.access}` } });
    const b2 = p2.json();
    expect(b2.items.map((m: any) => m.text)).toEqual(["m3", "m4"]);

    // Page 3 (remaining)
    const p3 = await app.inject({ method: "GET", url: `/matches/${matchId}/messages?limit=2&cursor=${encodeURIComponent(b2.nextCursor)}`, headers: { authorization: `Bearer ${a.access}` } });
    const b3 = p3.json();
    expect(b3.items.map((m: any) => m.text)).toEqual(["m5"]);
  });
});
