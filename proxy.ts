import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ADMIN 전용
const ADMIN_ONLY_PATHS = [
  "/admin/employees",
  "/admin/payroll",
];

// SUBADMIN 이상 (USER 접근 불가)
const SUBADMIN_PATHS = [
  "/scan",
  "/products",
  "/report",
  "/trade",
  "/tax",
  "/calendar",
  "/orders",
  "/ledger",
];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // ✅ 공개 경로
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/) !== null ||
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  // ✅ 세션 확인
  let res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + (search || ""))}`;
    return NextResponse.redirect(url);
  }

  // ✅ /api/me 호출해서 role 가져오기
  const host = req.headers.get("host") ?? "";
  const protocol = host.includes("localhost") ? "http" : "https";
  const cookieHeader = req.cookies.getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  let role = "USER";
  try {
    const meRes = await fetch(`${protocol}://${host}/api/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (meRes.ok) {
      const me = await meRes.json();
      role = me.role ?? "USER";
    }
  } catch {
    // role 조회 실패 시 USER로 처리
  }

  // ADMIN 전용 경로
  const isAdminOnly = ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminOnly && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // SUBADMIN 이상 경로
  const isSubadminPath = SUBADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (isSubadminPath && role === "USER") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
