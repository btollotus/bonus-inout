// app/api/tax/excel/route.ts
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

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function buildAddress(a1: any, a2: any) {
  const s1 = safeStr(a1);
  const s2 = safeStr(a2);
  return [s1, s2].filter(Boolean).join(" ");
}

function extractOrdererName(memo: any): string {
  if (memo == null) return "";
  const s = String(memo).trim();
  if (!s) return "";
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const j = JSON.parse(s);
      // ✅ orders.memo JSON 에는 orderer_name 키가 존재(캡쳐 확인)
      const v = j?.orderer_name;
      return v == null ? "" : String(v).trim();
    } catch {
      return "";
    }
  }
  return "";
}

// ✅ 품목명에서 "100개", "(100개)" 같은 패턴을 찾아 1BOX(포장)당 EA 수량 추정
function extractPackEaFromName(name: any): number | null {
  const s = String(name ?? "").trim();
  if (!s) return null;

  // (100개), ( 100 개 )
  const m1 = s.match(/\(\s*(\d+)\s*개\s*\)/);
  if (m1 && m1[1]) {
    const n = Number(m1[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // 100개 (괄호 없이)
  const m2 = s.match(/(\d+)\s*개/);
  if (m2 && m2[1]) {
    const n = Number(m2[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

type ShipRow = {
  id: string;
  order_id: string;
  seq: number;
  ship_to_name: string | null;
  ship_to_address1: string | null;
  ship_to_address2: string | null;
  ship_to_mobile: string | null;
  ship_to_phone: string | null;
  ship_zipcode: string | null;
  delivery_message: string | null;
};

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
        return NextResponse.json({ error: "orders 조회 실패", detail: error2.message }, { status: 500 });
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
      .select("order_id,name,food_type,weight_g,qty,unit,supply_amount,vat_amount,total_amount")
      .in("order_id", orderIds)
      .limit(200000);

    if (!linesErr && lines) {
      orderLines = lines as any[];
    }
  }

  // =============================
  // ✅ 배송정보: order_shipments (seq=1/2)
  // =============================
  const shipByOrder = new Map<
    string,
    {
      s1: ShipRow | null;
      s2: ShipRow | null;
    }
  >();

  if (orderIds.length) {
    const { data: shipData, error: shipErr } = await supabase
      .from("order_shipments")
      .select(
        "id,order_id,seq,ship_to_name,ship_to_address1,ship_to_address2,ship_to_mobile,ship_to_phone,ship_zipcode,delivery_message"
      )
      .in("order_id", orderIds)
      .order("order_id", { ascending: true })
      .order("seq", { ascending: true })
      .limit(200000);

    if (!shipErr && shipData) {
      for (const r of shipData as any[]) {
        const oid = String(r.order_id ?? "");
        if (!oid) continue;

        const seq = safeNum(r.seq);
        const cur = shipByOrder.get(oid) ?? { s1: null, s2: null };

        if (seq === 1 && !cur.s1) cur.s1 = r as ShipRow;
        else if (seq === 2 && !cur.s2) cur.s2 = r as ShipRow;

        shipByOrder.set(oid, cur);
      }
    }
  }

  // ✅ 매출처 사업자번호 매핑 (orders.customer_id -> partners.business_no)
  const customerIds = Array.from(new Set((orders ?? []).map((x: any) => x.customer_id).filter(Boolean) as string[]));

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
    return NextResponse.json({ error: "ledger_entries(OUT) 조회 실패", detail: lErr.message }, { status: 500 });
  }

  /**
   * ✅ 통합 1시트
   * 요청 헤더 순서:
   * 날짜 / 구분 / 사업자등록번호 / 거래처 / 주문자 / 품목명 / 식품유형 / 무게 / 비고 / 공급가 / VAT / 총액 /
   * 수화주명 / 주소1 / 휴대폰 / 전화 / 요청사항 /
   * 수화주명2 / 주소2 / 휴대폰2 / 전화2 / 요청사항2
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

    const oid = String(o.id ?? "");
    const ship = oid ? shipByOrder.get(oid) : undefined;

    const s1 = ship?.s1 ?? null;
    const s2 = ship?.s2 ?? null;

    const ship_to_name = s1 ? safeStr(s1.ship_to_name) : "";
    const address1 = s1 ? buildAddress(s1.ship_to_address1, s1.ship_to_address2) : "";
    const mobile = s1 ? safeStr(s1.ship_to_mobile) : "";
    const phone = s1 ? safeStr(s1.ship_to_phone) : "";
    const reqMsg = s1 ? safeStr(s1.delivery_message) : "";

    const ship_to_name2 = s2 ? safeStr(s2.ship_to_name) : "";
    const address2 = s2 ? buildAddress(s2.ship_to_address1, s2.ship_to_address2) : "";
    const mobile2 = s2 ? safeStr(s2.ship_to_mobile) : "";
    const phone2 = s2 ? safeStr(s2.ship_to_phone) : "";
    const reqMsg2 = s2 ? safeStr(s2.delivery_message) : "";

    const lns = linesByOrder.get(oid) ?? [];

    // 라인이 없으면(예외) 주문 합계 1행으로라도 남김 (품목명 공란)
    if (lns.length === 0) {
      rows.push({
        날짜: toYmd(o.ship_date),
        구분: "매출",
        사업자등록번호: normalizeBizNo(partnerBizNo),
        거래처: String(o.customer_name ?? ""),

        주문자: ordererName,
        품목명: "",
        식품유형: "",
        무게: "",
        비고: "",
        공급가: supplyOrder,
        VAT: vatOrder,
        총액: totalOrder,

        수화주명: ship_to_name,
        주소1: address1,
        휴대폰: mobile,
        전화: phone,
        요청사항: reqMsg,

        수화주명2: ship_to_name2,
        주소2: address2,
        휴대폰2: mobile2,
        전화2: phone2,
        요청사항2: reqMsg2,
      });
      continue;
    }

    for (const ln of lns) {
      const supply = safeNum(ln.supply_amount);
      const vat = safeNum(ln.vat_amount);
      const total = safeNum(ln.total_amount ?? supply + vat);

      // ✅ 무게(품목무게 * 총수량) 계산
      // - EA: qty 그대로
      // - BOX: (qty * 1BOX당 EA수량) * 개별무게
      // - 단, 품목명에 "100개/200개"가 있으면: 수량 입력이 "박스 수량"인 케이스가 많으므로
      //   unit이 EA라도 packEa를 우선 적용하여 총수량=qty*packEa로 계산
      const unit = String(ln.unit ?? "").toUpperCase();
      const qty = safeNum(ln.qty);

      const unitWeight = safeNum(ln.weight_g);

      const packEa = extractPackEaFromName(ln.name);
      let totalQty = qty;

      if (packEa != null) {
        // ✅ "품목명에 100개/200개"가 있으면 박스당 포장수량으로 보고 적용
        totalQty = qty * packEa;
      } else if (unit === "BOX") {
        // (보조) unit이 BOX인데 품목명에서 packEa를 못 찾으면 qty 그대로(추정 불가)
        totalQty = qty;
      }

      const weightTotal = unitWeight > 0 && totalQty > 0 ? unitWeight * totalQty : "";

      rows.push({
        날짜: toYmd(o.ship_date),
        구분: "매출",
        사업자등록번호: normalizeBizNo(partnerBizNo),
        거래처: String(o.customer_name ?? ""),

        주문자: ordererName,
        품목명: String(ln.name ?? ""),
        식품유형: String(ln.food_type ?? ""),
        무게: weightTotal,
        비고: "",
        공급가: supply,
        VAT: vat,
        총액: total,

        수화주명: ship_to_name,
        주소1: address1,
        휴대폰: mobile,
        전화: phone,
        요청사항: reqMsg,

        수화주명2: ship_to_name2,
        주소2: address2,
        휴대폰2: mobile2,
        전화2: phone2,
        요청사항2: reqMsg2,
      });
    }
  }

  // =============================
  // 매입(OUT) 행: 기존 방식 유지 (품목명 공란 + 배송정보 공란)
  // ✅ 총액만 있는 과거데이터도 공급가/VAT 역산해서 엑셀에 표시
  // =============================
  for (const l of (ledgers ?? []) as any[]) {
    const total = safeNum(l.total_amount ?? l.amount ?? 0);
    const vt = String(l.vat_type ?? "TAXED").toUpperCase();
    const cat = String(l.category ?? "OUT");

    // ✅ DB에 정확 컬럼이 있으면 그대로 사용, 없으면(총액만) 역산
    const hasExact = l.supply_amount != null || l.vat_amount != null || l.total_amount != null;

    let supply = hasExact ? safeNum(l.supply_amount ?? 0) : 0;
    let vat = hasExact ? safeNum(l.vat_amount ?? 0) : 0;

    if (!hasExact) {
      if (vt === "TAXED") {
        const s = Math.round(total / 1.1);
        supply = s;
        vat = total - s;
      } else {
        supply = total;
        vat = 0;
      }
    }

    // VAT는 TAXED만 인정
    let vatForReport = vt === "TAXED" ? vat : 0;

    // ✅ 급여/세금/기타는 지출항목이므로 공급가/VAT/총액을 마이너스로 표시
    // (이미 음수여도 항상 음수 유지)
    const isExpenseNeg = cat === "급여" || cat === "세금" || cat === "기타";
    const supplyOut = isExpenseNeg ? -Math.abs(supply) : supply;
    const vatOut = isExpenseNeg ? -Math.abs(vatForReport) : vatForReport;
    const totalOut = isExpenseNeg ? -Math.abs(total) : total;

    rows.push({
      날짜: toYmd(l.entry_date),
      구분: `매입(${cat})`,
      사업자등록번호: normalizeBizNo(l.business_no),
      거래처: String(l.counterparty_name ?? ""),

      주문자: "",
      품목명: "",
      식품유형: "",
      무게: "",
      비고: String(l.memo ?? ""),
      공급가: supplyOut,
      VAT: vatOut,
      총액: totalOut,

      수화주명: "",
      주소1: "",
      휴대폰: "",
      전화: "",
      요청사항: "",

      수화주명2: "",
      주소2: "",
      휴대폰2: "",
      전화2: "",
      요청사항2: "",
    });
  }

  // 날짜순 정렬(같은 날짜면 구분 문자열 기준)
  rows.sort((a, b) => {
    if (a.날짜 === b.날짜) return String(a.구분).localeCompare(String(b.구분));
    return String(a.날짜).localeCompare(String(b.날짜));
  });

  const header = [
    "날짜",
    "구분",
    "사업자등록번호",
    "거래처",
    "주문자",
    "품목명",
    "식품유형",
    "무게",
    "비고",
    "공급가",
    "VAT",
    "총액",
    "수화주명",
    "주소1",
    "휴대폰",
    "전화",
    "요청사항",
    "수화주명2",
    "주소2",
    "휴대폰2",
    "전화2",
    "요청사항2",
  ];

  const ws = XLSX.utils.json_to_sheet(rows, { header });

  // 열 너비
  (ws as any)["!cols"] = [
    { wch: 12 }, // 날짜
    { wch: 16 }, // 구분
    { wch: 16 }, // 사업자등록번호
    { wch: 26 }, // 거래처

    { wch: 14 }, // 주문자
    { wch: 28 }, // 품목명
    { wch: 14 }, // 식품유형
    { wch: 10 }, // 무게
    { wch: 30 }, // 비고
    { wch: 12 }, // 공급가
    { wch: 10 }, // VAT
    { wch: 12 }, // 총액

    { wch: 14 }, // 수화주명
    { wch: 40 }, // 주소1
    { wch: 16 }, // 휴대폰
    { wch: 16 }, // 전화
    { wch: 22 }, // 요청사항

    { wch: 14 }, // 수화주명2
    { wch: 40 }, // 주소2
    { wch: 16 }, // 휴대폰2
    { wch: 16 }, // 전화2
    { wch: 22 }, // 요청사항2
  ];

  // ✅ 숫자 표시 형식(천단위) 적용: 무게, 공급가, VAT, 총액
  // ✅ 전체 폰트: 굴림 / 10
  // ✅ 급여/세금/기타(매입) 행은 공급가/VAT/총액 폰트 컬러 빨강
  const ref = ws["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);

    const idxType = header.indexOf("구분");
    const idxWeight = header.indexOf("무게");
    const idxSupply = header.indexOf("공급가");
    const idxVat = header.indexOf("VAT");
    const idxTotal = header.indexOf("총액");

    // 폰트 적용 (헤더 포함 전체)
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = (ws as any)[addr];
        if (!cell) continue;

        cell.s = {
          ...(cell.s ?? {}),
          font: { ...(cell.s?.font ?? {}), name: "굴림", sz: 10 },
        };
      }
    }

    // 숫자 형식 + (급여/세금/기타) 빨강 폰트 (데이터 행만)
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      // 해당 행 구분 확인 (예: 매입(급여))
      let isRedExpenseRow = false;
      if (idxType >= 0) {
        const typeAddr = XLSX.utils.encode_cell({ r, c: idxType });
        const typeCell = (ws as any)[typeAddr];
        const typeVal = typeCell ? String(typeCell.v ?? "") : "";
        isRedExpenseRow =
          typeVal === "매입(급여)" || typeVal === "매입(세금)" || typeVal === "매입(기타)";
      }

      for (const c of [idxWeight, idxSupply, idxVat, idxTotal]) {
        if (c < 0) continue;

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

        // ✅ 급여/세금/기타(매입) 행: 공급가/VAT/총액 폰트 컬러 빨강
        if (isRedExpenseRow && (c === idxSupply || c === idxVat || c === idxTotal)) {
          cell.s = {
            ...(cell.s ?? {}),
            font: {
              ...(cell.s?.font ?? {}),
              name: "굴림",
              sz: 10,
              color: { rgb: "FFFF0000" },
            },
          };
        }
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "세무사_통합");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });

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