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

function parseMemoJson(memo: any): any | null {
  if (memo == null) return null;
  const s = String(memo).trim();
  if (!s) return null;
  if (!(s.startsWith("{") && s.endsWith("}"))) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractOrdererName(memo: any): string {
  const j = parseMemoJson(memo);
  if (!j) return "";
  const v = j?.orderer_name;
  return v == null ? "" : String(v).trim();
}

// ✅ memo(JSON)에서 배송정보를 최대한 폭넓게 추출
function extractShipSnapshot(memo: any): {
  ship_to_name: string;
  ship_to_address1: string;
  ship_to_mobile: string;
  ship_to_phone: string;
  ship_to_note: string; // 요청사항
  ship_to2_address1: string;
} {
  const empty = {
    ship_to_name: "",
    ship_to_address1: "",
    ship_to_mobile: "",
    ship_to_phone: "",
    ship_to_note: "",
    ship_to2_address1: "",
  };

  const j = parseMemoJson(memo);
  if (!j) return empty;

  const pick = (obj: any, keys: string[]) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };

  // 1) 최상위 키 후보
  const direct = {
    ship_to_name: pick(j, ["ship_to_name", "receiver_name", "consignee_name", "to_name", "ship1_name", "ship_name"]),
    ship_to_address1: pick(j, [
      "ship_to_address1",
      "ship_to_addr1",
      "receiver_address1",
      "receiver_addr1",
      "consignee_address1",
      "to_address1",
      "to_addr1",
      "ship1_address1",
      "ship1_addr1",
      "address1",
      "addr1",
    ]),
    ship_to_mobile: pick(j, ["ship_to_mobile", "receiver_mobile", "consignee_mobile", "to_mobile", "ship1_mobile", "mobile"]),
    ship_to_phone: pick(j, ["ship_to_phone", "receiver_phone", "consignee_phone", "to_phone", "ship1_phone", "phone"]),
    ship_to_note: pick(j, ["ship_to_note", "ship_to_request", "request", "requests", "receiver_note", "note", "ship1_note"]),
    ship_to2_address1: pick(j, ["ship_to2_address1", "ship_to2_addr1", "ship2_address1", "ship2_addr1", "address2", "addr2"]),
  };

  // 2) 중첩 구조 후보 (예: shipping, ship_to, ship1, 배송지1/2 등)
  const nestedCandidates = [
    j?.shipping,
    j?.ship_to,
    j?.shipTo,
    j?.ship1,
    j?.shipping1,
    j?.delivery,
    j?.delivery1,
    j?.receiver,
    j?.consignee,
    j?.snapshot,
    j?.ship_snapshot,
    j?.shipping_snapshot,
  ].filter(Boolean);

  let n1 = {
    ship_to_name: "",
    ship_to_address1: "",
    ship_to_mobile: "",
    ship_to_phone: "",
    ship_to_note: "",
  };

  for (const obj of nestedCandidates) {
    n1 = {
      ship_to_name: n1.ship_to_name || pick(obj, ["name", "ship_to_name", "receiver_name", "consignee_name", "to_name"]),
      ship_to_address1:
        n1.ship_to_address1 ||
        pick(obj, ["address1", "addr1", "ship_to_address1", "ship_to_addr1", "receiver_address1", "receiver_addr1", "to_address1", "to_addr1"]),
      ship_to_mobile: n1.ship_to_mobile || pick(obj, ["mobile", "ship_to_mobile", "receiver_mobile", "to_mobile"]),
      ship_to_phone: n1.ship_to_phone || pick(obj, ["phone", "ship_to_phone", "receiver_phone", "to_phone"]),
      ship_to_note: n1.ship_to_note || pick(obj, ["note", "request", "requests", "ship_to_note", "ship_to_request"]),
    };
  }

  // 배송지2 중첩 후보
  const nested2Candidates = [j?.ship2, j?.shipping2, j?.delivery2, j?.shipping?.ship2, j?.ship_to?.ship2].filter(Boolean);

  let n2 = { ship_to2_address1: "" };
  for (const obj of nested2Candidates) {
    n2 = {
      ship_to2_address1:
        n2.ship_to2_address1 ||
        pick(obj, ["address1", "addr1", "ship_to_address1", "ship_to_addr1", "to_address1", "to_addr1", "ship2_address1", "ship2_addr1", "address2", "addr2"]),
    };
  }

  return {
    ship_to_name: direct.ship_to_name || n1.ship_to_name || "",
    ship_to_address1: direct.ship_to_address1 || n1.ship_to_address1 || "",
    ship_to_mobile: direct.ship_to_mobile || n1.ship_to_mobile || "",
    ship_to_phone: direct.ship_to_phone || n1.ship_to_phone || "",
    ship_to_note: direct.ship_to_note || n1.ship_to_note || "",
    ship_to2_address1: direct.ship_to2_address1 || n2.ship_to2_address1 || "",
  };
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
  // ✅ orders 테이블에는 배송 컬럼이 없음(현재 확인됨) → memo로만 처리
  let orders: any[] = [];
  {
    const { data, error } = await supabase
      .from("orders")
      .select("id,customer_id,customer_name,ship_date,ship_method,supply_amount,vat_amount,total_amount,memo")
      .gte("ship_date", from)
      .lte("ship_date", to)
      .order("ship_date", { ascending: true })
      .limit(100000);

    if (error) {
      return NextResponse.json({ error: "orders 조회 실패", detail: error.message }, { status: 500 });
    }
    orders = (data ?? []) as any[];
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
   * 요청 헤더 순서(배송정보 포함):
   * 날짜 / 구분 / 사업자등록번호 / 거래처 / 주문자 / 수화주명 / 주소1 / 휴대폰 / 전화 / 요청사항 / 배송지2 / 품목명 / 식품유형 / 무게 / 비고 / 공급가 / VAT / 총액
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
    const ship = extractShipSnapshot(o.memo);

    const lns = linesByOrder.get(String(o.id)) ?? [];

    // 라인이 없으면(예외) 주문 합계 1행으로라도 남김 (품목명 공란)
    if (lns.length === 0) {
      rows.push({
        날짜: toYmd(o.ship_date),
        구분: "매출",
        사업자등록번호: normalizeBizNo(partnerBizNo),
        거래처: String(o.customer_name ?? ""),
        주문자: ordererName,
        수화주명: ship.ship_to_name,
        주소1: ship.ship_to_address1,
        휴대폰: ship.ship_to_mobile,
        전화: ship.ship_to_phone,
        요청사항: ship.ship_to_note,
        배송지2: ship.ship_to2_address1,
        품목명: "",
        식품유형: "",
        무게: "",
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

      // ✅ 무게(품목무게 * 총수량) 계산
      const unit = String(ln.unit ?? "").toUpperCase();
      const qty = safeNum(ln.qty);
      const unitWeight = safeNum(ln.weight_g);

      const packEa = extractPackEaFromName(ln.name);
      let totalQty = qty;

      if (packEa != null) {
        totalQty = qty * packEa;
      } else if (unit === "BOX") {
        totalQty = qty;
      }

      const weightTotal = unitWeight > 0 && totalQty > 0 ? unitWeight * totalQty : "";

      rows.push({
        날짜: toYmd(o.ship_date),
        구분: "매출",
        사업자등록번호: normalizeBizNo(partnerBizNo),
        거래처: String(o.customer_name ?? ""),
        주문자: ordererName,
        수화주명: ship.ship_to_name,
        주소1: ship.ship_to_address1,
        휴대폰: ship.ship_to_mobile,
        전화: ship.ship_to_phone,
        요청사항: ship.ship_to_note,
        배송지2: ship.ship_to2_address1,
        품목명: String(ln.name ?? ""),
        식품유형: String(ln.food_type ?? ""),
        무게: weightTotal,
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
      수화주명: "",
      주소1: "",
      휴대폰: "",
      전화: "",
      요청사항: "",
      배송지2: "",
      품목명: "",
      식품유형: "",
      무게: "",
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

  const header = [
    "날짜",
    "구분",
    "사업자등록번호",
    "거래처",
    "주문자",
    "수화주명",
    "주소1",
    "휴대폰",
    "전화",
    "요청사항",
    "배송지2",
    "품목명",
    "식품유형",
    "무게",
    "비고",
    "공급가",
    "VAT",
    "총액",
  ];

  const ws = XLSX.utils.json_to_sheet(rows, { header });

  // 열 너비
  (ws as any)["!cols"] = [
    { wch: 12 }, // 날짜
    { wch: 16 }, // 구분
    { wch: 16 }, // 사업자등록번호
    { wch: 26 }, // 거래처
    { wch: 14 }, // 주문자
    { wch: 14 }, // 수화주명
    { wch: 36 }, // 주소1
    { wch: 16 }, // 휴대폰
    { wch: 14 }, // 전화
    { wch: 22 }, // 요청사항
    { wch: 30 }, // 배송지2
    { wch: 28 }, // 품목명
    { wch: 14 }, // 식품유형
    { wch: 10 }, // 무게
    { wch: 30 }, // 비고
    { wch: 12 }, // 공급가
    { wch: 10 }, // VAT
    { wch: 12 }, // 총액
  ];

  // ✅ 숫자 표시 형식(천단위) 적용: 무게(N=13), 공급가(P=15), VAT(Q=16), 총액(R=17)
  // ✅ 전체 폰트: 굴림 / 10
  const ref = ws["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);

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

    // 숫자 형식 적용 (데이터 행만)
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      for (const c of [13, 15, 16, 17]) {
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