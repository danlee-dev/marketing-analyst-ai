import { get } from "@vercel/blob";
import type { NextRequest } from "next/server";

// 비공개 Blob 을 로그인한 사용자에게만 내려준다. Range 를 넘겨 영상 탐색도 된다.
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path || !path.startsWith("posts/") || path.includes("..")) {
    return new Response("bad path", { status: 400 });
  }
  const range = request.headers.get("range");
  const res = await get(path, { access: "private", headers: range ? { range } : undefined });
  const status = (res?.statusCode ?? 404) as number;
  if (!res || !res.stream || (status !== 200 && status !== 206)) {
    return new Response("not found", { status: 404 });
  }
  const headers = new Headers({
    "Content-Type": res.blob.contentType ?? "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  for (const h of ["content-length", "content-range", "etag", "last-modified"]) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  const name = request.nextUrl.searchParams.get("dl");
  if (name) headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  return new Response(res.stream, { status: res.headers.get("content-range") ? 206 : status, headers });
}
