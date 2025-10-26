import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { newTestApp, resetDb } from "./helpers";

let app: any;

async function registerAndLogin(email: string, username: string, password: string) {
  // register
  const reg = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      username,
      password,
      name: "Test User",
      birthday: new Date("1995-01-01").toISOString(),
    },
  });
  expect([201, 409]).toContain(reg.statusCode); // allow reruns

  // login
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  expect(login.statusCode).toBe(200);
  const body = login.json();
  expect(body).toMatchObject({ access: expect.any(String), refresh: expect.any(String), user: expect.any(Object) });
  return body as { access: string; refresh: string; user: any };
}

describe("auth flow", () => {
  beforeAll(async () => {
    app = await newTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it("registers, logs in, and hits /me", async () => {
    const email = "test@example.com";
    const password = "Aa1!aaaa";
    const { access } = await registerAndLogin(email, "tester", password);

    const me = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${access}` },
    });
    expect(me.statusCode).toBe(200);
    const meBody = me.json();
    expect(meBody.user).toMatchObject({ id: expect.any(String), email, username: "tester" });
  });

  it("refresh and logout work", async () => {
    const email = "test2@example.com";
    const password = "Aa1!aaaa";
    const { refresh } = await registerAndLogin(email, "tester2", password);

    const refreshed = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refresh },
    });
    expect(refreshed.statusCode).toBe(200);
    const access2 = refreshed.json().access;
    expect(typeof access2).toBe("string");

    const logout = await app.inject({ method: "POST", url: "/auth/logout", payload: { refresh } });
    expect(logout.statusCode).toBe(204);
  });
});
