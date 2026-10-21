import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLogin } from "@/lib/auth/require-login";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const PROXY = "http://175.106.96.167:3000";

function toProxyDate(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().substring(0, 10);
}

export async function GET() {
  // ✅ 로그인한 사용자만 허용 (구매자 이름 포함 주문 목록)
  const auth = await requireLogin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { data: stateRow } = await supabase
      .from("coupang_poll_state")
      .select("last_changed_at")
      .eq("id", 1)
      .single();

      const createdAtFrom = toProxyDate(
        stateRow?.last_changed_at && new Date(stateRow.last_changed_at).getTime() > Date.now() - 60 * 60_000
          ? new Date(stateRow.last_changed_at)
          : new Date(Date.now() - 5 * 60_000)
      );
    const createdAtTo = toProxyDate(new Date());

    const params = new URLSearchParams({ createdAtFrom, createdAtTo });
    const pollRes = await fetch(`${PROXY}/coupang-poll?${params}`, {
      headers: { "x-proxy-token": process.env.PROXY_TOKEN_BONUS ?? "" },
    });

    if (!pollRes.ok) {
      const text = await pollRes.text();
      return NextResponse.json({ error: "poll_failed", detail: text }, { status: 500 });
    }

    const rawBody = await pollRes.json();
    
    const { newOrders } = rawBody;

    await supabase
      .from("coupang_poll_state")
      .update({ last_changed_at: new Date().toISOString() })
      .eq("id", 1);

      const { count } = await supabase
      .from("coupang_orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "ACCEPT");
    
    if (!newOrders?.length) {
      return NextResponse.json({ newCount: count ?? 0 });
    }
    
    await supabase
      .from("coupang_orders")
      .upsert(newOrders, { onConflict: "id", ignoreDuplicates: true });
      
    return NextResponse.json({ newCount: count ?? newOrders.length, orders: newOrders });
  } catch (e: any) {
    console.error("[coupang/poll] 예외:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}