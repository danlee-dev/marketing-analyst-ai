import { get } from "@vercel/blob";
import { readPost, writePost } from "@/lib/blob";
import { audioRuns, labelLines, type AudioClasses } from "@/lib/classify";
import { transcribeFile } from "@/lib/soniox";
import type { Transcript } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const { id } = await ctx.params;
  const { mediaIndex, audio } = (await request.json()) as { mediaIndex: number; audio?: AudioClasses | null };
  const post = await readPost(id);
  const media = post?.media.find((m) => m.index === mediaIndex);
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

  // 전사 도중 바뀐 내용(제목·첨부)을 덮지 않게 다시 읽고 합친다
  const fresh = (await readPost(id)) ?? post;
  fresh.transcripts = fresh.transcripts.filter((t) => t.mediaIndex !== mediaIndex).concat(transcript);
  fresh.transcripts.sort((a, b) => a.mediaIndex - b.mediaIndex);
  return Response.json({ post: await writePost(fresh) });
}
