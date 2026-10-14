import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// 로그인 없이 쓰는 파일 다운로드 링크 서명. MCP 로 붙은 로컬 Claude 가 영상을 내려받아 직접 분석할 때 쓴다.
const MAX_TTL = 24 * 3600;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET missing");
  return s;
}

const mac = (path: string, exp: number) => createHmac("sha256", secret()).update(`${path}\n${exp}`).digest("base64url");

export function signPath(origin: string, path: string, filename: string, ttlSec = 3600) {
  const exp = Math.floor(Date.now() / 1000) + Math.min(ttlSec, MAX_TTL);
  const q = new URLSearchParams({ p: path, e: String(exp), s: mac(path, exp), n: filename });
  return { url: `${origin}/api/dl?${q}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyPath(path: string, exp: number, sig: string) {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(exp) || exp < now || exp - now > MAX_TTL) return false;
  const a = Buffer.from(mac(path, exp));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
