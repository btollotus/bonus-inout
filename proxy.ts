import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ADMIN 전용 경로 (SUBADMIN, USER 접근 불가)
const ADMIN_ONLY_PATHS = [
  "/admin/employees",
  "/admin/payroll",
];

// SUBADMIN 이상 경로 (USER 접근 불가)
const SUBADMIN_PATHS = [
  "/scan",
  "/products",
  "/report",
  "/trade",
  "/tax",
  "/calendar",
  "/orders",
  "/ledger",
  "/admin/leave-status", // SUBADMIN은 승인 가능, USER는 읽기만 → 일단 접근은 허용
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

  // ✅ Supabase 세션 확인
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

  // ✅ role 조회
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .single();

  const role = roleData?.role ?? "USER";

  // ADMIN 전용 경로 체크
  const isAdminOnly = ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminOnly && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // SUBADMIN 이상 경로 체크
  const isSubadminPath = SUBADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (isSubadminPath && role === "USER") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
