import { extAuth } from "@/lib/extAuth";

// 확장 팝업의 저장 위치 고르기: 워크스페이스 > 프로젝트 > 폴더
export async function GET(request: Request) {
  const a = await extAuth(request);
  if ("error" in a) return a.error;
  const ids = [...a.ws];
  if (!ids.length) return Response.json({ user: null, workspaces: [] });
  const [{ data: u }, { data: wss }, { data: projects }, { data: folders }] = await Promise.all([
    a.sb.from("profiles").select("email, name").eq("id", a.userId).maybeSingle(),
    a.sb.from("workspaces").select("id, name").in("id", ids).order("created_at"),
    a.sb.from("projects").select("id, workspace_id, name").in("workspace_id", ids).order("position"),
    a.sb.from("folders").select("id, project_id, parent_id, name, position").in("workspace_id", ids).order("position"),
  ]);
  return Response.json({
    user: u,
    workspaces: (wss ?? []).map((w) => ({
      ...w,
      projects: (projects ?? [])
        .filter((p) => p.workspace_id === w.id)
        .map((p) => ({ id: p.id, name: p.name, folders: (folders ?? []).filter((f) => f.project_id === p.id) })),
    })),
  });
}
