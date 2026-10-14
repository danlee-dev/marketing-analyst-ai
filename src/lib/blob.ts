import "server-only";
import { del, list, put } from "@vercel/blob";

// 저장 경로: w/<workspace>/p/<post>/{media,attachments}/...
export const postDir = (workspaceId: string, postId: string) => `w/${workspaceId}/p/${postId}/`;
export const workspaceOfPath = (path: string) => path.match(/^w\/([0-9a-f-]{36})\//)?.[1] ?? null;

export async function putFile(path: string, body: Blob | ArrayBuffer | ReadableStream | string, contentType: string) {
  return put(path, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
}

export async function deletePrefix(prefix: string) {
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

export async function deleteFile(path: string) {
  await del(path).catch(() => {});
}
