import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login/, /^\/auth\//, /^\/api\/auth\//, /^\/invite\//];

// Supabase 세션을 갱신하고, 로그인 안 한 사용자는 로그인 화면으로
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (data.user || PUBLIC.some((r) => r.test(path))) return response;

  if (path.startsWith("/api/")) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  const login = new URL("/login", request.url);
  if (path !== "/") login.searchParams.set("next", path + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/|models/|favicon.ico|icon|apple-icon).*)"],
};
