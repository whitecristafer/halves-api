import { buildApp } from "../src/app";

export async function newTestApp() {
  const app = await buildApp();
  return app;
}

export async function resetDb(app: any) {
  // Truncate all tables to isolate tests
  const prisma = app.prisma as any;
  const tables = [
    '"RefreshToken"',
    '"FeedSeen"',
    '"Message"',
    '"Match"',
    '"Interaction"',
    '"Photo"',
    '"Preferences"',
    '"Block"',
    '"Report"',
    '"User"',
  ];
  const sql = `TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE;`;
  await prisma.$executeRawUnsafe(sql);
}

// Build a minimal multipart/form-data body for single file field
export function makeMultipart(fieldName: string, filename: string, contentType: string, data: Buffer) {
  const boundary = "----vitestBoundary" + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, data, tail]);
  const headers = { "content-type": `multipart/form-data; boundary=${boundary}` } as Record<string, string>;
  return { body, headers };
}
