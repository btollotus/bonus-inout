"use client";

import React, { useRef } from "react";

// ─────────────────────── Types ───────────────────────
type QuotePrintProps = {
  onClose: () => void;
  quoteData: {
    // 업체 정보
    customerName: string;
    // 견적 기본 정보
    quoteDate: string;       // YYYY-MM-DD
    productType: string;     // 예: 전사 1도 (3mm)
    widthMm: number | null;
    heightMm: number | null;
    quantity: number;
    isNew: boolean;
    designChanged: boolean;
    useStockMold: boolean;
    shape: string | null;
    memo: string | null;
    // 계산 결과
    unitPrice: number;       // V (고객 제시가)
    moldCost: number;        // 성형틀
    plateCost: number;       // 판비
    sheetCount: number;      // 전사지 장수
    sheetCost: number;       // 전사지 비용
    workFee: number;         // 기본작업비
    totalActual: number;     // 합계 (부가세 별도)
    totalWithVat: number;    // 부가세 포함
    V: number;               // 고객 제시 단가
    V_stock: number | null;  // 기성 성형틀 단가
    // 식품 유형 (제품에서 자동 판별)
    foodType: string;
  };
};

// ─────────────────────── 회사 정보 ───────────────────────
const OUR = {
  name: "주식회사 보누스메이트",
  nameShort: "(주)보누스메이트",
  business_no: "343-88-03009",
  ceo: "조대성",
  address: "경기도 파주시 광탄면 장지산로 250-90 1층",
  bizType: "제조업",
  bizItem: "식품제조가공업",
  phone: "02-356-3380",
  email: "cacaoplus@naver.com",
  bank: "국민은행 024801-04-536001(주식회사 보누스메이트)",
  website: "www.bonusmate.co.kr",
};

// ─────────────────────── Helpers ───────────────────────
const fmt = (n: number) => Number(n ?? 0).toLocaleString("ko-KR");

function numberToKorean(n: number): string {
  if (n === 0) return "영";
  const units = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const tens  = ["", "십", "백", "천"];
  const bigs  = ["", "만", "억", "조"];
  let result = "";
  let bigIdx = 0;
  while (n > 0) {
    const chunk = n % 10000;
    if (chunk !== 0) {
      let chunkStr = "";
      let tmp = chunk;
      let tenIdx = 0;
      while (tmp > 0) {
        const d = tmp % 10;
        if (d !== 0) chunkStr = units[d] + tens[tenIdx] + chunkStr;
        tmp = Math.floor(tmp / 10);
        tenIdx++;
      }
      result = chunkStr + bigs[bigIdx] + result;
    }
    n = Math.floor(n / 10000);
    bigIdx++;
  }
  return result;
}

function formatDateKorean(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const date = new Date(ymd);
  const dow = days[date.getDay()];
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 ${dow}요일`;
}

// ─────────────────────── Component ───────────────────────
export default function QuotePrintModal({ onClose, quoteData }: QuotePrintProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const {
    customerName, quoteDate, productType, widthMm, heightMm,
    quantity, isNew, designChanged, useStockMold, shape, memo,
    unitPrice, moldCost, plateCost, sheetCount, sheetCost,
    workFee, totalActual, totalWithVat, V, V_stock, foodType,
  } = quoteData;

  // 품목 테이블 행 구성
  const lineItems: { name: string; spec: string; qty: string; unit: number; supply: number; vat: number; total: number }[] = [];

  // 성형틀
  if (moldCost > 0) {
    lineItems.push({
      name: "성형틀 제작비", spec: widthMm && heightMm ? `${widthMm}×${heightMm}mm` : "",
      qty: "식", unit: moldCost, supply: moldCost,
      vat: Math.round(moldCost * 0.1), total: Math.round(moldCost * 1.1),
    });
  }
  // 판비
  if (plateCost > 0) {
    lineItems.push({
      name: "인쇄제판비", spec: "",
      qty: "식", unit: plateCost, supply: plateCost,
      vat: Math.round(plateCost * 0.1), total: Math.round(plateCost * 1.1),
    });
  }
  // 전사지
  if (sheetCost > 0) {
    lineItems.push({
      name: "전사지", spec: `${sheetCount}장`,
      qty: "식", unit: sheetCost, supply: sheetCost,
      vat: Math.round(sheetCost * 0.1), total: Math.round(sheetCost * 1.1),
    });
  }
  // 기본작업비
  if (workFee > 0) {
    lineItems.push({
      name: "기본작업비", spec: "",
      qty: "식", unit: workFee, supply: workFee,
      vat: Math.round(workFee * 0.1), total: Math.round(workFee * 1.1),
    });
  }
  // 초콜릿 제품 본체
  const productSpec = [
    widthMm && heightMm ? `${widthMm}×${heightMm}mm` : "",
    shape ?? "",
    productType,
  ].filter(Boolean).join(" / ");

  lineItems.push({
    name: "초콜릿 제작비",
    spec: productSpec,
    qty: fmt(quantity) + "개",
    unit: V,
    supply: V * quantity,
    vat: Math.round(V * quantity * 0.1),
    total: Math.round(V * quantity * 1.1),
  });

  // 합계
  const sumSupply = lineItems.reduce((a, r) => a + r.supply, 0);
  const sumVat    = lineItems.reduce((a, r) => a + r.vat, 0);
  const sumTotal  = lineItems.reduce((a, r) => a + r.total, 0);

  // 빈 행 (최소 8행 채우기)
  const emptyRows = Math.max(0, 8 - lineItems.length);

  function doPrint() {
    const content = printRef.current;
    if (!content) return;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:none;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9pt; color: #111; background: #fff; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #999; padding: 3px 5px; }
.no-border td, .no-border th { border: none; }
.title { text-align: center; font-size: 18pt; font-weight: bold; letter-spacing: 8px; margin: 8px 0 12px; }
.logo-wrap { text-align: center; margin-bottom: 4px; }
.logo-wrap img { height: 36px; }
.sum-kor { font-size: 10pt; font-weight: bold; }
.red { color: #c00; font-size: 8pt; }
.footer { margin-top: 8px; font-size: 8pt; color: #333; }
.footer p { margin: 2px 0; }
.company-footer { text-align: center; font-size: 8pt; margin-top: 12px; color: #555; }
</style>
</head><body>${content.innerHTML}
</body></html>`);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
  }

  // td 스타일
  const tdC = "border border-slate-400 px-1 py-0.5 text-center text-xs";
  const tdL = "border border-slate-400 px-1 py-0.5 text-left text-xs";
  const tdR = "border border-slate-400 px-1 py-0.5 text-right text-xs tabular-nums";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
      {/* 상단 버튼 */}
      <div className="flex items-center justify-between bg-slate-800 px-5 py-3 text-white">
        <div className="font-semibold">견적서 미리보기</div>
        <div className="flex gap-2">
          <button onClick={doPrint}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold hover:bg-blue-700">
            🖨️ 인쇄 / PDF 저장
          </button>
          <button onClick={onClose}
            className="rounded-xl bg-slate-600 px-4 py-2 text-sm hover:bg-slate-500">
            닫기
          </button>
        </div>
      </div>

      {/* 미리보기 영역 */}
      <div className="flex-1 overflow-auto bg-slate-200 p-6">
        <div className="mx-auto bg-white shadow-xl" style={{ width: "210mm", minHeight: "297mm", padding: "15mm" }}>
          <div ref={printRef}>

            {/* 로고 */}
            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <img src="/bonusmate-logo.png" alt="BONUSMATE" style={{ height: 40 }}
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>

            {/* 제목 */}
            <div style={{ textAlign: "center", fontSize: 20, fontWeight: "bold", letterSpacing: 8, margin: "8px 0 12px" }}>
              견 적 서
            </div>

            {/* 견적일 + 발신자 테이블 */}
            <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 8 }}>
              <tbody>
                <tr>
                  {/* 좌: 견적일, 업체명 */}
                  <td style={{ border: "none", verticalAlign: "top", width: "45%", paddingRight: 8 }}>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <tbody>
                        <tr>
                          <td style={{ border: "none", fontSize: 9, paddingBottom: 4 }}>
                            견적일 : {formatDateKorean(quoteDate)}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ border: "none", fontSize: 10, paddingBottom: 4 }}>
                            업체명 : <strong>{customerName}</strong> &nbsp; 귀중
                          </td>
                        </tr>
                        <tr>
                          <td style={{ border: "none", fontSize: 9, color: "#555", paddingTop: 4 }}>
                            아래와 같이 견적합니다.
                          </td>
                        </tr>
                        {!isNew && (
                          <tr>
                            <td style={{ border: "none", fontSize: 8, color: "#c00", paddingTop: 4 }}>
                              ※ 주문제작은 선결제 후 진행됩니다.
                            </td>
                          </tr>
                        )}
                        {isNew && (
                          <tr>
                            <td style={{ border: "none", fontSize: 8, color: "#c00", paddingTop: 4 }}>
                              ※ 주문제작은 선결제 후 진행됩니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </td>

                  {/* 우: 발신자 정보 */}
                  <td style={{ border: "none", verticalAlign: "top", width: "55%" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 8.5 }}>
                      <tbody>
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", width: 56, padding: "2px 4px" }}>등록번호</td>
                          <td style={{ border: "1px solid #999", padding: "2px 6px" }} colSpan={3}>{OUR.business_no}</td>
                        </tr>
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "2px 4px" }} rowSpan={4}>발<br/>신<br/>자</td>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", width: 48, padding: "2px 4px" }}>상호</td>
                          <td style={{ border: "1px solid #999", padding: "2px 6px" }}>{OUR.nameShort}</td>
                          <td style={{ border: "1px solid #999", padding: "2px 6px", position: "relative" }}>
                            성명 {OUR.ceo}
                            <img src="/stamp.png" alt="" style={{ position: "absolute", right: 2, top: -4, height: 28, opacity: 0.9 }}
                              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "2px 4px" }}>사업장주소</td>
                          <td style={{ border: "1px solid #999", padding: "2px 6px" }} colSpan={2}>{OUR.address}</td>
                        </tr>
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "2px 4px" }}>업 태</td>
                          <td style={{ border: "1px solid #999", padding: "2px 6px" }}>{OUR.bizType}</td>
                          <td style={{ border: "1px solid #999", padding: "2px 6px" }}>종목 {OUR.bizItem}</td>
                        </tr>
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "2px 4px" }}>전화번호</td>
                          <td style={{ border: "1px solid #999", padding: "2px 6px" }} colSpan={2}>{OUR.phone}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 합계금액 */}
            <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 6 }}>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", width: 72, fontSize: 9, padding: "3px 4px" }}>합계금액</td>
                  <td style={{ border: "1px solid #999", padding: "3px 8px", fontSize: 10, fontWeight: "bold" }}>
                    금 {numberToKorean(sumTotal)}원 정
                  </td>
                  <td style={{ border: "1px solid #999", textAlign: "right", padding: "3px 8px", fontSize: 10, fontWeight: "bold", width: 120 }}>
                    ( ₩ {fmt(sumTotal)} )
                  </td>
                  <td style={{ border: "1px solid #999", textAlign: "center", width: 80, fontSize: 8.5, color: "#555", padding: "3px 4px" }}>
                    부가세 포함
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 품목 테이블 */}
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 8.5, marginBottom: 6 }}>
              <thead>
                <tr style={{ background: "#f0f0f0" }}>
                  <th style={{ border: "1px solid #999", textAlign: "center", padding: "3px", width: "30%" }}>품 명</th>
                  <th style={{ border: "1px solid #999", textAlign: "center", padding: "3px", width: "18%" }}>규 격</th>
                  <th style={{ border: "1px solid #999", textAlign: "center", padding: "3px", width: "8%" }}>수 량</th>
                  <th style={{ border: "1px solid #999", textAlign: "center", padding: "3px", width: "11%" }}>단 가</th>
                  <th style={{ border: "1px solid #999", textAlign: "center", padding: "3px", width: "13%" }}>공급가</th>
                  <th style={{ border: "1px solid #999", textAlign: "center", padding: "3px", width: "9%" }}>부가세</th>
                  <th style={{ border: "1px solid #999", textAlign: "center", padding: "3px", width: "11%" }}>합 계</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((r, i) => (
                  <tr key={i}>
                    <td style={{ border: "1px solid #999", padding: "3px 5px" }}>{r.name}</td>
                    <td style={{ border: "1px solid #999", padding: "3px 5px", textAlign: "center" }}>{r.spec}</td>
                    <td style={{ border: "1px solid #999", padding: "3px 5px", textAlign: "center" }}>{r.qty}</td>
                    <td style={{ border: "1px solid #999", padding: "3px 5px", textAlign: "right" }}>{fmt(r.unit)}</td>
                    <td style={{ border: "1px solid #999", padding: "3px 5px", textAlign: "right" }}>{fmt(r.supply)}</td>
                    <td style={{ border: "1px solid #999", padding: "3px 5px", textAlign: "right" }}>{fmt(r.vat)}</td>
                    <td style={{ border: "1px solid #999", padding: "3px 5px", textAlign: "right" }}>{fmt(r.total)}</td>
                  </tr>
                ))}
                {/* 빈 행 */}
                {Array.from({ length: emptyRows }).map((_, i) => (
                  <tr key={`empty-${i}`} style={{ height: 20 }}>
                    <td style={{ border: "1px solid #999" }} />
                    <td style={{ border: "1px solid #999" }} />
                    <td style={{ border: "1px solid #999" }} />
                    <td style={{ border: "1px solid #999" }} />
                    <td style={{ border: "1px solid #999" }} />
                    <td style={{ border: "1px solid #999" }} />
                    <td style={{ border: "1px solid #999" }} />
                  </tr>
                ))}

                {/* 식품유형 / 주의사항 행 */}
                <tr>
                  <td style={{ border: "1px solid #999", padding: "3px 5px", fontSize: 8, color: "#333" }} colSpan={7}>
                    *식품유형-{foodType}
                  </td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #999", padding: "3px 5px", fontSize: 8, color: "#555" }} colSpan={7}>
                    *본 제품은 인쇄면에 물이 묻으면 번지거나 지워질 수 있으니 주의하세야되고,
                  </td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #999", padding: "3px 5px", fontSize: 8, color: "#555" }} colSpan={7}>
                    *특히 냉동,냉장 보관시 결로에 의한 번짐 주의하세요.
                  </td>
                </tr>
                {useStockMold && (
                  <tr>
                    <td style={{ border: "1px solid #999", padding: "3px 5px", fontSize: 8, color: "#555" }} colSpan={7}>
                      *기성 성형틀 사용
                    </td>
                  </tr>
                )}
                {designChanged && (
                  <tr>
                    <td style={{ border: "1px solid #999", padding: "3px 5px", fontSize: 8, color: "#555" }} colSpan={7}>
                      *디자인 변경 재주문 (인쇄제판비 발생)
                    </td>
                  </tr>
                )}
                {memo && (
                  <tr>
                    <td style={{ border: "1px solid #999", padding: "3px 5px", fontSize: 8, color: "#555" }} colSpan={7}>
                      *{memo}
                    </td>
                  </tr>
                )}

                {/* 소계 행 */}
                <tr style={{ background: "#f5f5f5", fontWeight: "bold" }}>
                  <td style={{ border: "1px solid #999", textAlign: "center", padding: "3px 5px", fontSize: 9 }} colSpan={4}>소 계</td>
                  <td style={{ border: "1px solid #999", textAlign: "right", padding: "3px 5px" }}>{fmt(sumSupply)}</td>
                  <td style={{ border: "1px solid #999", textAlign: "right", padding: "3px 5px" }}>{fmt(sumVat)}</td>
                  <td style={{ border: "1px solid #999", textAlign: "right", padding: "3px 5px" }}>{fmt(sumTotal)}</td>
                </tr>
              </tbody>
            </table>

            {/* 비고 */}
            <div style={{ fontSize: 8.5, marginTop: 8 }}>
              <div style={{ fontWeight: "bold", marginBottom: 4 }}>[비 고]</div>
              <p style={{ margin: "2px 0" }}>* 세금계산서 발행시 사업자등록증을 이메일로 보내주세요</p>
              <p style={{ margin: "2px 0" }}>* e-mail : {OUR.email}</p>
              <p style={{ margin: "2px 0" }}>* 계좌 : {OUR.bank}</p>
              <p style={{ margin: "2px 0", color: "#c00", fontWeight: "bold" }}>* 주문제작은 선결제입니다.</p>
              {V_stock && (
                <p style={{ margin: "2px 0", color: "#555" }}>
                  * 기성 성형틀 적용 시 단가: {fmt(V_stock)}원/개
                </p>
              )}
            </div>

            {/* 푸터 */}
            <div style={{ textAlign: "center", fontSize: 8, color: "#555", marginTop: 16, borderTop: "1px solid #ddd", paddingTop: 8 }}>
              {OUR.name}(카카오플러스) &nbsp; {OUR.website} &nbsp; 전화 {OUR.phone}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
