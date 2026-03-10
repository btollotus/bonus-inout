// app/api/admin/disable-resigned-user/route.ts
// 퇴사일 저장 시 Supabase Auth 계정 ban 처리

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { auth_user_id, resign_date } = await req.json();

    if (!auth_user_id) {
      return NextResponse.json({ error: "auth_user_id 필요" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];
    const isResigned = resign_date && resign_date <= today;

    if (isResigned) {
      // ✅ Supabase Auth ban: 로그인 완전 차단
      const { error } = await admin.auth.admin.updateUserById(auth_user_id, {
        ban_duration: "876600h", // 100년 = 사실상 영구 ban
      });
      if (error) throw error;

      // ✅ 기존 세션 강제 종료
      await admin.auth.admin.signOut(auth_user_id);
    } else {
      // 퇴사일 제거 또는 미래 날짜 → ban 해제
      const { error } = await admin.auth.admin.updateUserById(auth_user_id, {
        ban_duration: "none",
      });
      if (error) throw error;
    }

    return NextResponse.json({ success: true, banned: isResigned });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "처리 중 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
