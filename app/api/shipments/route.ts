// app/api/shipments/excel/route.ts
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

type ShipMethod = "택배" | "퀵" | "기타";

const HIDE_CUSTOMERS = new Set(["카카오플러스-판매", "네이버-판매", "쿠팡-판매"]);

function normalizeShipMethod(v: any): ShipMethod {
  const s = String(v ?? "").trim();
  if (!s) return "기타";
  if (s.includes("택배")) return "택배";
  if (s.includes("퀵")) return "퀵";
  return "기타";
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function filename(date: string) {
  return `출고목록_${date}.xlsx`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = safeStr(searchParams.get("date")); // YYYY-MM-DD

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date 파라미터가 필요합니다. (YYYY-MM-DD)" }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "서버 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ✅ orders + order_shipments + order_lines
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        customer_name,
        ship_date,
        ship_method,
        order_shipments:order_shipments (
          seq,
          ship_to_name,
          ship_to_address1,
          ship_to_address2,
          ship_to_mobile,
          ship_to_phone,
          delivery_message
        ),
        order_lines:order_lines (
          line_no,
          name,
          qty
        )
      `
      )
      .eq("ship_date", date);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orders = (data ?? []) as any[];

    // ✅ 숨김 채널 제외 + ship_date null 방지
    const filtered = orders
      .filter((o) => safeStr(o?.ship_date).slice(0, 10) === date)
      .filter((o) => {
        const customerName = safeStr(o?.customer_name) || "(거래처 미지정)";
        return !HIDE_CUSTOMERS.has(customerName);
      });

    // --- Excel 생성 ---
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("출고목록");

    // 헤더(이미지 기준)
    ws.columns = [
      { header: "수화주명", key: "recv_name", width: 18 }, // A
      { header: "주소1", key: "addr1", width: 48 }, // B
      { header: "휴대폰", key: "mobile", width: 16 }, // C
      { header: "전화", key: "phone", width: 16 }, // D
      { header: "택배수량", key: "box_cnt", width: 10 }, // E
      { header: "택배요금", key: "fee", width: 10 }, // F
      { header: "선착불", key: "prepaid", width: 10 }, // G
      { header: "제주선착불", key: "jeju_prepaid", width: 12 }, // H
      { header: "제품명", key: "products", width: 40 }, // I
      { header: "배송메세지", key: "msg", width: 26 }, // J
    ];

    // 헤더 스타일(가볍게)
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 18;

    // ✅ 한 order의 제품명: order_lines 모두 합쳐 1칸 출력
    // - "제품명 x수량" 형태
    function buildProductsText(lines: any[]) {
      const arr = (lines ?? [])
        .slice()
        .sort((a: any, b: any) => (a?.line_no ?? 0) - (b?.line_no ?? 0))
        .map((l: any) => {
          const nm = safeStr(l?.name);
          const q = Number(l?.qty ?? 0);
          if (!nm) return "";
          if (!Number.isFinite(q) || q <= 0) return nm;
          return `${nm} x${q}`;
        })
        .filter(Boolean);

      // Excel 한 칸에서 줄바꿈 표시(필요 시 자동 줄바꿈)
      return arr.join("\n");
    }

    // ✅ 조건 고정값
    const FIX_BOX_CNT = 1;
    const FIX_FEE = 3300;
    const FIX_PREPAID = "010";
    const FIX_JEJU_PREPAID = "010";

    // ✅ 행 생성: order_shipments가 2개면 2줄, 없으면 1줄(빈 배송정보)
    for (const o of filtered) {
      const customerName = safeStr(o?.customer_name) || "(거래처 미지정)";

      // ship_method는 여기서는 엑셀 컬럼에는 직접 안 쓰지만, 혹시 나중 확장 대비 normalize 유지
      normalizeShipMethod(o?.ship_method);

      const shipments = (o?.order_shipments ?? [])
        .slice()
        .sort((a: any, b: any) => (a?.seq ?? 0) - (b?.seq ?? 0));

      const lines = o?.order_lines ?? [];
      const productsText = buildProductsText(lines);

      const rowsToMake = shipments.length > 0 ? shipments : [null];

      for (const s of rowsToMake) {
        const recvName = safeStr(s?.ship_to_name) || customerName; // 배송지 수화주명이 없으면 거래처명 fallback
        const addr1 = safeStr(s?.ship_to_address1);
        const addr2 = safeStr(s?.ship_to_address2);
        const addr = [addr1, addr2].filter(Boolean).join(" ");

        const mobile = safeStr(s?.ship_to_mobile);
        const phone = safeStr(s?.ship_to_phone);
        const msg = safeStr(s?.delivery_message);

        const row = ws.addRow({
          recv_name: recvName,
          addr1: addr,
          mobile,
          phone,
          box_cnt: FIX_BOX_CNT,
          fee: FIX_FEE,
          prepaid: FIX_PREPAID,
          jeju_prepaid: FIX_JEJU_PREPAID,
          products: productsText,
          msg,
        });

        row.alignment = { vertical: "top", wrapText: true };
      }
    }

    // 숫자형 컬럼 서식
    ws.getColumn("box_cnt").numFmt = "0";
    ws.getColumn("fee").numFmt = "0";

    // 테두리(가볍게)
    ws.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        };
        if (rowNumber === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF3F4F6" },
          };
        }
      });
    });

    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename(date))}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "엑셀 생성 중 오류" }, { status: 500 });
  }
}