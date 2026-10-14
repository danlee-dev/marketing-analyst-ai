import "server-only";
import { del, get, list, put } from "@vercel/blob";
import type { Post } from "./types";

export const postDir = (id: string) => `posts/${id}/`;
const metaPath = (id: string) => `posts/${id}/meta.json`;

export async function putFile(path: string, body: Blob | ArrayBuffer | ReadableStream | string, contentType: string) {
  return put(path, body, {
    access: "private",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function readPost(id: string): Promise<Post | null> {
  const res = await get(metaPath(id), { access: "private", useCache: false });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  return JSON.parse(await new Response(res.stream).text()) as Post;
}

export async function writePost(post: Post): Promise<Post> {
  post.updatedAt = new Date().toISOString();
  await putFile(metaPath(post.id), JSON.stringify(post, null, 2), "application/json");
  return post;
}

export async function listPostIds(): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "posts/", mode: "folded", cursor, limit: 1000 });
    for (const folder of page.folders) ids.push(folder.replace(/^posts\//, "").replace(/\/$/, ""));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return ids;
}

export async function listPosts(): Promise<Post[]> {
  const ids = await listPostIds();
  const posts = await Promise.all(ids.map((id) => readPost(id).catch(() => null)));
  return posts
    .filter((p): p is Post => !!p)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deletePrefix(prefix: string) {
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}
