import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import AttendanceClient from "@/app/attendance/attendance-client";

export const metadata: Metadata = { title: "홈 | BONUSMATE ERP" };

export default async function HomePage() {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  let role = "USER";
  if (user) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    role = data?.role ?? "USER";
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-4">

        {/* 기존 환영 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-2">
            <img src="/bonusmate-logo.png" alt="BONUSMATE" style={{ height: 40, width: "auto" }} />
            <h1 className="text-xl font-bold text-gray-900">BONUSMATE ERP</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            로그인되었습니다. 상단 메뉴에서 원하는 기능을 선택하세요.
          </p>
        </div>

        {/* 출퇴근 위젯 — SUBADMIN/USER만 표시, ADMIN 제외 */}
        {role !== "ADMIN" && <AttendanceClient />}

      </div>
    </main>
  );
}