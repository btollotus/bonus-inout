import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

function toYmd(d: string) {
  return (d || "").slice(0, 10);
}
function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const from = toYmd(searchParams.get("from") || "");
  const to = toYmd(searchParams.get("to") || "");
  const outCatsRaw = searchParams.get("outCats") || "";
  const outCats = outCatsRaw
    ? outCatsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (!from || !to) {
    return NextResponse.json({ error: "from/to 파라미터가 필요합니다." }, { status: 400 });
  }

  const supabase = await createClient();

  // 1) 매출(orders)
  const { data: oData, error: oErr } = await supabase
    .from("orders")
    .select("id,customer_id,customer_name,ship_date,ship_method,supply_amount,vat_amount,total_amount")
    .gte("ship_date", from)
    .lte("ship_date", to)
    .order("ship_date", { ascending: true })
    .limit(100000);

  if (oErr) {
    return NextResponse.json({ error: "orders 조회 실패", detail: oErr.message }, { status: 500 });
  }

  // 2) 매입(ledger_entries OUT) + 선택 카테고리 필터
  let ledgerQuery = supabase
    .from("ledger_entries")
    .select(
      "id,entry_date,entry_ts,direction,amount,category,method,counterparty_name,business_no,memo,supply_amount,vat_amount,total_amount,vat_type,vat_rate"
    )
    .eq("direction", "OUT")
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date", { ascending: true })
    .limit(200000);

  if (outCats.length > 0) {
    ledgerQuery = ledgerQuery.in("category", outCats);
  }

  const { data: lData, error: lErr } = await ledgerQuery;

  if (lErr) {
    return NextResponse.json(
      { error: "ledger_entries(OUT) 조회 실패", detail: lErr.message },
      { status: 500 }
    );
  }

  const rows: any[] = [];

  // 매출 행
  for (const o of (oData ?? []) as any[]) {
    const supply = safeNum(o.supply_amount);
    const vat = safeNum(o.vat_amount);
    const total = safeNum(o.total_amount);

    rows.push({
      날짜: toYmd(o.ship_date),
      거래처: String(o.customer_name ?? ""),
      구분: "매출",
      공급가: supply,
      VAT: vat,
      총액: total,
      비고: "",
      참조ID: String(o.id),
    });
  }

  // 매입(OUT) 행
  for (const l of (lData ?? []) as any[]) {
    const total = safeNum(l.total_amount ?? l.amount);
    const supply = safeNum(l.supply_amount ?? 0);
    const vat = safeNum(l.vat_amount ?? 0);
    const vt = String(l.vat_type ?? "TAXED").toUpperCase();

    // 대표님 tax 화면 로직과 동일하게: VAT는 TAXED만 인정
    const vatForReport = vt === "TAXED" ? vat : 0;

    rows.push({
      날짜: toYmd(l.entry_date),
      거래처: String(l.counterparty_name ?? ""),
      구분: `매입(${String(l.category ?? "OUT")})`,
      공급가: supply,
      VAT: vatForReport,
      총액: total,
      비고: String(l.memo ?? ""),
      참조ID: String(l.id),
    });
  }

  rows.sort((a, b) => {
    if (a.날짜 === b.날짜) return String(a.구분).localeCompare(String(b.구분));
    return String(a.날짜).localeCompare(String(b.날짜));
  });

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["날짜", "거래처", "구분", "공급가", "VAT", "총액", "비고", "참조ID"],
  });

  (ws as any)["!cols"] = [
    { wch: 12 },
    { wch: 26 },
    { wch: 16 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 30 },
    { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "세무사_통합");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = `세무사_통합_${from}_${to}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}