import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { workspaceOfPath } from "@/lib/blob";
import { isMember } from "@/lib/supabase/server";

// DM 으로 받은 파일을 브라우저에서 Blob 으로 바로 올린다 (함수 4.5MB 제한 회피)
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const ws = workspaceOfPath(pathname);
        if (!ws || !/^w\/[0-9a-f-]{36}\/p\/[0-9a-f-]{36}\/attachments\/[^/]+$/.test(pathname)) throw new Error("잘못된 경로");
        if (!(await isMember(ws)).ok) throw new Error("권한 없음");
        return { maximumSizeInBytes: 500 * 1024 * 1024, addRandomSuffix: false, allowOverwrite: true };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "업로드 실패" }, { status: 400 });
  }
}
