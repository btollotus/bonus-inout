import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  // 1. 현재 로그인 유저가 ADMIN인지 확인
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", session.user.id)
    .single();

  // employees 테이블에 role 컬럼이 없는 경우 email로 ADMIN 체크
  const isAdmin =
    employee?.role === "ADMIN" ||
    session.user.email === process.env.ADMIN_EMAIL ||
    session.user.email === "bonusmate@naver.com"; // fallback

  if (!isAdmin) {
    return NextResponse.json({ error: "관리자만 접근 가능합니다." }, { status: 403 });
  }

  // 2. Service Role로 Auth Users 목록 조회
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await adminClient.auth.admin.listUsers();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    display_name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
  }));

  return NextResponse.json({ users });
}
