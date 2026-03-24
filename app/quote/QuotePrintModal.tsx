"use client";

import React, { useRef } from "react";

// ─────────────────────── Types ───────────────────────
type PrintItem = {
  productType: string;
  colorType: "dark" | "white";
  isRaise: boolean;
  widthMm: number | null;
  heightMm: number | null;
  thickness: string;
  quantity: number;
  isNew: boolean;
  designChanged: boolean;
  useStockMold: boolean;
  moldCost: number;
  plateCost: number;
  V: number;
  manualV: number;
};

type QuotePrintProps = {
  onClose: () => void;
  quoteData: {
    customerName: string;
    quoteDate: string;
    inputMode: "auto" | "manual";
    items: PrintItem[];
    memo: string | null;
    iceboxPrice: number;
    deliveryPrice: number;
    quoteRequestId?: string | null;  // DB 저장된 견적 ID (드라이브 업로드용)
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
  kakao: "cacaoplus",
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
  const [saving, setSaving] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState<string | null>(null);

  const { customerName, quoteDate, inputMode, items, memo, iceboxPrice, deliveryPrice, quoteRequestId } = quoteData;

  // ── 식품유형 (첫 품목 기준) ──
  const firstItem = items[0];
  const foodType = firstItem
    ? (firstItem.colorType === "dark" && !firstItem.isRaise ? "준초콜릿" : "당류가공품")
    : "준초콜릿";

  // ── 주의사항 (첫 품목 기준) ──
  const cautions: string[] = [];
  if (firstItem?.isRaise) {
    cautions.push("본 제품은 인쇄면에 물이 묻으면 번지거나 지워질 수 있으니 주의하셔야되고, 특히 냉동,냉장 보관시 결로에 의해 번질 수 있으니 주의하셔야됩니다.");
  }
  cautions.push("27도 이하 건조한 곳에 보관하세요.");

  // ── 품목 행 구성 ──
  type LineItem = { name: string; qty: string; unit: number; supply: number; vat: number; total: number };
  const lineItems: LineItem[] = [];

  for (const item of items) {
    const colorLabel = item.isRaise ? "컬러인쇄" : item.colorType === "dark" ? "다크" : "화이트";
    const sizeStr = item.widthMm && item.heightMm
      ? `${item.widthMm}×${item.heightMm}mm, 두께 ${item.thickness}`
      : item.thickness ? `두께 ${item.thickness}` : "";
    const productName = sizeStr ? `${colorLabel}(${sizeStr})` : colorLabel;
    const unitPrice = inputMode === "manual" ? item.manualV : item.V;
    if (!unitPrice || !item.quantity) continue;

    const supply = unitPrice * item.quantity;
    const vat = Math.round(supply * 0.1);
    lineItems.push({ name: productName, qty: fmt(item.quantity), unit: unitPrice, supply, vat, total: supply + vat });

    // 성형틀 (moldCost > 0)
    if (item.moldCost > 0) {
      lineItems.push({
        name: "성형틀 (최초 1회)", qty: "1",
        unit: item.moldCost, supply: item.moldCost,
        vat: Math.round(item.moldCost * 0.1),
        total: item.moldCost + Math.round(item.moldCost * 0.1),
      });
    }

    // 인쇄제판 (레이즈 아닌 경우만, plateCost > 0)
    if (item.plateCost > 0 && !item.isRaise) {
      lineItems.push({
        name: "인쇄제판 (최초 1회)", qty: "1",
        unit: item.plateCost, supply: item.plateCost,
        vat: Math.round(item.plateCost * 0.1),
        total: item.plateCost + Math.round(item.plateCost * 0.1),
      });
    }
  }

  // 아이스박스
  if (iceboxPrice > 0) {
    const supply = Math.round(iceboxPrice / 1.1);
    const vat = iceboxPrice - supply;
    lineItems.push({ name: "아이스박스/택배포장(5~10월)", qty: "1", unit: iceboxPrice, supply, vat, total: iceboxPrice });
  }

  // 택배비
  if (deliveryPrice > 0) {
    const supply = Math.round(deliveryPrice / 1.1);
    const vat = deliveryPrice - supply;
    lineItems.push({ name: "택배비", qty: "1", unit: deliveryPrice, supply, vat, total: deliveryPrice });
  }

  const sumSupply = lineItems.reduce((a, r) => a + r.supply, 0);
  const sumVat    = lineItems.reduce((a, r) => a + r.vat, 0);
  const sumTotal  = lineItems.reduce((a, r) => a + r.total, 0);
  const emptyRows = Math.max(0, 8 - lineItems.length);

  // ── 파일명 생성 ──
  function makeFileName(): string {
    const today = quoteDate.replace(/-/g, "");
    const safe = (s: string) => s.replace(/[\\/:*?"<>|×x]/g, "x").replace(/\s+/g, "_").slice(0, 20);
    const first = items[0];
    if (!first) return `${today}-${safe(customerName)}-견적서`;
    const colorLabel = first.isRaise ? "컬러인쇄" : first.colorType === "dark" ? "다크" : "화이트";
    const sizeStr = first.widthMm && first.heightMm ? `${first.widthMm}x${first.heightMm}mm` : "";
    const qty = first.quantity ? `${first.quantity}개` : "";
    return [today, safe(customerName), colorLabel, sizeStr, qty, "견적서"].filter(Boolean).join("-");
  }

  // ── 인쇄 + 드라이브 저장 ──
  async function handlePrintAndSave() {
    doPrint();  // 브라우저 인쇄 즉시 실행

    // 드라이브 업로드 (quoteRequestId가 있을 때만)
    if (quoteRequestId) {
      setSaving(true);
      setSaveMsg("📤 구글 드라이브 저장 중...");
      try {
        const res = await fetch("/api/trigger-quote-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteRequestId,
            fileName: makeFileName(),
          }),
        });
        if (res.ok) {
          setSaveMsg("✅ 드라이브 저장 요청 완료 (1~2분 소요)");
        } else {
          setSaveMsg("⚠️ 드라이브 저장 실패 (인쇄는 완료)");
        }
      } catch {
        setSaveMsg("⚠️ 드라이브 저장 오류 (인쇄는 완료)");
      } finally {
        setSaving(false);
      }
    }
  }

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
body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 11pt; color: #111; background: #fff; }
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

  const cellBase: React.CSSProperties = { border: "1px solid #999", padding: "3px 5px", fontSize: 12.8 };
  const cellHead: React.CSSProperties = { ...cellBase, background: "#f0f0f0", textAlign: "center", fontWeight: "bold" };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
      {/* 상단 버튼 */}
      <div className="flex items-center justify-between bg-slate-800 px-5 py-3 text-white">
        <div className="flex items-center gap-3">
          <div className="font-semibold">견적서 미리보기</div>
          {saveMsg && (
            <span className={`text-xs px-3 py-1 rounded-full ${saveMsg.startsWith("✅") ? "bg-green-700 text-green-100" : saveMsg.startsWith("📤") ? "bg-blue-700 text-blue-100" : "bg-amber-700 text-amber-100"}`}>
              {saveMsg}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrintAndSave} disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold hover:bg-blue-700 disabled:opacity-60">
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
            <div style={{ textAlign: "center", fontSize: 22, fontWeight: "bold", letterSpacing: 8, margin: "8px 0 12px" }}>
              견 적 서
            </div>

            {/* 견적일 + 발신자 */}
            <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 8 }}>
              <tbody>
                <tr>
                  <td style={{ border: "none", verticalAlign: "top", width: "44%", paddingRight: 10 }}>
                    <div style={{ fontSize: 13.5, marginBottom: 4 }}>견적일 : {formatDateKorean(quoteDate)}</div>
                    <div style={{ fontSize: customerName.length > 15 ? 12 : 15, marginBottom: 4 }}>
                      업체명 : <strong>{customerName}</strong> &nbsp; 귀중
                    </div>
                    <div style={{ fontSize: 13.5, color: "#555", marginBottom: 4 }}>아래와 같이 견적합니다.</div>
                    <div style={{ fontSize: 12, color: "#c00" }}>※ 주문제작은 선결제 후 진행됩니다.</div>
                  </td>
                  <td style={{ border: "none", verticalAlign: "top", width: "56%" }}>
                    {/* 발신자 정보: 외부 2열(발신자 | 내용), 내용 열 안에 별도 테이블 */}
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                      <tbody>
                        {/* 등록번호 행 */}
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", width: 52, padding: "3px 4px", fontSize: 10 }}>등록번호</td>
                          <td style={{ border: "1px solid #999", padding: "3px 6px" }} colSpan={3}>{OUR.business_no}</td>
                        </tr>
                        {/* 상호 + 성명 */}
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "3px 4px", fontSize: 10 }} rowSpan={6}>발<br/>신<br/>자</td>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", width: 52, padding: "3px 4px", fontSize: 10 }}>상호</td>
                          <td style={{ border: "1px solid #999", padding: "3px 5px" }}>{OUR.nameShort}</td>
                          <td style={{ border: "1px solid #999", padding: "3px 5px", whiteSpace: "nowrap", width: 90 }}>
                            <span style={{ paddingRight: 3, borderRight: "1px solid #bbb", marginRight: 3, fontSize: 10 }}>성명</span>
                            <span style={{ position: "relative" }}>
                              {OUR.ceo}
                              <img src="/stamp.png" alt="" style={{ position: "absolute", left: "100%", top: -4, marginLeft: -6, height: 24, opacity: 0.9 }}
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            </span>
                          </td>
                        </tr>
                        {/* 사업장주소 */}
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "3px 4px", fontSize: 10 }}>주소</td>
                          <td style={{ border: "1px solid #999", padding: "3px 5px", fontSize: 10 }} colSpan={2}>{OUR.address}</td>
                        </tr>
                        {/* 업태/종목 */}
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "3px 4px", fontSize: 10 }}>업태</td>
                          <td style={{ border: "1px solid #999", padding: "3px 5px" }}>{OUR.bizType}</td>
                          <td style={{ border: "1px solid #999", padding: "3px 5px", whiteSpace: "nowrap", fontSize: 10 }}>
                            <span style={{ paddingRight: 3, borderRight: "1px solid #bbb", marginRight: 3, fontSize: 10 }}>종목</span>
                            {OUR.bizItem}
                          </td>
                        </tr>
                        {/* 전화번호 */}
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "3px 4px", fontSize: 10 }}>전화</td>
                          <td style={{ border: "1px solid #999", padding: "3px 5px" }} colSpan={2}>{OUR.phone}</td>
                        </tr>
                        {/* 카카오/이메일 */}
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "3px 4px", fontSize: 10 }}>카카오</td>
                          <td style={{ border: "1px solid #999", padding: "3px 5px", fontSize: 10 }} colSpan={2}>
                            {OUR.kakao} &nbsp;|&nbsp; {OUR.email}
                          </td>
                        </tr>
                        {/* 입금계좌 */}
                        <tr>
                          <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", padding: "3px 4px", fontSize: 10 }}>계좌</td>
                          <td style={{ border: "1px solid #999", padding: "3px 5px", fontSize: 10, fontWeight: "bold" }} colSpan={2}>{OUR.bank}</td>
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
                  <td style={{ border: "1px solid #999", background: "#f5f5f5", textAlign: "center", width: 68, fontSize: 13.5, padding: "3px 4px", whiteSpace: "nowrap" }}>합계금액</td>
                  <td style={{ border: "1px solid #999", padding: "3px 8px", fontSize: 15, fontWeight: "bold" }}>
                    금 {numberToKorean(sumTotal)}원 정 &nbsp;&nbsp; ₩ {fmt(sumTotal)}
                  </td>
                  <td style={{ border: "1px solid #999", textAlign: "center", width: 68, fontSize: 12, color: "#555", padding: "3px 4px", whiteSpace: "nowrap" }}>
                    부가세 포함
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 품목 테이블 */}
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 16.5, marginBottom: 6 }}>
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
                {Array.from({ length: emptyRows }).map((_, i) => (
                  <tr key={`e-${i}`} style={{ height: 20 }}>
                    {[0,1,2,3,4,5].map(j => <td key={j} style={{ ...cellBase }} />)}
                  </tr>
                ))}

                {/* 식품유형 */}
                <tr>
                  <td style={{ ...cellBase, color: "#333" }} colSpan={6}>*식품유형 - {foodType}</td>
                </tr>

                {/* 주의사항 */}
                {cautions.map((c, i) => (
                  <tr key={`c-${i}`}>
                    <td style={{ ...cellBase, color: "#555" }} colSpan={6}>*{c}</td>
                  </tr>
                ))}

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
            <div style={{ fontSize: 12.8, marginTop: 8 }}>
              <div style={{ fontWeight: "bold", marginBottom: 4 }}>[비 고]</div>
              <p style={{ margin: "2px 0" }}>* 세금계산서 발행시 사업자등록증을 이메일로 보내주세요</p>
              <p style={{ margin: "2px 0", color: "#c00", fontWeight: "bold" }}>* 주문제작은 선결제입니다.</p>
            </div>

            {/* 푸터 */}
            <div style={{ textAlign: "center", fontSize: 12, color: "#555", marginTop: 14, borderTop: "1px solid #ddd", paddingTop: 8 }}>
              {OUR.name}(카카오플러스) &nbsp; {OUR.website} &nbsp; 전화 {OUR.phone}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
