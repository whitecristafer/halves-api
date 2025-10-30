import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { newTestApp, resetDb } from "./helpers";

let app: any;

const PWD = "Aa1!aaaa";

async function register(app: any, payload: any) {
  const res = await app.inject({ method: "POST", url: "/auth/register", payload });
  expect(res.statusCode).toBe(201);
  return res.json() as { user: any; access: string; refresh: string };
}

function multipartBody(fieldName: string, filename: string, contentType: string, data: Buffer) {
  const boundary = "----vitestBoundary" + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, data, tail]);
  const headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  } as Record<string, string>;
  return { body, headers };
}

describe("/me/photos multipart upload limits and resequencing", () => {
  beforeAll(async () => {
    app = await newTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it("allows up to 4 uploads, rejects 5th, and resequences after delete", async () => {
    const u = await register(app, {
      email: "ph@example.com",
      username: "photo01",
      name: "Pho",
      birthday: "1990-01-01",
      password: PWD,
    });

    const blob = Buffer.from("PNG-DATA", "utf8"); // content doesn't matter; mimetype checked only

    // Upload 4 photos
    const uploadedIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const { body, headers } = multipartBody("photo", `p${i}.png`, "image/png", blob);
      const res = await app.inject({ method: "POST", url: "/me/photos", headers: { ...headers, authorization: `Bearer ${u.access}` }, payload: body });
      expect(res.statusCode).toBe(201);
      const pj = res.json();
      uploadedIds.push(pj.photo.id);
      expect(pj.photo.order).toBe(i);
      expect(typeof pj.photo.url).toBe("string");
      expect(pj.photo.url.startsWith("/uploads/")).toBe(true);
    }

    // 5th should fail
  const fifth = multipartBody("photo", "p4.png", "image/png", blob);
    const res5 = await app.inject({ method: "POST", url: "/me/photos", headers: { ...fifth.headers, authorization: `Bearer ${u.access}` }, payload: fifth.body });
    expect(res5.statusCode).toBe(400);
    expect(res5.json().code).toBe("BAD_INPUT");

    // Verify GET returns 4 sorted by order
    const list = await app.inject({ method: "GET", url: "/me/photos", headers: { authorization: `Bearer ${u.access}` } });
    expect(list.statusCode).toBe(200);
    const photos = list.json().photos as any[];
    expect(photos).toHaveLength(4);
    expect(photos.map((p) => p.order)).toEqual([0, 1, 2, 3]);

    // Delete photo with order 1
    const toDelete = photos.find((p) => p.order === 1);
    const del = await app.inject({ method: "DELETE", url: `/me/photos/${toDelete.id}`, headers: { authorization: `Bearer ${u.access}` } });
    expect(del.statusCode).toBe(204);

    // After delete, orders must be resequenced: 0,1,2
    const list2 = await app.inject({ method: "GET", url: "/me/photos", headers: { authorization: `Bearer ${u.access}` } });
    const photos2 = list2.json().photos as any[];
    expect(photos2).toHaveLength(3);
    expect(photos2.map((p) => p.order)).toEqual([0, 1, 2]);
  });
});
