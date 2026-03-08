import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

const ADMIN_ONLY_PATHS = ["/admin/employees", "/admin/payroll"];
const SUBADMIN_PATHS = ["/scan", "/products", "/report", "/trade", "/tax", "/calendar", "/orders", "/ledger"];

export async function proxy(req: NextRequest) {
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

  // ✅ /api/me 대신 직접 Admin Client로 role 조회
  let role = "USER";
  try {
    const admin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .single();
    role = roleData?.role ?? "USER";
  } catch {
    // role 조회 실패 시 USER 유지
  }

  const isAdminOnly = ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminOnly && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  const isSubadminPath = SUBADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (isSubadminPath && role === "USER") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};