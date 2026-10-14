import { IgError } from "@/lib/instagram";
import { ingestLink } from "@/lib/ingest";
import { detect } from "@/lib/sources/detect";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 300;

// 링크를 받아 출처별로 수집하고 프로젝트(와 폴더)에 넣는다
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/posts">) {
  const { id: projectId } = await ctx.params;
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });

  const { url, folderId } = (await request.json().catch(() => ({}))) as { url?: string; folderId?: string | null };
  const d = url ? detect(url) : null;
  if (!d) return Response.json({ error: "링크를 알아볼 수 없어요" }, { status: 400 });

  // RLS 덕분에 멤버가 아니면 프로젝트가 안 보인다
  const { data: project } = await supabase.from("projects").select("id, workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  try {
    return Response.json(await ingestLink(supabase, project, d, folderId || null));
  } catch (e) {
    const status = e instanceof IgError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "가져오기 실패" }, { status });
  }
}
