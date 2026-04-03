// ============================================================
// Supabase Edge Function: check-expiry-and-stock
// 매일 08:00 KST (UTC 23:00 전날) 자동 실행
// 1. v_expiry_alert → expiry_mgmt_logs 자동 INSERT
// 2. v_safety_stock_alert → expiry_mgmt_logs 자동 INSERT
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (_req) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const results: string[] = [];

    // ── 1. 소비기한 D-30 경보 ──
    const { data: expiryAlerts, error: expiryErr } = await supabase
      .from("v_expiry_alert")
      .select("*");

    if (expiryErr) throw new Error("v_expiry_alert 조회 실패: " + expiryErr.message);

    for (const row of expiryAlerts ?? []) {
      // 오늘 이미 같은 원료+소비기한으로 기록된 게 있으면 스킵
      const { data: existing } = await supabase
        .from("expiry_mgmt_logs")
        .select("id")
        .eq("log_date", today)
        .eq("material_id", row.material_id)
        .eq("expiry_date", row.expiry_date)
        .maybeSingle();

      if (existing) continue;

      const { error: insertErr } = await supabase
        .from("expiry_mgmt_logs")
        .insert({
          log_date: today,
          material_id: row.material_id,
          item_name: row.material_name,
          expiry_date: row.expiry_date,
          current_stock: row.total_received,
          status: row.alert_type === "expired" ? "만료" : "D-30 경보",
          action: null,
        });

      if (insertErr) {
        results.push(`❌ 소비기한 기록 실패 (${row.material_name}): ${insertErr.message}`);
      } else {
        results.push(`✅ 소비기한 기록: ${row.material_name} (${row.expiry_date}, ${row.alert_type})`);
      }
    }

    // ── 2. 안전재고 미달 경보 ──
    const { data: stockAlerts, error: stockErr } = await supabase
      .from("v_safety_stock_alert")
      .select("*");

    if (stockErr) throw new Error("v_safety_stock_alert 조회 실패: " + stockErr.message);

    for (const row of stockAlerts ?? []) {
      // 오늘 이미 같은 원료로 안전재고 기록된 게 있으면 스킵
      const { data: existing } = await supabase
        .from("expiry_mgmt_logs")
        .select("id")
        .eq("log_date", today)
        .eq("material_id", row.material_id)
        .eq("status", "안전재고 미달")
        .maybeSingle();

      if (existing) continue;

      const { error: insertErr } = await supabase
        .from("expiry_mgmt_logs")
        .insert({
          log_date: today,
          material_id: row.material_id,
          item_name: row.material_name,
          expiry_date: null,
          current_stock: row.current_stock,
          status: "안전재고 미달",
          action: `부족량: ${row.shortage}${row.unit ?? "g"}`,
        });

      if (insertErr) {
        results.push(`❌ 안전재고 기록 실패 (${row.material_name}): ${insertErr.message}`);
      } else {
        results.push(`✅ 안전재고 기록: ${row.material_name} (현재고 ${row.current_stock}, 부족 ${row.shortage})`);
      }
    }

    const summary = `완료 - 소비기한 ${expiryAlerts?.length ?? 0}건, 안전재고 ${stockAlerts?.length ?? 0}건 처리`;
    console.log(summary, results);

    return new Response(
      JSON.stringify({ ok: true, summary, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("Edge Function 오류:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
