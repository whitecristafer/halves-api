export function encodeCursor(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export function decodeCursor<T = any>(str: string): T | null {
  try {
    return JSON.parse(Buffer.from(str, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
