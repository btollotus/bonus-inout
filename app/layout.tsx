import "./globals.css";
import TopNav from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "재고관리 MVP",
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
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    role = data?.role ?? "USER";
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