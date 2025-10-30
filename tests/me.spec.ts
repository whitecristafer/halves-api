import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { newTestApp, resetDb } from "./helpers";

let app: any;

const PWD = "Aa1!aaaa";

async function register(app: any, payload: any) {
  const res = await app.inject({ method: "POST", url: "/auth/register", payload });
  expect(res.statusCode).toBe(201);
  return res.json() as { user: any; access: string; refresh: string };
}

describe("/me profile persistence", () => {
  beforeAll(async () => {
    app = await newTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it("saves and returns name, bio, city", async () => {
    const u = await register(app, {
      email: "p1@example.com",
      username: "pro1",
      name: "Proto",
      birthday: "1992-02-02",
      password: PWD,
    });

    const patch = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { authorization: `Bearer ${u.access}` },
      payload: { name: "New Name", bio: "About me", city: "Metropolis" },
    });
    expect(patch.statusCode).toBe(200);
    const body = patch.json();
    expect(body.user.name).toBe("New Name");
    expect(body.user.bio).toBe("About me");
    expect(body.user.city).toBe("Metropolis");

    const me = await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${u.access}` } });
    expect(me.statusCode).toBe(200);
    const meBody = me.json();
    expect(meBody.user.name).toBe("New Name");
    expect(meBody.user.bio).toBe("About me");
    expect(meBody.user.city).toBe("Metropolis");
  });

  it("rejects invalid input (empty name)", async () => {
    const u = await register(app, {
      email: "p2@example.com",
      username: "pro2",
      name: "User",
      birthday: "1990-01-01",
      password: PWD,
    });
    const bad = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { authorization: `Bearer ${u.access}` },
      payload: { name: "" },
    });
    expect(bad.statusCode).toBe(400);
    const err = bad.json();
    expect(err.code).toBe("BAD_INPUT");
  });
});
