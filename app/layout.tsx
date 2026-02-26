import "./globals.css";
import TopNav from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const metadata = {
  title: "BONUSMATE ERP",
  description: "BONUS In/Out",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string = "USER";
  const email: string = user?.email ?? "";

  if (user) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (serviceKey) {
      const supabaseAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );

      const { data } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      role = data?.role ?? "USER";
    }
  }

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          backgroundColor: "black",
          color: "white",
          minHeight: "100vh",
        }}
      >
        <TopNav role={role} email={email} />
        {/* ✅ 풀폭 레이아웃 */}
        <main style={{ width: "100%" }}>{children}</main>
      </body>
    </html>
  );
}