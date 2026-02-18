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
};

const HIDE_CUSTOMERS = new Set([
  "카카오플러스-판매",
  "네이버-판매",
  "쿠팡-판매",
]);

const FIX_QTY = 1;
const FIX_FEE = 3300;
const FIX_PREPAID = "010";
const FIX_JEJU_PREPAID = "010";

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function buildAddress(a1: string | null, a2: string | null) {
  return [safeStr(a1), safeStr(a2)].filter(Boolean).join(" ");
}

// ✅ 숫자 제거: 제품명만 합침
function buildProductName(lines: LineRow[]) {
  return lines
    .slice()
    .sort((a, b) => Number(a.line_no ?? 9999) - Number(b.line_no ?? 9999))
    .map((l) => safeStr(l.name) || "(품목명없음)")
    .join(", ");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = safeStr(url.searchParams.get("date"));

    if (!date) {
      return new Response("date 파라미터가 필요합니다.", { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // 1️⃣ orders 조회
    const { data: ordersData, error: oErr } = await supabase
      .from("orders")
      .select("id,ship_date,customer_name")
      .eq("ship_date", date);

    if (oErr) throw oErr;

    const orders = (ordersData ?? []).filter(
      (o: OrderRow) => !HIDE_CUSTOMERS.has(safeStr(o.customer_name))
    ) as OrderRow[];

    const orderIds = orders.map((o) => o.id);
    if (orderIds.length === 0) {
      return new Response("출고 데이터 없음", { status: 200 });
    }

    // 2️⃣ 배송지 조회
    const { data: shipData, error: sErr } = await supabase
      .from("order_shipments")
      .select(
        "id,order_id,seq,ship_to_name,ship_to_address1,ship_to_address2,ship_to_mobile,ship_to_phone,delivery_message"
      )
      .in("order_id", orderIds)
      .order("order_id", { ascending: true })
      .order("seq", { ascending: true });

    if (sErr) throw sErr;

    const ships = (shipData ?? []) as ShipRow[];

    const shipsByOrder = new Map<string, ShipRow[]>();
    for (const s of ships) {
      const arr = shipsByOrder.get(s.order_id) ?? [];
      arr.push(s);
      shipsByOrder.set(s.order_id, arr);
    }

    // 3️⃣ 제품명 조회 (qty 제거됨)
    const { data: lineData, error: lErr } = await supabase
      .from("order_lines")
      .select("order_id,line_no,name")
      .in("order_id", orderIds)
      .order("order_id", { ascending: true })
      .order("line_no", { ascending: true });

    if (lErr) throw lErr;

    const lines = (lineData ?? []) as LineRow[];

    const linesByOrder = new Map<string, LineRow[]>();
    for (const l of lines) {
      const arr = linesByOrder.get(l.order_id) ?? [];
      arr.push(l);
      linesByOrder.set(l.order_id, arr);
    }

    // 4️⃣ 엑셀 생성
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("출고");

    ws.columns = [
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

    ws.getRow(1).font = { bold: true };

    for (const o of orders) {
      const shipRows = shipsByOrder.get(o.id) ?? [];
      const targets = shipRows.length ? shipRows.slice(0, 2) : [null];

      const productName = buildProductName(linesByOrder.get(o.id) ?? []);

      for (const s of targets) {
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
          delivery_message: s ? safeStr(s.delivery_message) : "",
        });
      }
    }

    const buf = await wb.xlsx.writeBuffer();

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=출고_${date}.xlsx`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(
      `출고 엑셀 생성 오류: ${String(e?.message ?? e)}`,
      { status: 500 }
    );
  }
}