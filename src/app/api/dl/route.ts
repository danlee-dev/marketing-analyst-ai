import { get } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { verifyPath } from "@/lib/signed";

// 서명된 임시 링크로 원본 파일 내려받기 (로그인 불필요, 만료·서명만 검사). Range 지원.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const path = q.get("p") ?? "";
  if (!/^w\/[0-9a-f-]{36}\/p\/[0-9a-f-]{36}\//.test(path) || path.includes("..") || !verifyPath(path, Number(q.get("e")), q.get("s") ?? "")) {
    return new Response("link expired or invalid", { status: 403 });
  }
  const range = request.headers.get("range");
  const res = await get(path, { access: "private", headers: range ? { range } : undefined });
  const status = (res?.statusCode ?? 404) as number;
  if (!res || !res.stream || (status !== 200 && status !== 206)) return new Response("not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": res.blob.contentType ?? "application/octet-stream",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(q.get("n") || path.split("/").pop() || "file")}`,
  });
  for (const h of ["content-length", "content-range"]) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(res.stream, { status: res.headers.get("content-range") ? 206 : status, headers });
}
