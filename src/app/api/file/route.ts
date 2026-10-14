import { get } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { workspaceOfPath } from "@/lib/blob";
import { isMember } from "@/lib/supabase/server";

// 비공개 Blob 을 그 워크스페이스 멤버에게만 내려준다. Range 를 넘겨 영상 탐색도 된다.
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  const ws = path && !path.includes("..") ? workspaceOfPath(path) : null;
  if (!path || !ws) return new Response("bad path", { status: 400 });
  if (!(await isMember(ws)).ok) return new Response("forbidden", { status: 403 });

  const range = request.headers.get("range");
  const res = await get(path, { access: "private", headers: range ? { range } : undefined });
  const status = (res?.statusCode ?? 404) as number;
  if (!res || !res.stream || (status !== 200 && status !== 206)) return new Response("not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": res.blob.contentType ?? "application/octet-stream",
    "Cache-Control": "private, max-age=86400, immutable",
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
