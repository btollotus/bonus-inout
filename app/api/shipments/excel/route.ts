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
  ship_date: string | null;
  customer_name: string | null;
};

type LineRow = {
  order_id: string;
  line_no: number | null;
  name: string | null;
  qty: number | null;
  unit: string | null;
  unit_type: string | null;
  pack_ea: number | null;
  actual_ea: number | null;
};

// ✅ 추가: work_orders 서브네임 조회용
type WorkOrderRow = {
  linked_order_id: string | null;
  client_name: string | null;
  sub_name: string | null;
};

const HIDE_CUSTOMERS = new Set(["카카오플러스-판매", "네이버-판매", "쿠팡-판매"]);

const FIX_QTY = 1;
const FIX_FEE = 3300;
const FIX_PREPAID = "010";
const FIX_JEJU_PREPAID = "010";
// ✅ 배송메시지 고정값
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

// ✅ 수정: 거래처명/서브네임 형태로 제품명 생성
// 예) 라끄루뜨 서울/베이글리스트  또는  라끄루뜨 서울 (서브네임 없을 때)
function buildProductName(clientName: string | null, subName: string | null): string {
  const client = safeStr(clientName);
  const sub = safeStr(subName);
  if (!client) return "(거래처명없음)";
  if (sub) return `*****${client}/${sub}`;
  return `*****${client}`;
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

    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) 해당 날짜 orders
    const { data: ordersData, error: oErr } = await supabase
      .from("orders")
      .select("id,ship_date,customer_name")
      .eq("ship_date", date)
      .not("ship_date", "is", null)
      .limit(20000);

    if (oErr) throw oErr;

    const ordersAll = (ordersData ?? []) as OrderRow[];
    const orders = ordersAll.filter((o) => {
      const name = safeStr(o.customer_name) || "(거래처 미지정)";
      return !HIDE_CUSTOMERS.has(name);
    });

    const orderIds = orders.map((o) => o.id);

    // ✅ 빈 파일 응답 공통 함수
    function makeEmptyWorkbook() {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("출고");
      ws.columns = COLUMNS;
      ws.getRow(1).font = { bold: true };
      return wb;
    }

    if (orderIds.length === 0) {
      const wb = makeEmptyWorkbook();
      const buf = await wb.xlsx.writeBuffer();
      return makeResponse(buf, date);
    }

    // 2) order_shipments
    const { data: shipData, error: sErr } = await supabase
      .from("order_shipments")
      .select(
        "id,order_id,seq,ship_to_name,ship_to_address1,ship_to_address2,ship_to_mobile,ship_to_phone,delivery_message"
      )
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

    // ✅ 3) work_orders에서 서브네임 조회 (linked_order_id 기준)
    const { data: woData } = await supabase
      .from("work_orders")
      .select("linked_order_id,client_name,sub_name")
      .in("linked_order_id", orderIds)
      .limit(20000);

    // order_id → { client_name, sub_name } 매핑 (주문당 첫 번째 작업지시서 기준)
    const woByOrder = new Map<string, { client_name: string | null; sub_name: string | null }>();
    for (const wo of ((woData ?? []) as WorkOrderRow[])) {
      if (wo.linked_order_id && !woByOrder.has(wo.linked_order_id)) {
        woByOrder.set(wo.linked_order_id, {
          client_name: wo.client_name,
          sub_name: wo.sub_name,
        });
      }
    }

    // 4) 엑셀 생성
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("출고");

    ws.columns = COLUMNS;
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.getColumn("box_qty").numFmt = "0";
    ws.getColumn("fee").numFmt = "#,##0";

    for (const o of orders) {
      const oid = o.id;
      const shipRows = shipsByOrder.get(oid) ?? [];
      const targetShips = shipRows.length ? shipRows.slice(0, 2) : [null];

      // ✅ 제품명: work_orders의 거래처명/서브네임, 없으면 orders.customer_name
      const wo = woByOrder.get(oid);
      const productName = wo
        ? buildProductName(wo.client_name, wo.sub_name)
        : buildProductName(o.customer_name, null);

      for (const s of targetShips) {
        ws.addRow({
          ship_to_name: s ? safeStr(s.ship_to_name) : "",
          address1: s ? buildAddress(s.ship_to_address1, s.ship_to_address2) : "",
          mobile: s ? safeStr(s.ship_to_mobile) : "",
          phone: s ? safeStr(s.ship_to_phone) : "",
          box_qty: FIX_QTY,
          fee: FIX_FEE,
          prepaid: FIX_PREPAID,
          jeju_prepaid: FIX_JEJU_PREPAID,
          product_name: productName,
          // ✅ 배송메시지: 고정값으로 대체
          delivery_message: FIX_DELIVERY_MESSAGE,
        });
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