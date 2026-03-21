// app/layout.tsx
import "./globals.css";
import TopNavWrapper from "@/components/TopNavWrapper";
import { ChatProvider } from "@/components/ChatProvider";
import FloatingChat from "@/components/FloatingChat";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "BONUSMATE ERP", template: "%s | BONUSMATE ERP" },
};

async function getMe(): Promise<{ role: string; email: string }> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { role: "USER", email: "" };
    const admin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    return { role: data?.role ?? "USER", email: user.email ?? "" };
  } catch {
    return { role: "USER", email: "" };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { role, email } = await getMe();
  return (
    <html lang="ko">
      <body style={{ margin: 0, backgroundColor: "#f9fafb", color: "#111", minHeight: "100vh" }}>
        <ChatProvider role={role} email={email}>
          <TopNavWrapper role={role} email={email} />
          <main style={{ width: "100%" }}>{children}</main>
          <FloatingChat />
        </ChatProvider>
      </body>
    </html>
  );
}
