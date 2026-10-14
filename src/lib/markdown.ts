import { fmtTime, KIND_LABEL } from "./naming";
import { SOURCE_LABEL } from "./sources/detect";
import { isNoAudio, type Format, type Post, type Transcript } from "./types";

// 게시물 → 사람과 Claude 가 함께 읽는 마크다운. zip 의 post.md 와 MCP 응답이 같은 걸 쓴다.

const n = (v: number | null | undefined) => (v == null ? null : v.toLocaleString("ko-KR"));
const kst = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
export const fileExt = (path: string) => path.split(".").pop() ?? "bin";

export const FORMAT_LABEL: Record<Format, string> = {
  video: "영상",
  image: "사진",
  carousel: "캐러셀",
  text: "글",
  article: "아티클",
  page: "웹페이지",
  note: "메모",
};

export function formatLabel(post: Post) {
  if (post.source === "youtube" && post.site?.includes("shorts")) return "쇼츠";
  if (post.source === "instagram" && post.format === "video") return "릴스";
  if (post.format === "carousel") return `캐러셀 ${post.media.length}장`;
  return FORMAT_LABEL[post.format] ?? post.format;
}

export function transcriptText(post: Post, t: Transcript): string {
  const head = post.media.filter((m) => m.kind === "video").length > 1 ? `[미디어 ${String(t.mediaIndex).padStart(2, "0")}]\n` : "";
  if (isNoAudio(t)) return `${head}(소리 없는 영상)\n`;
  if (t.status === "error") return `${head}(전사 실패: ${t.error})\n`;
  const lines = t.lines.map((l) => {
    const kind = l.kind && l.kind !== "unknown" ? ` (${KIND_LABEL[l.kind]})` : "";
    return `[${fmtTime(l.start)}]${kind} ${l.text}`;
  });
  const music = (t.audio ?? []).filter((a) => a.kind !== "speech" && a.kind !== "silence");
  const runs = music.length
    ? "\n오디오 구간: " + music.map((a) => `${fmtTime(a.start)}-${fmtTime(a.end)} ${a.kind === "song" ? "노래" : "음악"}`).join(", ") + "\n"
    : "";
  return `${head}${lines.length ? lines.join("\n") : "(말이나 가사 없음)"}\n${runs}`;
}

export function postMarkdown(post: Post, opts: { folderPath?: string; files?: boolean } = {}): string {
  const a = post.account;
  const stats = [n(post.likes) && `좋아요 ${n(post.likes)}`, n(post.comments) && `댓글 ${n(post.comments)}`, n(post.views) && `조회 ${n(post.views)}`]
    .filter(Boolean)
    .join(" · ");
  const isText = post.format === "text" || post.format === "note";
  const hasBody = !!post.body && post.body.trim() !== post.caption.trim();
  return [
    `# ${post.title}`,
    "",
    `- 출처: ${SOURCE_LABEL[post.source] ?? post.source} · ${formatLabel(post)}`,
    post.source !== "upload" ? `- 링크: ${post.url}` : "",
    post.source === "web" ? `- 사이트: ${post.site ?? ""}${a.fullName ? ` (${a.fullName})` : ""}` : `- 계정: @${a.username}${a.fullName ? ` (${a.fullName})` : ""}${a.isVerified ? " 인증됨" : ""}`,
    post.source !== "web" && post.source !== "upload" ? `- 프로필: ${a.profileUrl}` : "",
    `- 날짜: ${kst(post.taken_at)}`,
    opts.folderPath ? `- 폴더: ${opts.folderPath}` : "",
    stats ? `- ${stats}` : "",
    post.music ? `- 음악: ${post.music}` : "",
    post.location ? `- 위치: ${post.location}` : "",
    post.hashtags.length ? `- 해시태그: ${post.hashtags.join(" ")}` : "",
    "",
    post.note ? `## 메모\n\n${post.note}\n` : "",
    post.caption && !isText ? `## ${post.source === "web" ? "요약" : "캡션"}\n\n${post.caption}\n` : "",
    isText || hasBody ? `## ${post.format === "article" ? "본문" : "내용"}\n\n${post.body || post.caption}\n` : "",
    post.transcripts.length ? "## 영상 전사\n\n(말 / 노래 / 말+배경음악 은 오디오 분류 결과)\n\n" + post.transcripts.map((t) => transcriptText(post, t)).join("\n") : "",
    opts.files !== false && (post.media.length || post.attachments.length || post.thumb_path) ? "## 파일\n" : "",
    ...(opts.files !== false
      ? [
          ...post.media.map((m) => `- media/${String(m.index).padStart(2, "0")}.${fileExt(m.path)} (${m.kind === "video" ? "영상" : "사진"})`),
          ...(!post.media.length && post.thumb_path ? [`- thumbnail.${fileExt(post.thumb_path)} (썸네일)`] : []),
          ...post.attachments.map((x) => `- attachments/${x.name} (첨부 파일)`),
        ]
      : []),
    "",
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .filter((l) => l !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function indexMarkdown(posts: Post[], folders: string[]): string {
  return [
    `# 레퍼런스 ${posts.length}개`,
    "",
    `내보낸 시각: ${kst(new Date().toISOString())}`,
    "",
    "각 폴더의 post.md 에 출처·링크·계정·캡션/본문·전사가 있고, media/ 에 원본 사진·영상, attachments/ 에 첨부 파일이 있습니다.",
    "",
    ...posts.map((p, i) => `${i + 1}. ${folders[i]}/ - ${SOURCE_LABEL[p.source]} ${formatLabel(p)} · ${p.source === "web" ? p.site : `@${p.account.username}`} · ${p.url}`),
    "",
  ].join("\n");
}
