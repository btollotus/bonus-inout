// app/trade/page.tsx
import { createClient } from "@/lib/supabase/server";
import TradeClient from "./trade-client";

export const metadata = { title: "거래내역(통합) | BONUSMATE ERP" };

export default async function TradePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role = "USER";
  if (user) {
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (roleData?.role) role = roleData.role;
  }

  return <TradeClient role={role} />;
}
