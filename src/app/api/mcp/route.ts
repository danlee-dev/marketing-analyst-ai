import { get } from "@vercel/blob";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { ingestLink } from "@/lib/ingest";
import { fileExt, postMarkdown, formatLabel } from "@/lib/markdown";
import { safeName } from "@/lib/naming";
import { signPath } from "@/lib/signed";
import { detect, SOURCE_LABEL } from "@/lib/sources/detect";
import { supabaseAdmin } from "@/lib/supabase/server";
import { userFromToken } from "@/lib/tokenAuth";
import { FORMAT_GROUP, type Folder, type Post } from "@/lib/types";

// 사용자의 로컬 Claude(Claude Code / Desktop)가 붙는 MCP 서버. 분석은 사용자 쪽 Claude 가 하므로 API 비용이 없다.
// 인증은 개인 토큰(api_tokens), 데이터 접근은 관리 클라이언트 + 워크스페이스 멤버십 확인으로 범위를 좁힌다.

export const maxDuration = 300;

// 도구 안에서는 요청 객체가 없어서, 서명 링크에 쓸 사이트 주소를 요청마다 기억해 둔다 (배포마다 같은 값)
let origin = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3017";

const INSTRUCTIONS = `레퍼런스 보관함: 팀이 모은 인스타·YouTube·X·TikTok·웹 레퍼런스를 워크스페이스 > 프로젝트 > 폴더 구조로 읽고, 분석을 메모로 남기는 서버.

작업 순서
1. list_workspaces → list_projects 로 구조를 보고, list_references 로 대상을 고른다.
2. get_reference 로 캡션·본문·영상 전사(말/노래 구분)·지표·이미지를 읽는다.
3. 영상(릴스·쇼츠·X 영상)의 화면까지 분석해야 하면 get_media_links 로 원본 파일 임시 링크를 받아
   로컬에서 내려받고(curl -L -o) ffmpeg 로 프레임을 뽑아 이미지로 본다.
   예) ffmpeg -i video.mp4 -vf "select='eq(n,0)+gt(scene,0.3)',scale=720:-2" -vsync vfr frames/%03d.jpg
   장면 전환이 너무 많거나 적으면 -vf "fps=1/2,scale=720:-2" 로 2초 간격.
   훅 분석에는 첫 3초를 촘촘히: ffmpeg -t 3 -i video.mp4 -vf fps=4 hook/%02d.jpg
4. 분석 결과는 save_note 로 해당 레퍼런스 메모에 남긴다 (팀원도 사이트에서 본다). 여러 개를 비교한 종합 분석은 대표 레퍼런스나 사용자가 지정한 곳에 남긴다.
5. 새 링크는 add_reference 로 저장한다.`;

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
          "레퍼런스 하나의 전체 내용: 출처·계정·지표·캡션·본문(아티클/글)·영상 전사(말/노래 구분)·메모. include_images 면 썸네일과 사진을 이미지로 함께 준다. 영상 화면 분석은 get_media_links 로 원본을 받아 로컬에서 프레임을 나눈다.",
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
      "get_media_links",
      {
        title: "원본 파일 링크",
        description:
          "레퍼런스의 원본 영상·사진·첨부 파일을 내려받을 임시 링크(기본 1시간). 영상 화면 분석이 필요할 때 받아서 로컬에서 ffmpeg 로 프레임을 나눠 본다. YouTube·TikTok 은 원본 영상 파일이 없고 썸네일만 있다.",
        inputSchema: z.object({
          id: z.string().uuid(),
          kinds: z.array(z.enum(["video", "image", "attachment", "thumbnail"])).default(["video", "image", "thumbnail"]),
          ttl_minutes: z.number().int().min(5).max(1440).default(60),
        }),
      },
      async ({ id, kinds, ttl_minutes }, ctx) => {
        const { data } = await supabaseAdmin().from("posts").select("*").eq("id", id).maybeSingle();
        const post = data as Post | null;
        if (!post || !(await allowedWs(userOf(ctx))).has(post.workspace_id)) return fail("접근할 수 있는 레퍼런스가 아니에요.");
        const base = safeName(`${post.account.username}_${post.title}`, 40).replace(/\s+/g, "_");
        const files: { kind: string; name: string; url: string; size?: number; seconds?: number }[] = [];
        const ttl = ttl_minutes * 60;
        for (const m of post.media) {
          if (!kinds.includes(m.kind)) continue;
          const name = `${base}_${String(m.index).padStart(2, "0")}.${fileExt(m.path)}`;
          files.push({ kind: m.kind, name, url: signPath(origin, m.path, name, ttl).url, size: m.size, seconds: m.duration });
        }
        if (kinds.includes("thumbnail") && post.thumb_path && !post.media.some((m) => m.path === post.thumb_path)) {
          const name = `${base}_thumb.${fileExt(post.thumb_path)}`;
          files.push({ kind: "thumbnail", name, url: signPath(origin, post.thumb_path, name, ttl).url });
        }
        if (kinds.includes("attachment")) {
          for (const a of post.attachments) files.push({ kind: "attachment", name: a.name, url: signPath(origin, a.path, a.name, ttl).url, size: a.size });
        }
        if (!files.length) {
          return text(
            post.source === "youtube" || post.source === "tiktok"
              ? `${SOURCE_LABEL[post.source]} 레퍼런스는 원본 영상 파일을 저장하지 않아요. 전사와 썸네일은 get_reference 로 볼 수 있어요. 원본: ${post.url}`
              : "내려받을 파일이 없어요.",
          );
        }
        const mb = (b?: number) => (b ? ` ${(b / 1e6).toFixed(1)}MB` : "");
        const lines = files.map((f) => `- ${f.kind} ${f.name}${mb(f.size)}${f.seconds ? ` ${Math.round(f.seconds)}초` : ""}\n  ${f.url}`);
        const dir = `refs/${base}`;
        const curl = files.map((f) => `curl -sL -o "${dir}/${f.name}" "${f.url}"`).join("\n");
        const videos = files.filter((f) => f.kind === "video");
        const ff = videos
          .map((f) => {
            const stem = f.name.replace(/\.[^.]+$/, "");
            return `mkdir -p "${dir}/${stem}_frames" && ffmpeg -loglevel error -i "${dir}/${f.name}" -vf "select='eq(n,0)+gt(scene,0.3)',scale=720:-2" -vsync vfr "${dir}/${stem}_frames/%03d.jpg"`;
          })
          .join("\n");
        return text(
          `# ${post.title} 원본 파일 (${ttl_minutes}분 동안 유효)\n\n${lines.join("\n")}\n\n내려받기:\n\`\`\`bash\nmkdir -p "${dir}"\n${curl}\n\`\`\`` +
            (ff ? `\n\n프레임 나누기 (장면 전환마다):\n\`\`\`bash\n${ff}\n\`\`\`` : ""),
        );
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
  { serverInfo: { name: "reference-box", version: "1.1.0" }, instructions: INSTRUCTIONS },
);

async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  const userId = await userFromToken(bearerToken);
  return userId ? { token: bearerToken!, clientId: userId, scopes: ["refs"], extra: { userId } } : undefined;
}

const authed = withMcpAuth(handler, verifyToken, { required: true });

const route = (req: Request) => {
  origin = new URL(req.url).origin;
  return authed(req);
};

export { route as GET, route as POST, route as DELETE };
