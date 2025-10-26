export function encodeCursor(obj) {
    return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
export function decodeCursor(str) {
    try {
        return JSON.parse(Buffer.from(str, "base64url").toString("utf8"));
    }
    catch {
        return null;
    }
}
