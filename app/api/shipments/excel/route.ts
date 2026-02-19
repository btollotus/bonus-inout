// app/api/shipments/excel/route.ts
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // exceljs는 node 런타임 권장

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

// ✅ 숨길 판매채널
const HIDE_CUSTOMERS = new Set(["카카오플러스-판매", "네이버-판매", "쿠팡-판매"]);

// ✅ 고정값 규칙
const FIX_QTY = 1;
const FIX_FEE = 3300;
const FIX_PREPAID = "010";
const FIX_JEJU_PREPAID = "010";

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

function buildProductName(lines: LineRow[]) {
  // 요구사항: order_lines 모두 합쳐서 1칸 (✅ 수량/단위 등 숫자 표시 금지 → name만 합침)
  const parts = lines
    .slice()
    .sort((a, b) => Number(a.line_no ?? 9999) - Number(b.line_no ?? 9999))
    .map((l) => {
      const n = safeStr(l.name) || "(품목명없음)";
      return n;
    });

  return parts.join(", ");
}

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
    if (orderIds.length === 0) {
      // 빈 파일도 내려주기(실패 대신)
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

      const buf = await wb.xlsx.writeBuffer();
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            `출고_${date}.xlsx`
          )}`,
          "Cache-Control": "no-store",
        },
      });
    }

    // 2) order_shipments (배송지 1~2)
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

    // 3) order_lines (제품명 합치기)
    const { data: lineData, error: lErr } = await supabase
      .from("order_lines")
      .select("order_id,line_no,name,qty,unit,unit_type,pack_ea,actual_ea")
      .in("order_id", orderIds)
      .order("order_id", { ascending: true })
      .order("line_no", { ascending: true })
      .limit(200000);

    if (lErr) throw lErr;
    const lines = (lineData ?? []) as LineRow[];

    const linesByOrder = new Map<string, LineRow[]>();
    for (const l of lines) {
      const arr = linesByOrder.get(l.order_id) ?? [];
      arr.push(l);
      linesByOrder.set(l.order_id, arr);
    }

    // 4) 엑셀 생성
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
    ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    // 숫자컬럼은 숫자로
    ws.getColumn("box_qty").numFmt = "0";
    ws.getColumn("fee").numFmt = "#,##0";

    for (const o of orders) {
      const oid = o.id;

      const shipRows = shipsByOrder.get(oid) ?? [];
      // 배송지 2개면 2줄 / 없으면 1줄(빈값)
      const targetShips = shipRows.length ? shipRows.slice(0, 2) : [null];

      const productName = buildProductName(linesByOrder.get(oid) ?? []);

      for (const s of targetShips) {
        const ship_to_name = s ? safeStr(s.ship_to_name) : "";
        const address1 = s ? buildAddress(s.ship_to_address1, s.ship_to_address2) : "";
        const mobile = s ? safeStr(s.ship_to_mobile) : "";
        const phone = s ? safeStr(s.ship_to_phone) : "";
        const delivery_message = s ? safeStr(s.delivery_message) : "";

        ws.addRow({
          ship_to_name,
          address1,
          mobile,
          phone,
          box_qty: FIX_QTY,
          fee: FIX_FEE,
          prepaid: FIX_PREPAID,
          jeju_prepaid: FIX_JEJU_PREPAID,
          product_name: productName,
          delivery_message,
        });
      }
    }

    // 보기 좋게 행 높이
    ws.eachRow((row, rowNumber) => {
      row.height = rowNumber === 1 ? 18 : 16;
      row.alignment = { vertical: "middle" };
    });

    const buf = await wb.xlsx.writeBuffer();

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
          `출고_${date}.xlsx`
        )}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "unknown error");
    return new Response(`출고 엑셀 생성 오류: ${msg}`, { status: 500 });
  }
}