import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const mallId = process.env.CAFE24_MALL_ID!;
const clientId = process.env.CAFE24_CLIENT_ID!;
const clientSecret = process.env.CAFE24_CLIENT_SECRET!;

async function getAccessToken(): Promise<string> {
  const { data: tokenRow } = await supabase
    .from("cafe24_tokens")
    .select("*")
    .eq("id", 1)
    .single();

  if (!tokenRow) throw new Error("cafe24 토큰 없음 - 인증 필요");

  // 만료 5분 전이면 갱신
  if (new Date(tokenRow.expires_at).getTime() - Date.now() < 5 * 60_000) {
    const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenRow.refresh_token,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`토큰 갱신 실패: ${JSON.stringify(data)}`);

    const expiresAt = new Date(data.expires_at + "+09:00").toISOString();
    await supabase.from("cafe24_tokens").upsert({
      id: 1,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });

    return data.access_token;
  }

  return tokenRow.access_token;
}

export async function GET() {
  try {
    const accessToken = await getAccessToken();

    const { data: stateRow } = await supabase
      .from("cafe24_poll_state")
      .select("last_changed_at")
      .eq("id", 1)
      .single();

      const toKSTString = (date: Date) => {
        const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        return kst.toISOString().replace("T", " ").substring(0, 19);
      };
      const since = toKSTString(new Date(Date.now() - 7 * 24 * 60 * 60_000));

      const now = toKSTString(new Date());

    const url = `https://${mallId}.cafe24api.com/api/v2/admin/orders?start_date=${encodeURIComponent(since)}&end_date=${encodeURIComponent(now)}&limit=50`;
    console.log("[cafe24/poll] request url:", url);
    const ordersRes = await fetch(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Cafe24-Api-Version": "2026-03-01",
        },
      }
    );

    const ordersData = await ordersRes.json();

    await supabase.from("cafe24_poll_state").update({ last_changed_at: new Date().toISOString() }).eq("id", 1);

    if (!ordersRes.ok) throw new Error(JSON.stringify(ordersData));

    const orders = ordersData.orders ?? [];
    if (orders.length === 0) {
      const { count } = await supabase
        .from("cafe24_orders")
        .select("*", { count: "exact", head: true })
        .eq("confirmed", false);
      const { data: recentOrders } = await supabase
        .from("cafe24_orders")
        .select("*")
        .eq("confirmed", false)
        .order("ordered_at", { ascending: false })
        .limit(20);
      return NextResponse.json({ newCount: count ?? 0, orders: recentOrders ?? [] });
    }

    const rows = await Promise.all(orders.map(async (o: any) => {
      let product_name = "";
      try {
        const detailRes = await fetch(
          `https://${mallId}.cafe24api.com/api/v2/admin/orders/${o.order_id}?fields=items`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "X-Cafe24-Api-Version": "2026-03-01",
            },
          }
        );
        const detailData = await detailRes.json();
        console.log("[cafe24/poll] detailData:", o.order_id, JSON.stringify(detailData).substring(0, 500));
        const items = detailData.order?.items ?? [];
        product_name = items.map((item: any) => item.product_name).filter(Boolean).join(", ");
      } catch {}
      return {
        id: o.order_id,
        order_id: o.order_id,
        product_name,
        quantity: 1,
        price: parseInt(o.actual_order_amount?.payment_amount ?? o.payment_amount ?? "0"),
        buyer_name: o.billing_name ?? "",
        status: o.shipping_status ?? "unknown",
        ordered_at: o.order_date,
      };
    }));

    await supabase
    .from("cafe24_orders")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: false });

  const { count } = await supabase
    .from("cafe24_orders")
    .select("*", { count: "exact", head: true })
    .eq("confirmed", false);

  const { data: recentOrders } = await supabase
    .from("cafe24_orders")
    .select("*")
    .eq("confirmed", false)
    .order("ordered_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ newCount: count ?? 0, orders: recentOrders ?? [] });
  } catch (e: any) {
    console.error("[cafe24/poll] 예외:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}