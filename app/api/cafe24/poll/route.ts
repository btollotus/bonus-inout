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

    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
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

    const since = stateRow?.last_changed_at
      ? new Date(stateRow.last_changed_at).toISOString().replace("T", " ").substring(0, 19)
      : new Date(Date.now() - 5 * 60_000).toISOString().replace("T", " ").substring(0, 19);

    const now = new Date().toISOString().replace("T", " ").substring(0, 19);

    const ordersRes = await fetch(
      `https://${mallId}.cafe24api.com/api/v2/orders?start_date=${encodeURIComponent(since)}&end_date=${encodeURIComponent(now)}&order_status=N20&limit=50`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Cafe24-Api-Version": "2024-06-01",
        },
      }
    );

    const ordersData = await ordersRes.json();

    await supabase.from("cafe24_poll_state").update({ last_changed_at: new Date().toISOString() }).eq("id", 1);

    if (!ordersRes.ok) throw new Error(JSON.stringify(ordersData));

    const orders = ordersData.orders ?? [];
    if (orders.length === 0) return NextResponse.json({ newCount: 0 });

    const rows = orders.flatMap((o: any) =>
      (o.items ?? []).map((item: any) => ({
        id: `${o.order_id}_${item.order_item_code}`,
        order_id: o.order_id,
        product_name: item.product_name,
        quantity: item.quantity,
        price: parseInt(o.actual_price ?? "0"),
        buyer_name: o.billing_name ?? "",
        status: o.order_status,
        ordered_at: o.order_date,
      }))
    );

    await supabase
      .from("cafe24_orders")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

    const { count } = await supabase
      .from("cafe24_orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "N20");

    return NextResponse.json({ newCount: count ?? rows.length, orders: rows });
  } catch (e: any) {
    console.error("[cafe24/poll] 예외:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}