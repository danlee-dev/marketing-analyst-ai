import { del } from "@vercel/blob";
import { deletePrefix, postDir, readPost, writePost } from "@/lib/blob";
import type { Attachment } from "@/lib/types";

export async function GET(_req: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const post = await readPost((await ctx.params).id);
  return post ? Response.json({ post }) : Response.json({ error: "없음" }, { status: 404 });
}

type Patch = { title?: string; addAttachments?: Attachment[]; removeAttachment?: string };

export async function PATCH(request: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const { id } = await ctx.params;
  const post = await readPost(id);
  if (!post) return Response.json({ error: "없음" }, { status: 404 });
  const body = (await request.json()) as Patch;

  if (typeof body.title === "string" && body.title.trim()) post.title = body.title.trim().slice(0, 80);
  if (body.addAttachments?.length) {
    const prefix = `${postDir(id)}attachments/`;
    for (const a of body.addAttachments) {
      if (!a.path.startsWith(prefix)) continue;
      post.attachments = post.attachments.filter((x) => x.path !== a.path).concat(a);
    }
  }
  if (body.removeAttachment) {
    const target = post.attachments.find((a) => a.path === body.removeAttachment);
    if (target) {
      await del(target.path).catch(() => {});
      post.attachments = post.attachments.filter((a) => a.path !== target.path);
    }
  }
  return Response.json({ post: await writePost(post) });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/posts/[id]">) {
  await deletePrefix(postDir((await ctx.params).id));
  return Response.json({ ok: true });
}
