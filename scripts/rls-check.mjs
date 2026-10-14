// 워크스페이스 권한(RLS) 점검: 소유자 A, 초대받는 B, 외부인 C 로 실제 DB 에서 확인하고 정리한다.
// 사용: node scripts/rls-check.mjs   (.env.local 의 Supabase 키 필요)
import { createClient } from "@supabase/supabase-js";
import crypto, { randomBytes } from "node:crypto";

process.loadEnvFile(".env.local");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const tag = randomBytes(3).toString("hex");
const users = [];
let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "  ok " : "  FAIL"} ${name}`);
  if (!ok) failed++;
};

async function user(label) {
  const email = `rls-${label}-${tag}@example.com`;
  const password = randomBytes(12).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `QA ${label}` } });
  if (error) throw error;
  users.push(data.user.id);
  const c = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { c, id: data.user.id };
}

try {
  const A = await user("a");
  const B = await user("b");
  const C = await user("c");

  const wsId = crypto.randomUUID();
  const { error: wsErr } = await A.c.from("workspaces").insert({ id: wsId, name: `QA ${tag}` });
  const { data: ws } = await A.c.from("workspaces").select().eq("id", wsId).single();
  check("A 가 워크스페이스를 만든다", !wsErr && !!ws);
  if (wsErr) console.log("> wsErr", wsErr.message, wsErr.code);
  const { data: mem } = await A.c.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", A.id).single();
  check("만든 사람은 자동으로 owner", mem?.role === "owner");

  const { data: pj, error: pjErr } = await A.c.from("projects").insert({ workspace_id: ws.id, name: "마케팅" }).select().single();
  if (pjErr) console.log("> pjErr", pjErr.message);
  const { data: pj2 } = await A.c.from("projects").insert({ workspace_id: ws.id, name: "기술" }).select().single();
  const { data: fd, error: fdErr } = await A.c.from("folders").insert({ workspace_id: ws.id, project_id: pj.id, name: "릴스" }).select().single();
  if (fdErr) console.log("> fdErr", fdErr.message);
  const { data: fd2 } = await A.c.from("folders").insert({ workspace_id: ws.id, project_id: pj2.id, name: "다른" }).select().single();
  const { data: post, error: postErr } = await A.c
    .from("posts")
    .insert({
      workspace_id: ws.id,
      project_id: pj.id,
      folder_id: fd.id,
      shortcode: "QA" + tag,
      url: "https://www.instagram.com/p/x/",
      title: "t",
      account: { username: "x" },
      taken_at: new Date().toISOString(),
      type: "image",
    })
    .select()
    .single();
  check("A 가 프로젝트·폴더·게시물을 만든다", !postErr && !!post);

  const { error: crossFolder } = await A.c.from("posts").update({ folder_id: fd2.id }).eq("id", post.id);
  check("다른 프로젝트 폴더로는 못 옮긴다", !!crossFolder);

  const { data: cSees } = await C.c.from("posts").select("id").eq("id", post.id);
  const { data: cWs } = await C.c.from("workspaces").select("id").eq("id", ws.id);
  check("외부인 C 는 게시물·워크스페이스가 안 보인다", cSees.length === 0 && cWs.length === 0);

  const { error: cInsert } = await C.c.from("posts").insert({ ...post, id: undefined, shortcode: "QB" + tag });
  check("외부인 C 는 남의 프로젝트에 게시물을 못 넣는다", !!cInsert);

  const cWsHijack = { id: crypto.randomUUID() };
  await C.c.from("workspaces").insert({ id: cWsHijack.id, name: "x" });
  const { error: hijack } = await C.c.from("posts").insert({ ...post, id: undefined, workspace_id: cWsHijack.id, shortcode: "QC" + tag });
  check("자기 워크스페이스 id 를 붙여도 남의 프로젝트에는 못 넣는다", !!hijack);

  const { error: cJoin } = await C.c.from("workspace_members").insert({ workspace_id: ws.id, user_id: C.id, role: "owner" });
  check("외부인 C 는 스스로 멤버가 될 수 없다", !!cJoin);

  const { data: inv } = await A.c.from("workspace_invites").insert({ workspace_id: ws.id }).select().single();
  const { data: info } = await B.c.rpc("invite_info", { invite_token: inv.token });
  check("초대 링크로 워크스페이스 이름을 미리 본다", info?.[0]?.workspace_name === `QA ${tag}` && info?.[0]?.valid === true);
  const { data: joined, error: joinErr } = await B.c.rpc("accept_invite", { invite_token: inv.token });
  check("B 가 초대를 수락한다", !joinErr && joined === ws.id);
  const { data: bSees } = await B.c.from("posts").select("id").eq("id", post.id);
  check("수락한 B 는 게시물이 보인다", bSees.length === 1);
  const { data: bRole } = await B.c.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", B.id).single();
  check("초대로 들어온 B 는 member", bRole?.role === "member");

  const { error: bPromote } = await B.c.from("workspace_members").update({ role: "owner" }).eq("workspace_id", ws.id).eq("user_id", B.id);
  const { data: bRole2 } = await admin.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", B.id).single();
  check("member 는 스스로 owner 가 될 수 없다", bRole2?.role === "member" && (bPromote === null || !!bPromote));

  const { data: bOwnerInvite, error: bOwnerInvErr } = await B.c.from("workspace_invites").insert({ workspace_id: ws.id, role: "owner" }).select();
  check("member 는 owner 초대 링크를 못 만든다", !!bOwnerInvErr || !bOwnerInvite?.length);

  await A.c.from("workspace_invites").update({ revoked: true }).eq("id", inv.id);
  const { error: revokedJoin } = await C.c.rpc("accept_invite", { invite_token: inv.token });
  check("꺼진 초대 링크로는 못 들어온다", !!revokedJoin);

  const { data: cProfiles } = await C.c.from("profiles").select("id").in("id", [A.id, B.id]);
  check("외부인 C 는 남의 프로필(이메일)을 못 본다", cProfiles.length === 0);

  const { error: bDelWs } = await B.c.from("workspaces").delete().eq("id", ws.id);
  const { data: still } = await admin.from("workspaces").select("id").eq("id", ws.id);
  check("member 는 워크스페이스를 못 지운다", still.length === 1 && (bDelWs === null || !!bDelWs));

  await A.c.from("workspaces").delete().eq("id", ws.id);
  await C.c.from("workspaces").delete().eq("id", cWsHijack.id);
} catch (e) {
  console.error("> error", e.message ?? e);
  failed++;
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  console.log(failed ? `\n${failed}개 실패` : "\n모두 통과");
  process.exit(failed ? 1 : 0);
}
