import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// 요청한 사용자 권한으로 동작 (RLS 적용)
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component 에서 호출되면 무시 (proxy 가 세션을 갱신한다)
        }
      },
    },
  });
}

// RLS 우회. 가입 처리처럼 꼭 필요한 곳에서만
export function supabaseAdmin() {
  return createJsClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function isMember(workspaceId: string) {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false as const, supabase, user };
  const { data } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  return { ok: !!data, supabase, user };
}
