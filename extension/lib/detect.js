// 링크 → 출처 판별. 사이트의 src/lib/sources/detect.ts 와 같은 규칙.

const IG = /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i;
const YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i;
const X = /(?:twitter\.com|x\.com)\/(?:[\w]+|i\/web)\/status(?:es)?\/(\d{1,25})/i;
const TT = /tiktok\.com\/(?:@[\w.-]+\/(?:video|photo)\/(\d{8,25})|v\/(\d{8,25}))/i;

export const SOURCE_LABEL = { instagram: "Instagram", youtube: "YouTube", x: "X", tiktok: "TikTok", web: "웹" };

export function detect(url) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  let m = url.match(IG);
  if (m) return { source: "instagram", id: m[1], url: `https://www.instagram.com/p/${m[1]}/`, kind: /\/reels?\//.test(url) ? "릴스" : "게시물" };
  m = url.match(YT);
  if (m) return { source: "youtube", id: m[1], url: /\/shorts\//.test(url) ? `https://www.youtube.com/shorts/${m[1]}` : `https://www.youtube.com/watch?v=${m[1]}`, kind: /\/shorts\//.test(url) ? "쇼츠" : "영상" };
  m = url.match(X);
  if (m) return { source: "x", id: m[1], url: `https://x.com/i/status/${m[1]}`, kind: "글" };
  m = url.match(TT);
  if (m) return { source: "tiktok", id: m[1] || m[2], url: url.split(/[?#]/)[0], kind: "영상" };
  try {
    const u = new URL(url);
    if (!/\./.test(u.hostname)) return null;
    u.hash = "";
    return { source: "web", id: "", url: u.toString(), kind: "웹페이지", host: u.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

// 현재 페이지가 "목록" 성격인지 (한 번에 가져오기 후보)
export function listKind(url) {
  if (!url) return null;
  if (/instagram\.com\/[\w.]+\/saved\//.test(url)) return "인스타 저장됨 컬렉션";
  if (/instagram\.com\/(explore\/(tags|locations)\/|[\w.]+\/(reels\/|tagged\/)?$)/.test(url.split(/[?#]/)[0])) return "인스타 목록";
  if (/youtube\.com\/(@[\w.-]+|channel\/|c\/|playlist\?|feed\/|results\?)/.test(url)) return "YouTube 목록";
  if (/(x|twitter)\.com\/(i\/bookmarks|[\w]+\/?$|[\w]+\/(media|likes)|search\?)/.test(url)) return "X 목록";
  if (/tiktok\.com\/@[\w.-]+\/?$/.test(url)) return "TikTok 목록";
  return null;
}

// 페이지 안에서 실행되는 링크 수집기. scripting.executeScript 로 주입하므로 바깥 변수를 쓰지 않는다.
export async function collectLinksInPage(opts) {
  const res = [
    /^https:\/\/www\.instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/[\w-]+/i,
    /^https:\/\/(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|shorts\/)[\w-]{11}/i,
    /^https:\/\/youtu\.be\/[\w-]{11}/i,
    /^https:\/\/(?:x|twitter)\.com\/\w+\/status\/\d+/i,
    /^https:\/\/www\.tiktok\.com\/@[\w.-]+\/video\/\d+/i,
  ];
  const here = location.href.split(/[?#]/)[0];
  const norm = (h) => {
    let m = h.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i);
    if (m) return `https://www.instagram.com/p/${m[1]}/`;
    m = h.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/i);
    if (m) return /\/shorts\//.test(h) ? `https://www.youtube.com/shorts/${m[1]}` : `https://www.youtube.com/watch?v=${m[1]}`;
    m = h.match(/(?:x|twitter)\.com\/(\w+)\/status\/(\d+)/i);
    if (m) return `https://x.com/${m[1]}/status/${m[2]}`;
    m = h.match(/tiktok\.com\/(@[\w.-]+)\/video\/(\d+)/i);
    if (m) return `https://www.tiktok.com/${m[1]}/video/${m[2]}`;
    return null;
  };
  const seen = new Set();
  const grab = () => {
    for (const a of document.querySelectorAll("a[href]")) {
      const h = a.href;
      if (!res.some((r) => r.test(h))) continue;
      const n = norm(h);
      if (n && n.split(/[?#]/)[0] !== here) seen.add(n);
    }
  };
  grab();
  if (opts && opts.scroll) {
    const max = opts.max || 500;
    const started = Date.now();
    let stable = 0;
    let last = seen.size;
    while (stable < 4 && seen.size < max && Date.now() - started < 180000) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 1300));
      grab();
      if (seen.size === last) stable++;
      else {
        stable = 0;
        last = seen.size;
      }
      try {
        chrome.runtime.sendMessage({ type: "collect-progress", count: seen.size });
      } catch {}
    }
  }
  return [...seen].slice(0, (opts && opts.max) || 500);
}
