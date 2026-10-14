import { cookies } from "next/headers";
import { AUTH_COOKIE, sessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ error: "비밀번호가 맞지 않아요" }, { status: 401 });
  }
  (await cookies()).set(AUTH_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(AUTH_COOKIE);
  return Response.json({ ok: true });
}
