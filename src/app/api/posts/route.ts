import { listPosts, putFile, readPost, writePost } from "@/lib/blob";
import { fetchCdn, fetchIgPost, IgError } from "@/lib/instagram";
import { autoTitle, parseShortcode } from "@/lib/naming";
import type { MediaItem, Post } from "@/lib/types";

export const maxDuration = 300;

export async function GET() {
  return Response.json({ posts: await listPosts() });
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
  "image/heic": "heic",
  "video/mp4": "mp4",
};

async function saveRemote(url: string, pathNoExt: string, fallbackType: string) {
  const res = await fetchCdn(url);
  const contentType = (res.headers.get("content-type") ?? fallbackType).split(";")[0];
  const path = `${pathNoExt}.${EXT[contentType] ?? fallbackType.split("/")[1]}`;
  const buf = await res.arrayBuffer();
  await putFile(path, buf, contentType);
  return { path, contentType, size: buf.byteLength };
}

export async function POST(request: Request) {
  const { url } = (await request.json().catch(() => ({}))) as { url?: string };
  const id = url ? parseShortcode(url) : null;
  if (!id) return Response.json({ error: "인스타 게시물 링크가 아니에요" }, { status: 400 });

  const existing = await readPost(id);
  if (existing) return Response.json({ post: existing, existed: true });

  try {
    const ig = await fetchIgPost(id);
    const dir = `posts/${id}`;
    const media: MediaItem[] = [];
    // 순서 유지 + 동시 다운로드 3개
    const queue = ig.media.map((m, i) => ({ m, i }));
    const results: MediaItem[] = new Array(queue.length);
    await Promise.all(
      Array.from({ length: Math.min(3, queue.length) }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const { m, i } = job;
          const n = String(i + 1).padStart(2, "0");
          const saved = await saveRemote(m.url, `${dir}/media/${n}`, m.kind === "video" ? "video/mp4" : "image/jpeg");
          results[i] = { index: i + 1, kind: m.kind, ...saved, width: m.width, height: m.height, duration: m.duration };
        }
      }),
    );
    media.push(...results);

    let thumbPath: string | null = media.find((m) => m.kind === "image")?.path ?? null;
    if (ig.thumbUrl && (ig.type === "video" || media[0]?.kind === "video")) {
      thumbPath = (await saveRemote(ig.thumbUrl, `${dir}/thumb`, "image/jpeg").catch(() => null))?.path ?? thumbPath;
    }
    const profilePic = ig.profilePicUrl
      ? await saveRemote(ig.profilePicUrl, `${dir}/profile`, "image/jpeg").catch(() => null)
      : null;

    const now = new Date().toISOString();
    const post: Post = {
      id: ig.shortcode,
      url: `https://www.instagram.com/${ig.type === "video" ? "reel" : "p"}/${ig.shortcode}/`,
      title: autoTitle(ig.caption, `${ig.type === "video" ? "릴스" : "게시물"} ${ig.shortcode}`),
      account: {
        username: ig.username,
        fullName: ig.fullName,
        profileUrl: `https://www.instagram.com/${ig.username}/`,
        isVerified: ig.isVerified,
        profilePicPath: profilePic?.path,
      },
      caption: ig.caption,
      hashtags: [...new Set(ig.caption.match(/#[\p{L}\p{N}_]+/gu) ?? [])],
      mentions: [...new Set(ig.caption.match(/@[\w.]+/g) ?? [])],
      takenAt: ig.takenAt,
      type: ig.type,
      likes: ig.likes,
      comments: ig.comments,
      views: ig.views,
      music: ig.music,
      location: ig.location,
      media,
      thumbPath,
      transcripts: [],
      attachments: [],
      createdAt: now,
      updatedAt: now,
    };
    await writePost(post);
    return Response.json({ post });
  } catch (e) {
    const status = e instanceof IgError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "가져오기 실패" }, { status });
  }
}
