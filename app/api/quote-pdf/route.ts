// app/api/quote-pdf/route.ts
// 견적서 HTML 생성 API (GitHub Actions에서 호출)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OUR = {
  name: "주식회사 보누스메이트",
  nameShort: "(주)보누스메이트",
  business_no: "343-88-03009",
  ceo: "조대성",
  address: "경기도 파주시 광탄면 장지산로 250-90 1층",
  bizType: "제조업",
  bizItem: "식품제조가공업",
  phone: "02-356-3380",
  kakao: "cacaoplus",
  email: "cacaoplus@naver.com",
  bank: "국민은행 024801-04-536001(주식회사 보누스메이트)",
  website: "www.bonusmate.co.kr",
};

function fmt(n: number) { return Number(n ?? 0).toLocaleString("ko-KR"); }

function numberToKorean(n: number): string {
  if (n === 0) return "영";
  const units = ["","일","이","삼","사","오","육","칠","팔","구"];
  const tens  = ["","십","백","천"];
  const bigs  = ["","만","억","조"];
  let result = "", bigIdx = 0;
  while (n > 0) {
    const chunk = n % 10000;
    if (chunk !== 0) {
      let chunkStr = "", tmp = chunk, tenIdx = 0;
      while (tmp > 0) {
        const d = tmp % 10;
        if (d !== 0) chunkStr = units[d] + tens[tenIdx] + chunkStr;
        tmp = Math.floor(tmp / 10); tenIdx++;
      }
      result = chunkStr + bigs[bigIdx] + result;
    }
    n = Math.floor(n / 10000); bigIdx++;
  }
  return result;
}

function formatDateKorean(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  const days = ["일","월","화","수","목","금","토"];
  const dow = days[new Date(ymd).getDay()];
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 ${dow}요일`;
}

export async function GET(req: NextRequest) {
  // 인증 확인
  const token = req.headers.get("x-internal-token");
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return new NextResponse("id 필수", { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 견적 요청 + 견적 결과 조회
  const { data: qr, error } = await supabase
    .from("quote_requests")
    .select("*, quotes(*)")
    .eq("id", id)
    .single();

  if (error || !qr) return new NextResponse("견적 없음", { status: 404 });

  const q = qr.quotes?.[0];

  // 품목 행 구성
  type LineItem = { name: string; qty: string; unit: number; supply: number; vat: number; total: number };
  const lineItems: LineItem[] = [];

  const isRaise = (qr.product_type ?? "").startsWith("레이즈");
  const colorType = qr.color_type ?? "dark";
  const pt = qr.product_type ?? "";
  const thickness = pt.includes("2mm") ? "2mm" : pt.includes("3mm") ? "3mm" : pt.includes("5mm") ? "5mm" : "";
  const sizeStr = qr.width_mm && qr.height_mm
    ? `${qr.width_mm}×${qr.height_mm}mm${thickness ? ", 두께 " + thickness : ""}`
    : thickness ? `두께 ${thickness}` : "";
  const colorLabel = isRaise ? "컬러인쇄" : colorType === "dark" ? "다크" : "화이트";
  const productName = sizeStr ? `${colorLabel}(${sizeStr})` : colorLabel;

  const V = q?.final_price ?? 0;
  const qty = qr.quantity ?? 0;
  const moldCost = q?.mold_cost ?? 0;
  const plateCost = q?.plate_cost ?? 0;

  if (V > 0 && qty > 0) {
    const supply = V * qty;
    lineItems.push({ name: productName, qty: fmt(qty), unit: V, supply, vat: Math.round(supply * 0.1), total: supply + Math.round(supply * 0.1) });
  }
  if (moldCost > 0) {
    lineItems.push({ name: "성형틀 (최초 1회)", qty: "1", unit: moldCost, supply: moldCost, vat: Math.round(moldCost * 0.1), total: moldCost + Math.round(moldCost * 0.1) });
  }
  if (plateCost > 0 && !isRaise) {
    lineItems.push({ name: "인쇄제판 (최초 1회)", qty: "1", unit: plateCost, supply: plateCost, vat: Math.round(plateCost * 0.1), total: plateCost + Math.round(plateCost * 0.1) });
  }

  const sumSupply = lineItems.reduce((a, r) => a + r.supply, 0);
  const sumVat    = lineItems.reduce((a, r) => a + r.vat, 0);
  const sumTotal  = lineItems.reduce((a, r) => a + r.total, 0);
  const emptyRows = Math.max(0, 8 - lineItems.length);

  const foodType = (colorType === "dark" && !isRaise) ? "준초콜릿" : "당류가공품";
  const cautions = isRaise
    ? ["본 제품은 인쇄면에 물이 묻으면 번지거나 지워질 수 있으니 주의하셔야되고, 특히 냉동,냉장 보관시 결로에 의해 번질 수 있으니 주의하셔야됩니다.", "27도 이하 건조한 곳에 보관하세요."]
    : ["27도 이하 건조한 곳에 보관하세요."];

  const quoteDate = (qr.created_at ?? "").slice(0, 10);

  const cb = "border:1px solid #999;padding:4px 6px;font-size:11pt;";
  const ch = cb + "background:#f0f0f0;text-align:center;font-weight:bold;";
  const cbC = cb + "text-align:center;";
  const cbR = cb + "text-align:right;";

  const lineRowsHtml = lineItems.map(r =>
    "<tr>" +
    "<td style='" + cb + "'>"+r.name+"</td>" +
    "<td style='" + cbC + "'>"+r.qty+"</td>" +
    "<td style='" + cbR + "'>"+fmt(r.unit)+"</td>" +
    "<td style='" + cbR + "'>"+fmt(r.supply)+"</td>" +
    "<td style='" + cbR + "'>"+fmt(r.vat)+"</td>" +
    "<td style='" + cbR + "'>"+fmt(r.total)+"</td>" +
    "</tr>"
  ).join("");

  const emptyRowsHtml = Array.from({ length: emptyRows }).map(() =>
    "<tr style='height:22px;'>" + ("<td style='" + cb + "'></td>").repeat(6) + "</tr>"
  ).join("");

  const cautionsHtml = cautions.map(c =>
    "<tr><td colspan='6' style='" + cb + "color:#555;'>*" + c + "</td></tr>"
  ).join("");

  const memoHtml = qr.memo
    ? "<tr><td colspan='6' style='" + cb + "color:#555;'>*" + qr.memo + "</td></tr>"
    : "";

  const customerName = qr.customer_name ?? "";
  const nameFontSize = customerName.length > 15 ? "12pt" : "15pt";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
@page { size: A4 portrait; margin: 15mm 15mm 12mm 15mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'NanumGothic','맑은 고딕',sans-serif; font-size: 11pt; color: #111; background: #fff; }
table { border-collapse: collapse; width: 100%; }
</style>
</head><body>

<!-- 로고 -->
<div style="text-align:center;margin-bottom:4px;">
  <img src="https://bonus-inout.vercel.app/bonusmate-logo.png" style="height:40px;" alt="BONUSMATE" />
</div>

<!-- 제목 -->
<div style="text-align:center;font-size:22pt;font-weight:bold;letter-spacing:8px;margin:8px 0 12px;">견 적 서</div>

<!-- 견적일 + 발신자 -->
<table style="margin-bottom:8px;">
  <tbody>
    <tr>
      <td style="border:none;vertical-align:top;width:44%;padding-right:10px;">
        <div style="font-size:13pt;margin-bottom:4px;">견적일 : ${formatDateKorean(quoteDate)}</div>
        <div style="font-size:${nameFontSize};margin-bottom:4px;">업체명 : <strong>${customerName}</strong> &nbsp; 귀중</div>
        <div style="font-size:13pt;color:#555;margin-bottom:4px;">아래와 같이 견적합니다.</div>
        <div style="font-size:11pt;color:#c00;">※ 주문제작은 선결제 후 진행됩니다.</div>
      </td>
      <td style="border:none;vertical-align:top;width:56%;">
        <table style="font-size:11pt;">
          <tbody>
            <tr>
              <td style="border:1px solid #999;background:#f5f5f5;text-align:center;padding:3px 4px;" colspan="2">등록번호</td>
              <td style="border:1px solid #999;padding:3px 6px;" colspan="2">${OUR.business_no}</td>
            </tr>
            <tr>
              <td style="border:1px solid #999;background:#f5f5f5;text-align:center;padding:3px 4px;" rowspan="6">발<br>신<br>자</td>
              <td style="border:1px solid #999;background:#f5f5f5;text-align:center;padding:3px 4px;width:52px;">상호</td>
              <td style="border:1px solid #999;padding:3px 5px;">${OUR.nameShort}</td>
              <td style="border:1px solid #999;padding:3px 5px;white-space:nowrap;width:90px;">
                <span style="padding-right:3px;border-right:1px solid #bbb;margin-right:3px;">성명</span>${OUR.ceo}
              </td>
            </tr>
            <tr>
              <td style="border:1px solid #999;background:#f5f5f5;text-align:center;padding:3px 4px;">주소</td>
              <td style="border:1px solid #999;padding:3px 5px;font-size:10pt;" colspan="2">${OUR.address}</td>
            </tr>
            <tr>
              <td style="border:1px solid #999;background:#f5f5f5;text-align:center;padding:3px 4px;">업태</td>
              <td style="border:1px solid #999;padding:3px 5px;">${OUR.bizType}</td>
              <td style="border:1px solid #999;padding:3px 5px;white-space:nowrap;font-size:10pt;">
                <span style="padding-right:3px;border-right:1px solid #bbb;margin-right:3px;">종목</span>${OUR.bizItem}
              </td>
            </tr>
            <tr>
              <td style="border:1px solid #999;background:#f5f5f5;text-align:center;padding:3px 4px;">전화</td>
              <td style="border:1px solid #999;padding:3px 5px;" colspan="2">${OUR.phone}</td>
            </tr>
            <tr>
              <td style="border:1px solid #999;background:#f5f5f5;text-align:center;padding:3px 4px;">카카오</td>
              <td style="border:1px solid #999;padding:3px 5px;font-size:10pt;" colspan="2">${OUR.kakao} | ${OUR.email}</td>
            </tr>
            <tr>
              <td style="border:1px solid #999;background:#f5f5f5;text-align:center;padding:3px 4px;">계좌</td>
              <td style="border:1px solid #999;padding:3px 5px;font-size:10pt;font-weight:bold;" colspan="2">${OUR.bank}</td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>

<!-- 합계금액 -->
<table style="margin-bottom:6px;">
  <tbody>
    <tr>
      <td style="border:1px solid #999;background:#f5f5f5;text-align:center;width:68px;font-size:10pt;padding:3px 4px;white-space:nowrap;">합계금액</td>
      <td style="border:1px solid #999;padding:3px 8px;font-size:13pt;font-weight:bold;">
        금 ${numberToKorean(sumTotal)}원 정 &nbsp;&nbsp; ₩ ${fmt(sumTotal)}
      </td>
      <td style="border:1px solid #999;text-align:center;width:68px;font-size:10pt;color:#555;padding:3px 4px;white-space:nowrap;">부가세 포함</td>
    </tr>
  </tbody>
</table>

<!-- 품목 테이블 -->
<table style="font-size:11pt;margin-bottom:6px;">
  <thead>
    <tr style="background:#f0f0f0;">
      <th style="${ch}width:42%;text-align:left;">품 명</th>
      <th style="${ch}width:10%;">수 량</th>
      <th style="${ch}width:13%;">단 가</th>
      <th style="${ch}width:14%;">공급가</th>
      <th style="${ch}width:10%;">부가세</th>
      <th style="${ch}width:11%;">합 계</th>
    </tr>
  </thead>
  <tbody>
    ${lineRowsHtml}
    ${emptyRowsHtml}
    <tr><td colspan="6" style="${cb}color:#333;">*식품유형 - ${foodType}</td></tr>
    ${cautionsHtml}
    ${memoHtml}
    <tr style="background:#f5f5f5;font-weight:bold;">
      <td colspan="3" style="${cb}text-align:center;">소 계</td>
      <td style="${cb}text-align:right;">${fmt(sumSupply)}</td>
      <td style="${cb}text-align:right;">${fmt(sumVat)}</td>
      <td style="${cb}text-align:right;">${fmt(sumTotal)}</td>
    </tr>
  </tbody>
</table>

<!-- 비고 -->
<div style="font-size:11pt;margin-top:8px;">
  <div style="font-weight:bold;margin-bottom:4px;">[비 고]</div>
  <p style="margin:2px 0;">* 세금계산서 발행시 사업자등록증을 이메일로 보내주세요</p>
  <p style="margin:2px 0;color:#c00;font-weight:bold;">* 주문제작은 선결제입니다.</p>
</div>

<!-- 푸터 -->
<div style="text-align:center;font-size:10pt;color:#555;margin-top:14px;border-top:1px solid #ddd;padding-top:8px;">
  ${OUR.name}(카카오플러스) &nbsp; ${OUR.website} &nbsp; 전화 ${OUR.phone}
</div>

</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
