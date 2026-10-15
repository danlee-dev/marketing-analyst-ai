import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "./supabase/server";

// 개인 토큰(rb_...) → 사용자 id. MCP 와 크롬 확장이 같이 쓴다.
export async function userFromToken(token: string | null | undefined): Promise<string | null> {
  if (!token || !token.startsWith("rb_")) return null;
  const sb = supabaseAdmin();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data } = await sb.from("api_tokens").select("id, user_id").eq("token_hash", hash).maybeSingle();
  if (!data) return null;
  void sb.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return data.user_id as string;
}

export function bearer(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

export async function memberWorkspaceIds(userId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin().from("workspace_members").select("workspace_id").eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.workspace_id as string));
}
