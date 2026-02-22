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
  if (memo == null) return "";
  const s = String(memo).trim();
  if (!s) return "";
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const j = JSON.parse(s);
      const v = j?.orderer_name;
      return v == null ? "" : String(v).trim();
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
    ? outCatsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (!from || !to) {
    return NextResponse.json({ error: "from/to 파라미터가 필요합니다." }, { status: 400 });
  }

  const supabase = await createClient();

  // =============================
  // 1) 매출(orders)
  // =============================
  // ✅ 주문자 추출을 위해 memo 포함 시도(없으면 fallback)
  let orders: any[] = [];
  {
    const { data, error } = await supabase
      .from("orders")
      .select("id,customer_id,customer_name,ship_date,ship_method,supply_amount,vat_amount,total_amount,memo")
      .gte("ship_date", from)
      .lte("ship_date", to)
      .order("ship_date", { ascending: true })
      .limit(100000);

    if (!error) {
      orders = (data ?? []) as any[];
    } else {
      const { data: data2, error: error2 } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name,ship_date,ship_method,supply_amount,vat_amount,total_amount")
        .gte("ship_date", from)
        .lte("ship_date", to)
        .order("ship_date", { ascending: true })
        .limit(100000);

      if (error2) {
        return NextResponse.json(
          { error: "orders 조회 실패", detail: error2.message },
          { status: 500 }
        );
      }
      orders = (data2 ?? []) as any[];
    }
  }

  // ✅ orders.id 목록으로 order_lines 조회 (품목명은 order_lines.name 사용)
  const orderIds = Array.from(new Set((orders ?? []).map((o: any) => o.id).filter(Boolean) as string[]));

  let orderLines: any[] = [];
  if (orderIds.length) {
    const { data: lines, error: linesErr } = await supabase
      .from("order_lines")
      .select("order_id,name,qty,unit,supply_amount,vat_amount,total_amount")
      .in("order_id", orderIds)
      .limit(200000);

    if (!linesErr && lines) {
      orderLines = lines as any[];
    }
  }

  // ✅ 매출처 사업자번호 매핑 (orders.customer_id -> partners.business_no)
  const customerIds = Array.from(
    new Set((orders ?? []).map((x: any) => x.customer_id).filter(Boolean) as string[])
  );

  const partnersById = new Map<string, { business_no: string | null }>();
  if (customerIds.length) {
    const { data: pData, error: pErr } = await supabase
      .from("partners")
      .select("id,business_no")
      .in("id", customerIds)
      .limit(10000);

    if (!pErr && pData) {
      for (const p of pData as any[]) {
        partnersById.set(String(p.id), { business_no: p.business_no ?? null });
      }
    }
  }

  // =============================
  // 2) 매입(ledger_entries OUT) + 선택 카테고리 필터
  // =============================
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

  const { data: ledgers, error: lErr } = await ledgerQuery;

  if (lErr) {
    return NextResponse.json(
      { error: "ledger_entries(OUT) 조회 실패", detail: lErr.message },
      { status: 500 }
    );
  }

  /**
   * ✅ 통합 1시트
   * 요청 헤더 순서:
   * 날짜 / 구분 / 사업자등록번호 / 거래처 / 주문자 / 품목명 / 비고 / 공급가 / VAT / 총액
   */
  const rows: any[] = [];

  // =============================
  // 매출 행: order_lines 라인 단위로 출력
  // =============================
  const linesByOrder = new Map<string, any[]>();
  for (const ln of orderLines) {
    const oid = String(ln.order_id ?? "");
    if (!oid) continue;
    if (!linesByOrder.has(oid)) linesByOrder.set(oid, []);
    linesByOrder.get(oid)!.push(ln);
  }

  for (const o of orders) {
    const supplyOrder = safeNum(o.supply_amount);
    const vatOrder = safeNum(o.vat_amount);
    const totalOrder = safeNum(o.total_amount);

    const cid = String(o.customer_id ?? "");
    const partnerBizNo = cid ? partnersById.get(cid)?.business_no ?? "" : "";

    const ordererName = extractOrdererName(o.memo);

    const lns = linesByOrder.get(String(o.id)) ?? [];

    // 라인이 없으면(예외) 주문 합계 1행으로라도 남김 (품목명 공란)
    if (lns.length === 0) {
      rows.push({
        날짜: toYmd(o.ship_date),
        구분: "매출",
        사업자등록번호: normalizeBizNo(partnerBizNo),
        거래처: String(o.customer_name ?? ""),
        주문자: ordererName,
        품목명: "",
        비고: "",
        공급가: supplyOrder,
        VAT: vatOrder,
        총액: totalOrder,
      });
      continue;
    }

    for (const ln of lns) {
      const supply = safeNum(ln.supply_amount);
      const vat = safeNum(ln.vat_amount);
      const total = safeNum(ln.total_amount ?? supply + vat);

      rows.push({
        날짜: toYmd(o.ship_date),
        구분: "매출",
        사업자등록번호: normalizeBizNo(partnerBizNo),
        거래처: String(o.customer_name ?? ""),
        주문자: ordererName,
        품목명: String(ln.name ?? ""),
        비고: "",
        공급가: supply,
        VAT: vat,
        총액: total,
      });
    }
  }

  // =============================
  // 매입(OUT) 행: 기존 방식 유지 (품목명 공란)
  // =============================
  for (const l of (ledgers ?? []) as any[]) {
    const total = safeNum(l.total_amount ?? l.amount ?? 0);
    const supply = safeNum(l.supply_amount ?? 0);
    const vat = safeNum(l.vat_amount ?? 0);
    const vt = String(l.vat_type ?? "TAXED").toUpperCase();

    // VAT는 TAXED만 인정
    const vatForReport = vt === "TAXED" ? vat : 0;

    rows.push({
      날짜: toYmd(l.entry_date),
      구분: `매입(${String(l.category ?? "OUT")})`,
      사업자등록번호: normalizeBizNo(l.business_no),
      거래처: String(l.counterparty_name ?? ""),
      주문자: "",
      품목명: "",
      비고: String(l.memo ?? ""),
      공급가: supply,
      VAT: vatForReport,
      총액: total,
    });
  }

  // 날짜순 정렬(같은 날짜면 구분 문자열 기준)
  rows.sort((a, b) => {
    if (a.날짜 === b.날짜) return String(a.구분).localeCompare(String(b.구분));
    return String(a.날짜).localeCompare(String(b.날짜));
  });

  const header = ["날짜", "구분", "사업자등록번호", "거래처", "주문자", "품목명", "비고", "공급가", "VAT", "총액"];

  const ws = XLSX.utils.json_to_sheet(rows, { header });

  // 열 너비
  (ws as any)["!cols"] = [
    { wch: 12 }, // 날짜
    { wch: 16 }, // 구분
    { wch: 16 }, // 사업자등록번호
    { wch: 26 }, // 거래처
    { wch: 14 }, // 주문자
    { wch: 28 }, // 품목명
    { wch: 30 }, // 비고
    { wch: 12 }, // 공급가
    { wch: 10 }, // VAT
    { wch: 12 }, // 총액
  ];

  // ✅ 숫자 표시 형식(천단위) 적용: 공급가(H=7), VAT(I=8), 총액(J=9)
  const ref = ws["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      for (const c of [7, 8, 9]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = (ws as any)[addr];
        if (!cell) continue;

        // 문자열이면 숫자로 교정
        if (cell.t === "s") {
          const n = Number(String(cell.v ?? "").replaceAll(",", ""));
          if (Number.isFinite(n)) {
            cell.t = "n";
            cell.v = n;
          }
        }

        if (cell.t === "n") {
          cell.z = "#,##0";
        }
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
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}