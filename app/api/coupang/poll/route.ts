import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  try {
    const { data: stateRow } = await supabase
      .from("coupang_poll_state")
      .select("last_changed_at")
      .eq("id", 1)
      .single();

    const createdAtFrom = toProxyDate(
      stateRow?.last_changed_at
        ? new Date(stateRow.last_changed_at)
        : new Date(Date.now() - 5 * 60_000)
    );
    const createdAtTo = toProxyDate(new Date());

    const params = new URLSearchParams({ createdAtFrom, createdAtTo });
    const pollRes = await fetch(`${PROXY}/coupang-poll?${params}`);

    if (!pollRes.ok) {
      const text = await pollRes.text();
      return NextResponse.json({ error: "poll_failed", detail: text }, { status: 500 });
    }

    const rawBody = await pollRes.json();
    console.log("[poll] proxy raw:", JSON.stringify(rawBody));
    const { newOrders } = rawBody;

    await supabase
      .from("coupang_poll_state")
      .update({ last_changed_at: new Date().toISOString() })
      .eq("id", 1);

    if (!newOrders?.length) {
      return NextResponse.json({ newCount: 0 });
    }

    await supabase
      .from("coupang_orders")
      .upsert(newOrders, { onConflict: "id", ignoreDuplicates: true });

    const { count } = await supabase
      .from("coupang_orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "ACCEPT");

    return NextResponse.json({ newCount: count ?? newOrders.length, orders: newOrders });
  } catch (e: any) {
    console.error("[coupang/poll] 예외:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}