// app/api/work-order-pdf/route.ts
// 작업지시서 PDF 생성 API (GitHub Actions에서 호출)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  // 내부 토큰 검증 (GitHub Actions에서만 호출 가능하도록)
  const token = req.headers.get("x-internal-token");
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return new NextResponse("Missing id", { status: 400 });
  }

  // 작업지시서 데이터 조회
  const { data: order, error } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) {
    return new NextResponse("Work order not found", { status: 404 });
  }

  // HTML → PDF 변환 (puppeteer 없이 html-pdf-node 또는 직접 HTML 반환)
  // 여기서는 작업지시서 HTML을 생성하여 반환
  // GitHub Actions에서 wkhtmltopdf 또는 chromium으로 변환 가능
  // 현재는 HTML을 반환하고 Actions에서 PDF로 변환

  const html = generateWorkOrderHTML(order);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function generateWorkOrderHTML(order: Record<string, unknown>): string {
  const today = new Date().toLocaleDateString("ko-KR");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>작업지시서</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
      font-size: 12px;
      padding: 20px;
      color: #000;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .header .company {
      font-size: 14px;
      color: #333;
    }
    .section {
      margin-bottom: 16px;
    }
    .section-title {
      background-color: #2F4F8F;
      color: white;
      padding: 4px 8px;
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    table td, table th {
      border: 1px solid #ccc;
      padding: 5px 8px;
      font-size: 11px;
    }
    table th {
      background-color: #f0f0f0;
      font-weight: bold;
      width: 120px;
      text-align: left;
    }
    .two-col table th { width: 100px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
      background-color: #4CAF50;
      color: white;
    }
    .footer {
      margin-top: 30px;
      border-top: 1px solid #ccc;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #666;
    }
    .sign-area {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 20px;
    }
    .sign-box {
      border: 1px solid #ccc;
      text-align: center;
      padding: 5px;
    }
    .sign-box .title {
      background-color: #f0f0f0;
      padding: 3px;
      font-weight: bold;
      font-size: 10px;
      margin-bottom: 20px;
    }
    .sign-box .name {
      font-size: 10px;
      color: #333;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>작 업 지 시 서</h1>
    <div class="company">BONUSMATE ERP</div>
  </div>

  <div class="section">
    <div class="section-title">기본 정보</div>
    <table>
      <tr>
        <th>지시번호</th>
        <td>${order.order_number ?? "-"}</td>
        <th>작업일자</th>
        <td>${order.work_date ?? "-"}</td>
      </tr>
      <tr>
        <th>업체명</th>
        <td>${order.client_name ?? "-"}</td>
        <th>납품기한</th>
        <td>${order.delivery_date ?? "-"}</td>
      </tr>
      <tr>
        <th>품목명</th>
        <td>${order.item_name ?? "-"}</td>
        <th>식품유형</th>
        <td>${order.food_type ?? "-"}</td>
      </tr>
      <tr>
        <th>규격</th>
        <td>${order.spec ?? "-"}</td>
        <th>수량</th>
        <td>${order.quantity ? Number(order.quantity).toLocaleString() + " 개" : "-"}</td>
      </tr>
      <tr>
        <th>진행상태</th>
        <td colspan="3">
          <span class="status-badge">생산완료</span>
        </td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">담당자</div>
    <table>
      <tr>
        <th>이전담당</th>
        <td>${order.assignee_transfer ?? "-"}</td>
        <th>인쇄확인</th>
        <td>${order.assignee_print_check ?? "-"}</td>
      </tr>
      <tr>
        <th>생산담당</th>
        <td>${order.assignee_production ?? "-"}</td>
        <th>투입담당</th>
        <td>${order.assignee_input ?? "-"}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">생산 정보</div>
    <table>
      <tr>
        <th>생산수량</th>
        <td>${order.production_quantity ? Number(order.production_quantity).toLocaleString() + " 개" : "-"}</td>
        <th>불량수량</th>
        <td>${order.defect_quantity ? Number(order.defect_quantity).toLocaleString() + " 개" : "-"}</td>
      </tr>
      <tr>
        <th>생산완료일</th>
        <td>${order.production_completed_at ? new Date(order.production_completed_at as string).toLocaleDateString("ko-KR") : "-"}</td>
        <th>비고</th>
        <td>${order.notes ?? "-"}</td>
      </tr>
    </table>
  </div>

  <div class="sign-area">
    <div class="sign-box">
      <div class="title">이전담당</div>
      <div class="name">${order.assignee_transfer ?? ""}</div>
    </div>
    <div class="sign-box">
      <div class="title">인쇄확인</div>
      <div class="name">${order.assignee_print_check ?? ""}</div>
    </div>
    <div class="sign-box">
      <div class="title">생산담당</div>
      <div class="name">${order.assignee_production ?? ""}</div>
    </div>
    <div class="sign-box">
      <div class="title">투입담당</div>
      <div class="name">${order.assignee_input ?? ""}</div>
    </div>
  </div>

  <div class="footer">
    <span>생성일: ${today}</span>
    <span>BONUSMATE ERP System</span>
  </div>
</body>
</html>`;
}
