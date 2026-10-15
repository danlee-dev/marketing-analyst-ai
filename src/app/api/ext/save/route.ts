import { putFile } from "@/lib/blob";
import { extAuth, projectFor } from "@/lib/extAuth";
import { ingestLink } from "@/lib/ingest";
import { IgError } from "@/lib/instagram";
import { detect } from "@/lib/sources/detect";
import { transcribePending } from "@/lib/transcribeServer";
import type { Attachment, Post } from "@/lib/types";

export const maxDuration = 300;

// 확장에서 저장: 링크 수집 + (선택) 메모, 화면 캡처, 영상 전사
export async function POST(request: Request) {
  const a = await extAuth(request);
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    folderId?: string | null;
    url?: string;
    note?: string;
    screenshot?: string;
    transcribe?: boolean;
  };
  const project = body.projectId ? await projectFor(a.sb, a.ws, body.projectId, body.folderId) : null;
  if (!project) return Response.json({ error: "저장할 프로젝트를 찾을 수 없어요" }, { status: 404 });
  const d = body.url ? detect(body.url) : null;
  if (!d) return Response.json({ error: "저장할 수 없는 주소예요" }, { status: 400 });

  try {
    const res = await ingestLink(a.sb, project, d, body.folderId || null, a.userId);
    let post: Post = res.post;
    const patch: Partial<Post> = {};

    if (body.note?.trim()) patch.note = post.note ? `${post.note}\n\n${body.note.trim()}` : body.note.trim();

    const m = body.screenshot?.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
    if (m) {
      const buf = Buffer.from(m[2], "base64");
      if (buf.byteLength < 8 * 1024 * 1024) {
        const ext = m[1] === "jpeg" ? "jpg" : m[1];
        const path = `w/${project.workspace_id}/p/${post.id}/attachments/screenshot-${Date.now()}.${ext}`;
        await putFile(path, new Blob([new Uint8Array(buf)]), `image/${m[1]}`);
        const shot: Attachment = { name: `화면 캡처.${ext}`, path, size: buf.byteLength, contentType: `image/${m[1]}`, addedAt: new Date().toISOString() };
        patch.attachments = [...post.attachments, shot];
        // 웹페이지는 실제 화면이 og 이미지보다 레퍼런스로 낫다
        if (post.source === "web" || !post.thumb_path) patch.thumb_path = path;
      }
    }
    if (Object.keys(patch).length) {
      const { data } = await a.sb.from("posts").update(patch).eq("id", post.id).select("*").single();
      if (data) post = data as Post;
    }
    if (body.transcribe !== false && post.media.some((x) => x.kind === "video")) {
      post = await transcribePending(a.sb, post).catch(() => post);
    }
    return Response.json({ post: { id: post.id, title: post.title, url: post.url, source: post.source, format: post.format, project_id: post.project_id, workspace_id: post.workspace_id, folder_id: post.folder_id }, existed: !!res.existed });
  } catch (e) {
    const status = e instanceof IgError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "저장하지 못했어요" }, { status });
  }
}
