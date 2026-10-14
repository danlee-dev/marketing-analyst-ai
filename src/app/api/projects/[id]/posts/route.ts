import { postDir, putFile } from "@/lib/blob";
import { fetchCdn, fetchIgPost, IgError } from "@/lib/instagram";
import { autoTitle, parseShortcode } from "@/lib/naming";
import { requireUser } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/types";

export const maxDuration = 300;

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

// 인스타 게시물을 받아 프로젝트(와 폴더)에 넣는다
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/posts">) {
  const { id: projectId } = await ctx.params;
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });

  const { url, folderId } = (await request.json().catch(() => ({}))) as { url?: string; folderId?: string | null };
  const shortcode = url ? parseShortcode(url) : null;
  if (!shortcode) return Response.json({ error: "인스타 게시물 링크가 아니에요" }, { status: 400 });

  // RLS 덕분에 멤버가 아니면 프로젝트가 안 보인다
  const { data: project } = await supabase.from("projects").select("id, workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const { data: existing } = await supabase.from("posts").select("*").eq("project_id", projectId).eq("shortcode", shortcode).maybeSingle();
  if (existing) return Response.json({ post: existing, existed: true });

  try {
    const ig = await fetchIgPost(shortcode);
    const postId = crypto.randomUUID();
    const dir = postDir(project.workspace_id, postId);

    const queue = ig.media.map((m, i) => ({ m, i }));
    const media: MediaItem[] = new Array(queue.length);
    await Promise.all(
      Array.from({ length: Math.min(3, queue.length) }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const { m, i } = job;
          const saved = await saveRemote(m.url, `${dir}media/${String(i + 1).padStart(2, "0")}`, m.kind === "video" ? "video/mp4" : "image/jpeg");
          media[i] = { index: i + 1, kind: m.kind, ...saved, width: m.width, height: m.height, duration: m.duration };
        }
      }),
    );

    let thumbPath: string | null = media.find((m) => m.kind === "image")?.path ?? null;
    if (ig.thumbUrl && media[0]?.kind === "video") {
      thumbPath = (await saveRemote(ig.thumbUrl, `${dir}thumb`, "image/jpeg").catch(() => null))?.path ?? thumbPath;
    }
    const profilePic = ig.profilePicUrl ? await saveRemote(ig.profilePicUrl, `${dir}profile`, "image/jpeg").catch(() => null) : null;

    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        id: postId,
        workspace_id: project.workspace_id,
        project_id: projectId,
        folder_id: folderId || null,
        shortcode: ig.shortcode,
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
        taken_at: ig.takenAt,
        type: ig.type,
        likes: ig.likes,
        comments: ig.comments,
        views: ig.views,
        music: ig.music,
        location: ig.location,
        media,
        thumb_path: thumbPath,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ post });
  } catch (e) {
    const status = e instanceof IgError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "가져오기 실패" }, { status });
  }
}
