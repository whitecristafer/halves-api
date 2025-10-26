import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { newTestApp, resetDb } from "./helpers";

let app: any;

describe("db constraints", () => {
  beforeAll(async () => {
    app = await newTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it("Photo unique (userId, order)", async () => {
    // create user
    const user = await app.prisma.user.create({
      data: {
        email: "u@x.com",
        username: "u1",
        passwordHash: "hash",
      },
    });

    // create two photos with same order
    await app.prisma.photo.create({ data: { userId: user.id, url: "/uploads/a.jpg", order: 0 } });
    await expect(
      app.prisma.photo.create({ data: { userId: user.id, url: "/uploads/b.jpg", order: 0 } })
    ).rejects.toBeTruthy();
  });

  it("Match unique on normalized pair order", async () => {
    const a = await app.prisma.user.create({ data: { email: "a@x.com", username: "a", passwordHash: "h" } });
    const b = await app.prisma.user.create({ data: { email: "b@x.com", username: "b", passwordHash: "h" } });
    const [min, max] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];

    await app.prisma.match.create({ data: { userAId: min, userBId: max } });
    // DB constraint enforces uniqueness only for the exact (userAId,userBId) pair.
    // Since the app normalizes order as min,max, trying to insert the same normalized pair should fail.
    await expect(app.prisma.match.create({ data: { userAId: min, userBId: max } })).rejects.toBeTruthy();
  });
});
