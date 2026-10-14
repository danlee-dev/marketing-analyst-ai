import type { Attachment, Post } from "@/lib/types";

export const fileUrl = (path: string) => `/api/file?path=${encodeURIComponent(path)}`;

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("로그인이 필요해요");
  }
  if (!res.ok) throw new Error(data.error ?? `요청 실패 (${res.status})`);
  return data as T;
}

export const api = {
  list: () => fetch("/api/posts", { cache: "no-store" }).then((r) => json<{ posts: Post[] }>(r)),
  ingest: (url: string) =>
    fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }).then(
      (r) => json<{ post: Post; existed?: boolean }>(r),
    ),
  transcribe: (id: string, mediaIndex: number, audio: unknown) =>
    fetch(`/api/posts/${id}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaIndex, audio }),
    }).then((r) => json<{ post: Post }>(r)),
  patch: (id: string, body: { title?: string; addAttachments?: Attachment[]; removeAttachment?: string }) =>
    fetch(`/api/posts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(
      (r) => json<{ post: Post }>(r),
    ),
  remove: (id: string) => fetch(`/api/posts/${id}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
};
