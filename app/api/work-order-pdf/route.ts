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
    .select(`
      *,
      work_order_items(*)
    `)
    .eq("id", id)
    .single();

  if (error || !order) return new NextResponse("Work order not found", { status: 404 });

  const html = generateWorkOrderHTML(order);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function generateWorkOrderHTML(order: any): string {
  const items = (order.work_order_items ?? [])
    .filter((item: any) => {
      const name = (item.sub_items ?? [])[0]?.name ?? "";
      return !name.startsWith("성형틀") && !name.startsWith("인쇄제판");
    })
    .sort((a: any, b: any) => a.delivery_date.localeCompare(b.delivery_date));

  const deliveryDate = items[0]?.delivery_date ?? "";
  const dayNames = ["일","월","화","수","목","금","토"];
  const deliveryDay = deliveryDate ? `(${dayNames[new Date(deliveryDate).getDay()]})` : "";

  const productNameDisplay = (() => {
    const names = items.map((i: any) => (i.sub_items ?? [])[0]?.name).filter(Boolean);
    if (names.length === 0) return order.product_name;
    if (names.length === 1) return names[0];
    return `${names[0]} 외 ${names.length - 1}건`;
  })();

  const createdDate = order.created_at ? order.created_at.slice(0, 10) : order.order_date;
  const createdDay = createdDate ? `(${dayNames[new Date(createdDate).getDay()]})` : "";

  const itemsHTML = items.map((item: any) => {
    const actualQty = item.actual_qty;
    const unitWeight = item.unit_weight;
    const totalWeight = actualQty && unitWeight ? Math.round(actualQty * unitWeight) : null;
    const expiryDate = item.expiry_date ?? "";
    const itemName = (item.sub_items ?? [])[0]?.name || "—";
    const itemBarcode = item.barcode_no ?? null;
    const orderQty = item.order_qty ?? 0;

    return `
    <div style="margin-bottom:10px;">
      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          <tr>
            <td style="border:1px solid #94a3b8;border-bottom:none;padding:5px 10px;width:22%;background:#1e3a5f;color:#fff;font-weight:bold;font-size:9pt;vertical-align:middle;">
              ${itemName}
            </td>
            <td style="border:1px solid #94a3b8;border-bottom:none;border-left:none;padding:5px 10px;background:#f8fafc;vertical-align:middle;">
              ${itemBarcode ? `<span style="font-family:monospace;font-size:8pt;color:#444;">${itemBarcode}</span>` : '<span style="color:#aaa;font-size:8pt;">바코드 없음</span>'}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;padding:4px 6px;">주문수량</td>
            <td style="border:1px solid #cbd5e1;border-left:none;padding:0;">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="border:none;border-right:1px solid #cbd5e1;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;padding:4px;width:14%;">출고수량</td>
                  <td style="border:none;border-right:1px solid #cbd5e1;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;padding:4px;width:14%;">개당중량(g)</td>
                  <td style="border:none;border-right:1px solid #cbd5e1;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;padding:4px;width:14%;">총중량(g)</td>
                  <td style="border:none;border-right:1px solid #cbd5e1;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;padding:4px;width:18%;">소비기한</td>
                  <td style="border:none;background:#f1f5f9;font-weight:bold;font-size:8pt;text-align:center;padding:4px;width:40%;">비고</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;border-top:none;text-align:right;font-weight:bold;font-size:11pt;padding:4px 6px;">
              ${orderQty.toLocaleString("ko-KR")}
            </td>
            <td style="border:1px solid #cbd5e1;border-left:none;border-top:none;padding:0;">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="border:none;border-right:1px solid #cbd5e1;text-align:right;font-weight:bold;color:${actualQty ? "#1d4ed8" : "#111"};font-size:8.5pt;padding:4px;width:14%;">
                    ${actualQty != null ? actualQty.toLocaleString("ko-KR") : ""}
                  </td>
                  <td style="border:none;border-right:1px solid #cbd5e1;text-align:right;font-size:8.5pt;padding:4px;width:14%;">
                    ${unitWeight != null ? unitWeight : ""}
                  </td>
                  <td style="border:none;border-right:1px solid #cbd5e1;text-align:right;color:${totalWeight ? "#1d4ed8" : "#999"};font-size:8.5pt;padding:4px;width:14%;">
                    ${totalWeight ? totalWeight.toLocaleString("ko-KR") : ""}
                  </td>
                  <td style="border:none;border-right:1px solid #cbd5e1;text-align:center;font-size:8pt;padding:4px;width:18%;">
                    ${expiryDate}
                  </td>
                  <td style="border:none;font-size:8.5pt;padding:4px;width:40%;">
                    ${item.note ?? ""}
                  </td>
                </tr>
              </table>
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
    body { margin: 0; font-family: 'Nanum Gothic', 'NanumGothic', sans-serif; font-size: 10pt; color: #111; background: #fff; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  <div style="text-align:center;font-size:8.5pt;color:#555;margin-bottom:4px;letter-spacing:2px;">성실! 신뢰! 화합!</div>
  <div style="text-align:center;font-size:17pt;font-weight:bold;letter-spacing:6px;margin-bottom:8px;border-bottom:2px solid #111;padding-bottom:6px;">
    작 업 지 시 서
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
    <tbody>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;width:80px;">거래처명</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${order.client_name}${order.sub_name ? ` (${order.sub_name})` : ""}</td>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;width:80px;">납기일</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;font-weight:bold;">${deliveryDate} ${deliveryDay}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">품목명</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;" colspan="3">${productNameDisplay}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">식품유형</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${order.food_type ?? "—"}</td>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">두께</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${order.thickness ?? "—"}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">규격(로고)</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${order.logo_spec ?? "—"}</td>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">포장방법</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${order.packaging_type ?? "—"}${order.packaging_type === "트레이" && order.tray_slot ? ` / ${order.tray_slot}` : ""}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">포장단위</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${order.package_unit ?? "—"}</td>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">성형틀/장</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${order.mold_per_sheet ? `${order.mold_per_sheet}개` : "—"}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">납품방법</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${order.delivery_method ?? "—"}</td>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">주문일</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;">${createdDate} ${createdDay}</td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">지시번호</td>
        <td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;" colspan="3">${order.work_order_no}</td>
      </tr>
      ${order.note ? `<tr><td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">비고</td><td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;" colspan="3">${order.note}</td></tr>` : ""}
      ${order.reference_note ? `<tr><td style="background:#f8fafc;border:1px solid #cbd5e1;padding:3px 6px;font-weight:bold;font-size:11pt;color:#374151;">참고사항</td><td style="border:1px solid #cbd5e1;padding:3px 8px;font-size:11pt;" colspan="3">${order.reference_note}</td></tr>` : ""}
    </tbody>
  </table>

  <div style="font-weight:bold;font-size:9pt;margin-bottom:6px;border-left:3px solid #2563eb;padding-left:5px;">
    ${items.length > 1 ? `품목별 생산 현황 (총 ${items.length}건)` : "생산 현황"}
  </div>

  ${itemsHTML}

  <div style="margin-top:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
    ${[
      ["전사인쇄", order.assignee_transfer],
      ["인쇄검수", order.assignee_print_check],
      ["생산완료", order.assignee_production],
      ["입력완료", order.assignee_input],
    ].map(([label, name]) => `
      <div style="border:1px solid #ccc;text-align:center;padding:5px;">
        <div style="background:#f0f0f0;padding:3px;font-weight:bold;font-size:10px;margin-bottom:20px;">${label}</div>
        <div style="font-size:10px;color:#333;margin-top:5px;">${name ?? ""}</div>
      </div>
    `).join("")}
  </div>
</body>
</html>`;
}
