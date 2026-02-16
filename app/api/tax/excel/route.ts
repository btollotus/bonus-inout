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
    return NextResponse.json(
      { error: "from/to 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // 1) 매출(orders)
  // - 현재 TaxClient와 동일 컬럼 사용
  const { data: oData, error: oErr } = await supabase
    .from("orders")
    .select(
      "id,customer_id,customer_name,ship_date,ship_method,supply_amount,vat_amount,total_amount"
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

  // ✅ 매출처 사업자번호 매핑 (orders.customer_id -> partners.business_no)
  const customerIds = Array.from(
    new Set(
      (oData ?? [])
        .map((x: any) => x.customer_id)
        .filter(Boolean) as string[]
    )
  );

  let partnersById = new Map<string, { business_no: string | null }>();
  if (customerIds.length) {
    const { data: pData, error: pErr } = await supabase
      .from("partners")
      .select("id,business_no")
      .in("id", customerIds)
      .limit(10000);

    if (!pErr && pData) {
      for (const p of pData as any[]) {
        partnersById.set(String(p.id), {
          business_no: p.business_no ?? null,
        });
      }
    }
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

  /**
   * ✅ 통합 1시트
   * 컬럼:
   * 날짜 / 거래처 / 사업자등록번호 / 구분 / 공급가 / VAT / 총액 / 비고
   * (참조ID 제거)
   */
  const rows: any[] = [];

  // 매출 행
  for (const o of (oData ?? []) as any[]) {
    const supply = safeNum(o.supply_amount);
    const vat = safeNum(o.vat_amount);
    const total = safeNum(o.total_amount);

    const cid = String(o.customer_id ?? "");
    const partnerBizNo = cid ? partnersById.get(cid)?.business_no ?? "" : "";

    rows.push({
      날짜: toYmd(o.ship_date),
      거래처: String(o.customer_name ?? ""),
      사업자등록번호: normalizeBizNo(partnerBizNo),
      구분: "매출",
      공급가: supply,
      VAT: vat,
      총액: total,
      비고: "",
    });
  }

  // 매입(OUT) 행
  for (const l of (lData ?? []) as any[]) {
    const total = safeNum(l.total_amount ?? l.amount);
    const supply = safeNum(l.supply_amount ?? 0);
    const vat = safeNum(l.vat_amount ?? 0);
    const vt = String(l.vat_type ?? "TAXED").toUpperCase();

    // TaxClient와 동일: VAT는 TAXED만 인정
    const vatForReport = vt === "TAXED" ? vat : 0;

    rows.push({
      날짜: toYmd(l.entry_date),
      거래처: String(l.counterparty_name ?? ""),
      사업자등록번호: normalizeBizNo(l.business_no),
      구분: `매입(${String(l.category ?? "OUT")})`,
      공급가: supply,
      VAT: vatForReport,
      총액: total,
      비고: String(l.memo ?? ""),
    });
  }

  // 날짜순 정렬(같은 날짜면 구분 문자열 기준)
  rows.sort((a, b) => {
    if (a.날짜 === b.날짜) return String(a.구분).localeCompare(String(b.구분));
    return String(a.날짜).localeCompare(String(b.날짜));
  });

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["날짜", "거래처", "사업자등록번호", "구분", "공급가", "VAT", "총액", "비고"],
  });

  // 열 너비
  (ws as any)["!cols"] = [
    { wch: 12 }, // 날짜
    { wch: 26 }, // 거래처
    { wch: 16 }, // 사업자등록번호
    { wch: 16 }, // 구분
    { wch: 12 }, // 공급가
    { wch: 10 }, // VAT
    { wch: 12 }, // 총액
    { wch: 30 }, // 비고
  ];

  // ✅ 숫자 표시 형식(천단위) 적용: 공급가(E), VAT(F), 총액(G)
  const ref = ws["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      for (const c of [4, 5, 6]) { // E=4, F=5, G=6 (0-based)
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = (ws as any)[addr];
        if (!cell) continue;

        // 안전장치: 문자열이면 숫자로 교정
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
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        filename
      )}`,
      "Cache-Control": "no-store",
    },
  });
}