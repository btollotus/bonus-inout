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

function normalizeBizNo(bn: any) {
  const s = String(bn ?? "").trim();
  return s || "";
}

function extractOrdererName(memo: any): string {
  if (!memo) return "";
  const s = String(memo).trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const j = JSON.parse(s);
      return j?.orderer_name ? String(j.orderer_name) : "";
    } catch {
      return "";
    }
  }
  return "";
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
    return NextResponse.json(
      { error: "from/to 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // =============================
  // 1) 매출(orders + order_lines)
  // =============================
  const { data: orders, error: oErr } = await supabase
    .from("orders")
    .select(
      "id,customer_id,customer_name,ship_date,supply_amount,vat_amount,total_amount,memo"
    )
    .gte("ship_date", from)
    .lte("ship_date", to)
    .order("ship_date", { ascending: true })
    .limit(100000);

  if (oErr) {
    return NextResponse.json(
      { error: "orders 조회 실패", detail: oErr.message },
      { status: 500 }
    );
  }

  const orderIds = (orders ?? []).map((o: any) => o.id);

  let orderLines: any[] = [];
  if (orderIds.length) {
    const { data: lines, error: lErr } = await supabase
      .from("order_lines")
      .select("order_id,item_name,product_name,variant_name,qty,unit_price,supply_amount,vat_amount,total_amount")
      .in("order_id", orderIds)
      .limit(200000);

    if (!lErr && lines) {
      orderLines = lines;
    }
  }

  // 사업자번호 매핑
  const customerIds = Array.from(
    new Set((orders ?? []).map((x: any) => x.customer_id).filter(Boolean))
  );

  const partnersById = new Map<string, { business_no: string | null }>();

  if (customerIds.length) {
    const { data: pData } = await supabase
      .from("partners")
      .select("id,business_no")
      .in("id", customerIds);

    if (pData) {
      for (const p of pData as any[]) {
        partnersById.set(String(p.id), {
          business_no: p.business_no ?? null,
        });
      }
    }
  }

  // =============================
  // 2) 매입(ledger_entries OUT)
  // =============================
  let ledgerQuery = supabase
    .from("ledger_entries")
    .select(
      "entry_date,category,counterparty_name,business_no,memo,supply_amount,vat_amount,total_amount,amount,vat_type"
    )
    .eq("direction", "OUT")
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date", { ascending: true })
    .limit(200000);

  if (outCats.length > 0) {
    ledgerQuery = ledgerQuery.in("category", outCats);
  }

  const { data: ledgers } = await ledgerQuery;

  // =============================
  // 엑셀 rows 생성
  // =============================
  const rows: any[] = [];

  // 🔹 매출 (라인 단위)
  for (const o of orders ?? []) {
    const lines = orderLines.filter((x) => x.order_id === o.id);

    const ordererName = extractOrdererName(o.memo);
    const bizNo = normalizeBizNo(
      partnersById.get(String(o.customer_id ?? ""))?.business_no
    );

    for (const line of lines) {
      const supply = safeNum(line.supply_amount ?? line.qty * line.unit_price);
      const vat = safeNum(line.vat_amount);
      const total = safeNum(line.total_amount ?? supply + vat);

      const itemName =
        line.item_name ||
        line.product_name ||
        line.variant_name ||
        "";

      rows.push({
        날짜: toYmd(o.ship_date),
        구분: "매출",
        사업자등록번호: bizNo,
        거래처: String(o.customer_name ?? ""),
        주문자: ordererName,
        품목명: itemName,
        비고: "",
        공급가: supply,
        VAT: vat,
        총액: total,
      });
    }
  }

  // 🔹 매입
  for (const l of ledgers ?? []) {
    const total = safeNum(l.total_amount ?? l.amount);
    const supply = safeNum(l.supply_amount);
    const vat =
      String(l.vat_type ?? "TAXED").toUpperCase() === "TAXED"
        ? safeNum(l.vat_amount)
        : 0;

    rows.push({
      날짜: toYmd(l.entry_date),
      구분: `매입(${String(l.category ?? "OUT")})`,
      사업자등록번호: normalizeBizNo(l.business_no),
      거래처: String(l.counterparty_name ?? ""),
      주문자: "",
      품목명: "",
      비고: String(l.memo ?? ""),
      공급가: supply,
      VAT: vat,
      총액: total,
    });
  }

  // 날짜 정렬
  rows.sort((a, b) => {
    if (a.날짜 === b.날짜)
      return String(a.구분).localeCompare(String(b.구분));
    return String(a.날짜).localeCompare(String(b.날짜));
  });

  const header = [
    "날짜",
    "구분",
    "사업자등록번호",
    "거래처",
    "주문자",
    "품목명",
    "비고",
    "공급가",
    "VAT",
    "총액",
  ];

  const ws = XLSX.utils.json_to_sheet(rows, { header });

  (ws as any)["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 24 },
    { wch: 14 },
    { wch: 24 },
    { wch: 28 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
  ];

  const ref = ws["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      for (const c of [7, 8, 9]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = (ws as any)[addr];
        if (cell?.t === "n") cell.z = "#,##0";
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "세무사_통합");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = `세무사_통합_${from}_${to}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        filename
      )}`,
      "Cache-Control": "no-store",
    },
  });
}