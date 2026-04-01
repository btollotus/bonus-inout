// app/api/shipments/excel/route.ts
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ShipRow = {
  id: string;
  order_id: string;
  seq: number;
  ship_to_name: string | null;
  ship_to_address1: string | null;
  ship_to_address2: string | null;
  ship_to_mobile: string | null;
  ship_to_phone: string | null;
  delivery_message: string | null;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  ship_date: string | null;
  customer_name: string | null;
  ship_method: string | null;
};

type WorkOrderRow = {
  linked_order_id: string | null;
  client_name: string | null;
  sub_name: string | null;
};

type OrderLineRow = {
  order_id: string;
  name: string | null;
  qty: number | null;
  unit_type: string | null;
  total_amount: number | null; // ✅ 추가: 택배비 금액 읽기용
};

// ✅ 이 3개 거래처는 제품명을 "품목명-수량" 형식으로 표시
const ITEM_NAME_CUSTOMERS = new Set(["카카오플러스-판매", "네이버-판매", "쿠팡-판매"]);

const FIX_QTY = 1;
const DEFAULT_FEE = 3300; // ✅ 기본값 (택배비 품목이 없을 때 fallback)
const FIX_PREPAID = "010";
const FIX_JEJU_PREPAID = "010";
const FIX_DELIVERY_MESSAGE = "당일배송바랍니다";

function ymdToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function buildAddress(a1: string | null, a2: string | null) {
  const s1 = safeStr(a1);
  const s2 = safeStr(a2);
  return [s1, s2].filter(Boolean).join(" ");
}

function buildProductName(clientName: string | null, subName: string | null): string {
  const client = safeStr(clientName);
  const sub = safeStr(subName);
  if (!client) return "(거래처명없음)";
  if (sub) return `*****${client}/${sub}`;
  return `*****${client}`;
}

// ✅ 3개 거래처용: 품목명-수량 형식 (전체 표시, 택배비/성형틀/인쇄제판 제외)
const EXCLUDE_ITEM_PREFIXES = ["택배비", "성형틀", "인쇄제판"];

function isExcludedItem(name: string): boolean {
  const n = name.trim();
  return EXCLUDE_ITEM_PREFIXES.some((ex) => n.startsWith(ex));
}

function buildItemProductName(lines: OrderLineRow[]): string {
  const validLines = lines
    .filter((l) => safeStr(l.name))
    .filter((l) => !isExcludedItem(safeStr(l.name)));
  if (validLines.length === 0) return "";
  return "*****" + validLines
    .map((l) => {
      const unit = safeStr(l.unit_type).toUpperCase() === "BOX" ? "BOX" : "EA";
      return `${safeStr(l.name)}-${Number(l.qty ?? 0)}${unit}`;
    })
    .join(" / ");
}

// ✅ 주문의 order_lines에서 택배비 품목의 total_amount 추출
// "택배비"로 시작하는 라인 중 첫 번째 항목의 total_amount 반환
// 없으면 DEFAULT_FEE(3300) 반환
function getShippingFee(lines: OrderLineRow[]): number {
  const feeLine = lines.find((l) => safeStr(l.name).startsWith("택배비"));
  if (!feeLine) return DEFAULT_FEE;
  const amt = Number(feeLine.total_amount ?? 0);
  return amt > 0 ? amt : DEFAULT_FEE;
}

const COLUMNS = [
  { header: "수화주명", key: "ship_to_name", width: 18 },
  { header: "주소1", key: "address1", width: 50 },
  { header: "휴대폰", key: "mobile", width: 16 },
  { header: "전화", key: "phone", width: 16 },
  { header: "택배수량", key: "box_qty", width: 10 },
  { header: "택배요금", key: "fee", width: 10 },
  { header: "선착불", key: "prepaid", width: 8 },
  { header: "제주선착불", key: "jeju_prepaid", width: 10 },
  { header: "제품명", key: "product_name", width: 45 },
  { header: "배송메세지", key: "delivery_message", width: 30 },
];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = safeStr(url.searchParams.get("date")) || ymdToday();

    // 추가: customer_ids 파라미터 파싱 (없으면 null → 전체 조회)
    const customerIdsParam = url.searchParams.get("customer_ids");
    const customerIds = customerIdsParam
      ? customerIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let ordersQuery = supabase
      .from("orders")
      .select("id,customer_id,ship_date,customer_name,ship_method")
      .eq("ship_date", date)
      .not("ship_date", "is", null)
      .limit(20000);

    if (customerIds && customerIds.length > 0) {
      ordersQuery = ordersQuery.in("customer_id", customerIds);
    }

    const { data: ordersData, error: oErr } = await ordersQuery;

    if (oErr) throw oErr;

    const ordersAll = (ordersData ?? []) as OrderRow[];

    // ✅ 일반 거래처 먼저, 3개 특정 거래처(네이버/카카오/쿠팡) 나중 — 각 그룹 내 입력 순서 유지
    const orders = [
      ...ordersAll.filter((o) => !ITEM_NAME_CUSTOMERS.has(safeStr(o.customer_name))),
      ...ordersAll.filter((o) => ITEM_NAME_CUSTOMERS.has(safeStr(o.customer_name))),
    ];

    const orderIds = orders.map((o) => o.id);

    if (orderIds.length === 0) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("출고");
      ws.columns = COLUMNS;
      ws.getRow(1).font = { bold: true };
      const buf = await wb.xlsx.writeBuffer();
      return makeResponse(buf, date);
    }

    const { data: shipData, error: sErr } = await supabase
      .from("order_shipments")
      .select("id,order_id,seq,ship_to_name,ship_to_address1,ship_to_address2,ship_to_mobile,ship_to_phone,delivery_message")
      .in("order_id", orderIds)
      .order("order_id", { ascending: true })
      .order("seq", { ascending: true })
      .limit(40000);

    if (sErr) throw sErr;
    const ships = (shipData ?? []) as ShipRow[];

    const shipsByOrder = new Map<string, ShipRow[]>();
    for (const s of ships) {
      const arr = shipsByOrder.get(s.order_id) ?? [];
      arr.push(s);
      shipsByOrder.set(s.order_id, arr);
    }

    const { data: woData } = await supabase
      .from("work_orders")
      .select("linked_order_id,client_name,sub_name")
      .in("linked_order_id", orderIds)
      .limit(20000);

    const woByOrder = new Map<string, { client_name: string | null; sub_name: string | null }>();
    for (const wo of ((woData ?? []) as WorkOrderRow[])) {
      if (wo.linked_order_id && !woByOrder.has(wo.linked_order_id)) {
        woByOrder.set(wo.linked_order_id, {
          client_name: wo.client_name,
          sub_name: wo.sub_name,
        });
      }
    }

    // ✅ 전체 주문의 order_lines 조회 (택배비 + 3개 거래처 품목명 모두 처리)
    const { data: lineData } = await supabase
      .from("order_lines")
      .select("order_id,name,qty,unit_type,total_amount")
      .in("order_id", orderIds)
      .order("line_no", { ascending: true })
      .limit(100000);

    const linesByOrder = new Map<string, OrderLineRow[]>();
    for (const l of ((lineData ?? []) as OrderLineRow[])) {
      const arr = linesByOrder.get(l.order_id) ?? [];
      arr.push(l);
      linesByOrder.set(l.order_id, arr);
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("출고");

    ws.addRow(["수화주명","주소1","휴대폰","전화","택배수량","택배요금","선착불","제주선착불","제품명","배송메세지"]);
    ws.getRow(1).font = { bold: true };
    ws.getColumn(1).width = 18;
    ws.getColumn(2).width = 50;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 10;
    ws.getColumn(6).width = 10;
    ws.getColumn(7).width = 8;
    ws.getColumn(8).width = 10;
    ws.getColumn(9).width = 45;
    ws.getColumn(10).width = 30;
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.getColumn(5).numFmt = "0";
    ws.getColumn(6).numFmt = "#,##0";

    for (const o of orders) {
      const oid = o.id;
      const shipRows = shipsByOrder.get(oid) ?? [];
      const targetShips = shipRows.length ? shipRows.slice(0, 2) : [null];
      const lines = linesByOrder.get(oid) ?? [];

      const customerName = safeStr(o.customer_name);
      let productName: string;

      if (ITEM_NAME_CUSTOMERS.has(customerName)) {
        // 3개 거래처: 품목명-수량 형식
        productName = buildItemProductName(lines);
      } else {
        // 일반 거래처: 기존 방식
        const wo = woByOrder.get(oid);
        productName = wo
          ? buildProductName(wo.client_name, wo.sub_name)
          : buildProductName(o.customer_name, null);
      }

      // ✅ 해당 주문의 택배비 라인에서 실제 금액 추출 (없으면 3300 기본값)
      const shippingFee = getShippingFee(lines);

      for (const s of targetShips) {
        ws.addRow([
          s ? safeStr(s.ship_to_name) : "",
          s ? buildAddress(s.ship_to_address1, s.ship_to_address2) : "",
          s ? safeStr(s.ship_to_mobile) : "",
          s ? safeStr(s.ship_to_phone) : "",
          FIX_QTY,
          shippingFee, // ✅ 하드코딩 FIX_FEE 대신 실제 주문별 택배비 사용
          FIX_PREPAID,
          FIX_JEJU_PREPAID,
          productName,
          FIX_DELIVERY_MESSAGE,
        ]);
      }
    }

    ws.eachRow((row, rowNumber) => {
      row.height = rowNumber === 1 ? 18 : 16;
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle" };
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    return makeResponse(buf, date);

  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "unknown error");
    return new Response(`출고 엑셀 생성 오류: ${msg}`, { status: 500 });
  }
}

function makeResponse(buf: ExcelJS.Buffer, date: string) {
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`출고_${date}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
