import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { fileUrl } from "./api";
import { folderName, fmtTime, KIND_LABEL, kstDate, safeName } from "@/lib/naming";
import { isNoAudio, type Folder, type Post, type Transcript } from "@/lib/types";

const n = (v: number | null | undefined) => (v == null ? "-" : v.toLocaleString("ko-KR"));
const kst = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
const ext = (path: string) => path.split(".").pop() ?? "bin";

export function transcriptText(post: Post, t: Transcript): string {
  const head = post.media.length > 1 ? `[미디어 ${String(t.mediaIndex).padStart(2, "0")}]\n` : "";
  if (isNoAudio(t)) return `${head}(소리 없는 영상)\n`;
  if (t.status === "error") return `${head}(전사 실패: ${t.error})\n`;
  const lines = t.lines.map((l) => {
    const kind = l.kind && l.kind !== "unknown" ? ` (${KIND_LABEL[l.kind]})` : "";
    return `[${fmtTime(l.start)}]${kind} ${l.text}`;
  });
  const music = (t.audio ?? []).filter((a) => a.kind !== "speech" && a.kind !== "silence");
  const runs = music.length
    ? "\n오디오 구간: " +
      music.map((a) => `${fmtTime(a.start)}-${fmtTime(a.end)} ${a.kind === "song" ? "노래" : "음악"}`).join(", ") +
      "\n"
    : "";
  return `${head}${lines.length ? lines.join("\n") : "(말이나 가사 없음)"}\n${runs}`;
}

export function postMarkdown(post: Post): string {
  const a = post.account;
  const transcripts = post.transcripts.map((t) => transcriptText(post, t)).join("\n");
  const files = post.media.map((m) => `- media/${String(m.index).padStart(2, "0")}.${ext(m.path)} (${m.kind === "video" ? "영상" : "사진"})`);
  return [
    `# ${post.title}`,
    "",
    `- 링크: ${post.url}`,
    `- 계정: @${a.username}${a.fullName ? ` (${a.fullName})` : ""}${a.isVerified ? " 인증됨" : ""}`,
    `- 프로필: ${a.profileUrl}`,
    `- 게시일: ${kst(post.taken_at)}`,
    `- 형식: ${post.type === "carousel" ? `캐러셀 ${post.media.length}장` : post.type === "video" ? "릴스/영상" : "사진"}`,
    `- 좋아요 ${n(post.likes)} · 댓글 ${n(post.comments)}${post.views != null ? ` · 조회 ${n(post.views)}` : ""}`,
    post.music ? `- 음악: ${post.music}` : "",
    post.location ? `- 위치: ${post.location}` : "",
    post.hashtags.length ? `- 해시태그: ${post.hashtags.join(" ")}` : "",
    "",
    post.note ? `## 메모\n\n${post.note}\n` : "",
    "## 캡션",
    "",
    post.caption || "(캡션 없음)",
    "",
    post.transcripts.length ? "## 영상 전사\n\n(말 / 노래 / 말+배경음악 은 오디오 분류 결과)\n\n" + transcripts : "",
    "## 파일",
    "",
    ...files,
    ...post.attachments.map((x) => `- attachments/${x.name} (DM 파일)`),
    "",
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n");
}

function indexMarkdown(posts: Post[], folders: string[]): string {
  return [
    `# 인스타 레퍼런스 ${posts.length}개`,
    "",
    `내보낸 시각: ${kst(new Date().toISOString())}`,
    "",
    "각 폴더의 post.md 에 링크·계정·캡션·전사가 있고, media/ 에 원본 사진·영상, attachments/ 에 DM 으로 받은 파일이 있습니다.",
    "",
    ...posts.map(
      (p, i) =>
        `${i + 1}. ${folders[i]}/ - @${p.account.username} · ${p.type === "carousel" ? `캐러셀 ${p.media.length}장` : p.type === "video" ? "영상" : "사진"} · ${p.url}`,
    ),
    "",
  ].join("\n");
}

// 폴더 id -> "상위/하위" 경로. base 를 주면 그 폴더 아래 상대 경로만
function folderPaths(folders: Folder[], base: string | null) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = (id: string, seen = new Set<string>()): string => {
    const f = byId.get(id);
    if (!f || id === base || seen.has(id)) return "";
    seen.add(id);
    const parent = f.parent_id ? path(f.parent_id, seen) : "";
    return parent ? `${parent}/${safeName(f.name, 40)}` : safeName(f.name, 40);
  };
  return path;
}

export async function downloadZip(
  posts: Post[],
  ctx: { projectName: string; folders: Folder[]; baseFolderId?: string | null; rootName?: string },
  onProgress: (done: number, total: number) => void,
) {
  const chunks: Uint8Array[] = [];
  let failed: unknown = null;
  const zip = new Zip((err, chunk) => {
    if (err) failed = err;
    else chunks.push(chunk);
  });
  const addText = (name: string, text: string) => {
    const f = new ZipDeflate(name, { level: 6 });
    zip.add(f);
    f.push(strToU8(text), true);
  };
  const addBinary = async (name: string, path: string) => {
    const res = await fetch(fileUrl(path));
    if (!res.ok) throw new Error(`${name.split("/").pop()} 다운로드 실패`);
    const f = new ZipPassThrough(name);
    zip.add(f);
    f.push(new Uint8Array(await res.arrayBuffer()), true);
  };

  const single = posts.length === 1 && !ctx.rootName;
  const root = single
    ? folderName(posts[0])
    : `${safeName(ctx.rootName ?? ctx.projectName, 50)}_${kstDate(new Date().toISOString())}`;
  const fpath = folderPaths(ctx.folders, ctx.baseFolderId ?? null);
  const used = new Map<string, number>();
  const dirs = posts.map((p) => {
    if (single) return root;
    const sub = p.folder_id ? fpath(p.folder_id) : "";
    const base = `${root}/${sub ? sub + "/" : ""}${folderName(p)}`;
    const k = (used.get(base) ?? 0) + 1;
    used.set(base, k);
    return k > 1 ? `${base}_${k}` : base;
  });

  const total = posts.reduce((s, p) => s + p.media.length + p.attachments.length, 0);
  let done = 0;
  onProgress(0, total);
  if (!single) addText(`${root}/INDEX.md`, indexMarkdown(posts, dirs.map((d) => d.slice(root.length + 1))));

  for (const [i, post] of posts.entries()) {
    const dir = dirs[i];
    addText(`${dir}/post.md`, postMarkdown(post));
    addText(`${dir}/caption.txt`, `@${post.account.username}\n${post.url}\n\n${post.caption}\n`);
    if (post.transcripts.length) addText(`${dir}/transcript.txt`, post.transcripts.map((t) => transcriptText(post, t)).join("\n"));
    addText(`${dir}/meta.json`, JSON.stringify(post, null, 2));
    for (const m of post.media) {
      await addBinary(`${dir}/media/${String(m.index).padStart(2, "0")}.${ext(m.path)}`, m.path);
      onProgress(++done, total);
    }
    for (const a of post.attachments) {
      await addBinary(`${dir}/attachments/${safeName(a.name, 120)}`, a.path);
      onProgress(++done, total);
    }
  }
  zip.end();
  if (failed) throw failed;

  const blob = new Blob(chunks as BlobPart[], { type: "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${root}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}
