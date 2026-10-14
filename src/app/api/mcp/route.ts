import { createHash } from "node:crypto";
import { get } from "@vercel/blob";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { ingestLink } from "@/lib/ingest";
import { postMarkdown, formatLabel } from "@/lib/markdown";
import { detect, SOURCE_LABEL } from "@/lib/sources/detect";
import { supabaseAdmin } from "@/lib/supabase/server";
import { FORMAT_GROUP, type Folder, type Post } from "@/lib/types";

// 사용자의 로컬 Claude(Claude Code / Desktop)가 붙는 MCP 서버. 분석은 사용자 쪽 Claude 가 하므로 API 비용이 없다.
// 인증은 개인 토큰(api_tokens), 데이터 접근은 관리 클라이언트 + 워크스페이스 멤버십 확인으로 범위를 좁힌다.

export const maxDuration = 300;

type Ctx = { http?: { authInfo?: AuthInfo } };
const userOf = (ctx: Ctx) => (ctx.http?.authInfo?.extra as { userId?: string } | undefined)?.userId ?? "";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

async function memberships(userId: string) {
  const { data } = await supabaseAdmin()
    .from("workspace_members")
    .select("workspace_id, role, workspace:workspaces(id, name)")
    .eq("user_id", userId);
  return (data ?? []) as unknown as { workspace_id: string; role: string; workspace: { id: string; name: string } }[];
}

async function allowedWs(userId: string) {
  return new Set((await memberships(userId)).map((m) => m.workspace_id));
}

async function foldersOf(projectId: string) {
  const { data } = await supabaseAdmin().from("folders").select("*").eq("project_id", projectId);
  return (data ?? []) as Folder[];
}

function pathOf(folders: Folder[], id: string | null) {
  const out: string[] = [];
  let cur = id ? folders.find((f) => f.id === id) : undefined;
  while (cur && out.length < 20) {
    out.unshift(cur.name);
    cur = cur.parent_id ? folders.find((f) => f.id === cur!.parent_id) : undefined;
  }
  return out.join("/");
}

function subtree(folders: Folder[], id: string) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) (ids.add(f.id), (grew = true));
  }
  return ids;
}

const line = (p: Post, folders: Folder[]) =>
  `- [${p.id}] ${p.title} | ${SOURCE_LABEL[p.source]} ${formatLabel(p)} | ${p.source === "web" ? p.site : `@${p.account.username}`}` +
  `${p.folder_id ? ` | 폴더: ${pathOf(folders, p.folder_id)}` : ""}${p.transcripts.length ? " | 전사 있음" : ""}${p.note ? " | 메모 있음" : ""} | ${p.url || "(직접 추가)"}`;

async function imageBlock(path: string) {
  const res = await get(path, { access: "private" });
  if (!res?.stream || res.statusCode !== 200) return null;
  const type = res.blob.contentType ?? "";
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
  const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
  if (buf.byteLength > 4 * 1024 * 1024) return null;
  return { type: "image" as const, data: buf.toString("base64"), mimeType: type };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_workspaces",
      { title: "워크스페이스 목록", description: "내가 속한 워크스페이스(사업 아이템별 공간)와 역할을 보여준다.", inputSchema: z.object({}) },
      async (_args, ctx) => {
        const ms = await memberships(userOf(ctx));
        if (!ms.length) return text("속한 워크스페이스가 없어요.");
        return text(ms.map((m) => `- [${m.workspace_id}] ${m.workspace?.name} (${m.role === "owner" ? "관리자" : "멤버"})`).join("\n"));
      },
    );

    server.registerTool(
      "list_projects",
      {
        title: "프로젝트와 폴더",
        description: "워크스페이스의 프로젝트(마케팅, 기술 분석 등)와 폴더 트리, 레퍼런스 개수를 보여준다. workspace_id 를 생략하면 내 모든 워크스페이스.",
        inputSchema: z.object({ workspace_id: z.string().uuid().optional() }),
      },
      async ({ workspace_id }, ctx) => {
        const ws = await allowedWs(userOf(ctx));
        const ids = workspace_id ? [workspace_id].filter((id) => ws.has(id)) : [...ws];
        if (!ids.length) return fail("접근할 수 있는 워크스페이스가 아니에요.");
        const sb = supabaseAdmin();
        const [{ data: projects }, { data: folders }, { data: posts }] = await Promise.all([
          sb.from("projects").select("id, workspace_id, name, description").in("workspace_id", ids).order("position"),
          sb.from("folders").select("*").in("workspace_id", ids),
          sb.from("posts").select("project_id, folder_id").in("workspace_id", ids),
        ]);
        const count = (pid: string, fid?: string) => (posts ?? []).filter((p) => p.project_id === pid && (!fid || p.folder_id === fid)).length;
        const out: string[] = [];
        for (const p of projects ?? []) {
          out.push(`## [${p.id}] ${p.name} (레퍼런스 ${count(p.id)}개)${p.description ? `\n${p.description}` : ""}`);
          const fs = ((folders ?? []) as Folder[]).filter((f) => f.project_id === p.id);
          const walk = (parent: string | null, depth: number) => {
            for (const f of fs.filter((x) => x.parent_id === parent)) {
              out.push(`${"  ".repeat(depth)}- 폴더 [${f.id}] ${f.name} (${count(p.id, f.id)}개)`);
              walk(f.id, depth + 1);
            }
          };
          walk(null, 0);
        }
        return text(out.join("\n") || "프로젝트가 없어요.");
      },
    );

    server.registerTool(
      "list_references",
      {
        title: "레퍼런스 목록",
        description:
          "프로젝트(또는 폴더)의 레퍼런스 목록. 각 줄의 [id] 로 get_reference 를 부르면 캡션·본문·전사·이미지를 볼 수 있다. format: video | image | text | page.",
        inputSchema: z.object({
          project_id: z.string().uuid(),
          folder_id: z.string().uuid().optional(),
          include_subfolders: z.boolean().default(true),
          format: z.enum(["all", "video", "image", "text", "page"]).default("all"),
          query: z.string().optional(),
          limit: z.number().int().min(1).max(200).default(50),
        }),
      },
      async ({ project_id, folder_id, include_subfolders, format, query, limit }, ctx) => {
        const sb = supabaseAdmin();
        const { data: project } = await sb.from("projects").select("id, workspace_id, name").eq("id", project_id).maybeSingle();
        if (!project || !(await allowedWs(userOf(ctx))).has(project.workspace_id)) return fail("접근할 수 있는 프로젝트가 아니에요.");
        const folders = await foldersOf(project_id);
        const { data } = await sb.from("posts").select("*").eq("project_id", project_id).order("created_at", { ascending: false });
        let posts = (data ?? []) as Post[];
        if (folder_id) {
          const scope = include_subfolders ? subtree(folders, folder_id) : new Set([folder_id]);
          posts = posts.filter((p) => p.folder_id && scope.has(p.folder_id));
        }
        if (format !== "all") posts = posts.filter((p) => FORMAT_GROUP[p.format] === format);
        if (query) {
          const q = query.toLowerCase();
          posts = posts.filter((p) => [p.title, p.caption, p.body, p.note, p.account.username, p.site ?? ""].some((s) => s?.toLowerCase().includes(q)));
        }
        const total = posts.length;
        posts = posts.slice(0, limit);
        return text(`# ${project.name}${folder_id ? ` / ${pathOf(folders, folder_id)}` : ""} — ${total}개${total > posts.length ? ` (앞 ${posts.length}개)` : ""}\n\n${posts.map((p) => line(p, folders)).join("\n") || "레퍼런스가 없어요."}`);
      },
    );

    server.registerTool(
      "get_reference",
      {
        title: "레퍼런스 읽기",
        description:
          "레퍼런스 하나의 전체 내용: 출처·계정·지표·캡션·본문(아티클/글)·영상 전사(말/노래 구분)·메모. include_images 면 썸네일과 사진을 이미지로 함께 준다 (영상 파일 자체는 주지 않음).",
        inputSchema: z.object({
          id: z.string().uuid(),
          include_images: z.boolean().default(true),
          max_images: z.number().int().min(0).max(10).default(4),
        }),
      },
      async ({ id, include_images, max_images }, ctx) => {
        const { data } = await supabaseAdmin().from("posts").select("*").eq("id", id).maybeSingle();
        const post = data as Post | null;
        if (!post || !(await allowedWs(userOf(ctx))).has(post.workspace_id)) return fail("접근할 수 있는 레퍼런스가 아니에요.");
        const folders = await foldersOf(post.project_id);
        const md = postMarkdown(post, { folderPath: post.folder_id ? pathOf(folders, post.folder_id) : undefined, files: false });
        const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [{ type: "text", text: md }];
        if (include_images && max_images > 0) {
          const paths = [...(post.thumb_path ? [post.thumb_path] : []), ...post.media.filter((m) => m.kind === "image").map((m) => m.path)];
          for (const p of [...new Set(paths)].slice(0, max_images)) {
            const img = await imageBlock(p).catch(() => null);
            if (img) content.push(img);
          }
        }
        return { content };
      },
    );

    server.registerTool(
      "search_references",
      {
        title: "레퍼런스 검색",
        description: "내 모든 워크스페이스(또는 지정한 곳)에서 제목·캡션·본문·메모·계정으로 레퍼런스를 찾는다.",
        inputSchema: z.object({ query: z.string().min(1), workspace_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(100).default(30) }),
      },
      async ({ query, workspace_id, limit }, ctx) => {
        const ws = await allowedWs(userOf(ctx));
        const ids = workspace_id ? [workspace_id].filter((x) => ws.has(x)) : [...ws];
        if (!ids.length) return fail("접근할 수 있는 워크스페이스가 아니에요.");
        const q = query.replace(/[%,()]/g, " ").trim();
        const { data } = await supabaseAdmin()
          .from("posts")
          .select("*")
          .in("workspace_id", ids)
          .or(`title.ilike.%${q}%,caption.ilike.%${q}%,body.ilike.%${q}%,note.ilike.%${q}%,site.ilike.%${q}%`)
          .order("created_at", { ascending: false })
          .limit(limit);
        const posts = (data ?? []) as Post[];
        return text(posts.length ? posts.map((p) => line(p, [])).join("\n") : `'${query}' 로 찾은 레퍼런스가 없어요.`);
      },
    );

    server.registerTool(
      "save_note",
      {
        title: "메모 저장",
        description: "분석 결과나 정리를 레퍼런스의 메모에 남긴다. 팀원도 사이트에서 같이 본다. mode 가 append 면 기존 메모 뒤에 붙인다.",
        inputSchema: z.object({ id: z.string().uuid(), note: z.string().min(1).max(20000), mode: z.enum(["append", "replace"]).default("append") }),
      },
      async ({ id, note, mode }, ctx) => {
        const sb = supabaseAdmin();
        const { data } = await sb.from("posts").select("id, workspace_id, note, title").eq("id", id).maybeSingle();
        if (!data || !(await allowedWs(userOf(ctx))).has(data.workspace_id)) return fail("접근할 수 있는 레퍼런스가 아니에요.");
        const next = mode === "append" && data.note ? `${data.note}\n\n${note}` : note;
        const { error } = await sb.from("posts").update({ note: next }).eq("id", id);
        return error ? fail(error.message) : text(`'${data.title}' 메모에 저장했어요.`);
      },
    );

    server.registerTool(
      "add_reference",
      {
        title: "링크 저장",
        description: "인스타·YouTube·X·TikTok·웹 링크를 프로젝트(와 폴더)에 저장한다. 인스타 영상 전사는 사이트에서 진행된다.",
        inputSchema: z.object({ project_id: z.string().uuid(), url: z.string().min(4), folder_id: z.string().uuid().optional() }),
      },
      async ({ project_id, url, folder_id }, ctx) => {
        const userId = userOf(ctx);
        const sb = supabaseAdmin();
        const { data: project } = await sb.from("projects").select("id, workspace_id").eq("id", project_id).maybeSingle();
        if (!project || !(await allowedWs(userId)).has(project.workspace_id)) return fail("접근할 수 있는 프로젝트가 아니에요.");
        const d = detect(url);
        if (!d) return fail("링크를 알아볼 수 없어요.");
        try {
          const { post, existed } = await ingestLink(sb, project, d, folder_id ?? null, userId);
          return text(`${existed ? "이미 있는 레퍼런스예요" : "저장했어요"}: [${post.id}] ${post.title}`);
        } catch (e) {
          return fail(e instanceof Error ? e.message : "저장하지 못했어요");
        }
      },
    );
  },
  { serverInfo: { name: "reference-box", version: "1.0.0" } },
);

async function verifyToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer || !bearer.startsWith("rb_")) return undefined;
  const sb = supabaseAdmin();
  const hash = createHash("sha256").update(bearer).digest("hex");
  const { data } = await sb.from("api_tokens").select("id, user_id").eq("token_hash", hash).maybeSingle();
  if (!data) return undefined;
  void sb.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return { token: bearer, clientId: data.user_id, scopes: ["refs"], extra: { userId: data.user_id } };
}

const authed = withMcpAuth(handler, verifyToken, { required: true });

export { authed as GET, authed as POST, authed as DELETE };
