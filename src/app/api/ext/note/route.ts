import { extAuth, projectFor } from "@/lib/extAuth";

// 선택한 문구를 메모 카드로 (카피·문장 레퍼런스용)
export async function POST(request: Request) {
  const a = await extAuth(request);
  if ("error" in a) return a.error;
  const { projectId, folderId, text, url, title } = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    folderId?: string | null;
    text?: string;
    url?: string;
    title?: string;
  };
  const project = projectId ? await projectFor(a.sb, a.ws, projectId, folderId) : null;
  if (!project) return Response.json({ error: "저장할 프로젝트를 찾을 수 없어요" }, { status: 404 });
  const body = (text ?? "").trim().slice(0, 20000);
  if (!body) return Response.json({ error: "저장할 문구가 없어요" }, { status: 400 });
  let site: string | null = null;
  try {
    site = url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {}
  const id = crypto.randomUUID();
  const { data: profile } = await a.sb.from("profiles").select("name, email").eq("id", a.userId).maybeSingle();
  const firstLine = body.split("\n").find((l) => l.trim())?.trim() ?? "메모";
  const { data, error } = await a.sb
    .from("posts")
    .insert({
      id,
      workspace_id: project.workspace_id,
      project_id: project.id,
      folder_id: folderId || null,
      source: "upload",
      format: "note",
      type: "note",
      shortcode: id,
      url: url && /^https?:\/\//.test(url) ? url : "",
      title: firstLine.slice(0, 60),
      account: { username: profile?.name ?? profile?.email ?? "나", fullName: title ? `${title}${site ? ` · ${site}` : ""}` : site, profileUrl: "" },
      caption: body,
      body,
      site,
      taken_at: new Date().toISOString(),
      created_by: a.userId,
    })
    .select("id, title")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ post: data });
}
