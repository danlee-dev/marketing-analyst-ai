import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { bearer, memberWorkspaceIds, userFromToken } from "./tokenAuth";

// 크롬 확장 요청: 개인 토큰으로 사용자 확인 + 멤버인 워크스페이스로만 범위 제한
export async function extAuth(request: Request) {
  const userId = await userFromToken(bearer(request));
  if (!userId) return { error: Response.json({ error: "확장을 다시 연결해 주세요" }, { status: 401 }) } as const;
  return { userId, ws: await memberWorkspaceIds(userId), sb: supabaseAdmin() } as const;
}

export async function projectFor(sb: ReturnType<typeof supabaseAdmin>, ws: Set<string>, projectId: string, folderId?: string | null) {
  const { data: project } = await sb.from("projects").select("id, workspace_id, name").eq("id", projectId).maybeSingle();
  if (!project || !ws.has(project.workspace_id)) return null;
  if (folderId) {
    const { data: f } = await sb.from("folders").select("id").eq("id", folderId).eq("project_id", projectId).maybeSingle();
    if (!f) return null;
  }
  return project as { id: string; workspace_id: string; name: string };
}
