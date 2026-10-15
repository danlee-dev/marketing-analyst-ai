import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { get } from "@vercel/blob";
import { audioRuns, labelLines, type AudioClasses } from "./classify";
import { transcribeFile } from "./soniox";
import type { MediaItem, Post, Transcript } from "./types";

// 영상 하나를 Soniox 로 전사해 게시물에 붙인다. 웹 화면은 브라우저 YAMNet 점수(audio)를 같이 보내 말/노래를 가르고,
// 크롬 확장·MCP 경로는 점수 없이 전사만 한다.
export async function transcribeMedia(sb: SupabaseClient, postId: string, mediaIndex: number, audio: AudioClasses | null): Promise<Post> {
  const { data: post } = await sb.from("posts").select("id, media").eq("id", postId).maybeSingle();
  const media = (post?.media as MediaItem[] | undefined)?.find((m) => m.index === mediaIndex);
  if (!post || !media || media.kind !== "video") throw new Error("영상이 아니에요");

  let transcript: Transcript;
  try {
    const file = await get(media.path, { access: "private" });
    if (!file?.stream) throw new Error("영상 파일을 못 찾았어요");
    const blob = await new Response(file.stream).blob();
    const lines = await transcribeFile(blob, media.path.split("/").pop() ?? "video.mp4");
    transcript = { mediaIndex, status: "done", lines: labelLines(lines, audio), audio: audioRuns(audio) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "전사 실패";
    transcript = /no audio stream/i.test(message)
      ? { mediaIndex, status: "done", lines: [], noAudio: true }
      : { mediaIndex, status: "error", lines: [], error: message };
  }

  // 다른 영상 전사가 그사이 끝났을 수 있으니 다시 읽고 합친다
  const { data: fresh } = await sb.from("posts").select("transcripts").eq("id", postId).single();
  const transcripts = ((fresh?.transcripts ?? []) as Transcript[])
    .filter((t) => t.mediaIndex !== mediaIndex)
    .concat(transcript)
    .sort((a, b) => a.mediaIndex - b.mediaIndex);
  const { data, error } = await sb.from("posts").update({ transcripts }).eq("id", postId).select("*").single();
  if (error) throw new Error(error.message);
  return data as Post;
}

// 아직 전사 안 된 영상 전부 (최대 n개, 순서대로)
export async function transcribePending(sb: SupabaseClient, post: Post, max = 6): Promise<Post> {
  let latest = post;
  const done = new Set(post.transcripts.map((t) => t.mediaIndex));
  for (const m of post.media.filter((x) => x.kind === "video" && !done.has(x.index)).slice(0, max)) {
    latest = await transcribeMedia(sb, post.id, m.index, null);
  }
  return latest;
}
