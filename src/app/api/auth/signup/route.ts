import { supabaseAdmin } from "@/lib/supabase/server";

// 메일 인증 없이 바로 쓰도록 서버에서 확인된 계정을 만든다 (Supabase 기본 메일은 시간당 몇 통 제한)
export async function POST(request: Request) {
  const { email, password, name } = (await request.json().catch(() => ({}))) as { email?: string; password?: string; name?: string };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "이메일 형식이 아니에요" }, { status: 400 });
  if (!password || password.length < 8) return Response.json({ error: "비밀번호는 8자 이상이어야 해요" }, { status: 400 });

  const { error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name?.trim() || email.split("@")[0] },
  });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return Response.json({ error: taken ? "이미 가입된 이메일이에요. 로그인해 주세요." : error.message }, { status: taken ? 409 : 400 });
  }
  return Response.json({ ok: true });
}
