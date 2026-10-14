import { createHash, randomBytes } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";

// 로컬 Claude 연결용 개인 토큰. 원문은 만들 때 한 번만 돌려준다.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const { data } = await supabase.from("api_tokens").select("id, name, prefix, created_at, last_used_at").order("created_at", { ascending: false });
  return Response.json({ tokens: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  const token = `rb_${randomBytes(24).toString("base64url")}`;
  const { data, error } = await supabase
    .from("api_tokens")
    .insert({
      name: (name?.trim() || "Claude").slice(0, 40),
      token_hash: createHash("sha256").update(token).digest("hex"),
      prefix: token.slice(0, 7),
    })
    .select("id, name, prefix, created_at, last_used_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ token, record: data });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id 가 없어요" }, { status: 400 });
  await supabase.from("api_tokens").delete().eq("id", id);
  return Response.json({ ok: true });
}
