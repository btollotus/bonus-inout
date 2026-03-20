// app/api/work-order-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const token = req.headers.get("x-internal-token");
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return new NextResponse("Missing id", { status: 400 });

  const { data: order, error } = await supabase
    .from("work_orders")
    .select(`*, work_order_items(id,work_order_id,delivery_date,sub_items,order_qty,barcode_no,actual_qty,unit_weight,total_weight,expiry_date,order_id,note,images)`)
    .eq("id", id)
    .single();

  if (error || !order) return new NextResponse("Work order not found", { status: 404 });

  const html = generateWorkOrderHTML(order);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function isSpecialItem(itemName: string): boolean {
  const n = String(itemName ?? "").trim();
  return n.startsWith("성형틀") || n.startsWith("인쇄제판");
}

function parseLogoSize(logoSpec: string | null): { width: string; height: string } | null {
  if (!logoSpec) return null;
  const m = logoSpec.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i);
  if (!m) return null;
  const unit = m[3] ?? "mm";
  return { width: `${m[1]}${unit}`, height: `${m[2]}${unit}` };
}

function fmt(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString("ko-KR");
}

function generateWorkOrderHTML(wo: any): string {
  const items = (wo.work_order_items ?? [])
    .filter((item: any) => !isSpecialItem((item.sub_items ?? [])[0]?.name ?? ""))
    .sort((a: any, b: any) => (a.delivery_date ?? "").localeCompare(b.delivery_date ?? ""));

  const deliveryDate = items[0]?.delivery_date ?? wo.order_date ?? "";
  const dayNames = ["일","월","화","수","목","금","토"];
  const deliveryDay = deliveryDate ? `(${dayNames[new Date(deliveryDate).getDay()]})` : "";

  const isMultiItem = items.length > 1;
  const productNameDisplay = (() => {
    const names = items.map((i: any) => (i.sub_items ?? [])[0]?.name).filter(Boolean);
    if (names.length === 0) return wo.product_name;
    if (names.length === 1) return names[0];
    return `${names[0]} 외 ${names.length - 1}건`;
  })();

  const createdDate = wo.created_at ? wo.created_at.slice(0, 10) : wo.order_date ?? "";
  const createdDay = createdDate ? `(${dayNames[new Date(createdDate).getDay()]})` : "";
  const isReorder = wo.is_reorder ?? false;

  const statusRows = [
    { label: "전사인쇄", checked: wo.status_transfer },
    { label: "인쇄검수", checked: wo.status_print_check },
    { label: "생산완료", checked: wo.status_production },
    { label: "입력완료", checked: wo.status_input },
  ];

  const itemsHTML = items.map((item: any, idx: number) => {
    const aq = item.actual_qty ?? null;
    const uw = item.unit_weight ?? null;
    const tw = aq && uw ? Math.round(aq * uw) : null;
    const exp = item.expiry_date ?? "";
    const itemName = (item.sub_items ?? [])[0]?.name || "—";
    const itemBarcode = item.barcode_no ?? null;
    const note = item.note ?? "";

    return `
    <div style="margin-bottom:${idx < items.length - 1 ? "10px" : "6px"};">
      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          <tr>
            <td style="border:1px solid #94a3b8;border-bottom:none;padding:5px 10px;width:30%;background:#f1f5f9;color:#111;font-weight:bold;font-size:9pt;vertical-align:middle;white-space:nowrap;">${itemName}</td>
            <td style="border:1px solid #94a3b8;border-bottom:none;border-left:none;padding:5px 10px;background:#f8fafc;vertical-align:middle;">
              ${itemBarcode
                ? `<span style="font-family:monospace;font-size:8pt;color:#444;white-space:nowrap;">${itemBarcode}</span>`
                : `<span style="color:#aaa;font-size:8pt;">바코드 없음</span>`}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;white-space:nowrap;padding:4px 6px;vertical-align:middle;">주문수량</td>
            <td style="border:1px solid #cbd5e1;border-left:none;padding:0;">
              <table style="width:100%;border-collapse:collapse;"><tbody><tr>
                <td style="border:none;border-right:1px solid #cbd5e1;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;white-space:nowrap;padding:4px;width:14%;">출고수량</td>
                <td style="border:none;border-right:1px solid #cbd5e1;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;white-space:nowrap;padding:4px;width:14%;">개당중량(g)</td>
                <td style="border:none;border-right:1px solid #cbd5e1;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;white-space:nowrap;padding:4px;width:14%;">총중량(g)</td>
                <td style="border:none;border-right:1px solid #cbd5e1;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;white-space:nowrap;padding:4px;width:18%;">소비기한</td>
                <td style="border:none;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;white-space:nowrap;padding:4px;width:40%;">비고</td>
              </tr></tbody></table>
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;border-top:none;text-align:right;font-weight:bold;font-size:11pt;padding:4px 6px;vertical-align:middle;">${fmt(item.order_qty)}</td>
            <td style="border:1px solid #cbd5e1;border-left:none;border-top:none;padding:0;">
              <table style="width:100%;border-collapse:collapse;"><tbody><tr>
                <td style="border:none;border-right:1px solid #cbd5e1;text-align:right;font-weight:bold;color:${aq ? "#1d4ed8" : "#111"};font-size:8.5pt;padding:4px;vertical-align:middle;width:14%;">${aq != null ? fmt(aq) : ""}</td>
                <td style="border:none;border-right:1px solid #cbd5e1;text-align:right;font-size:8.5pt;padding:4px;vertical-align:middle;width:14%;">${uw != null ? uw : ""}</td>
                <td style="border:none;border-right:1px solid #cbd5e1;text-align:right;color:${tw ? "#1d4ed8" : "#999"};font-size:8.5pt;padding:4px;vertical-align:middle;width:14%;">${tw ? fmt(tw) : ""}</td>
                <td style="border:none;border-right:1px solid #cbd5e1;text-align:center;font-size:8pt;padding:4px;vertical-align:middle;width:18%;">${exp}</td>
                <td style="border:none;font-size:8.5pt;padding:4px;vertical-align:middle;width:40%;">${note}</td>
              </tr></tbody></table>
            </td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>작업지시서</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 14mm; }
    body { margin: 0; font-family: 'Nanum Gothic', 'NanumGothic', 'Malgun Gothic', sans-serif; font-size: 10pt; color: #111; background: #fff; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  <div style="text-align:center;font-size:8.5pt;color:#555;margin-bottom:4px;letter-spacing:2px;">성실! 신뢰! 화합!</div>
  <div style="text-align:center;font-size:17pt;font-weight:bold;letter-spacing:6px;margin-bottom:8px;border-bottom:2px solid #111;padding-bottom:6px;">
    작 업 지 시 서
    <span style="margin-left:14px;font-size:10pt;font-weight:bold;letter-spacing:0px;padding:2px 10px;border-radius:12px;vertical-align:middle;background:${isReorder ? "#fef3c7" : "#dbeafe"};color:${isReorder ? "#b45309" : "#1d4ed8"};border:1px solid ${isReorder ? "#fcd34d" : "#93c5fd"};">
      ${isReorder ? "재주문" : "신규"}
    </span>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
    <tbody>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;width:80px;">거래처명</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${wo.client_name}${wo.sub_name ? ` (${wo.sub_name})` : ""}</td>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;width:80px;">납기일</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;font-weight:bold;">${deliveryDate} ${deliveryDay}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">품목명</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;" colspan="3">${productNameDisplay}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">식품유형</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${wo.food_type ?? "—"}</td>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">두께</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${wo.thickness ?? "—"}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">규격(로고)</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${wo.logo_spec ?? "—"}</td>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">포장방법</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${wo.packaging_type ?? "—"}${wo.packaging_type === "트레이" && wo.tray_slot ? ` / ${wo.tray_slot}` : ""}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">포장단위</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${wo.package_unit ?? "—"}</td>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">장/성형틀</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${wo.mold_per_sheet ? `${wo.mold_per_sheet}개` : "—"}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">납품방법</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${wo.delivery_method ?? "—"}</td>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">주문일</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${createdDate} ${createdDay}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">지시번호</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;" colspan="3">${wo.work_order_no}</td>
      </tr>
      ${wo.note ? `<tr><td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">비고</td><td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;" colspan="3">${wo.note}</td></tr>` : ""}
      ${wo.reference_note ? `<tr><td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;white-space:nowrap;">참고사항</td><td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;" colspan="3">${wo.reference_note}</td></tr>` : ""}
    </tbody>
  </table>

  <div style="font-weight:bold;font-size:9pt;margin-bottom:3px;margin-top:6px;border-left:3px solid #2563eb;padding-left:5px;">진행상태 확인</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
    <tbody><tr>
      ${statusRows.map(({ label, checked }) => `
        <td style="border:1px solid #cbd5e1;padding:3px 6px;text-align:center;width:25%;">
          <span style="font-size:8pt;color:#555;">${label} </span><span style="font-size:10pt;">${checked ? "✅" : "☐"}</span>
        </td>`).join("")}
    </tr></tbody>
  </table>

  <div style="font-weight:bold;font-size:9pt;margin-bottom:6px;border-left:3px solid #2563eb;padding-left:5px;">
    ${isMultiItem ? `품목별 생산 현황 (총 ${items.length}건)` : "생산 현황"}
  </div>

  ${itemsHTML}
</body>
</html>`;
}
