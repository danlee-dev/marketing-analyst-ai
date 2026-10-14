import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { postDir, putFile } from "./blob";
import {
  assertPublicUrl,
  collect,
  UA,
  type RemoteMedia,
} from "./sources/collect";
import type { Detected } from "./sources/detect";
import type { MediaItem, Post } from "./types";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/avif": "avif",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4",
};

export async function saveRemote(
  url: string,
  pathNoExt: string,
  fallbackType: string,
) {
  assertPublicUrl(url);
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`미디어 다운로드 실패 (HTTP ${res.status})`);
  const contentType = (res.headers.get("content-type") ?? fallbackType)
    .split(";")[0]
    .trim();
  if (!contentType.startsWith("image/") && !contentType.startsWith("video/"))
    throw new Error("이미지가 아니에요");
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 300 * 1024 * 1024) throw new Error("파일이 너무 커요");
  const path = `${pathNoExt}.${EXT[contentType] ?? fallbackType.split("/")[1]}`;
  await putFile(path, buf, contentType);
  return { path, contentType, size: buf.byteLength };
}

export async function findExisting(
  sb: SupabaseClient,
  projectId: string,
  source: string,
  shortcode: string,
) {
  const { data } = await sb
    .from("posts")
    .select("*")
    .eq("project_id", projectId)
    .eq("source", source)
    .eq("shortcode", shortcode)
    .maybeSingle();
  return (data as Post | null) ?? null;
}

// 링크 하나를 수집해 프로젝트(와 폴더)에 저장. 웹 화면(사용자 RLS)과 MCP(관리 클라이언트 + 멤버십 확인 후)가 같이 쓴다.
export async function ingestLink(
  sb: SupabaseClient,
  project: { id: string; workspace_id: string },
  d: Detected,
  folderId: string | null,
  createdBy?: string,
): Promise<{ post: Post; existed?: boolean }> {
  const projectId = project.id;
  if (d.id) {
    const existing = await findExisting(sb, projectId, d.source, d.id);
    if (existing) return { post: existing, existed: true };
  }
  const c = await collect(d);
  if (!d.id) {
    const existing = await findExisting(sb, projectId, c.source, c.shortcode);
    if (existing) return { post: existing, existed: true };
  }
  const postId = crypto.randomUUID();
  const dir = postDir(project.workspace_id, postId);

  const queue = c.media.map((m, i) => ({ m, i }));
  const media: (MediaItem | null)[] = new Array(queue.length).fill(null);
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const { m, i }: { m: RemoteMedia; i: number } = job;
        const saved = await saveRemote(
          m.url,
          `${dir}media/${String(i + 1).padStart(2, "0")}`,
          m.kind === "video" ? "video/mp4" : "image/jpeg",
        );
        media[i] = {
          index: i + 1,
          kind: m.kind,
          ...saved,
          width: m.width,
          height: m.height,
          duration: m.duration,
        };
      }
    }),
  );
  const saved = media.filter((m): m is MediaItem => !!m);

  let thumbPath: string | null =
    saved.find((m) => m.kind === "image")?.path ?? null;
  if (c.thumbUrl && (!thumbPath || saved[0]?.kind === "video")) {
    thumbPath =
      (
        await saveRemote(c.thumbUrl, `${dir}thumb`, "image/jpeg").catch(
          async () => {
            // YouTube maxres 썸네일이 없는 영상은 hq 로
            if (c.source === "youtube")
              return saveRemote(
                c.thumbUrl!.replace(/(maxresdefault|oar2)/, "hqdefault"),
                `${dir}thumb`,
                "image/jpeg",
              ).catch(() => null);
            return null;
          },
        )
      )?.path ?? thumbPath;
  }
  const profilePic = c.profilePicUrl
    ? await saveRemote(c.profilePicUrl, `${dir}profile`, "image/jpeg").catch(
        () => null,
      )
    : null;

  const { data: post, error } = await sb
    .from("posts")
    .insert({
      id: postId,
      workspace_id: project.workspace_id,
      project_id: projectId,
      folder_id: folderId || null,
      source: c.source,
      format: c.format,
      type: c.format,
      shortcode: c.shortcode,
      url: c.url,
      title: c.title,
      account: { ...c.account, profilePicPath: profilePic?.path },
      caption: c.caption,
      body: c.body,
      site: c.site,
      hashtags: [...new Set(c.caption.match(/#[\p{L}\p{N}_]+/gu) ?? [])],
      mentions: [...new Set(c.caption.match(/@[\w.]+/g) ?? [])],
      taken_at: c.takenAt,
      likes: c.likes,
      comments: c.comments,
      views: c.views,
      music: c.music,
      location: c.location,
      media: saved,
      thumb_path: thumbPath,
      transcripts: c.transcripts,
      ...(createdBy ? { created_by: createdBy } : {}),
    })
    .select("*")
    .single();
  if (error)
    throw new Error(
      error.code === "23505" ? "이 프로젝트에 이미 있어요" : error.message,
    );
  return { post: post as Post };
}
