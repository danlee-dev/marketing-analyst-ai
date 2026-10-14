import { get } from "@vercel/blob";
import { audioRuns, labelLines, type AudioClasses } from "@/lib/classify";
import { transcribeFile } from "@/lib/soniox";
import { requireUser } from "@/lib/supabase/server";
import type { MediaItem, Transcript } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const { id } = await ctx.params;
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const { mediaIndex, audio } = (await request.json()) as { mediaIndex: number; audio?: AudioClasses | null };

  const { data: post } = await supabase.from("posts").select("id, media").eq("id", id).maybeSingle();
  const media = (post?.media as MediaItem[] | undefined)?.find((m) => m.index === mediaIndex);
  if (!post || !media || media.kind !== "video") return Response.json({ error: "영상이 아니에요" }, { status: 400 });

  let transcript: Transcript;
  try {
    const file = await get(media.path, { access: "private" });
    if (!file?.stream) throw new Error("영상 파일을 못 찾았어요");
    const blob = await new Response(file.stream).blob();
    const lines = await transcribeFile(blob, media.path.split("/").pop() ?? "video.mp4");
    transcript = { mediaIndex, status: "done", lines: labelLines(lines, audio ?? null), audio: audioRuns(audio ?? null) };
  } catch (e) {
    transcript = { mediaIndex, status: "error", lines: [], error: e instanceof Error ? e.message : "전사 실패" };
  }

  // 전사 도중 다른 영상 전사가 끝났을 수 있으니 다시 읽고 합친다
  const { data: fresh } = await supabase.from("posts").select("transcripts").eq("id", id).single();
  const transcripts = ((fresh?.transcripts ?? []) as Transcript[])
    .filter((t) => t.mediaIndex !== mediaIndex)
    .concat(transcript)
    .sort((a, b) => a.mediaIndex - b.mediaIndex);
  const { data, error } = await supabase.from("posts").update({ transcripts }).eq("id", id).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ post: data });
}
