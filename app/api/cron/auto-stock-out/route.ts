import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function GET() {
  try {
    // 오늘 날짜 KST 기준
    const todayKST = new Date(
      new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    );
    const todayStr = `${todayKST.getFullYear()}-${String(todayKST.getMonth() + 1).padStart(2, "0")}-${String(todayKST.getDate()).padStart(2, "0")}`;

    console.log(`[auto-stock-out] 실행일 KST: ${todayStr}`);

    // 1. 오늘 출고일인 주문 조회
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, ship_date")
      .eq("ship_date", todayStr);

    if (ordersErr) throw new Error("orders 조회 실패: " + ordersErr.message);
    if (!orders || orders.length === 0) {
      console.log("[auto-stock-out] 오늘 출고 주문 없음");
      return NextResponse.json({ processed: 0, skipped: 0, errors: [] });
    }

    console.log(`[auto-stock-out] 대상 주문 ${orders.length}건`);

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const order of orders) {
      // 2. 연결된 work_orders 조회
      const { data: woRows, error: woErr } = await supabase
        .from("work_orders")
        .select("id, work_order_no")
        .eq("linked_order_id", order.id);

      if (woErr) { errors.push(`WO 조회 실패 (order ${order.id}): ${woErr.message}`); continue; }
      if (!woRows || woRows.length === 0) { skipped++; continue; }

      for (const wo of woRows) {
        // 3. work_order_items 조회 (actual_qty > 0, expiry_date 있는 것만)
        const { data: items, error: itemsErr } = await supabase
          .from("work_order_items")
          .select("id, actual_qty, order_qty, expiry_date, barcode_no, sub_items")
          .eq("work_order_id", wo.id)
          .gt("actual_qty", 0)
          .not("expiry_date", "is", null);

        if (itemsErr) { errors.push(`items 조회 실패 (wo ${wo.work_order_no}): ${itemsErr.message}`); continue; }
        if (!items || items.length === 0) { skipped++; continue; }

        for (const item of items) {
          // 성형틀, 인쇄제판 제외
          const itemName: string = (item.sub_items ?? [])[0]?.name ?? "";
          if (itemName.startsWith("성형틀") || itemName.startsWith("인쇄제판")) { skipped++; continue; }

          // 4. variant_id 조회 (barcode_no → product_barcodes)
          let variantId: string | null = null;
          if (item.barcode_no) {
            const { data: pbData } = await supabase
              .from("product_barcodes")
              .select("variant_id")
              .eq("barcode", item.barcode_no)
              .maybeSingle();
            variantId = pbData?.variant_id ?? null;
          }
          if (!variantId) {
            // work_orders.variant_id fallback
            const { data: woData } = await supabase
              .from("work_orders")
              .select("variant_id")
              .eq("id", wo.id)
              .single();
            variantId = woData?.variant_id ?? null;
          }
          if (!variantId) { errors.push(`variant 없음: ${wo.work_order_no} - ${itemName}`); continue; }

          // 5. lot 조회 (variant_id + expiry_date)
          const { data: lot } = await supabase
            .from("lots")
            .select("id")
            .eq("variant_id", variantId)
            .eq("expiry_date", item.expiry_date)
            .maybeSingle();

          if (!lot) { errors.push(`lot 없음: ${wo.work_order_no} - ${itemName}`); continue; }

          // 6. IN 있는지 확인
          const { data: inMov } = await supabase
            .from("movements")
            .select("id")
            .eq("lot_id", lot.id)
            .eq("type", "IN")
            .limit(1);

          if (!inMov || inMov.length === 0) { skipped++; continue; }

          // 7. OUT 이미 있는지 확인 (멱등성)
          const outNote = `거래내역 OUT - ${wo.work_order_no} - ${itemName}`;
          const { data: existingOut } = await supabase
            .from("movements")
            .select("id")
            .eq("lot_id", lot.id)
            .eq("type", "OUT")
            .eq("note", outNote)
            .limit(1);

          if (existingOut && existingOut.length > 0) {
            console.log(`[auto-stock-out] 이미 처리됨: ${outNote}`);
            skipped++;
            continue;
          }

          // 8. OUT insert (qty = order_qty, happened_at = ship_date KST)
          const { error: outErr } = await supabase.from("movements").insert({
            lot_id: lot.id,
            type: "OUT",
            qty: item.order_qty,
            happened_at: `${order.ship_date}T00:00:00+09:00`,
            note: outNote,
          });

          if (outErr) {
            errors.push(`OUT insert 실패 (${outNote}): ${outErr.message}`);
          } else {
            console.log(`[auto-stock-out] OUT 처리 완료: ${outNote}`);
            processed++;
          }
        }
      }
    }

    console.log(`[auto-stock-out] 완료 — processed: ${processed}, skipped: ${skipped}, errors: ${errors.length}`);
    return NextResponse.json({ processed, skipped, errors });

  } catch (e: any) {
    console.error("[auto-stock-out] 예외:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}