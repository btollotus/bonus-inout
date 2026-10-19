// lib/auth/require-admin.ts
// 관리자 전용 API 보호: 로그인 쿠키로 사용자 확인 → user_roles에서 ADMIN 여부 확인
// (/api/me 와 동일한 인증 방식 재사용)
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export type RequireAdminResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 | 500; error: string };

export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, status: 401, error: "로그인이 필요합니다." };
  }

  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleError) {
    console.error("requireAdmin user_roles 조회 오류:", roleError.message);
    return { ok: false, status: 500, error: "권한 확인 중 오류가 발생했습니다." };
  }

  if (data?.role !== "ADMIN") {
    return { ok: false, status: 403, error: "관리자만 사용할 수 있습니다." };
  }

  return { ok: true, userId: user.id };
}