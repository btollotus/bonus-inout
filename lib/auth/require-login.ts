// lib/auth/require-login.ts
// 로그인한 사용자만 허용 (역할 무관). 퇴사자는 계정이 비활성화되어 로그인 불가.
import { createClient } from "@/lib/supabase/server";

export type RequireLoginResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401; error: string };

export async function requireLogin(): Promise<RequireLoginResult> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, status: 401, error: "로그인이 필요합니다." };
  }
  return { ok: true, userId: user.id };
}