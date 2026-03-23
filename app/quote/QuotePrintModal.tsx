"use client";

import React, { useRef } from "react";

// ─────────────────────── Types ───────────────────────
type QuotePrintProps = {
  onClose: () => void;
  quoteData: {
    customerName: string;
    quoteDate: string;        // YYYY-MM-DD
    productType: string;      // 예: 전사 1도 (3mm)
    colorType: "dark" | "white"; // 다크 / 화이트
    isRaise: boolean;         // 레이즈 여부
    widthMm: number | null;
    heightMm: number | null;
    thickness: string;        // 예: 3mm
    quantity: number;
    isNew: boolean;
    designChanged: boolean;
    useStockMold: boolean;
    memo: string | null;
    // 계산 결과
    moldCost: number;
    plateCost: number;
    sheetCost: number;
    workFee: number;
    V: number;               // 고객 제시 단가
    V_stock: number | null;
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
      let tmp = chunk, tenIdx = 0;
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
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const dow = days[new Date(ymd).getDay()];
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 ${dow}요일`;
}

// ─────────────────────── Component ───────────────────────
export default function QuotePrintModal({ onClose, quoteData }: QuotePrintProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const {
    customerName, quoteDate, productType, colorType, isRaise,
    widthMm, heightMm, thickness, quantity, isNew,
    designChanged, useStockMold, memo,
    moldCost, plateCost, sheetCost, workFee, V, V_stock,
  } = quoteData;

  // ── 식품유형 ──
  const foodType = (colorType === "dark" && !isRaise)
    ? "준초콜릿"
    : "당류가공품";

  // ── 제품 품명 표시 ──
  // 예: 다크(30×30mm, 두께 3mm) / 화이트(30×30mm, 두께 3mm) / 컬러인쇄(30×30mm, 두께 3mm)
  const sizeStr = widthMm && heightMm ? `${widthMm}×${heightMm}mm, 두께 ${thickness}` : `두께 ${thickness}`;
  const colorLabel = isRaise ? "컬러인쇄" : colorType === "dark" ? "다크" : "화이트";
  const productNameDisplay = `${colorLabel}(${sizeStr})`;

  // ── 주의사항 ──
  const cautions: string[] = [];
  if (isRaise) {
    cautions.push("본 제품은 인쇄면에 물이 묻으면 번지거나 지워질 수 있으니 주의하셔야되고, 특히 냉동,냉장 보관시 결로에 의해 번질 수 있으니 주의하셔야됩니다.");
  }
  cautions.push("27도 이하 건조한 곳에 보관하세요.");

  // ── 품목 행 구성 ──
  type LineItem = { name: string; qty: string; unit: number; supply: number; vat: number; total: number };
  const lineItems: LineItem[] = [];

  if (moldCost > 0) {
    lineItems.push({
      name: "성형틀 (최초 1회)", qty: "1",
      unit: moldCost, supply: moldCost,
      vat: Math.round(moldCost * 0.1),
      total: moldCost + Math.round(moldCost * 0.1),
    });
  }
  if (plateCost > 0) {
    lineItems.push({
      name: "인쇄제판 (최초 1회)", qty: "1",
      unit: plateCost, supply: plateCost,
      vat: Math.round(plateCost * 0.1),
      total: plateCost + Math.round(plateCost * 0.1),
    });
  }
  // 전사지 항목 → 견적서에 숨김 (초콜릿 단가에 포함)
  // workFee도 단가에 포함, 별도 표시 안 함

  // 초콜릿 제작비
  const chocoSupply = V * quantity;
  const chocoVat = Math.round(chocoSupply * 0.1);
  lineItems.push({
    name: productNameDisplay, qty: fmt(quantity) + "개",
    unit: V, supply: chocoSupply,
    vat: chocoVat, total: chocoSupply + chocoVat,
  });

  const sumSupply = lineItems.reduce((a, r) => a + r.supply, 0);
  const sumVat    = lineItems.reduce((a, r) => a + r.vat, 0);
  const sumTotal  = lineItems.reduce((a, r) => a + r.total, 0);

  // 빈 행 (최소 8행)
  const emptyRows = Math.max(0, 8 - lineItems.length);

  // ── 인쇄 ──
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
@page { size: A4 portrait; margin: 15mm 15mm 12mm 15mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9pt; color: #111; background: #fff; }
table { border-collapse: collapse; width: 100%; }
</style>
</head><body>${content.innerHTML}</body></html>`);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
  }

  const cellBase: React.CSSProperties = { border: "1px solid #999", padding: "3px 5px", fontSize: 8.5 };
  const cellHead: React.CSSProperties = { ...cellBase, background: "#f0f0f0", textAlign: "center", fontWeight: "bold" };

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

      {/* 미리보기 */}
      <div className="flex-1 overflow-auto bg-slate-200 p-6">
        <div className="mx-auto bg-white shadow-xl" style={{ width: "210mm", minHeight: "297mm", padding: "15mm 15mm 12mm" }}>
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

            {/* 견적일 + 발신자 */}
            <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 8 }}>
              <tbody>
                <tr>
                  {/* 좌: 견적일, 업체명 */}
                  <td style={{ border: "none", verticalAlign: "top", width: "44%", paddingRight: 10 }}>
                    <div style={{ fontSize: 9, marginBottom: 4 }}>견적일 : {formatDateKorean(quoteDate)}</div>
                    <div style={{ fontSize: 10, marginBottom: 4 }}>
                      업체명 : <strong>{customerName}</strong> &nbsp; 귀중
                    </div>
                    <div style={{ fontSize: 9, color: "#555", marginBottom: 4 }}>아래와 같이 견적합니다.</div>
                    <div style={{ fontSize: 8, color: "#c00" }}>※ 주문제작은 선결제 후 진행됩니다.</div>
                  </td>

                  {/* 우: 발신자 */}
                  <td style={{ border: "none", verticalAlign: "top", width: "56%" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 8.5 }}>
                      <tbody>
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", width: 52, padding: "2px 3px" }}>등록번호</td>
                          <td style={{ border: "1px solid #999", padding: "2px 6px" }} colSpan={3}>{OUR.business_no}</td>
                        </tr>
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "2px 3px" }} rowSpan={4}>
                            발<br/>신<br/>자
                          </td>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", width: 44, padding: "2px 3px" }}>상호</td>
                          <td style={{ border: "1px solid #999", padding: "2px 5px" }}>{OUR.nameShort}</td>
                          <td style={{ border: "1px solid #999", padding: "2px 5px", position: "relative", minWidth: 80 }}>
                            성명 {OUR.ceo}
                            <img src="/stamp.png" alt="" style={{ position: "absolute", right: 2, top: -4, height: 28, opacity: 0.9 }}
                              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "2px 3px" }}>사업장주소</td>
                          <td style={{ border: "1px solid #999", padding: "2px 5px" }} colSpan={2}>{OUR.address}</td>
                        </tr>
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "2px 3px" }}>업 태</td>
                          <td style={{ border: "1px solid #999", padding: "2px 5px" }}>{OUR.bizType}</td>
                          <td style={{ border: "1px solid #999", padding: "2px 5px" }}>종목 {OUR.bizItem}</td>
                        </tr>
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "2px 3px" }}>전화번호</td>
                          <td style={{ border: "1px solid #999", padding: "2px 5px" }} colSpan={2}>{OUR.phone}</td>
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
                  <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", width: 68, fontSize: 9, padding: "3px 4px" }}>합계금액</td>
                  <td style={{ border: "1px solid #999", padding: "3px 8px", fontSize: 10, fontWeight: "bold" }}>
                    금 {numberToKorean(sumTotal)}원 정
                  </td>
                  <td style={{ border: "1px solid #999", textAlign: "right", padding: "3px 8px", fontSize: 10, fontWeight: "bold", width: 110 }}>
                    ( ₩ {fmt(sumTotal)} )
                  </td>
                  <td style={{ border: "1px solid #999", textAlign: "center", width: 72, fontSize: 8, color: "#555", padding: "3px 4px" }}>
                    부가세 포함
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 품목 테이블 — 규격 컬럼 없음 */}
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 8.5, marginBottom: 6 }}>
              <thead>
                <tr style={{ background: "#f0f0f0" }}>
                  <th style={{ ...cellHead, width: "42%", textAlign: "left" }}>품 명</th>
                  <th style={{ ...cellHead, width: "10%" }}>수 량</th>
                  <th style={{ ...cellHead, width: "13%" }}>단 가</th>
                  <th style={{ ...cellHead, width: "14%" }}>공급가</th>
                  <th style={{ ...cellHead, width: "10%" }}>부가세</th>
                  <th style={{ ...cellHead, width: "11%" }}>합 계</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...cellBase }}>{r.name}</td>
                    <td style={{ ...cellBase, textAlign: "center" }}>{r.qty}</td>
                    <td style={{ ...cellBase, textAlign: "right" }}>{fmt(r.unit)}</td>
                    <td style={{ ...cellBase, textAlign: "right" }}>{fmt(r.supply)}</td>
                    <td style={{ ...cellBase, textAlign: "right" }}>{fmt(r.vat)}</td>
                    <td style={{ ...cellBase, textAlign: "right" }}>{fmt(r.total)}</td>
                  </tr>
                ))}

                {/* 빈 행 */}
                {Array.from({ length: emptyRows }).map((_, i) => (
                  <tr key={`e-${i}`} style={{ height: 20 }}>
                    <td style={{ ...cellBase }} /><td style={{ ...cellBase }} />
                    <td style={{ ...cellBase }} /><td style={{ ...cellBase }} />
                    <td style={{ ...cellBase }} /><td style={{ ...cellBase }} />
                  </tr>
                ))}

                {/* 식품유형 */}
                <tr>
                  <td style={{ ...cellBase, color: "#333" }} colSpan={6}>
                    *식품유형 - {foodType}
                  </td>
                </tr>

                {/* 주의사항 */}
                {cautions.map((c, i) => (
                  <tr key={`c-${i}`}>
                    <td style={{ ...cellBase, color: "#555" }} colSpan={6}>*{c}</td>
                  </tr>
                ))}

                {/* 기성 성형틀 사용 시 */}
                {useStockMold && (
                  <tr>
                    <td style={{ ...cellBase, color: "#555" }} colSpan={6}>*기성 성형틀 사용</td>
                  </tr>
                )}

                {/* 디자인 변경 */}
                {designChanged && (
                  <tr>
                    <td style={{ ...cellBase, color: "#555" }} colSpan={6}>*디자인 변경 재주문 (인쇄제판 재발생)</td>
                  </tr>
                )}

                {/* 메모 */}
                {memo && (
                  <tr>
                    <td style={{ ...cellBase, color: "#555" }} colSpan={6}>*{memo}</td>
                  </tr>
                )}

                {/* 소계 */}
                <tr style={{ background: "#f5f5f5", fontWeight: "bold" }}>
                  <td style={{ ...cellBase, textAlign: "center" }} colSpan={3}>소 계</td>
                  <td style={{ ...cellBase, textAlign: "right" }}>{fmt(sumSupply)}</td>
                  <td style={{ ...cellBase, textAlign: "right" }}>{fmt(sumVat)}</td>
                  <td style={{ ...cellBase, textAlign: "right" }}>{fmt(sumTotal)}</td>
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
            <div style={{ textAlign: "center", fontSize: 8, color: "#555", marginTop: 14, borderTop: "1px solid #ddd", paddingTop: 8 }}>
              {OUR.name}(카카오플러스) &nbsp; {OUR.website} &nbsp; 전화 {OUR.phone}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
