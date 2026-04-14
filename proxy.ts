import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

// ADMIN만 접근 가능
const ADMIN_ONLY_PATHS = [
  "/admin/employees",
  "/admin/payroll",
  "/admin/hr",  
 
  // "/trade" 제거 → SUBADMIN도 접근 가능하도록 아래로 이동
];

// ADMIN + SUBADMIN만 접근 가능 (USER 차단)
const SUBADMIN_PATHS = [
  "/scan",
  "/report",
  "/tax/spec",
  "/tax/statement",
  "/production",
  "/trade", // ✅ ADMIN_ONLY에서 이동 — SUBADMIN도 접근 가능
  "/products", // ✅ /leave 제거 — USER도 접근 가능
];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/unauthorized") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/) !== null ||
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next();

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

  // Admin Client로 role 조회 + 퇴사 여부 확인
  let role = "USER";
  try {
    const admin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // role 조회
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .single();
    role = roleData?.role ?? "USER";

    // ✅ 퇴사 여부 확인 — ADMIN/SUBADMIN은 제외
    if (role === "USER") {
      const today = new Date().toISOString().split("T")[0];
      const { data: empData } = await admin
        .from("employees")
        .select("resign_date")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      // resign_date가 null이거나 오늘보다 미래면 재직 → 정상 통과
      if (empData?.resign_date && empData.resign_date <= today) {
        // Supabase Auth 세션 강제 종료
        await admin.auth.admin.signOut(data.user.id);
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.search = "?resigned=1";
        const redirectRes = NextResponse.redirect(url);
        req.cookies.getAll().forEach(({ name }) => {
          if (name.includes("supabase") || name.startsWith("sb-")) {
            redirectRes.cookies.delete(name);
          }
        });
        return redirectRes;
      }
    }
  } catch {
    // role/퇴사 조회 실패 시 USER 유지
  }

  // ADMIN 전용 경로
  const isAdminOnly =
    ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p)) ||
    (pathname.startsWith("/tax") &&
      !pathname.startsWith("/tax/spec") &&
      !pathname.startsWith("/tax/statement"));

  if (isAdminOnly && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  // ADMIN + SUBADMIN 전용 경로 (USER 차단)
  const isSubadminPath = SUBADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (isSubadminPath && role === "USER") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
