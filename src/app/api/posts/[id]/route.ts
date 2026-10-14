import { deleteFile, deletePrefix, postDir } from "@/lib/blob";
import { requireUser } from "@/lib/supabase/server";
import type { Attachment } from "@/lib/types";

// 첨부 하나 지우기 (Blob 파일도 같이)
export async function PATCH(request: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const { id } = await ctx.params;
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const { removeAttachment } = (await request.json()) as { removeAttachment?: string };

  const { data: post } = await supabase.from("posts").select("id, workspace_id, attachments").eq("id", id).maybeSingle();
  if (!post) return Response.json({ error: "없음" }, { status: 404 });
  const attachments = post.attachments as Attachment[];
  const target = attachments.find((a) => a.path === removeAttachment);
  if (target && target.path.startsWith(postDir(post.workspace_id, post.id))) await deleteFile(target.path);
  const { data, error } = await supabase
    .from("posts")
    .update({ attachments: attachments.filter((a) => a.path !== removeAttachment) })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ post: data });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const { id } = await ctx.params;
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const { data: post } = await supabase.from("posts").select("id, workspace_id").eq("id", id).maybeSingle();
  if (!post) return Response.json({ error: "없음" }, { status: 404 });
  await deletePrefix(postDir(post.workspace_id, post.id));
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
