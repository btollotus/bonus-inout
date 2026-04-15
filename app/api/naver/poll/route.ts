import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const PROXY = "http://175.106.96.167:3000";

function toNaverDate(date: Date): string {
  return date.toISOString().slice(0, 23) + 'Z';
}

export async function GET() {
  try {
    // 1. 마지막 폴링 시각 조회
    const { data: stateRow } = await supabase
      .from("naver_poll_state")
      .select("last_changed_at")
      .eq("id", 1)
      .single();

    const lastChangedFrom = toNaverDate(
      stateRow?.last_changed_at
        ? new Date(stateRow.last_changed_at)
        : new Date(Date.now() - 5 * 60_000)
    );
    const now = toNaverDate(new Date());

    // 2. 프록시 서버에서 주문 조회
    const params = new URLSearchParams({ lastChangedFrom, lastChangedTo: now });
    const pollRes = await fetch(`${PROXY}/poll?${params}`);

    if (!pollRes.ok) {
      const text = await pollRes.text();
      return NextResponse.json({ error: "poll_failed", detail: text }, { status: 500 });
    }

    const { newOrders } = await pollRes.json();

    // 3. 폴링 시각 업데이트
    await supabase.from("naver_poll_state").update({ last_changed_at: new Date().toISOString() }).eq("id", 1);

    // 4. 신규 주문 저장
    if (newOrders?.length) {
      await supabase
        .from("naver_orders")
        .upsert(newOrders, { onConflict: "id", ignoreDuplicates: true });
    }

    // 5. 미확인 주문 수 항상 반환 (신규 주문 없어도)
    const { count } = await supabase
      .from("naver_orders")
      .select("*", { count: "exact", head: true })
      .in("status", ["PAYED", "PAYMENT_WAITING"]);

    // 6. 최근 미확인 주문 목록도 반환
    const { data: recentOrders } = await supabase
      .from("naver_orders")
      .select("*")
      .in("status", ["PAYED", "PAYMENT_WAITING"])
      .order("ordered_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ 
      newCount: count ?? 0, 
      orders: recentOrders ?? [] 
    });
  } catch (e: any) {
    console.error("[naver/poll] 예외:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}