// app/trade/page.tsx
import { createClient } from "@/lib/supabase/server";
import TradeClient from "./trade-client";

export const metadata = { title: "거래내역(통합) | BONUSMATE ERP" };

export default async function TradePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role = "USER";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role) role = profile.role;
  }

  return <TradeClient role={role} />;
}
