import "./globals.css";
import TopNavWrapper from "@/components/TopNavWrapper";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "BONUSMATE ERP", template: "%s | BONUSMATE ERP" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: string = "USER";
  const email: string = user?.email ?? "";

  if (user) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      const supabaseAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      role = data?.role ?? "USER";
    }

    // role을 쿠키에 저장 → proxy.ts에서 읽을 수 있게
    const cookieStore = await cookies();
    cookieStore.set("user_role", role, {
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24시간
    });
  }

  return (
    <html lang="ko">
      <body style={{ margin: 0, backgroundColor: "#f9fafb", color: "#111", minHeight: "100vh" }}>
        <TopNavWrapper role={role} email={email} />
        <main style={{ width: "100%" }}>{children}</main>
      </body>
    </html>
  );
}
