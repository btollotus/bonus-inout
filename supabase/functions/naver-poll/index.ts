import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// esm.sh의 npm:bcryptjs는 Worker 없이 동작하는 순수 JS 구현
import bcryptjs from "https://esm.sh/bcryptjs@2.4.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function getNaverToken(): Promise<string> {
  const clientId = Deno.env.get("NAVER_CLIENT_ID")!;
  const clientSecret = Deno.env.get("NAVER_CLIENT_SECRET")!;
  const timestamp = Date.now().toString();
  const password = `${clientId}_${timestamp}`;

  const hashed = bcryptjs.hashSync(password, clientSecret);
  const clientSecretSign = btoa(hashed);

  const res = await fetch(
    "https://api.commerce.naver.com/external/v1/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        timestamp,
        client_secret_sign: clientSecretSign,
        grant_type: "client_credentials",
        type: "SELF",
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`토큰 발급 실패: ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

Deno.serve(async () => {
  try {
    const accessToken = await getNaverToken();

    const { data: stateRow } = await supabase
      .from("naver_poll_state")
      .select("last_changed_at")
      .eq("id", 1)
      .single();

    const lastChangedFrom =
      stateRow?.last_changed_at ??
      new Date(Date.now() - 5 * 60_000).toISOString();
    const now = new Date().toISOString();

    const params = new URLSearchParams({
      lastChangedFrom,
      lastChangedTo: now,
      limitCount: "100",
    });

    const ordersRes = await fetch(
      `https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/last-changed-statuses?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!ordersRes.ok) {
      const text = await ordersRes.text();
      throw new Error(`주문 조회 실패: ${text}`);
    }

    const ordersData = await ordersRes.json();
    const changedOrders = (ordersData.data ?? []) as any[];

    const newOrders = changedOrders.filter(
      (o) =>
        o.productOrderStatus === "PAYED" ||
        o.productOrderStatus === "PAYMENT_WAITING"
    );

    await supabase
      .from("naver_poll_state")
      .update({ last_changed_at: now })
      .eq("id", 1);

    if (newOrders.length === 0) {
      return new Response(JSON.stringify({ newCount: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const productOrderIds = newOrders.map((o) => o.productOrderId);

    const detailRes = await fetch(
      "https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/query",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productOrderIds }),
      }
    );

    const detailData = await detailRes.json();
    const details = (detailData.data ?? []) as any[];

    const rows = details.map((d) => ({
      id: d.productOrder.productOrderId,
      order_id: d.productOrder.orderId,
      product_name: d.productOrder.productName,
      quantity: d.productOrder.quantity,
      price: d.productOrder.totalPaymentAmount,
      buyer_name: d.order?.ordererName ?? "",
      status: d.productOrder.productOrderStatus,
      ordered_at:
        d.productOrder.paymentDate ?? d.productOrder.orderDate,
    }));

    await supabase
      .from("naver_orders")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

    const { count } = await supabase
      .from("naver_orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "PAYED");

    return new Response(
      JSON.stringify({ newCount: count ?? newOrders.length, orders: rows }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[naver-poll] 예외:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
