import { extAuth, projectFor } from "@/lib/extAuth";
import { detect } from "@/lib/sources/detect";

// 한 번에 가져오기 전에 이미 프로젝트에 있는 링크를 걸러낸다
export async function POST(request: Request) {
  const a = await extAuth(request);
  if ("error" in a) return a.error;
  const { projectId, urls } = (await request.json().catch(() => ({}))) as { projectId?: string; urls?: string[] };
  const project = projectId ? await projectFor(a.sb, a.ws, projectId) : null;
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  const list = (urls ?? []).slice(0, 2000).map((u) => ({ u, d: detect(u) })).filter((x) => x.d?.id);
  const { data } = await a.sb.from("posts").select("source, shortcode").eq("project_id", project.id);
  const have = new Set((data ?? []).map((r) => `${r.source}:${r.shortcode}`));
  return Response.json({ existing: list.filter((x) => have.has(`${x.d!.source}:${x.d!.id}`)).map((x) => x.u) });
}
