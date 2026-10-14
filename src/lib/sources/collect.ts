import "server-only";
import { createHash } from "node:crypto";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { fetchIgPost, IgError } from "../instagram";
import { autoTitle } from "../naming";
import type { Account, Format, Source, Transcript, TranscriptLine } from "../types";
import type { Detected } from "./detect";

// 모든 출처가 이 모양으로 돌려준다. 저장(다운로드·DB)은 라우트에서 공통 처리.
export type RemoteMedia = { kind: "image" | "video"; url: string; width?: number; height?: number; duration?: number };
export type Collected = {
  source: Source;
  shortcode: string;
  url: string;
  title: string;
  account: Omit<Account, "profilePicPath">;
  profilePicUrl: string | null;
  caption: string;
  body: string;
  site: string | null;
  takenAt: string;
  format: Format;
  likes: number | null;
  comments: number | null;
  views: number | null;
  music: string | null;
  location: string | null;
  media: RemoteMedia[];
  thumbUrl: string | null;
  transcripts: Transcript[];
};

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export class CollectError extends IgError {}

export async function collect(d: Detected): Promise<Collected> {
  switch (d.source) {
    case "instagram":
      return instagram(d.id);
    case "x":
      return xPost(d.id);
    case "youtube":
      return youtube(d);
    case "tiktok":
      return tiktok(d);
    default:
      return web(d.url);
  }
}

async function getJson<T>(url: string, init?: RequestInit & { plainUA?: boolean }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...(init?.plainUA ? { "User-Agent": "curl/8.7.1" } : { "User-Agent": UA }), ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new CollectError(`가져오지 못했어요 (HTTP ${res.status})`, res.status === 404 ? 404 : 502);
  return res.json() as Promise<T>;
}

// ---------- Instagram ----------
async function instagram(code: string): Promise<Collected> {
  const ig = await fetchIgPost(code);
  return {
    source: "instagram",
    shortcode: ig.shortcode,
    url: `https://www.instagram.com/${ig.type === "video" ? "reel" : "p"}/${ig.shortcode}/`,
    title: autoTitle(ig.caption, `${ig.type === "video" ? "릴스" : "게시물"} ${ig.shortcode}`),
    account: {
      username: ig.username,
      fullName: ig.fullName,
      profileUrl: `https://www.instagram.com/${ig.username}/`,
      isVerified: ig.isVerified,
    },
    profilePicUrl: ig.profilePicUrl,
    caption: ig.caption,
    body: "",
    site: "instagram.com",
    takenAt: ig.takenAt,
    format: ig.type,
    likes: ig.likes,
    comments: ig.comments,
    views: ig.views,
    music: ig.music,
    location: ig.location,
    media: ig.media,
    thumbUrl: ig.media[0]?.kind === "video" ? ig.thumbUrl : null,
    transcripts: [],
  };
}

// ---------- X (트위터) — react-tweet 과 같은 공개 syndication 엔드포인트 ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
const xToken = (id: string) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");

async function xPost(id: string): Promise<Collected> {
  const t = await getJson<Raw>(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=ko&token=${xToken(id)}`);
  if (!t || t.__typename === "TweetTombstone" || !t.user) throw new CollectError("글을 찾을 수 없어요 (삭제됐거나 비공개)", 404);
  const text: string = (t.note_tweet?.text ?? t.text ?? "").replace(/\s*https:\/\/t\.co\/\w+$/g, "").trim();
  const media: RemoteMedia[] = (t.mediaDetails ?? []).map((m: Raw) => {
    if (m.type === "video" || m.type === "animated_gif") {
      const mp4 = (m.video_info?.variants ?? [])
        .filter((v: Raw) => v.content_type === "video/mp4")
        .sort((a: Raw, b: Raw) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
      return { kind: "video", url: mp4?.url, width: m.original_info?.width, height: m.original_info?.height, duration: m.video_info?.duration_millis ? m.video_info.duration_millis / 1000 : undefined };
    }
    return { kind: "image", url: `${m.media_url_https}?name=large`, width: m.original_info?.width, height: m.original_info?.height };
  }).filter((m: RemoteMedia) => !!m.url);
  const format: Format = !media.length ? "text" : media.length > 1 ? "carousel" : media[0].kind;
  const handle = t.user.screen_name as string;
  return {
    source: "x",
    shortcode: id,
    url: `https://x.com/${handle}/status/${id}`,
    title: autoTitle(text, `@${handle}의 글`),
    account: { username: handle, fullName: t.user.name ?? null, profileUrl: `https://x.com/${handle}`, isVerified: !!(t.user.is_blue_verified || t.user.verified) },
    profilePicUrl: (t.user.profile_image_url_https as string | undefined)?.replace("_normal", "_400x400") ?? null,
    caption: text,
    body: text,
    site: "x.com",
    takenAt: new Date(t.created_at ?? Date.now()).toISOString(),
    format,
    likes: t.favorite_count ?? null,
    comments: t.conversation_count ?? null,
    views: null,
    music: null,
    location: null,
    media,
    thumbUrl: media.find((m) => m.kind === "video") ? (t.mediaDetails?.[0]?.media_url_https ?? null) : null,
    transcripts: [],
  };
}

// ---------- YouTube — oEmbed 메타 + Supadata 자막 (영상 파일은 받지 않음) ----------
async function youtube(d: Detected): Promise<Collected> {
  const o = await getJson<Raw>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(d.url)}`);
  const shorts = d.url.includes("/shorts/");
  const transcript = await youtubeTranscript(d.url).catch(
    (e): Transcript => ({ mediaIndex: 1, status: "error", lines: [], error: e instanceof Error ? e.message : "자막을 가져오지 못했어요" }),
  );
  const handle = (o.author_url as string | undefined)?.split("/").pop()?.replace(/^@/, "") ?? o.author_name;
  return {
    source: "youtube",
    shortcode: d.id,
    url: d.url,
    title: o.title ?? `YouTube ${d.id}`,
    account: { username: handle, fullName: o.author_name ?? null, profileUrl: o.author_url ?? "https://www.youtube.com" },
    profilePicUrl: null,
    caption: "",
    body: "",
    site: shorts ? "youtube.com/shorts" : "youtube.com",
    takenAt: new Date().toISOString(),
    format: "video",
    likes: null,
    comments: null,
    views: null,
    music: null,
    location: null,
    media: [],
    thumbUrl: `https://i.ytimg.com/vi/${d.id}/${shorts ? "oar2" : "maxresdefault"}.jpg`,
    transcripts: [transcript],
  };
}

const SUPADATA = "https://api.supadata.ai/v1";

async function supadata(path: string, params: Record<string, string>) {
  const key = process.env.SUPADATA_API_KEY;
  if (!key) throw new Error("SUPADATA_API_KEY 가 없어요");
  const res = await fetch(`${SUPADATA}${path}?${new URLSearchParams(params)}`, { headers: { "x-api-key": key }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (res.status === 202) return { pending: body.jobId as string };
  if (!res.ok) throw new Error(`자막 서비스 오류 (HTTP ${res.status}) ${String(body?.message ?? body?.error ?? "").slice(0, 120)}`);
  return { body };
}

async function waitJob(jobId: string, until: number): Promise<Raw> {
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await supadata(`/transcript/${jobId}`, {});
    if ("body" in r && r.body) {
      if (r.body.status === "failed") throw new Error("자막 생성에 실패했어요");
      if (r.body.status === "completed" || Array.isArray(r.body.content)) return r.body;
    }
  }
  throw new Error("자막 생성 시간이 초과됐어요");
}

// 한국어 → 영어 → 원본 순으로 고르고, 자막이 아예 없으면 AI 전사(auto)
async function youtubeTranscript(url: string): Promise<Transcript> {
  const until = Date.now() + 200_000;
  let r = await supadata("/transcript", { url, mode: "auto", text: "false" });
  let body: Raw = "pending" in r ? await waitJob(r.pending!, until) : r.body;
  const avail: string[] = body?.availableLangs ?? [];
  const want = ["ko", "en"].find((l) => avail.includes(l));
  if (want && body?.lang !== want) {
    r = await supadata("/transcript", { url, mode: "native", text: "false", lang: want });
    body = "pending" in r ? await waitJob(r.pending!, until) : r.body;
  }
  const content: Raw[] = Array.isArray(body?.content) ? body.content : [];
  const lines: TranscriptLine[] = mergeCaptions(
    content
      .map((c) => ({ start: (c.offset ?? 0) / 1000, end: ((c.offset ?? 0) + (c.duration ?? 0)) / 1000, text: String(c.text ?? "").replace(/\s+/g, " ").trim(), lang: c.lang }))
      .filter((l) => l.text && !/^[[(（【][^\])）】]{1,24}[\])）】]$/.test(l.text)),
  );
  return { mediaIndex: 1, status: "done", lines };
}

// 자막 조각은 2~3초 단위라 문장 끝이나 6초 기준으로 묶는다
function mergeCaptions(parts: TranscriptLine[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && !/[.?!。？！]$/.test(last.text) && p.start - last.start < 6 && last.text.length < 120) {
      last.text = `${last.text} ${p.text}`;
      last.end = p.end;
    } else out.push({ ...p });
  }
  return out;
}

// ---------- TikTok — oEmbed 메타만 (영상 파일은 공개 경로가 불안정) ----------
async function tiktok(d: Detected): Promise<Collected> {
  // 브라우저 UA 로 부르면 503 을 준다 (실측)
  const o = await getJson<Raw>(`https://www.tiktok.com/oembed?url=${encodeURIComponent(d.url)}`, { plainUA: true });
  const id = d.id || String(o.embed_product_id ?? "") || createHash("sha1").update(d.url).digest("hex").slice(0, 16);
  const handle = String(o.author_unique_id ?? o.author_url?.split("@").pop() ?? o.author_name ?? "tiktok");
  return {
    source: "tiktok",
    shortcode: id,
    url: `https://www.tiktok.com/@${handle}/video/${id}`,
    title: autoTitle(o.title ?? "", `TikTok ${id}`),
    account: { username: handle, fullName: o.author_name ?? null, profileUrl: o.author_url ?? `https://www.tiktok.com/@${handle}` },
    profilePicUrl: null,
    caption: o.title ?? "",
    body: "",
    site: "tiktok.com",
    takenAt: new Date().toISOString(),
    format: "video",
    likes: null,
    comments: null,
    views: null,
    music: null,
    location: null,
    media: [],
    thumbUrl: o.thumbnail_url ?? null,
    transcripts: [],
  };
}

// ---------- 웹 페이지 — 본문 추출해 마크다운으로 ----------
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
turndown.remove(["script", "style", "noscript", "iframe", "form"]);

// 서버가 내부망 주소를 대신 열지 않게 (SSRF)
export function assertPublicUrl(raw: string) {
  const u = new URL(raw);
  const h = u.hostname.toLowerCase();
  const privateHost =
    !/^https?:$/.test(u.protocol) ||
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
    h.startsWith("[") ||
    /^\d+$/.test(h);
  if (privateHost) throw new CollectError("열 수 없는 주소예요", 400);
}

async function web(url: string): Promise<Collected> {
  // 리다이렉트를 직접 따라가며 단계마다 주소 검사
  let current = url;
  let res: Response | null = null;
  for (let hop = 0; hop < 6; hop++) {
    assertPublicUrl(current);
    res = await fetch(current, {
      cache: "no-store",
      redirect: "manual",
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15_000),
    });
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) break;
    current = new URL(loc, current).toString();
  }
  if (!res) throw new CollectError("페이지를 열지 못했어요", 502);
  if (!res.ok) throw new CollectError(`페이지를 열지 못했어요 (HTTP ${res.status})`, 502);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html")) throw new CollectError("웹 페이지가 아니에요. 파일은 '직접 추가'로 올려 주세요", 400);
  const html = (await res.text()).slice(0, 3_000_000);
  const finalUrl = current;
  const { document } = parseHTML(html);
  const meta = (sel: string) => document.querySelector(sel)?.getAttribute("content")?.trim() || null;
  const abs = (v: string | null) => {
    if (!v) return null;
    try {
      return new URL(v, finalUrl).toString();
    } catch {
      return null;
    }
  };
  const host = new URL(finalUrl).hostname.replace(/^www\./, "");
  const ogTitle = meta('meta[property="og:title"]') || document.querySelector("title")?.textContent?.trim() || host;
  const desc = meta('meta[property="og:description"]') || meta('meta[name="description"]') || "";
  const siteName = meta('meta[property="og:site_name"]') || host;
  const author = meta('meta[name="author"]') || meta('meta[property="article:author"]');
  const published = meta('meta[property="article:published_time"]') || meta('meta[name="date"]');

  // Readability 는 문서를 변형하므로 복제본으로
  const article = new Readability(parseHTML(html).document as unknown as Document, { charThreshold: 300 }).parse();
  const text = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  // 서비스 홈페이지도 본문이 길게 잡히므로 og:type 과 경로로 가른다
  const ogType = meta('meta[property="og:type"]');
  const path = new URL(finalUrl).pathname.replace(/\/+$/, "");
  const isArticle = !!article && text.length > 600 && (ogType === "article" || (path.length > 1 && text.length > 1500));
  const body = article?.content ? turndown.turndown(article.content).replace(/\n{3,}/g, "\n\n").trim().slice(0, 60_000) : desc;

  return {
    source: "web",
    shortcode: createHash("sha1").update(finalUrl).digest("hex").slice(0, 20),
    url: finalUrl,
    title: (article?.title || ogTitle).slice(0, 120),
    account: { username: host, fullName: author || siteName, profileUrl: new URL(finalUrl).origin },
    profilePicUrl: abs(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ?? null) ?? abs("/favicon.ico"),
    caption: desc,
    body,
    site: host,
    takenAt: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : new Date().toISOString(),
    format: isArticle ? "article" : "page",
    likes: null,
    comments: null,
    views: null,
    music: null,
    location: null,
    media: [],
    thumbUrl: abs(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]')),
    transcripts: [],
  };
}
