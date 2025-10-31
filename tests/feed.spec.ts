import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { newTestApp, resetDb } from "./helpers";

let app: any;

const PWD = "Aa1!aaaa";

async function register(app: any, payload: any) {
  const res = await app.inject({ method: "POST", url: "/auth/register", payload });
  expect(res.statusCode).toBe(201);
  const body = res.json();
  return body as { user: any; access: string; refresh: string };
}

async function login(app: any, email: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  expect(res.statusCode).toBe(200);
  return res.json() as { user: any; access: string; refresh: string };
}

describe("feed + interactions end-to-end", () => {
  beforeAll(async () => {
    app = await newTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it("respects gender, age, onlyVerified; dedup works; likes → match; messages; blocks; pagination", async () => {
    // Create viewer and candidates
    const viewerEmail = "viewer@example.com";
    const viewer = await register(app, {
      email: viewerEmail,
      username: "viewer",
      name: "Viewer",
      birthday: "1995-01-01",
      password: PWD,
    });

    // Update viewer profile (optional)
    await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { authorization: `Bearer ${viewer.access}` },
      payload: { city: "CityV" },
    });

    // Candidates
  const f1 = await register(app, { email: "f1@example.com", username: "f01", name: "F1", birthday: "1990-01-01", password: PWD });
  const f2 = await register(app, { email: "f2@example.com", username: "f02", name: "F2", birthday: "1995-01-01", password: PWD });
  const m1 = await register(app, { email: "m1@example.com", username: "m01", name: "M1", birthday: "1990-01-01", password: PWD });
  const tooYoung = await register(app, { email: "y1@example.com", username: "y01", name: "Y1", birthday: "2007-01-01", password: PWD });
  const tooOld = await register(app, { email: "o1@example.com", username: "o01", name: "O1", birthday: "1970-01-01", password: PWD });

    // Mark genders and verification via prisma (for test purposes)
    await app.prisma.user.update({ where: { id: f1.user.id }, data: { gender: "female", isVerified: false } });
    await app.prisma.user.update({ where: { id: f2.user.id }, data: { gender: "female", isVerified: true } });
    await app.prisma.user.update({ where: { id: m1.user.id }, data: { gender: "male", isVerified: true } });
    await app.prisma.user.update({ where: { id: tooYoung.user.id }, data: { gender: "female", isVerified: true } });
    await app.prisma.user.update({ where: { id: tooOld.user.id }, data: { gender: "female", isVerified: true } });

    // Set viewer preferences: female only, age 20..40, not onlyVerified (yet)
    const prefsRes = await app.inject({
      method: "PATCH",
      url: "/me/preferences",
      headers: { authorization: `Bearer ${viewer.access}` },
      payload: { ageMin: 20, ageMax: 40, showGenders: ["female"], onlyVerified: false },
    });
    expect(prefsRes.statusCode).toBe(200);

    // Feed should include f1(1990) and f2(1995); exclude m1 (male), tooYoung (2007), tooOld (1970)
    const feed1 = await app.inject({ method: "GET", url: "/feed?limit=20", headers: { authorization: `Bearer ${viewer.access}` } });
    expect(feed1.statusCode).toBe(200);
    const feed1Body = feed1.json();
    const names1 = (feed1Body.items as any[]).map((i) => i.username);
  expect(names1).toContain("f01");
  expect(names1).toContain("f02");
  expect(names1).not.toContain("m01");
  expect(names1).not.toContain("y01");
  expect(names1).not.toContain("o01");

    // onlyVerified=true should filter out f1 (unverified), leaving f2
    const prefsOnlyVerified = await app.inject({
      method: "PATCH",
      url: "/me/preferences",
      headers: { authorization: `Bearer ${viewer.access}` },
      payload: { onlyVerified: true },
    });
    expect(prefsOnlyVerified.statusCode).toBe(200);

    // We previously saw f01 and f02 in feed1, and dedup marks them as seen for ~1 hour.
    // To validate onlyVerified filtering independently, clear seen marks for the viewer.
    await app.prisma.feedSeen.deleteMany({ where: { viewerId: viewer.user.id } });

    const feed2 = await app.inject({ method: "GET", url: "/feed?limit=20", headers: { authorization: `Bearer ${viewer.access}` } });
    const feed2Body = feed2.json();
    const names2 = (feed2Body.items as any[]).map((i) => i.username);
  expect(names2).toContain("f02");
  expect(names2).not.toContain("f01");

    // Dedup: immediate second call should be exhausted (items already marked seen)
  const feed3 = await app.inject({ method: "GET", url: "/feed?limit=20", headers: { authorization: `Bearer ${viewer.access}` } });
    const body3 = feed3.json();
    expect(body3.exhausted).toBe(true);

    // Check FeedSeen upserts happened
    const seenRows = await app.prisma.feedSeen.findMany({ where: { viewerId: viewer.user.id } });
    expect(seenRows.length).toBeGreaterThan(0);

    // Like flow: viewer likes f2
    const like1 = await app.inject({
      method: "POST",
      url: "/like",
      headers: { authorization: `Bearer ${viewer.access}` },
      payload: { toUserId: f2.user.id, isLike: true },
    });
    expect(like1.statusCode).toBe(200);
    expect(like1.json().matched).toBe(false);

    // f2 likes viewer → match
    const f2login = await login(app, "f2@example.com", PWD);
    const like2 = await app.inject({
      method: "POST",
      url: "/like",
      headers: { authorization: `Bearer ${f2login.access}` },
      payload: { toUserId: viewer.user.id, isLike: true },
    });
    expect(like2.statusCode).toBe(200);
    expect(like2.json().matched).toBe(true);
    const matchId = like2.json().matchId as string;
    expect(typeof matchId).toBe("string");

    // Matches list for viewer includes f2
    const matches = await app.inject({ method: "GET", url: "/matches?limit=20", headers: { authorization: `Bearer ${viewer.access}` } });
    expect(matches.statusCode).toBe(200);
    const mBody = matches.json();
    const peers = (mBody.items as any[]).map((m) => m.peer.username);
  expect(peers).toContain("f02");

    // Messaging
    const send1 = await app.inject({
      method: "POST",
      url: `/matches/${matchId}/messages`,
      headers: { authorization: `Bearer ${viewer.access}` },
      payload: { text: "Hi F2" },
    });
    expect(send1.statusCode).toBe(201);

    const listMsgs = await app.inject({ method: "GET", url: `/matches/${matchId}/messages?limit=30`, headers: { authorization: `Bearer ${viewer.access}` } });
    expect(listMsgs.statusCode).toBe(200);
    expect((listMsgs.json().items as any[]).length).toBe(1);

    // Block flow: viewer blocks f1 → f1 пропадает из ленты
    const block = await app.inject({ method: "POST", url: "/blocks", headers: { authorization: `Bearer ${viewer.access}` }, payload: { blockedUserId: f1.user.id } });
    expect(block.statusCode).toBe(201);

    const feedAfterBlock = await app.inject({ method: "GET", url: "/feed?limit=20", headers: { authorization: `Bearer ${viewer.access}` } });
    const afterNames = (feedAfterBlock.json().items as any[]).map((i) => i.username);
    expect(afterNames).not.toContain("f1");

    // Pagination check: add more candidates and page through
    const bulk = [] as any[];
    for (let i = 0; i < 5; i++) {
  const u = await register(app, { email: `p${i}@ex.com`, username: `p00${i}`, name: `P${i}`, birthday: "1994-01-01", password: PWD });
      await app.prisma.user.update({ where: { id: u.user.id }, data: { gender: "female", isVerified: true } });
      bulk.push(u);
    }

    const page1 = await app.inject({ method: "GET", url: "/feed?limit=2", headers: { authorization: `Bearer ${viewer.access}` } });
    const b1 = page1.json();
    expect(b1.items.length).toBeLessThanOrEqual(2);
    const cur = b1.nextCursor;
    if (cur) {
      const page2 = await app.inject({ method: "GET", url: `/feed?limit=2&cursor=${encodeURIComponent(cur)}` , headers: { authorization: `Bearer ${viewer.access}` } });
      const b2 = page2.json();
      // Ensure we are getting more items and not repeating within the same call
      if (b2.items.length > 0) {
        const set = new Set([...b1.items.map((i:any)=>i.id), ...b2.items.map((i:any)=>i.id)]);
        expect(set.size).toBe(b1.items.length + b2.items.length);
      }
    }
  });
});
