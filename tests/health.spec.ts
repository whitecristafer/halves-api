import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { newTestApp } from "./helpers";

let app: any;

describe("health", () => {
  beforeAll(async () => {
    app = await newTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("returns ok true", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"])?.toContain("application/json");
    expect(res.json()).toEqual({ ok: true });
  });
});
