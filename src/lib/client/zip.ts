import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { fileUrl } from "./api";
import { fileExt as ext, indexMarkdown, postMarkdown, transcriptText } from "@/lib/markdown";
import { folderName, kstDate, safeName } from "@/lib/naming";
import type { Folder, Post } from "@/lib/types";

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
  const fullPath = folderPaths(ctx.folders, null);
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
    addText(`${dir}/post.md`, postMarkdown(post, { folderPath: post.folder_id ? fullPath(post.folder_id) : undefined }));
    if (post.caption) addText(`${dir}/caption.txt`, `${post.source === "web" ? post.site : `@${post.account.username}`}\n${post.url}\n\n${post.caption}\n`);
    if (post.body && (post.format === "article" || post.format === "page")) addText(`${dir}/article.md`, `# ${post.title}\n\n${post.url}\n\n${post.body}\n`);
    if (post.transcripts.length) addText(`${dir}/transcript.txt`, post.transcripts.map((t) => transcriptText(post, t)).join("\n"));
    addText(`${dir}/meta.json`, JSON.stringify(post, null, 2));
    for (const m of post.media) {
      await addBinary(`${dir}/media/${String(m.index).padStart(2, "0")}.${ext(m.path)}`, m.path);
      onProgress(++done, total);
    }
    if (!post.media.length && post.thumb_path) await addBinary(`${dir}/thumbnail.${ext(post.thumb_path)}`, post.thumb_path).catch(() => {});
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
