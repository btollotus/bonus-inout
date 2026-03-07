import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  // 1. 쿠키로 현재 세션 확인 (서버사이드)
  const cookieStore = cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // anon 클라이언트로 세션 쿠키에서 유저 확인
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        cookie: cookieStore.toString(),
      },
    },
  });

  const { data: { user }, error: userError } = await anonClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  // 2. Service Role로 employees 테이블에서 role 확인
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: employee } = await adminClient
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  // ADMIN 체크 (email fallback 포함)
  const isAdmin =
    employee?.role === "ADMIN" ||
    user.email === "bonusmate@naver.com";

  if (!isAdmin) {
    return NextResponse.json({ error: "관리자만 접근 가능합니다." }, { status: 403 });
  }

  // 3. Auth Users 목록 조회
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
