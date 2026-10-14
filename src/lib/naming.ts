import type { Post } from "./types";

const SHORTCODE_RE = /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/;

export function parseShortcode(input: string): string | null {
  const m = input.match(SHORTCODE_RE);
  if (m) return m[1];
  const t = input.trim();
  return /^[\w-]{8,20}$/.test(t) ? t : null;
}

export function extractShortcodes(text: string): string[] {
  const found = text
    .split(/[\s,]+/)
    .map(parseShortcode)
    .filter((c): c is string => !!c);
  return [...new Set(found)];
}

// 캡션 첫 줄에서 해시태그·멘션·이모지를 걷어내 제목으로 쓴다
export function autoTitle(caption: string, fallback: string): string {
  const line =
    caption
      .split("\n")
      .map((l) =>
        l
          .replace(/[#@][\p{L}\p{N}_.]+/gu, "")
          .replace(/\p{Extended_Pictographic}|\p{Cf}|️/gu, "")
          .replace(/["“”‘’`]/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .find((l) => l.length >= 2) ?? "";
  const title = line.length > 40 ? line.slice(0, 40).trim() + "…" : line;
  return title || fallback;
}

export function safeName(s: string, max = 60): string {
  return (
    s
      .replace(/\p{Cf}|\p{Extended_Pictographic}|\uFE0F|[“”‘’`]/gu, "")
      .replace(/[\\/:*?"<>|\n\r\t]/g, " ")
      .replace(/…/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
      .trim()
      .replace(/[. ]+$/, "") || "untitled"
  );
}

export function folderName(post: Post): string {
  const date = kstDate(post.taken_at);
  return `${date}_${post.account.username}_${safeName(post.title, 50)}`;
}

export const kstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const KIND_LABEL = {
  speech: "말",
  song: "노래",
  speech_music: "말+배경음악",
  unknown: "",
} as const;
