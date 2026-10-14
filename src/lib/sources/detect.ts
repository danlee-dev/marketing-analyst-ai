import type { Source } from "../types";

// 붙여넣은 텍스트에서 링크를 뽑고, 링크마다 출처와 그 안의 id 를 정한다 (브라우저·서버 공용)

export type Detected = { source: Source; id: string; url: string };

const IG = /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i;
const YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i;
const X = /(?:twitter\.com|x\.com)\/(?:[\w]+|i\/web)\/status(?:es)?\/(\d{1,25})/i;
const TT = /tiktok\.com\/(?:@[\w.-]+\/(?:video|photo)\/(\d{8,25})|v\/(\d{8,25}))/i;
const TT_SHORT = /^(?:https?:\/\/)?(?:vm|vt)\.tiktok\.com\/[\w-]+/i;

export function detect(raw: string): Detected | null {
  const text = raw.trim();
  if (!text) return null;
  let m = text.match(IG);
  if (m) return { source: "instagram", id: m[1], url: `https://www.instagram.com/p/${m[1]}/` };
  m = text.match(YT);
  if (m) {
    const shorts = /\/shorts\//i.test(text);
    return { source: "youtube", id: m[1], url: shorts ? `https://www.youtube.com/shorts/${m[1]}` : `https://www.youtube.com/watch?v=${m[1]}` };
  }
  m = text.match(X);
  if (m) return { source: "x", id: m[1], url: `https://x.com/i/status/${m[1]}` };
  m = text.match(TT);
  if (m) return { source: "tiktok", id: m[1] ?? m[2], url: text.split(/[?#]/)[0] };
  if (TT_SHORT.test(text)) return { source: "tiktok", id: "", url: text.startsWith("http") ? text : `https://${text}` };
  // 인스타 코드만 붙여넣은 경우
  if (/^[\w-]{10,12}$/.test(text) && /[A-Z]/.test(text)) return { source: "instagram", id: text, url: `https://www.instagram.com/p/${text}/` };
  try {
    const u = new URL(text.startsWith("http") ? text : `https://${text}`);
    if (!/\./.test(u.hostname)) return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|igshid|ref$|si$)/i.test(k)) u.searchParams.delete(k);
    return { source: "web", id: "", url: u.toString() };
  } catch {
    return null;
  }
}

// 텍스트 → 링크 목록 (중복 제거)
export function extractLinks(text: string): Detected[] {
  const found = text
    .split(/[\s,]+/)
    .filter((t) => /^(https?:\/\/|www\.)|\.[a-z]{2,}\//i.test(t) || /^[\w-]{10,12}$/.test(t))
    .map(detect)
    .filter((d): d is Detected => !!d);
  const seen = new Set<string>();
  return found.filter((d) => {
    const k = d.id ? `${d.source}:${d.id}` : d.url;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const SOURCE_LABEL: Record<Source, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  tiktok: "TikTok",
  web: "웹",
  upload: "직접 추가",
};

export function jobLabel(d: Detected) {
  if (d.source === "web") {
    try {
      return new URL(d.url).hostname.replace(/^www\./, "");
    } catch {
      return d.url;
    }
  }
  return `${SOURCE_LABEL[d.source]} ${d.id}`.trim();
}
