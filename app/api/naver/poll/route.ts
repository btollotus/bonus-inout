import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function GET() {
  try {
    // 1. 액세스 토큰 발급
    const tokenRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/naver/token`);
    if (!tokenRes.ok) return NextResponse.json({ error: "token_failed" }, { status: 500 });
    const { access_token } = await tokenRes.json();

    // 2. 마지막 폴링 시각 조회
    const { data: stateRow } = await supabase
      .from("naver_poll_state")
      .select("last_changed_at")
      .eq("id", 1)
      .single();

    const lastChangedFrom = stateRow?.last_changed_at ?? new Date(Date.now() - 5 * 60_000).toISOString();
    const now = new Date().toISOString();

    // 3. 네이버 주문 변경 목록 조회
    const params = new URLSearchParams({
      lastChangedFrom,
      lastChangedTo: now,
      limitCount: "100",
    });

    const ordersRes = await fetch(
      `https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/last-changed-statuses?${params}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    if (!ordersRes.ok) {
      const text = await ordersRes.text();
      console.error("[naver/poll] 주문 조회 실패:", text);
      return NextResponse.json({ error: "orders_failed", detail: text }, { status: 500 });
    }

    const ordersData = await ordersRes.json();
    const changedOrders: any[] = ordersData.data ?? [];

    // 4. 결제완료 신규 주문만 필터
    const newOrders = changedOrders.filter(
      (o) => o.productOrderStatus === "PAYMENT_WAITING" || o.productOrderStatus === "PAYED"
    );

    if (newOrders.length === 0) {
      // 폴링 시각만 업데이트
      await supabase.from("naver_poll_state").update({ last_changed_at: now }).eq("id", 1);
      return NextResponse.json({ newCount: 0 });
    }

    // 5. 상세 주문 정보 조회
    const productOrderIds = newOrders.map((o) => o.productOrderId);

    const detailRes = await fetch(
      "https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/query",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productOrderIds }),
      }
    );

    const detailData = await detailRes.json();
    const details: any[] = detailData.data ?? [];

    // 6. Supabase에 저장 (중복 무시)
    const rows = details.map((d) => ({
      id: d.productOrder.productOrderId,
      order_id: d.productOrder.orderId,
      product_name: d.productOrder.productName,
      quantity: d.productOrder.quantity,
      price: d.productOrder.totalPaymentAmount,
      buyer_name: d.order?.ordererName ?? "",
      status: d.productOrder.productOrderStatus,
      ordered_at: d.productOrder.paymentDate ?? d.productOrder.orderDate,
    }));

    const { error: insertError } = await supabase
      .from("naver_orders")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

    if (insertError) {
      console.error("[naver/poll] Supabase insert 실패:", insertError);
    }

    // 7. 폴링 시각 업데이트
    await supabase.from("naver_poll_state").update({ last_changed_at: now }).eq("id", 1);

    // 8. 미확인 신규 주문 수 반환
    const { count } = await supabase
      .from("naver_orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "PAYED");

    return NextResponse.json({ newCount: count ?? newOrders.length, orders: rows });
  } catch (e) {
    console.error("[naver/poll] 예외:", e);
    return NextResponse.json({ error: "exception" }, { status: 500 });
  }
}