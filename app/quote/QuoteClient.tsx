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

  // ─── 품목 타입 ───
  type QuoteItem = {
    id: string;
    productType: string;
    colorType: "dark" | "white";
    widthMm: string;
    heightMm: string;
    quantity: string;
    isNew: boolean;
    designChanged: boolean;
    useStockMold: boolean;
    reuseExistingMold: boolean;
    calcResult: any;
    calcLoading: boolean;
    manualV: string;
  };

  const newItem = (): QuoteItem => ({
    id: crypto.randomUUID(),
    productType: "전사3mm", colorType: "dark",
    widthMm: "", heightMm: "", quantity: "",
    isNew: true, designChanged: false,
    useStockMold: false, reuseExistingMold: false,
    calcResult: null, calcLoading: false, manualV: "",
  });

  // 견적 입력 폼
  const [inputMode, setInputMode] = useState<"auto" | "manual">("auto");
  const [items, setItems] = useState<QuoteItem[]>([newItem()]);
  const [memo, setMemo] = useState("");

  // 아이스박스 / 택배비
  const ICEBOX_OPTIONS = [
    { label: "소 (4,620원)", value: 4620 },
    { label: "중 (6,930원)", value: 6930 },
    { label: "대 (9,230원)", value: 9230 },
  ];
  const DELIVERY_OPTIONS = [
    { label: "없음", value: 0 },
    { label: "3,300원", value: 3300 },
    { label: "4,000원", value: 4000 },
  ];
  const [useIcebox, setUseIcebox] = useState(false);
  const [iceboxPrice, setIceboxPrice] = useState(4620);
  const [deliveryPrice, setDeliveryPrice] = useState(0);

  // 전사지 탭용 레거시
  const [quantity, setQuantity] = useState("");

  // 품목 업데이트 헬퍼
  function updateItem(id: string, patch: Partial<QuoteItem>) {
    setItems(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
  }

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

  // ─── 계산 (API 호출) — 품목별로 inline 처리 ───
  // (각 품목의 계산 버튼에서 직접 fetch 호출)

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

  // ─── 견적 저장 (다품목 — 첫 품목 기준으로 저장) ───
  async function handleSave() {
    if (!activeCustomerName) return setMsg("업체명을 입력하거나 거래처를 선택하세요.");
    const firstCalc = items.find(x => x.calcResult || x.manualV);
    if (!firstCalc) return setMsg("먼저 계산을 실행하거나 단가를 입력하세요.");
    setMsg(null);
    for (const item of items) {
      const cr = item.calcResult;
      if (!cr && !item.manualV) continue;
      const V = item.useStockMold && cr?.V_stock ? cr.V_stock : (cr?.V ?? parseInt(item.manualV) ?? 0);
      const { data: req, error: reqErr } = await supabase.from("quote_requests").insert({
        customer_id: activeCustomerId,
        customer_name: activeCustomerName,
        request_type: "product",
        product_type: item.productType,
        width_mm: parseFloat(item.widthMm) || null,
        height_mm: parseFloat(item.heightMm) || null,
        quantity: parseInt(item.quantity) || null,
        is_new: item.isNew,
        design_changed: item.designChanged,
        use_stock_mold: item.useStockMold,
        reuse_existing_mold: item.reuseExistingMold,
        mold_qty: 1,
        memo: memo || null,
        status: "견적완료",
      }).select("id").single();
      if (reqErr) { setMsg(reqErr.message); return; }
      await supabase.from("quotes").insert({
        request_id: req.id,
        unit_price: cr?.unitPrice ?? 0,
        mold_cost: cr?.moldCost ?? 0,
        plate_cost: cr?.plateCost ?? 0,
        transfer_sheets: cr?.sheetCount ?? 0,
        transfer_cost: cr?.sheetCost ?? 0,
        work_fee: cr?.workFee ?? 0,
        total: cr?.totalActual ?? 0,
        t_price: cr?.T ?? 0,
        u_price: cr?.U ?? 0,
        final_price: V,
        final_price_stock: cr?.V_stock ?? null,
      });
    }
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
    setItems([newItem()]); setMemo("");
    setUseIcebox(false); setIceboxPrice(4620); setDeliveryPrice(0);
  }

  const filteredList = quoteList.filter(r => {
    if (!listSearch.trim()) return true;
    const q = listSearch.toLowerCase();
    return r.customer_name.toLowerCase().includes(q) ||
      (r.product_type ?? "").toLowerCase().includes(q) ||
      (r.memo ?? "").toLowerCase().includes(q);
  });

  // 첫 번째 품목 기준 (레거시 호환)
  const firstItem = items[0];
  const isRaise = firstItem.productType.startsWith("레이즈");

  // 식품유형 자동 판별
  function getFoodType(pt: string, ct: "dark" | "white"): string {
    if (pt.startsWith("레이즈")) return "당류가공품";
    return ct === "dark" ? "준초콜릿" : "당류가공품";
  }

  // 두께 추출
  function getThickness(pt: string): string {
    if (pt.includes("2mm")) return "2mm";
    if (pt.includes("3mm")) return "3mm";
    if (pt.includes("5mm")) return "5mm";
    return "";
  }

  // 견적서 인쇄 모달
  const [printOpen, setPrintOpen] = useState(false);
  const [lastQuoteRequestId, setLastQuoteRequestId] = useState<string | null>(null);

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

                {/* 헤더: 제목 + 자동/수동 토글 */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-semibold">견적 입력</div>
                    {activeCustomerName && <span className={pill}>{activeCustomerName}</span>}
                  </div>
                  <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
                    <button type="button"
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${inputMode === "auto" ? "bg-white shadow text-blue-700 border border-blue-200" : "text-slate-500 hover:text-slate-700"}`}
                      onClick={() => setInputMode("auto")}>
                      🔢 자동 계산
                    </button>
                    <button type="button"
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${inputMode === "manual" ? "bg-white shadow text-orange-700 border border-orange-200" : "text-slate-500 hover:text-slate-700"}`}
                      onClick={() => setInputMode("manual")}>
                      ✏️ 수동 입력
                    </button>
                  </div>
                </div>

                {/* 품목 목록 */}
                <div className="space-y-3 mb-3">
                  {items.map((item, idx) => {
                    const isRaiseItem = item.productType.startsWith("레이즈");
                    const isManualItem = item.productType === "입체초콜릿";
                    return (
                      <div key={item.id} className={`rounded-2xl border p-3 ${inputMode === "manual" ? "border-orange-200 bg-orange-50/30" : "border-slate-200 bg-slate-50/50"}`}>
                        {/* 품목 헤더 */}
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500">품목 {idx + 1}</span>
                          {items.length > 1 && (
                            <button className="text-xs text-red-400 hover:text-red-600"
                              onClick={() => setItems(prev => prev.filter(x => x.id !== item.id))}>
                              삭제
                            </button>
                          )}
                        </div>

                        {/* 입력 그리드: 제품 | 색상 | 가로 | 세로 | 수량 | 단가 */}
                        <div className="grid gap-2" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr" }}>
                          {/* 제품 */}
                          <div>
                            <div className="mb-1 text-[10px] font-semibold text-slate-500">제품</div>
                            <select className={inp} value={item.productType}
                              onChange={e => {
                                const pt = e.target.value;
                                updateItem(item.id, {
                                  productType: pt,
                                  colorType: pt.startsWith("레이즈") ? "white" : item.colorType,
                                  calcResult: null,
                                });
                              }}>
                              {PRODUCT_TYPES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                            </select>
                          </div>

                          {/* 색상 */}
                          <div>
                            <div className="mb-1 text-[10px] font-semibold text-slate-500">색상</div>
                            <select className={inp} value={item.colorType}
                              disabled={isRaiseItem}
                              onChange={e => updateItem(item.id, { colorType: e.target.value as "dark"|"white", calcResult: null })}>
                              <option value="dark">다크</option>
                              <option value="white">화이트</option>
                            </select>
                          </div>

                          {/* 가로 */}
                          <div>
                            <div className="mb-1 text-[10px] font-semibold text-slate-500">가로(mm)</div>
                            <input className={inp} type="number" placeholder="예: 30" value={item.widthMm}
                              onChange={e => updateItem(item.id, { widthMm: e.target.value, calcResult: null })} />
                          </div>

                          {/* 세로 */}
                          <div>
                            <div className="mb-1 text-[10px] font-semibold text-slate-500">세로(mm)</div>
                            <input className={inp} type="number" placeholder="예: 30" value={item.heightMm}
                              onChange={e => updateItem(item.id, { heightMm: e.target.value, calcResult: null })} />
                          </div>

                          {/* 수량 */}
                          <div>
                            <div className="mb-1 text-[10px] font-semibold text-slate-500">수량</div>
                            <input className={inp} type="number" placeholder="예: 500" value={item.quantity}
                              onChange={e => updateItem(item.id, { quantity: e.target.value, calcResult: null })} />
                          </div>

                          {/* 단가 */}
                          <div>
                            {inputMode === "manual" ? (
                              <>
                                <div className="mb-1 text-[10px] font-semibold text-orange-600">단가(원) ✏️</div>
                                <input className={`${inp} border-orange-300 bg-orange-50`} type="number" placeholder="직접 입력"
                                  value={item.manualV}
                                  onChange={e => updateItem(item.id, { manualV: e.target.value })} />
                              </>
                            ) : (
                              <>
                                <div className="mb-1 text-[10px] font-semibold text-slate-500">단가(원)</div>
                                <div className={`rounded-xl border px-3 py-2 text-sm tabular-nums ${item.calcResult ? "border-blue-200 bg-blue-50 font-semibold text-blue-700" : "border-slate-200 bg-slate-100 text-slate-400"}`}>
                                  {item.calcResult
                                    ? fmt(item.useStockMold && item.calcResult.V_stock ? item.calcResult.V_stock : item.calcResult.V) + "원"
                                    : "계산 후 표시"}
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* 옵션 행 */}
                        <div className="mt-2 flex flex-wrap gap-2 items-center">
                          {/* 신규/재주문 토글 */}
                          <button type="button"
                            className={`rounded-lg border px-3 py-1 text-xs font-semibold ${item.isNew ? "border-blue-300 bg-blue-50 text-blue-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}
                            onClick={() => updateItem(item.id, { isNew: !item.isNew, designChanged: false, calcResult: null })}>
                            {item.isNew ? "신규" : "재주문"}
                          </button>

                          {/* 디자인 변경 (재주문 시) */}
                          {!item.isNew && (
                            <label className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-orange-700">
                              <input type="checkbox" checked={item.designChanged}
                                onChange={e => updateItem(item.id, { designChanged: e.target.checked, calcResult: null })} />
                              디자인변경
                            </label>
                          )}

                          {/* 기성 성형틀 */}
                          <label className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-purple-700">
                            <input type="checkbox" checked={item.useStockMold}
                              onChange={e => updateItem(item.id, {
                                useStockMold: e.target.checked,
                                reuseExistingMold: e.target.checked ? false : item.reuseExistingMold,
                                calcResult: null,
                              })} />
                            기성 성형틀
                          </label>

                          {/* 타업체 성형틀 */}
                          <label className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-teal-700">
                            <input type="checkbox" checked={item.reuseExistingMold}
                              onChange={e => updateItem(item.id, {
                                reuseExistingMold: e.target.checked,
                                useStockMold: e.target.checked ? false : item.useStockMold,
                                calcResult: null,
                              })} />
                            기존 성형틀 재사용
                          </label>

                          {/* 자동 계산 결과 요약 표시 */}
                          {inputMode === "auto" && item.calcResult && (
                            <span className="ml-auto text-xs text-slate-500">
                              K:{fmt(item.calcResult.moldCost)} L:{fmt(item.calcResult.plateCost)} T:{fmt(item.calcResult.T)} U:{fmt(item.calcResult.U)}
                            </span>
                          )}
                        </div>

                        {/* 자동 계산 버튼 (품목별) */}
                        {inputMode === "auto" && !isManualItem && (
                          <button className={`mt-2 w-full rounded-xl border px-3 py-1.5 text-xs font-semibold ${item.calcLoading ? "bg-slate-100 text-slate-400" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
                            disabled={item.calcLoading}
                            onClick={async () => {
                              if (!item.widthMm || !item.heightMm) return setMsg("가로/세로를 입력하세요.");
                              if (!item.quantity) return setMsg("수량을 입력하세요.");
                              updateItem(item.id, { calcLoading: true, calcResult: null });
                              try {
                                const res = await fetch("/api/quote/calculate", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    productKey: item.productType,
                                    width: parseFloat(item.widthMm),
                                    height: parseFloat(item.heightMm),
                                    quantity: parseInt(item.quantity),
                                    isNew: item.isNew,
                                    designChanged: item.designChanged,
                                    useStockMold: item.useStockMold,
                                    reuseExistingMold: item.reuseExistingMold,
                                    moldQty: 1,
                                  }),
                                });
                                const data = await res.json();
                                if (data.error) { setMsg(data.error); updateItem(item.id, { calcLoading: false }); return; }
                                updateItem(item.id, { calcResult: data, calcLoading: false });
                              } catch (e: any) {
                                setMsg(e.message); updateItem(item.id, { calcLoading: false });
                              }
                            }}>
                            {item.calcLoading ? "계산 중..." : "🔢 계산"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 품목 추가 버튼 */}
                <button className={`${btn} w-full mb-4`}
                  onClick={() => setItems(prev => [...prev, newItem()])}>
                  + 품목 추가
                </button>

                {/* 메모 */}
                <div className="mb-4">
                  <div className="mb-1 text-xs font-semibold text-slate-600">메모</div>
                  <textarea className={`${inp} resize-none`} rows={2} placeholder="기타 요청사항" value={memo}
                    onChange={e => setMemo(e.target.value)} />
                </div>

                {/* 추가 옵션: 아이스박스 / 택배비 */}
                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-semibold text-slate-600">추가 옵션</div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm mb-2">
                        <input type="checkbox" checked={useIcebox} onChange={e => setUseIcebox(e.target.checked)} />
                        <span className="font-semibold text-blue-700">🧊 아이스박스 (5~10월)</span>
                      </label>
                      {useIcebox && (
                        <div className="flex gap-2 flex-wrap">
                          {ICEBOX_OPTIONS.map(o => (
                            <button key={o.value} type="button"
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${iceboxPrice === o.value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                              onClick={() => setIceboxPrice(o.value)}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-semibold text-slate-700">🚚 택배비</div>
                      <div className="flex gap-2 flex-wrap">
                        {DELIVERY_OPTIONS.map(o => (
                          <button key={o.value} type="button"
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${deliveryPrice === o.value ? "border-green-300 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                            onClick={() => setDeliveryPrice(o.value)}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 하단 버튼 */}
                <div className="flex gap-2">
                  <button
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white ${inputMode === "manual" ? "border border-orange-300 bg-orange-500 hover:bg-orange-600" : `${btnOn}`}`}
                    disabled={inputMode === "auto" && items.every(x => !x.calcResult)}
                    onClick={async () => {
                      if (!activeCustomerName) return setMsg("업체명을 입력하세요.");
                      // 자동 계산 모드: 저장 후 quoteRequestId 획득
                      if (inputMode === "auto") {
                        const firstItem = items.find(x => x.calcResult);
                        if (firstItem?.calcResult) {
                          const cr = firstItem.calcResult;
                          const V = firstItem.useStockMold && cr.V_stock ? cr.V_stock : cr.V;
                          const { data: req } = await supabase.from("quote_requests").insert({
                            customer_id: activeCustomerId,
                            customer_name: activeCustomerName,
                            request_type: "product",
                            product_type: firstItem.productType,
                            color_type: firstItem.colorType,
                            width_mm: parseFloat(firstItem.widthMm) || null,
                            height_mm: parseFloat(firstItem.heightMm) || null,
                            quantity: parseInt(firstItem.quantity) || null,
                            is_new: firstItem.isNew,
                            design_changed: firstItem.designChanged,
                            use_stock_mold: firstItem.useStockMold,
                            reuse_existing_mold: firstItem.reuseExistingMold,
                            mold_qty: 1, memo: memo || null, status: "견적완료",
                          }).select("id").single();
                          if (req?.id) {
                            await supabase.from("quotes").insert({
                              request_id: req.id,
                              unit_price: cr.unitPrice, mold_cost: cr.moldCost,
                              plate_cost: cr.plateCost, transfer_sheets: cr.sheetCount,
                              transfer_cost: cr.sheetCost, work_fee: cr.workFee,
                              total: cr.totalActual, t_price: cr.T, u_price: cr.U,
                              final_price: V, final_price_stock: cr.V_stock ?? null,
                            });
                            setLastQuoteRequestId(req.id);
                          }
                        }
                      }
                      setPrintOpen(true);
                    }}>
                    🖨️ 견적서 출력
                  </button>
                  <button className={btn} onClick={() => { setItems([newItem()]); setMemo(""); setUseIcebox(false); setIceboxPrice(4620); setDeliveryPrice(0); }}>
                    초기화
                  </button>
                </div>
              </div>
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
      {printOpen && (
        <QuotePrintModal
          onClose={() => setPrintOpen(false)}
          quoteData={{
            customerName: activeCustomerName,
            quoteDate: new Date().toISOString().slice(0, 10),
            inputMode,
            items: items.map(item => ({
              productType: PRODUCT_TYPES.find(p => p.key === item.productType)?.label ?? item.productType,
              colorType: item.colorType,
              isRaise: item.productType.startsWith("레이즈"),
              widthMm: parseFloat(item.widthMm) || null,
              heightMm: parseFloat(item.heightMm) || null,
              thickness: getThickness(item.productType),
              quantity: parseInt(item.quantity) || 0,
              isNew: item.isNew,
              designChanged: item.designChanged,
              useStockMold: item.useStockMold,
              moldCost: item.calcResult?.moldCost ?? 0,
              plateCost: item.calcResult?.plateCost ?? 0,
              sheetCost: item.calcResult?.sheetCost ?? 0,
              workFee: item.calcResult?.workFee ?? 0,
              V: item.useStockMold && item.calcResult?.V_stock
                ? item.calcResult.V_stock
                : (item.calcResult?.V ?? 0),
              manualV: parseInt(item.manualV) || 0,
            })),
            memo: memo || null,
            iceboxPrice: useIcebox ? iceboxPrice : 0,
            deliveryPrice,
            quoteRequestId: lastQuoteRequestId,
          }}
        />
      )}
    </div>
  );
}
