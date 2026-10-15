import type { AudioClasses } from "@/lib/classify";
import { requireUser } from "@/lib/supabase/server";
import { transcribeMedia } from "@/lib/transcribeServer";

export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const { id } = await ctx.params;
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const { mediaIndex, audio } = (await request.json()) as { mediaIndex: number; audio?: AudioClasses | null };
  try {
    return Response.json({ post: await transcribeMedia(supabase, id, mediaIndex, audio ?? null) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "전사 실패" }, { status: 400 });
  }
}
