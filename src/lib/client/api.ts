import { supabase } from "@/lib/supabase/browser";
import type { Attachment, Folder, Invite, Member, Post, Project, Workspace } from "@/lib/types";

export const fileUrl = (path: string) => `/api/file?path=${encodeURIComponent(path)}`;

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.assign("/login");
    throw new Error("로그인이 필요해요");
  }
  if (!res.ok) throw new Error(data.error ?? `요청 실패 (${res.status})`);
  return data as T;
}

function must<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const sb = () => supabase();

// 서버 라우트 (인스타·Blob·Soniox 가 필요한 것만)
export const server = {
  ingest: (projectId: string, url: string, folderId: string | null) =>
    fetch(`/api/projects/${projectId}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, folderId }),
    }).then((r) => json<{ post: Post; existed?: boolean }>(r)),
  transcribe: (id: string, mediaIndex: number, audio: unknown) =>
    fetch(`/api/posts/${id}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaIndex, audio }),
    }).then((r) => json<{ post: Post }>(r)),
  removeAttachment: (id: string, path: string) =>
    fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeAttachment: path }),
    }).then((r) => json<{ post: Post }>(r)),
  deletePost: (id: string) => fetch(`/api/posts/${id}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
};

// 나머지는 RLS 를 믿고 브라우저에서 바로
export const db = {
  me: async () => (await sb().auth.getUser()).data.user,

  workspaces: async () =>
    must<Workspace[]>(await sb().from("workspaces").select("*").order("created_at", { ascending: true })),
  // insert 직후 RETURNING 은 아직 멤버가 아니라 RLS 에 막힌다 (owner 등록은 같은 문장의 트리거). id 를 먼저 정하고 따로 읽는다.
  createWorkspace: async (name: string) => {
    const id = crypto.randomUUID();
    must(await sb().from("workspaces").insert({ id, name }));
    return must<Workspace>(await sb().from("workspaces").select("*").eq("id", id).single());
  },
  renameWorkspace: async (id: string, name: string) => must(await sb().from("workspaces").update({ name }).eq("id", id)),
  deleteWorkspace: async (id: string) => must(await sb().from("workspaces").delete().eq("id", id)),

  bundle: async (wsId: string) => {
    const [ws, projects, folders, members, invites] = await Promise.all([
      sb().from("workspaces").select("*").eq("id", wsId).maybeSingle(),
      sb().from("projects").select("*").eq("workspace_id", wsId).order("position"),
      sb().from("folders").select("*").eq("workspace_id", wsId).order("position"),
      sb().from("workspace_members").select("*, profile:profiles(email, name)").eq("workspace_id", wsId).order("created_at"),
      sb().from("workspace_invites").select("*").eq("workspace_id", wsId).eq("revoked", false).gt("expires_at", new Date().toISOString()),
    ]);
    return {
      workspace: must<Workspace | null>(ws),
      projects: must<Project[]>(projects),
      folders: must<Folder[]>(folders),
      members: must<Member[]>(members),
      invites: must<Invite[]>(invites),
    };
  },
  postCounts: async (wsId: string) => {
    const rows = must<{ project_id: string; folder_id: string | null }[]>(
      await sb().from("posts").select("project_id, folder_id").eq("workspace_id", wsId),
    );
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1);
      if (r.folder_id) counts.set(r.folder_id, (counts.get(r.folder_id) ?? 0) + 1);
    }
    return counts;
  },

  createProject: async (workspace_id: string, name: string, description?: string) =>
    must<Project>(await sb().from("projects").insert({ workspace_id, name, description: description || null }).select("*").single()),
  updateProject: async (id: string, patch: Partial<Pick<Project, "name" | "description">>) =>
    must<Project>(await sb().from("projects").update(patch).eq("id", id).select("*").single()),
  deleteProject: async (id: string, wsId: string, postIds: string[]) => {
    // Blob 파일까지 지우려면 게시물마다 서버를 거친다
    await Promise.all(postIds.map((p) => server.deletePost(p).catch(() => {})));
    must(await sb().from("projects").delete().eq("id", id).eq("workspace_id", wsId));
  },

  createFolder: async (project: Project, name: string, parent_id: string | null) =>
    must<Folder>(
      await sb()
        .from("folders")
        .insert({ workspace_id: project.workspace_id, project_id: project.id, name, parent_id })
        .select("*")
        .single(),
    ),
  renameFolder: async (id: string, name: string) => must<Folder>(await sb().from("folders").update({ name }).eq("id", id).select("*").single()),
  deleteFolder: async (id: string) => must(await sb().from("folders").delete().eq("id", id)),

  posts: async (projectId: string) =>
    must<Post[]>(await sb().from("posts").select("*").eq("project_id", projectId).order("created_at", { ascending: false })),
  updatePost: async (id: string, patch: Partial<Pick<Post, "title" | "note" | "folder_id">>) =>
    must<Post>(await sb().from("posts").update(patch).eq("id", id).select("*").single()),
  movePosts: async (ids: string[], folder_id: string | null) =>
    must<Post[]>(await sb().from("posts").update({ folder_id }).in("id", ids).select("*")),
  addAttachments: async (post: Post, added: Attachment[]) => {
    const { data } = await sb().from("posts").select("attachments").eq("id", post.id).single();
    const current = ((data?.attachments ?? []) as Attachment[]).filter((a) => !added.some((x) => x.path === a.path));
    return must<Post>(await sb().from("posts").update({ attachments: [...current, ...added] }).eq("id", post.id).select("*").single());
  },

  createInvite: async (workspace_id: string) =>
    must<Invite>(await sb().from("workspace_invites").insert({ workspace_id }).select("*").single()),
  revokeInvite: async (id: string) => must(await sb().from("workspace_invites").update({ revoked: true }).eq("id", id)),
  removeMember: async (workspace_id: string, user_id: string) =>
    must(await sb().from("workspace_members").delete().eq("workspace_id", workspace_id).eq("user_id", user_id)),
  setRole: async (workspace_id: string, user_id: string, role: "owner" | "member") =>
    must(await sb().from("workspace_members").update({ role }).eq("workspace_id", workspace_id).eq("user_id", user_id)),

  inviteInfo: async (token: string) =>
    must<{ workspace_id: string; workspace_name: string; valid: boolean }[]>(await sb().rpc("invite_info", { invite_token: token }))[0] ?? null,
  acceptInvite: async (token: string) => must<string>(await sb().rpc("accept_invite", { invite_token: token })),
};
