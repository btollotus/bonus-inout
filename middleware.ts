import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function redirectWithCookies(request: NextRequest, url: URL, base: NextResponse) {
  const res = NextResponse.redirect(url);

  // ✅ base(NextResponse.next)에 세팅된 쿠키를 redirect 응답으로 복사
  base.cookies.getAll().forEach((c) => {
    res.cookies.set(c.name, c.value, c.options);
  });

  return res;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // ✅ session 확인 (필요 시 여기서 refresh 쿠키가 response에 세팅될 수 있음)
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname.startsWith("/login");

  // next는 pathname만 말고 search까지 포함해주는 게 안전
  const nextFullPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  // ✅ 로그인 안 했는데 보호 페이지 접근 → /login
  if (!session && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", nextFullPath);
    return redirectWithCookies(request, url, response);
  }

  // ✅ 로그인 했는데 /login 접근 → next 또는 /
  if (session && isLoginPage) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next") || "/";
    url.pathname = next.startsWith("/") ? next : "/";
    url.search = "";
    return redirectWithCookies(request, url, response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};