import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { newTestApp, resetDb } from "./helpers";

let app: any;

const PWD = "Aa1!aaaa";

async function register(app: any, payload: any) {
  const res = await app.inject({ method: "POST", url: "/auth/register", payload });
  expect(res.statusCode).toBe(201);
  return res.json() as { user: any; access: string; refresh: string };
}

describe("preferences persistence and validation", () => {
  beforeAll(async () => {
    app = await newTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it("returns defaults on first GET and persists PATCH", async () => {
    const u = await register(app, {
      email: "pref@example.com",
      username: "pref01",
      name: "Pref",
      birthday: "1994-04-04",
      password: PWD,
    });

    const get1 = await app.inject({ method: "GET", url: "/me/preferences", headers: { authorization: `Bearer ${u.access}` } });
    expect(get1.statusCode).toBe(200);
    const p1 = get1.json();
    expect(p1.showGenders.sort()).toEqual(["female", "male", "other"].sort());

    const patch = await app.inject({
      method: "PATCH",
      url: "/me/preferences",
      headers: { authorization: `Bearer ${u.access}` },
      payload: { ageMin: 21, ageMax: 35, distanceKm: 50, showGenders: ["female"], onlyVerified: true },
    });
    expect(patch.statusCode).toBe(200);
    const p2 = patch.json();
    expect(p2).toMatchObject({ ageMin: 21, ageMax: 35, distanceKm: 50, showGenders: ["female"], onlyVerified: true });

    const get2 = await app.inject({ method: "GET", url: "/me/preferences", headers: { authorization: `Bearer ${u.access}` } });
    expect(get2.statusCode).toBe(200);
    const p3 = get2.json();
    expect(p3).toMatchObject({ ageMin: 21, ageMax: 35, distanceKm: 50, showGenders: ["female"], onlyVerified: true });
  });

  it("rejects ageMin > ageMax", async () => {
    const u = await register(app, {
      email: "pref2@example.com",
      username: "pref02",
      name: "Pref2",
      birthday: "1990-01-01",
      password: PWD,
    });

    const bad = await app.inject({
      method: "PATCH",
      url: "/me/preferences",
      headers: { authorization: `Bearer ${u.access}` },
      payload: { ageMin: 40, ageMax: 30 },
    });
    expect(bad.statusCode).toBe(400);
    const err = bad.json();
    expect(err.code).toBe("BAD_INPUT");
  });
});
