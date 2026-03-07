import type { Metadata } from "next";
export const metadata: Metadata = { title: "세무 | BONUSMATE ERP" };

// app/tax/page.tsx
import TaxClient from "./tax-client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=%2Ftax");

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (serviceKey) {
    const supabaseAdmin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const role = data?.role ?? "USER";
    if (role !== "ADMIN") redirect("/");
  } else {
    // service role key가 없으면 안전하게 차단
    redirect("/");
  }

  return <TaxClient />;
}