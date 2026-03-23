"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/browser";
import QuotePrintModal from "./QuotePrintModal";

// ─────────────────────── Types ───────────────────────
type Tab = "input" | "list" | "sheet";

type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
};

type QuoteRequestRow = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  request_type: string;
  product_type: string | null;
  width_mm: number | null;
  height_mm: number | null;
  quantity: number | null;
  is_new: boolean;
  design_changed: boolean;
  use_stock_mold: boolean;
  reuse_existing_mold: boolean;
  mold_qty: number;
  shape: string | null;
  memo: string | null;
  status: string;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
  quotes?: QuoteRow[];
};

type QuoteRow = {
  id: string;
  request_id: string;
  unit_price: number | null;
  mold_cost: number | null;
  plate_cost: number | null;
  transfer_sheets: number | null;
  transfer_cost: number | null;
  work_fee: number | null;
  packaging_cost: number | null;
  delivery_cost: number | null;
  total: number | null;
  t_price: number | null;
  u_price: number | null;
  final_price: number | null;
  final_price_stock: number | null;
  notes: string | null;
  created_at: string;
};

// ─────────────────────── 제품 파라미터 ───────────────────────
const PRODUCT_TYPES = [
  { key: "전사2mm",  label: "전사 1도 (2mm)" },
  { key: "전사3mm",  label: "전사 1도 (3mm)" },
  { key: "전사5mm",  label: "전사 1도 (5mm)" },
  { key: "레이즈2mm", label: "레이즈 (2mm)" },
  { key: "레이즈3mm", label: "레이즈 (3mm)" },
  { key: "레이즈5mm", label: "레이즈 (5mm)" },
  { key: "도눔1000이상",      label: "도눔 50×35 1천개↑" },
  { key: "도눔1000미만",      label: "도눔 50×35 1천개↓" },
  { key: "도눔1000이상인쇄",  label: "도눔 50×35 1천개↑+인쇄" },
  { key: "도눔1000미만인쇄",  label: "도눔 50×35 1천개↓+인쇄" },
  { key: "도눔별도1000이상",      label: "도눔 별도 1천개↑" },
  { key: "도눔별도1000미만",      label: "도눔 별도 1천개↓" },
  { key: "도눔별도1000이상인쇄",  label: "도눔 별도 1천개↑+인쇄" },
  { key: "도눔별도1000미만인쇄",  label: "도눔 별도 1천개↓+인쇄" },
  { key: "롤리팝1도55", label: "롤리팝 1도 55mm" },
  { key: "롤리팝2도55", label: "롤리팝 2도 55mm" },
  { key: "입체초콜릿",  label: "입체초콜릿 (수동)" },
];

const SHAPES = ["정사각형", "직사각형", "원형", "타원형", "기타"];
const LOST_REASONS = ["예산초과", "납기불가", "내부결재거절", "무응답", "기타"];
const STATUS_LIST = ["견적완료", "수주", "미수주"];

const STATUS_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  견적완료: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  수주:     { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  미수주:   { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
};

// ─────────────────────── Helpers ───────────────────────
const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("ko-KR");
const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

// ─────────────────────── Main Component ───────────────────────
export default function QuoteClient() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("input");
  const [msg, setMsg] = useState<string | null>(null);

  // 거래처 — 직접입력 or 기존 거래처 선택
  const [partnerMode, setPartnerMode] = useState<"direct" | "select">("direct");
  const [customerName, setCustomerName] = useState("");        // 직접 입력
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [partnerFilter, setPartnerFilter] = useState("");
  const [selectedPartner, setSelectedPartner] = useState<PartnerRow | null>(null);

  // 현재 유효한 업체명 (직접입력 or 선택된 거래처)
  const activeCustomerName = partnerMode === "direct"
    ? customerName.trim()
    : selectedPartner?.name ?? "";
  const activeCustomerId = partnerMode === "select"
    ? selectedPartner?.id ?? null
    : null;

  // 견적 입력 폼
  const [requestType, setRequestType] = useState<"product" | "sheet">("product");
  const [productType, setProductType] = useState("전사3mm");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [quantity, setQuantity] = useState("");
  const [isNew, setIsNew] = useState(true);
  const [designChanged, setDesignChanged] = useState(false);
  const [useStockMold, setUseStockMold] = useState(false);
  const [reuseExistingMold, setReuseExistingMold] = useState(false);
  const [moldQty, setMoldQty] = useState("1");
  const [shape, setShape] = useState("정사각형");
  const [memo, setMemo] = useState("");

  // 계산 결과
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // 견적 목록
  const [quoteList, setQuoteList] = useState<QuoteRequestRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("전체");
  const [listSearch, setListSearch] = useState("");

  // 전사지 견적 폼
  const [sheetCount, setSheetCount] = useState("5");
  const [sheetIsNew, setSheetIsNew] = useState(true);
  const [sheetCalcResult, setSheetCalcResult] = useState<any>(null);
  const [sheetList, setSheetList] = useState<QuoteRequestRow[]>([]);

  // 스타일
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn = "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700";
  const pill = "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";

  // ─── 거래처 로드 ───
  async function loadPartners() {
    let q = supabase.from("partners").select("id,name,business_no")
      .order("name", { ascending: true }).limit(500);
    if (partnerFilter.trim()) q = q.ilike("name", `%${partnerFilter.trim()}%`);
    const { data } = await q;
    setPartners((data ?? []) as PartnerRow[]);
  }

  // ─── 견적 목록 로드 ───
  async function loadQuoteList() {
    setListLoading(true);
    try {
      let q = supabase.from("quote_requests")
        .select("*,quotes(*)")
        .eq("request_type", "product")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "전체") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) return setMsg(error.message);
      setQuoteList((data ?? []) as QuoteRequestRow[]);
    } finally { setListLoading(false); }
  }

  // ─── 전사지 목록 로드 ───
  async function loadSheetList() {
    const { data } = await supabase.from("quote_requests")
      .select("*,quotes(*)")
      .eq("request_type", "sheet")
      .order("created_at", { ascending: false })
      .limit(100);
    setSheetList((data ?? []) as QuoteRequestRow[]);
  }

  useEffect(() => { loadPartners(); }, [partnerFilter]);
  useEffect(() => { if (tab === "list") loadQuoteList(); }, [tab, statusFilter]);
  useEffect(() => { if (tab === "sheet") loadSheetList(); }, [tab]);

  // ─── 계산 (API 호출) ───
  async function handleCalc() {
    if (!activeCustomerName) return setMsg("업체명을 입력하거나 거래처를 선택하세요.");
    if (!isFixed && (!widthMm || !heightMm)) return setMsg("크기를 입력하세요.");
    if (!quantity) return setMsg("수량을 입력하세요.");
    setCalcLoading(true); setCalcResult(null);
    try {
      const res = await fetch("/api/quote/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKey: productType,
          width: parseFloat(widthMm),
          height: parseFloat(heightMm),
          quantity: parseInt(quantity),
          isNew, designChanged, useStockMold, reuseExistingMold,
          moldQty: parseInt(moldQty) || 1,
        }),
      });
      const data = await res.json();
      if (data.error) return setMsg(data.error);
      setCalcResult(data);
    } catch (e: any) {
      setMsg(e.message);
    } finally { setCalcLoading(false); }
  }

  // ─── 전사지 계산 ───
  async function handleSheetCalc() {
    const sheets = Math.max(5, parseInt(sheetCount) || 5);
    const plateCost = sheetIsNew ? 95000 : 0;
    const sheetCost = sheets * 3000;
    const supplyPrice = plateCost + sheetCost;
    const delivery = supplyPrice < 50000 ? 3300 : 0;
    const total = supplyPrice + delivery;
    setSheetCalcResult({ sheets, plateCost, sheetCost, supplyPrice, delivery, total, totalWithVat: Math.round(total * 1.1) });
  }

  // ─── 견적 저장 ───
  async function handleSave() {
    if (!activeCustomerName) return setMsg("업체명을 입력하거나 거래처를 선택하세요.");
    if (!calcResult) return setMsg("먼저 계산을 실행하세요.");
    setMsg(null);
    const { data: req, error: reqErr } = await supabase.from("quote_requests").insert({
      customer_id: activeCustomerId,
      customer_name: activeCustomerName,
      request_type: "product",
      product_type: productType,
      width_mm: parseFloat(widthMm) || null,
      height_mm: parseFloat(heightMm) || null,
      quantity: parseInt(quantity) || null,
      is_new: isNew,
      design_changed: designChanged,
      use_stock_mold: useStockMold,
      reuse_existing_mold: reuseExistingMold,
      mold_qty: parseInt(moldQty) || 1,
      shape, memo: memo || null,
      status: "견적완료",
    }).select("id").single();
    if (reqErr) return setMsg(reqErr.message);

    const { error: quoteErr } = await supabase.from("quotes").insert({
      request_id: req.id,
      unit_price: calcResult.unitPrice,
      mold_cost: calcResult.moldCost,
      plate_cost: calcResult.plateCost,
      transfer_sheets: calcResult.sheetCount,
      transfer_cost: calcResult.sheetCost,
      work_fee: calcResult.workFee,
      packaging_cost: calcResult.packaging,
      total: calcResult.totalActual,
      t_price: calcResult.T,
      u_price: calcResult.U,
      final_price: calcResult.V,
      final_price_stock: calcResult.V_stock,
    });
    if (quoteErr) return setMsg(quoteErr.message);
    setMsg("✅ 견적이 저장됐어요!");
    resetForm();
  }

  // ─── 전사지 견적 저장 ───
  async function handleSheetSave() {
    if (!activeCustomerName) return setMsg("업체명을 입력하거나 거래처를 선택하세요.");
    if (!sheetCalcResult) return setMsg("먼저 계산을 실행하세요.");
    const { data: req, error: reqErr } = await supabase.from("quote_requests").insert({
      customer_id: activeCustomerId,
      customer_name: activeCustomerName,
      request_type: "sheet",
      quantity: sheetCalcResult.sheets,
      is_new: sheetIsNew,
      memo: memo || null,
      status: "견적완료",
    }).select("id").single();
    if (reqErr) return setMsg(reqErr.message);

    const { error: quoteErr } = await supabase.from("quotes").insert({
      request_id: req.id,
      plate_cost: sheetCalcResult.plateCost,
      transfer_sheets: sheetCalcResult.sheets,
      transfer_cost: sheetCalcResult.sheetCost,
      delivery_cost: sheetCalcResult.delivery,
      total: sheetCalcResult.total,
    });
    if (quoteErr) return setMsg(quoteErr.message);
    setMsg("✅ 전사지 견적이 저장됐어요!");
    setSheetCalcResult(null); setSheetCount("5"); setSheetIsNew(true);
    loadSheetList();
  }

  // ─── 상태 변경 ───
  async function updateStatus(id: string, status: string, lostReason?: string) {
    const { error } = await supabase.from("quote_requests")
      .update({ status, lost_reason: lostReason ?? null })
      .eq("id", id);
    if (error) return setMsg(error.message);
    loadQuoteList();
  }

  function resetForm() {
    setWidthMm(""); setHeightMm(""); setQuantity(""); setMemo("");
    setIsNew(true); setDesignChanged(false); setUseStockMold(false);
    setReuseExistingMold(false); setMoldQty("1"); setCalcResult(null);
  }

  const filteredList = quoteList.filter(r => {
    if (!listSearch.trim()) return true;
    const q = listSearch.toLowerCase();
    return r.customer_name.toLowerCase().includes(q) ||
      (r.product_type ?? "").toLowerCase().includes(q) ||
      (r.memo ?? "").toLowerCase().includes(q);
  });

  // 도눔 고정사이즈 여부
  const isFixed = productType.startsWith("도눔1000") && !productType.includes("별도");
  const isManual = productType === "입체초콜릿";

  // 식품유형 자동 판별
  function getFoodType(pt: string): string {
    if (pt.startsWith("레이즈")) return "당류가공품";
    if (pt.startsWith("전사") || pt.startsWith("도눔") || pt.startsWith("롤리팝")) return "준초콜릿 / 당류가공품";
    return "준초콜릿";
  }

  // 견적서 인쇄 모달
  const [printOpen, setPrintOpen] = useState(false);

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6">

        {/* 알림 */}
        {msg && (
          <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${msg.startsWith("✅") ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {msg}
            <button className="ml-3 text-xs underline opacity-70" onClick={() => setMsg(null)}>닫기</button>
          </div>
        )}

        {/* 탭 */}
        <div className="mb-6 flex gap-2">
          {([
            { key: "input", label: "📋 견적 입력" },
            { key: "list",  label: "📑 견적 목록" },
            { key: "sheet", label: "📄 전사지 견적" },
          ] as { key: Tab; label: string }[]).map(t => (
            <button key={t.key} className={tab === t.key ? btnOn : btn} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ───────────── 탭 1: 견적 입력 ───────────── */}
        {tab === "input" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">

            {/* 거래처 선택 */}
            <div className={`${card} p-4`}>
              <div className="mb-3 text-lg font-semibold">업체 선택</div>

              {/* 모드 토글 */}
              <div className="mb-3 flex gap-2">
                <button
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${partnerMode === "direct" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => { setPartnerMode("direct"); setSelectedPartner(null); }}>
                  ✏️ 직접 입력
                </button>
                <button
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${partnerMode === "select" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => { setPartnerMode("select"); setCustomerName(""); }}>
                  🔍 기존 거래처
                </button>
              </div>

              {/* 직접 입력 모드 */}
              {partnerMode === "direct" && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-600">업체명</div>
                  <input className={inp} placeholder="예: 아난티앳강남" value={customerName}
                    onChange={e => setCustomerName(e.target.value)} />
                  <div className="mt-2 text-xs text-slate-400">
                    신규 문의 업체는 업체명만 입력하세요.<br/>수주 확정 후 거래처 등록을 권장해요.
                  </div>
                </div>
              )}

              {/* 기존 거래처 선택 모드 */}
              {partnerMode === "select" && (
                <div>
                  <input className={`${inp} mb-2`} placeholder="업체명 검색" value={partnerFilter}
                    onChange={e => setPartnerFilter(e.target.value)} />
                  {selectedPartner && (
                    <div className="mb-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                      ✓ {selectedPartner.name}
                    </div>
                  )}
                  <div className="max-h-[320px] space-y-1 overflow-y-auto">
                    {partners.map(p => (
                      <button key={p.id}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedPartner?.id === p.id ? "border-blue-300 bg-blue-50 font-semibold" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                        onClick={() => setSelectedPartner(p)}>
                        <div className="font-semibold">{p.name}</div>
                        {p.business_no && <div className="text-xs text-slate-500">{p.business_no}</div>}
                      </button>
                    ))}
                  </div>
                  {selectedPartner && (
                    <button className={`${btn} mt-2 w-full`} onClick={() => setSelectedPartner(null)}>선택 해제</button>
                  )}
                </div>
              )}

              {/* 현재 선택된 업체 표시 */}
              {activeCustomerName && (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                  📋 {activeCustomerName}
                  {activeCustomerId && <span className="ml-1 text-xs font-normal text-green-600">(등록된 거래처)</span>}
                </div>
              )}
            </div>

            {/* 견적 입력 폼 */}
            <div className="space-y-4">
              <div className={`${card} p-4`}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-lg font-semibold">견적 입력</div>
                  {activeCustomerName && <span className={pill}>{activeCustomerName}</span>}
                </div>

                {/* 제품 선택 */}
                <div className="mb-4">
                  <div className="mb-1 text-xs font-semibold text-slate-600">제품 종류</div>
                  <select className={inp} value={productType} onChange={e => { setProductType(e.target.value); setCalcResult(null); }}>
                    {PRODUCT_TYPES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>

                {isManual && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    ⚠️ 입체초콜릿은 수동 계산 제품입니다. 메모에 내용을 기록하고 저장하세요.
                  </div>
                )}

                {!isManual && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* 크기 */}
                    {isFixed ? (
                      <div className="md:col-span-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                          📐 크기 고정: 50 × 35mm
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="mb-1 text-xs font-semibold text-slate-600">가로 (mm)</div>
                          <input className={inp} inputMode="decimal" placeholder="예: 30" value={widthMm}
                            onChange={e => { setWidthMm(e.target.value); setCalcResult(null); }} />
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-semibold text-slate-600">세로 (mm)</div>
                          <input className={inp} inputMode="decimal" placeholder="예: 30" value={heightMm}
                            onChange={e => { setHeightMm(e.target.value); setCalcResult(null); }} />
                        </div>
                      </>
                    )}

                    {/* 수량 */}
                    <div>
                      <div className="mb-1 text-xs font-semibold text-slate-600">수량 (개)</div>
                      <input className={inp} inputMode="numeric" placeholder="예: 1000" value={quantity}
                        onChange={e => { setQuantity(e.target.value); setCalcResult(null); }} />
                    </div>

                    {/* 모양 */}
                    <div>
                      <div className="mb-1 text-xs font-semibold text-slate-600">모양</div>
                      <select className={inp} value={shape} onChange={e => setShape(e.target.value)}>
                        {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* 성형틀 수량 */}
                    <div>
                      <div className="mb-1 text-xs font-semibold text-slate-600">성형틀 수량</div>
                      <select className={inp} value={moldQty} onChange={e => { setMoldQty(e.target.value); setCalcResult(null); }}>
                        {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}개</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* 옵션 */}
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 text-sm font-semibold">주문 옵션</div>
                  <div className="flex flex-wrap gap-3">
                    {/* 신규/재주문 */}
                    <button type="button"
                      onClick={() => { setIsNew(v => !v); setDesignChanged(false); setCalcResult(null); }}
                      style={{ padding: "4px 14px", borderRadius: 10, fontSize: 12, fontWeight: "bold", cursor: "pointer", border: "none",
                        background: isNew ? "#dbeafe" : "#fef3c7", color: isNew ? "#1d4ed8" : "#b45309",
                        outline: `1px solid ${isNew ? "#93c5fd" : "#fcd34d"}` }}>
                      {isNew ? "신규" : "재주문"}
                    </button>

                    {/* 디자인 변경 (재주문 시만) */}
                    {!isNew && (
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={designChanged}
                          onChange={e => { setDesignChanged(e.target.checked); setCalcResult(null); }} />
                        <span className="font-semibold text-orange-700">디자인 변경 (판비 발생)</span>
                      </label>
                    )}

                    {/* 기성 성형틀 */}
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={useStockMold}
                        onChange={e => { setUseStockMold(e.target.checked); if (e.target.checked) setReuseExistingMold(false); setCalcResult(null); }} />
                      <span className="font-semibold text-purple-700">기성 성형틀 사용 (+20%)</span>
                    </label>

                    {/* 타 제품 성형틀 재사용 */}
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={reuseExistingMold}
                        onChange={e => { setReuseExistingMold(e.target.checked); if (e.target.checked) setUseStockMold(false); setCalcResult(null); }} />
                      <span className="font-semibold text-teal-700">기존 성형틀 재사용 (K 면제)</span>
                    </label>
                  </div>
                </div>

                {/* 메모 */}
                <div className="mt-4">
                  <div className="mb-1 text-xs font-semibold text-slate-600">메모</div>
                  <textarea className={`${inp} resize-none`} rows={2} placeholder="기타 요청사항" value={memo}
                    onChange={e => setMemo(e.target.value)} />
                </div>

                {/* 계산 버튼 */}
                {!isManual && (
                  <div className="mt-4 flex gap-2">
                    <button className={`${btnOn} flex-1`} onClick={handleCalc} disabled={calcLoading}>
                      {calcLoading ? "계산 중..." : "🔢 자동 계산"}
                    </button>
                    <button className={btn} onClick={resetForm}>초기화</button>
                  </div>
                )}
              </div>

              {/* 계산 결과 */}
              {calcResult && (
                <div className={`${card} p-4`}>
                  <div className="mb-3 text-lg font-semibold">계산 결과</div>
                  <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                    {[
                      { label: "단가 (I)", value: fmt(calcResult.unitPrice)+"원" },
                      { label: "전사지", value: `${calcResult.sheetCount}장 / ${fmt(calcResult.sheetCost)}원` },
                      { label: "성형틀 (K)", value: fmt(calcResult.moldCost)+"원" },
                      { label: "판비 (L)", value: fmt(calcResult.plateCost)+"원" },
                      { label: "기본작업비", value: fmt(calcResult.workFee)+"원" },
                      { label: "합계 (S)", value: fmt(calcResult.totalActual)+"원" },
                      { label: "부가세 포함", value: fmt(calcResult.totalWithVat)+"원" },
                      { label: "T / U", value: `${fmt(calcResult.T)} / ${fmt(calcResult.U)}원` },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-xs text-slate-500">{label}</div>
                        <div className="font-semibold tabular-nums">{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* 고객 제시가 */}
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 px-4 py-3 text-center">
                      <div className="text-xs text-blue-600 font-semibold">★ 고객 제시가 (V)</div>
                      <div className="text-2xl font-black text-blue-700 tabular-nums">{fmt(calcResult.V)}원</div>
                    </div>
                    {calcResult.V_stock && (
                      <div className="rounded-2xl border-2 border-purple-300 bg-purple-50 px-4 py-3 text-center">
                        <div className="text-xs text-purple-600 font-semibold">기성 성형틀 제시가</div>
                        <div className="text-2xl font-black text-purple-700 tabular-nums">{fmt(calcResult.V_stock)}원</div>
                      </div>
                    )}
                  </div>

                  <button className={`${btnOn} mt-3 w-full`} onClick={handleSave}>
                    💾 견적 저장
                  </button>
                  <button className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setPrintOpen(true)}>
                    🖨️ 견적서 출력
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ───────────── 탭 2: 견적 목록 ───────────── */}
        {tab === "list" && (
          <div className={`${card} p-4`}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="text-lg font-semibold">견적 목록</div>
              <div className="flex gap-2">
                {["전체", ...STATUS_LIST].map(s => (
                  <button key={s} className={statusFilter === s ? btnOn : btn}
                    onClick={() => setStatusFilter(s)}>{s}</button>
                ))}
              </div>
              <input className={`${inp} max-w-[240px]`} placeholder="업체명/제품/메모 검색"
                value={listSearch} onChange={e => setListSearch(e.target.value)} />
              <button className={btn} onClick={loadQuoteList}>🔄 새로고침</button>
            </div>

            {listLoading ? (
              <div className="py-8 text-center text-sm text-slate-500">불러오는 중...</div>
            ) : filteredList.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">견적 내역이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: 100 }} /><col style={{ width: 140 }} />
                    <col style={{ width: 120 }} /><col style={{ width: 120 }} />
                    <col style={{ width: 80  }} /><col style={{ width: 80  }} />
                    <col style={{ width: 100 }} /><col style={{ width: 100 }} />
                    <col style={{ width: 160 }} />
                  </colgroup>
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">날짜</th>
                      <th className="px-3 py-2 text-left">업체명</th>
                      <th className="px-3 py-2 text-left">제품</th>
                      <th className="px-3 py-2 text-left">크기/수량</th>
                      <th className="px-3 py-2 text-center">신규</th>
                      <th className="px-3 py-2 text-right">고객 제시가</th>
                      <th className="px-3 py-2 text-center">상태</th>
                      <th className="px-3 py-2 text-left">미수주 사유</th>
                      <th className="px-3 py-2 text-center">상태 변경</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map(r => {
                      const q = r.quotes?.[0];
                      const sc = STATUS_COLOR[r.status] ?? STATUS_COLOR["견적완료"];
                      return (
                        <tr key={r.id} className="border-t border-slate-200 bg-white hover:bg-slate-50">
                          <td className="px-3 py-2 tabular-nums text-xs text-slate-500">
                            {r.created_at.slice(0, 10)}
                          </td>
                          <td className="px-3 py-2 font-semibold">{r.customer_name}</td>
                          <td className="px-3 py-2 text-xs">{r.product_type ?? "—"}</td>
                          <td className="px-3 py-2 text-xs tabular-nums">
                            {r.width_mm && r.height_mm ? `${r.width_mm}×${r.height_mm}mm` : "—"}
                            {r.quantity ? ` / ${fmt(r.quantity)}개` : ""}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: "bold",
                              background: r.is_new ? "#dbeafe" : "#fef3c7",
                              color: r.is_new ? "#1d4ed8" : "#b45309" }}>
                              {r.is_new ? "신규" : "재주문"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-blue-700">
                            {q?.final_price ? fmt(q.final_price)+"원" : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: "bold",
                              background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500">{r.lost_reason ?? "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {r.status !== "수주" && (
                                <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-100"
                                  onClick={() => updateStatus(r.id, "수주")}>수주</button>
                              )}
                              {r.status !== "미수주" && (
                                <select className="rounded-lg border border-red-200 bg-red-50 px-1 py-1 text-[11px] text-red-700"
                                  defaultValue=""
                                  onChange={e => { if (e.target.value) updateStatus(r.id, "미수주", e.target.value); e.target.value = ""; }}>
                                  <option value="" disabled>미수주▼</option>
                                  {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                              )}
                              {r.status !== "견적완료" && (
                                <button className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                                  onClick={() => updateStatus(r.id, "견적완료")}>견적완료</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ───────────── 탭 3: 전사지 견적 ───────────── */}
        {tab === "sheet" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">

            {/* 거래처 */}
            <div className={`${card} p-4`}>
              <div className="mb-3 text-lg font-semibold">업체 선택</div>

              {/* 모드 토글 */}
              <div className="mb-3 flex gap-2">
                <button
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${partnerMode === "direct" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => { setPartnerMode("direct"); setSelectedPartner(null); }}>
                  ✏️ 직접 입력
                </button>
                <button
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${partnerMode === "select" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => { setPartnerMode("select"); setCustomerName(""); }}>
                  🔍 기존 거래처
                </button>
              </div>

              {partnerMode === "direct" && (
                <div>
                  <input className={inp} placeholder="예: 터치 한남" value={customerName}
                    onChange={e => setCustomerName(e.target.value)} />
                  <div className="mt-2 text-xs text-slate-400">업체명만 입력하세요.</div>
                </div>
              )}

              {partnerMode === "select" && (
                <div>
                  <input className={`${inp} mb-2`} placeholder="업체명 검색" value={partnerFilter}
                    onChange={e => setPartnerFilter(e.target.value)} />
                  {selectedPartner && (
                    <div className="mb-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                      ✓ {selectedPartner.name}
                    </div>
                  )}
                  <div className="max-h-[300px] space-y-1 overflow-y-auto">
                    {partners.map(p => (
                      <button key={p.id}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedPartner?.id === p.id ? "border-blue-300 bg-blue-50 font-semibold" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                        onClick={() => setSelectedPartner(p)}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeCustomerName && (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                  📋 {activeCustomerName}
                </div>
              )}
            </div>

            {/* 전사지 입력 */}
            <div className="space-y-4">
              <div className={`${card} p-4`}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-lg font-semibold">전사지 단독 견적</div>
                  {activeCustomerName && <span className={pill}>{activeCustomerName}</span>}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-semibold text-slate-600">전사지 장수 (최소 5장)</div>
                    <input className={inp} inputMode="numeric" placeholder="예: 30" value={sheetCount}
                      onChange={e => { setSheetCount(e.target.value); setSheetCalcResult(null); }} />
                  </div>
                  <div className="flex items-end">
                    <button type="button"
                      onClick={() => { setSheetIsNew(v => !v); setSheetCalcResult(null); }}
                      style={{ padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: "bold", cursor: "pointer", border: "none",
                        background: sheetIsNew ? "#dbeafe" : "#fef3c7",
                        color: sheetIsNew ? "#1d4ed8" : "#b45309",
                        outline: `1px solid ${sheetIsNew ? "#93c5fd" : "#fcd34d"}` }}>
                      {sheetIsNew ? "신규 (인쇄판비 포함)" : "재주문 (인쇄판비 없음)"}
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 text-xs font-semibold text-slate-600">메모</div>
                  <textarea className={`${inp} resize-none`} rows={2} placeholder="기타 요청사항" value={memo}
                    onChange={e => setMemo(e.target.value)} />
                </div>

                <button className={`${btnOn} mt-4 w-full`} onClick={handleSheetCalc}>🔢 계산</button>
              </div>

              {/* 전사지 계산 결과 */}
              {sheetCalcResult && (
                <div className={`${card} p-4`}>
                  <div className="mb-3 text-lg font-semibold">계산 결과</div>
                  <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                    {[
                      { label: "전사지 장수", value: `${sheetCalcResult.sheets}장` },
                      { label: "인쇄판비", value: fmt(sheetCalcResult.plateCost)+"원" },
                      { label: "전사지 비용", value: fmt(sheetCalcResult.sheetCost)+"원" },
                      { label: "택배비", value: sheetCalcResult.delivery ? fmt(sheetCalcResult.delivery)+"원" : "없음" },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-xs text-slate-500">{label}</div>
                        <div className="font-semibold tabular-nums">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 px-4 py-3 text-center">
                      <div className="text-xs text-blue-600 font-semibold">공급가 (부가세 별도)</div>
                      <div className="text-2xl font-black text-blue-700 tabular-nums">{fmt(sheetCalcResult.supplyPrice)}원</div>
                    </div>
                    <div className="rounded-2xl border-2 border-slate-300 bg-slate-50 px-4 py-3 text-center">
                      <div className="text-xs text-slate-600 font-semibold">부가세 포함</div>
                      <div className="text-2xl font-black text-slate-700 tabular-nums">{fmt(sheetCalcResult.totalWithVat)}원</div>
                    </div>
                  </div>
                  <button className={`${btnOn} mt-3 w-full`} onClick={handleSheetSave}>💾 견적 저장</button>
                </div>
              )}

              {/* 전사지 목록 */}
              {sheetList.length > 0 && (
                <div className={`${card} p-4`}>
                  <div className="mb-3 text-base font-semibold">최근 전사지 견적</div>
                  <div className="space-y-2">
                    {sheetList.slice(0, 10).map(r => {
                      const q = r.quotes?.[0];
                      const sc = STATUS_COLOR[r.status] ?? STATUS_COLOR["견적완료"];
                      return (
                        <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <div>
                            <span className="font-semibold">{r.customer_name}</span>
                            <span className="ml-2 text-slate-500">{r.quantity}장</span>
                            <span className="ml-2 text-xs text-slate-400">{r.created_at.slice(0,10)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums text-blue-700 font-semibold">
                              {q?.total ? fmt(q.total)+"원" : "—"}
                            </span>
                            <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: "bold",
                              background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                              {r.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 견적서 인쇄 모달 */}
      {printOpen && calcResult && (
        <QuotePrintModal
          onClose={() => setPrintOpen(false)}
          quoteData={{
            customerName: activeCustomerName,
            quoteDate: new Date().toISOString().slice(0, 10),
            productType: PRODUCT_TYPES.find(p => p.key === productType)?.label ?? productType,
            widthMm: parseFloat(widthMm) || null,
            heightMm: parseFloat(heightMm) || null,
            quantity: parseInt(quantity) || 0,
            isNew,
            designChanged,
            useStockMold,
            shape,
            memo: memo || null,
            unitPrice: calcResult.unitPrice,
            moldCost: calcResult.moldCost,
            plateCost: calcResult.plateCost,
            sheetCount: calcResult.sheetCount,
            sheetCost: calcResult.sheetCost,
            workFee: calcResult.workFee,
            totalActual: calcResult.totalActual,
            totalWithVat: calcResult.totalWithVat,
            V: calcResult.V,
            V_stock: calcResult.V_stock,
            foodType: getFoodType(productType),
          }}
        />
      )}
    </div>
  );
}
