import "server-only";

// instaloader 가 쓰는 비로그인 단일 게시물 조회(doc_id GraphQL)를 옮긴 것
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const DOC_ID = "27128499623469141";
const APP_ID = "936619743392459";

export type IgMedia = { kind: "image" | "video"; url: string; width?: number; height?: number; duration?: number };

export type IgPost = {
  shortcode: string;
  username: string;
  fullName: string | null;
  isVerified: boolean;
  profilePicUrl: string | null;
  caption: string;
  takenAt: string;
  type: "image" | "video" | "carousel";
  likes: number | null;
  comments: number | null;
  views: number | null;
  music: string | null;
  location: string | null;
  media: IgMedia[];
  thumbUrl: string | null;
};

type Candidate = { url: string; width: number; height: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

const best = (c?: Candidate[]) =>
  c?.length ? c.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a)) : undefined;

function toMedia(node: Raw): IgMedia {
  if (node.video_versions?.length) {
    const v = best(node.video_versions) ?? node.video_versions[0];
    return { kind: "video", url: v.url, width: v.width, height: v.height, duration: node.video_duration ?? undefined };
  }
  const img = best(node.image_versions2?.candidates);
  return { kind: "image", url: img?.url ?? "", width: img?.width, height: img?.height };
}

async function csrfToken(): Promise<string> {
  const home = await fetch("https://www.instagram.com/", { headers: { "User-Agent": UA }, cache: "no-store" });
  const cookies = home.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.match(/csrftoken=([^;]+)/)?.[1]).find(Boolean) ?? "";
}

export class IgError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export async function fetchIgPost(shortcode: string): Promise<IgPost> {
  const csrf = await csrfToken();
  const body = new URLSearchParams({
    variables: JSON.stringify({
      shortcode,
      __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
    }),
    doc_id: DOC_ID,
    server_timestamps: "true",
  });

  let item: Raw = null;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4 && !item; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2500 * attempt));
    const res = await fetch("https://www.instagram.com/graphql/query", {
      method: "POST",
      cache: "no-store",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "x-ig-app-id": APP_ID,
        "x-csrftoken": csrf,
        "X-Requested-With": "XMLHttpRequest",
        Origin: "https://www.instagram.com",
        Referer: `https://www.instagram.com/p/${shortcode}/`,
        Cookie: csrf ? `csrftoken=${csrf}` : "",
        accept: "*/*",
      },
      body,
    });
    lastStatus = res.status;
    if (!res.ok) continue;
    const json = await res.json().catch(() => null);
    item = json?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0] ?? null;
    if (!item && json?.data) throw new IgError("게시물을 찾을 수 없어요 (비공개이거나 삭제됨)", 404);
  }
  if (!item) throw new IgError(`인스타가 요청을 막았어요 (HTTP ${lastStatus}). 잠시 뒤 다시 시도하세요.`, 429);

  const carousel: Raw[] | undefined = item.carousel_media;
  const media = carousel?.length ? carousel.map(toMedia) : [toMedia(item)];
  const type = carousel?.length ? "carousel" : media[0].kind === "video" ? "video" : "image";
  const music = item.clips_metadata?.music_info?.music_asset_info
    ? `${item.clips_metadata.music_info.music_asset_info.title} - ${item.clips_metadata.music_info.music_asset_info.display_artist}`
    : item.clips_metadata?.original_sound_info
      ? `오리지널 오디오 - ${item.clips_metadata.original_sound_info.ig_artist?.username ?? ""}`.trim()
      : null;

  return {
    shortcode: item.code ?? shortcode,
    username: item.user?.username ?? item.owner?.username ?? "unknown",
    fullName: item.user?.full_name || null,
    isVerified: !!item.user?.is_verified,
    profilePicUrl: item.user?.hd_profile_pic_url_info?.url ?? item.user?.profile_pic_url ?? null,
    caption: item.caption?.text ?? "",
    takenAt: new Date((item.taken_at ?? Date.now() / 1000) * 1000).toISOString(),
    type,
    likes: item.like_count ?? null,
    comments: item.comment_count ?? null,
    views: item.play_count ?? item.view_count ?? item.ig_play_count ?? null,
    music,
    location: item.location?.name ?? null,
    media,
    thumbUrl: best(item.image_versions2?.candidates)?.url ?? media.find((m) => m.kind === "image")?.url ?? null,
  };
}

export async function fetchCdn(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok || !res.body) throw new IgError(`미디어 다운로드 실패 (HTTP ${res.status})`);
  return res;
}
