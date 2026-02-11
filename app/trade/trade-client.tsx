"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
  ceo_name: string | null;
  biz_type: string | null;
  biz_item: string | null;
  phone: string | null;
  address1: string | null;
  is_pinned: boolean | null;
  pin_order: number | null;
  partner_type: string | null;
  group_name: string | null;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  ship_date: string | null;
  ship_method: string | null;
  status: string | null;
  memo: string | null;
  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  created_at: string;
};

type LedgerRow = {
  id: string;
  entry_date: string;
  entry_ts: string;
  direction: "IN" | "OUT" | string;
  amount: number;
  category: string | null;
  method: string | null;
  counterparty_name: string | null;
  business_no: string | null;
  memo: string | null;
  status: string | null;
  partner_id: string | null;
  created_at: string;
};

type Mode = "ORDERS" | "LEDGER" | "UNIFIED";
type PartnerView = "PINNED" | "RECENT" | "ALL";

type FoodTypeRow = { id: string; name: string };

type Line = {
  food_type: string;
  name: string;

  // ✅ 품목명과 수량 사이 무게(g)
  weight_g: number;

  qty: number;
  unit: number;
};

function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
}

function toInt(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(ymd: string, delta: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ymdToDisplay(ymd: string | null | undefined) {
  return ymd ?? "";
}

const LS_RECENT_PARTNERS = "bonus_trade_recent_partners_v1";

export default function TradeClient() {
  const supabase = useMemo(() => createClient(), []);

  const [msg, setMsg] = useState<string | null>(null);

  // 거래처
  const [partnerView, setPartnerView] = useState<PartnerView>("ALL");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerRow | null>(null);

  // 최근 거래처
  const [recentPartnerIds, setRecentPartnerIds] = useState<string[]>([]);

  // 모드
  const [mode, setMode] = useState<Mode>("UNIFIED");

  // 거래처 등록 폼
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [p_name, setP_name] = useState("");
  const [p_businessNo, setP_businessNo] = useState("");
  const [p_ceo, setP_ceo] = useState("");
  const [p_phone, setP_phone] = useState("");
  const [p_address1, setP_address1] = useState("");
  const [p_bizType, setP_bizType] = useState("");
  const [p_bizItem, setP_bizItem] = useState("");

  // 식품유형(자동완성)
  const [foodTypes, setFoodTypes] = useState<FoodTypeRow[]>([]);

  // 주문/출고 입력
  const [shipDate, setShipDate] = useState(todayYMD());
  const [shipMethod, setShipMethod] = useState("택배");
  const [orderTitle, setOrderTitle] = useState("");

  // ✅ 라인 기본값에 weight_g 추가
  const [lines, setLines] = useState<Line[]>([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: 0 }]);

  // ✅ 금액 계산은 (수량 × 단가) 그대로 유지 (무게는 저장/표기용)
  const orderTotals = useMemo(() => {
    const supply = lines.reduce((acc, l) => acc + toInt(l.qty) * toInt(l.unit), 0);
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    return { supply, vat, total };
  }, [lines]);

  // 금전출납 입력
  const [entryDate, setEntryDate] = useState(todayYMD());
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [payMethod, setPayMethod] = useState("BANK");
  const [category, setCategory] = useState<"매출입금" | "급여" | "세금" | "기타">("매출입금");
  const [amountStr, setAmountStr] = useState("");
  const [ledgerMemo, setLedgerMemo] = useState("");

  // 조회기간/데이터
  const [fromYMD, setFromYMD] = useState(addDays(todayYMD(), -30));
  const [toYMD, setToYMD] = useState(todayYMD());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);

  // ====== Helpers: 최근 거래처 ======
  function loadRecentFromLS() {
    try {
      const raw = localStorage.getItem(LS_RECENT_PARTNERS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string") as string[];
      return [];
    } catch {
      return [];
    }
  }

  function saveRecentToLS(ids: string[]) {
    try {
      localStorage.setItem(LS_RECENT_PARTNERS, JSON.stringify(ids));
    } catch {}
  }

  function pushRecentPartner(id: string) {
    setRecentPartnerIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 20);
      saveRecentToLS(next);
      return next;
    });
  }

  // ====== Loaders ======
  async function loadPartners() {
    setMsg(null);

    let q = supabase
      .from("partners")
      .select("id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name")
      .order("is_pinned", { ascending: false })
      .order("pin_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);

    const f = partnerFilter.trim();
    if (f) {
      q = q.or(`name.ilike.%${f}%,business_no.ilike.%${f}%`);
    }

    const { data, error } = await q;
    if (error) return setMsg(error.message);
    setPartners((data ?? []) as PartnerRow[]);
  }

  async function loadFoodTypes() {
    const { data, error } = await supabase
      .from("food_types")
      .select("id,name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(200);

    if (error) return;
    setFoodTypes((data ?? []) as FoodTypeRow[]);
  }

  async function loadTrades() {
    setMsg(null);

    const f = fromYMD || addDays(todayYMD(), -30);
    const t = toYMD || todayYMD();

    const selectedBusinessNo = selectedPartner?.business_no ?? null;
    const selectedPartnerId = selectedPartner?.id ?? null;

    let oq = supabase
      .from("orders")
      .select("id,customer_id,customer_name,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount,created_at")
      .gte("ship_date", f)
      .lte("ship_date", t)
      .order("ship_date", { ascending: false })
      .limit(500);

    if (selectedPartnerId) {
      oq = oq.or(`customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`);
    }

    const { data: oData, error: oErr } = await oq;
    if (oErr) return setMsg(oErr.message);
    setOrders((oData ?? []) as OrderRow[]);

    let lq = supabase
      .from("ledger_entries")
      .select("id,entry_date,entry_ts,direction,amount,category,method,counterparty_name,business_no,memo,status,partner_id,created_at")
      .gte("entry_date", f)
      .lte("entry_date", t)
      .order("entry_date", { ascending: false })
      .limit(1000);

    if (selectedPartnerId || selectedBusinessNo) {
      const ors: string[] = [];
      if (selectedPartnerId) ors.push(`partner_id.eq.${selectedPartnerId}`);
      if (selectedBusinessNo) ors.push(`business_no.eq.${selectedBusinessNo}`);
      if (selectedPartner?.name) ors.push(`counterparty_name.eq.${selectedPartner.name.replaceAll(",", "")}`);
      lq = lq.or(ors.join(","));
    }

    const { data: lData, error: lErr } = await lq;
    if (lErr) return setMsg(lErr.message);

    const mapped = (lData ?? []).map((r: any) => ({
      ...r,
      amount: Number(r.amount ?? 0),
    })) as LedgerRow[];

    setLedgers(mapped);
  }

  // ====== 초기 로드 ======
  useEffect(() => {
    setRecentPartnerIds(loadRecentFromLS());
    loadPartners();
    loadFoodTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerFilter]);

  useEffect(() => {
    loadTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartner?.id, fromYMD, toYMD]);

  function resetPartnerForm() {
    setP_name("");
    setP_businessNo("");
    setP_ceo("");
    setP_phone("");
    setP_address1("");
    setP_bizType("");
    setP_bizItem("");
  }

  async function createPartner() {
    setMsg(null);

    const name = p_name.trim();
    if (!name) return setMsg("업체명(필수)을 입력하세요.");

    const business_no = p_businessNo.trim() || null;

    const payload: any = {
      name,
      business_no,
      ceo_name: p_ceo.trim() || null,
      phone: p_phone.trim() || null,
      address1: p_address1.trim() || null,
      biz_type: p_bizType.trim() || null,
      biz_item: p_bizItem.trim() || null,
      partner_type: "CUSTOMER",
      is_pinned: false,
      pin_order: 9999,
    };

    const { data, error } = await supabase.from("partners").insert(payload).select("*").single();
    if (error) return setMsg(error.message);

    setShowPartnerForm(false);
    resetPartnerForm();

    await loadPartners();
    setSelectedPartner(data as PartnerRow);
    pushRecentPartner((data as PartnerRow).id);
  }

  function selectPartner(p: PartnerRow) {
    setSelectedPartner(p);
    setMsg(null);
    pushRecentPartner(p.id);
  }

  async function togglePinned(p: PartnerRow) {
    setMsg(null);
    const next = !(p.is_pinned ?? false);

    const { error } = await supabase.from("partners").update({ is_pinned: next }).eq("id", p.id);
    if (error) return setMsg(error.message);

    setPartners((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_pinned: next } : x)));
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { food_type: "", name: "", weight_g: 0, qty: 0, unit: 0 }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function createOrder() {
    setMsg(null);
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    if (lines.length === 0) return setMsg("품목을 1개 이상 입력하세요.");

    const cleanLines = lines
      .map((l) => ({
        food_type: (l.food_type || "").trim(),
        name: l.name.trim(),
        weight_g: toInt(l.weight_g),
        qty: toInt(l.qty),
        unit: toInt(l.unit),
      }))
      .filter((l) => l.name && l.qty > 0 && l.unit >= 0);

    if (cleanLines.length === 0) return setMsg("품목명/수량/단가를 올바르게 입력하세요.");

    const memoObj = {
      title: orderTitle.trim() || null,
      lines: cleanLines.map((l) => {
        const supply = l.qty * l.unit;
        const vat = Math.round(supply * 0.1);
        const total = supply + vat;
        return { ...l, supply, vat, total };
      }),
    };

    const payload: any = {
      customer_id: selectedPartner.id,
      customer_name: selectedPartner.name,
      title: null,
      ship_date: shipDate,
      ship_method: shipMethod,
      status: "DRAFT",
      memo: JSON.stringify(memoObj),
      supply_amount: orderTotals.supply,
      vat_amount: orderTotals.vat,
      total_amount: orderTotals.total,
      created_by: null,
    };

    const { error } = await supabase.from("orders").insert(payload);
    if (error) return setMsg(error.message);

    setOrderTitle("");
    setLines([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: 0 }]);

    await loadTrades();
  }

  async function createLedger() {
    setMsg(null);
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");

    const amount = Number((amountStr || "0").replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0) return setMsg("금액(원)을 올바르게 입력하세요.");

    const payload: any = {
      entry_date: entryDate,
      entry_ts: new Date().toISOString(),
      direction,
      amount,
      category,
      method: payMethod,
      counterparty_name: selectedPartner.name,
      business_no: selectedPartner.business_no,
      memo: ledgerMemo.trim() || null,
      status: "POSTED",
      partner_id: selectedPartner.id,
    };

    const { error } = await supabase.from("ledger_entries").insert(payload);
    if (error) return setMsg(error.message);

    setAmountStr("");
    setLedgerMemo("");

    await loadTrades();
  }

  const partnersToShow = useMemo(() => {
    let list = partners;

    if (partnerView === "PINNED") {
      list = list.filter((p) => !!p.is_pinned);
    } else if (partnerView === "RECENT") {
      const map = new Map(list.map((p) => [p.id, p]));
      list = recentPartnerIds.map((id) => map.get(id)).filter(Boolean) as PartnerRow[];
    }

    return list;
  }, [partners, partnerView, recentPartnerIds]);

  const unifiedRows = useMemo(() => {
    const items: Array<{
      kind: "ORDER" | "LEDGER";
      date: string;
      tsKey: string;
      amount: number;
      title: string;
      sub: string;
      rawId: string;
    }> = [];

    for (const o of orders) {
      const memo = safeJsonParse<{ title: string | null; lines: any[] }>(o.memo);
      const title = memo?.title ? `주문/출고 · ${memo.title}` : `주문/출고 · ${o.ship_method ?? ""}`.trim();

      const linesText =
        memo?.lines?.length
          ? memo.lines
              .slice(0, 3)
              .map((l) => {
                const ft = l.food_type ? `[${l.food_type}] ` : "";
                const w = l.weight_g ? ` ${formatMoney(l.weight_g)}g` : "";
                return `${ft}${l.name}${w} ${formatMoney(l.qty)}×${formatMoney(l.unit)}`;
              })
              .join(", ") + (memo.lines.length > 3 ? ` 외 ${memo.lines.length - 3}건` : "")
          : o.memo
          ? "메모 있음"
          : "";

      const date = o.ship_date ?? (o.created_at ? o.created_at.slice(0, 10) : "");
      const tsKey = `${date}T12:00:00.000Z`;

      items.push({
        kind: "ORDER",
        date,
        tsKey,
        amount: -Number(o.total_amount ?? 0),
        title,
        sub: linesText,
        rawId: o.id,
      });
    }

    for (const l of ledgers) {
      const sign = String(l.direction) === "OUT" ? -1 : 1;
      const title = `${l.category ?? "금전출납"} · ${l.method ?? ""}`.trim();
      const sub = `${l.counterparty_name ?? ""}${l.memo ? " · " + l.memo : ""}`.trim();

      items.push({
        kind: "LEDGER",
        date: l.entry_date,
        tsKey: l.entry_ts || `${l.entry_date}T12:00:00.000Z`,
        amount: sign * Number(l.amount ?? 0),
        title,
        sub,
        rawId: l.id,
      });
    }

    items.sort((a, b) => String(a.tsKey || a.date).localeCompare(String(b.tsKey || b.date)));

    let running = 0;
    const withBalance = items.map((x) => {
      running += x.amount;
      return { ...x, balance: running };
    });

    withBalance.sort((a, b) => String(b.tsKey || b.date).localeCompare(String(a.tsKey || a.date)));
    return withBalance;
  }, [orders, ledgers]);

  const unifiedTotals = useMemo(() => {
    const plus = unifiedRows.filter((x) => x.amount > 0).reduce((a, x) => a + x.amount, 0);
    const minus = unifiedRows.filter((x) => x.amount < 0).reduce((a, x) => a + x.amount, 0);
    const net = plus + minus;
    const endBalance = unifiedRows.length ? (unifiedRows as any)[0].balance : 0;
    return { plus, minus, net, endBalance };
  }, [unifiedRows]);

  // ====== UI ======
  const card = "rounded-2xl border border-zinc-700/50 bg-zinc-900/40";
  const input =
    "w-full rounded-xl border border-zinc-700/60 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400/60 focus:outline-none focus:ring-2 focus:ring-zinc-500/30";
  const btn = "rounded-xl border border-zinc-700/60 bg-zinc-800/30 px-3 py-2 text-sm hover:bg-zinc-800/50";
  const btnOn = "rounded-xl border border-zinc-500/70 bg-zinc-700/40 px-3 py-2 text-sm";

  return (
    <div className="mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6 text-zinc-100">
      {msg ? (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm">{msg}</div>
      ) : null}

      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* LEFT */}
        <div className={`${card} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-lg font-semibold">거래처</div>
            <div className="flex gap-2">
              <button
                className={btn}
                onClick={() => {
                  setShowPartnerForm((v) => !v);
                  setMsg(null);
                }}
              >
                + 등록
              </button>
              <button className={btn} onClick={() => loadPartners()}>
                새로고침
              </button>
            </div>
          </div>

          <div className="mb-3 flex gap-2">
            <button className={partnerView === "PINNED" ? btnOn : btn} onClick={() => setPartnerView("PINNED")}>
              즐겨찾기
            </button>
            <button className={partnerView === "RECENT" ? btnOn : btn} onClick={() => setPartnerView("RECENT")}>
              최근
            </button>
            <button className={partnerView === "ALL" ? btnOn : btn} onClick={() => setPartnerView("ALL")}>
              전체
            </button>
          </div>

          {showPartnerForm ? (
            <div className="mb-4 rounded-2xl border border-zinc-700/50 bg-zinc-800/20 p-3">
              <div className="mb-2 text-sm font-semibold">거래처 등록</div>

              <div className="space-y-2">
                <input className={input} placeholder="업체명(필수)" value={p_name} onChange={(e) => setP_name(e.target.value)} />
                <input className={input} placeholder="사업자등록번호" value={p_businessNo} onChange={(e) => setP_businessNo(e.target.value)} />
                <input className={input} placeholder="대표자" value={p_ceo} onChange={(e) => setP_ceo(e.target.value)} />
                <input className={input} placeholder="연락처" value={p_phone} onChange={(e) => setP_phone(e.target.value)} />
                <input className={input} placeholder="주소" value={p_address1} onChange={(e) => setP_address1(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} placeholder="업태" value={p_bizType} onChange={(e) => setP_bizType(e.target.value)} />
                  <input className={input} placeholder="종목" value={p_bizItem} onChange={(e) => setP_bizItem(e.target.value)} />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    className={`${btn} flex-1`}
                    onClick={() => {
                      setShowPartnerForm(false);
                      resetPartnerForm();
                    }}
                  >
                    취소
                  </button>
                  <button className={`${btnOn} flex-1`} onClick={createPartner}>
                    저장
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <input
            className={`${input} mb-3`}
            placeholder="목록 필터(이름/사업자번호)"
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
          />

          <div className="mb-2 text-xs text-zinc-300/70">
            선택된 거래처:{" "}
            {selectedPartner
              ? `${selectedPartner.name}${selectedPartner.business_no ? ` · ${selectedPartner.business_no}` : ""}`
              : "없음"}
          </div>

          <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
            {partnersToShow.length === 0 ? (
              <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/20 p-3 text-sm text-zinc-300/70">
                표시할 거래처가 없습니다.
              </div>
            ) : (
              partnersToShow.map((p) => {
                const active = selectedPartner?.id === p.id;
                const pinned = !!p.is_pinned;

                return (
                  <div
                    key={p.id}
                    className={`flex items-stretch gap-2 rounded-2xl border ${
                      active
                        ? "border-zinc-500/70 bg-zinc-800/40"
                        : "border-zinc-700/50 bg-zinc-900/30 hover:bg-zinc-800/30"
                    }`}
                  >
                    <button className="flex-1 rounded-2xl px-3 py-3 text-left" onClick={() => selectPartner(p)}>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-zinc-300/70">{p.business_no ?? ""}</div>
                    </button>

                    <button
                      type="button"
                      className="mr-2 my-2 w-10 rounded-xl border border-zinc-700/60 bg-zinc-950/20 text-lg hover:bg-zinc-800/40"
                      title={pinned ? "즐겨찾기 해제" : "즐겨찾기 등록"}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePinned(p);
                      }}
                    >
                      {pinned ? "★" : "☆"}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button className={`${btn} flex-1`} onClick={() => setSelectedPartner(null)}>
              선택 해제
            </button>
            <button className={`${btn} flex-1`} onClick={() => loadTrades()}>
              조회 갱신
            </button>
          </div>
        </div>

        {/* RIGHT */}
        <div className="min-w-0 space-y-6">
          <div className="flex gap-2">
            <button className={mode === "ORDERS" ? btnOn : btn} onClick={() => setMode("ORDERS")}>
              주문/출고
            </button>
            <button className={mode === "LEDGER" ? btnOn : btn} onClick={() => setMode("LEDGER")}>
              금전출납
            </button>
            <button className={mode === "UNIFIED" ? btnOn : btn} onClick={() => setMode("UNIFIED")}>
              통합
            </button>
          </div>

          {/* 주문/출고 */}
          {mode !== "LEDGER" ? (
            <div className={`${card} p-4`}>
              <div className="mb-3 text-lg font-semibold">주문/출고 입력</div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs text-zinc-300/70">출고일(주문일)</div>
                  <input
                    type="date"
                    className={`${input} date-input`}
                    value={shipDate}
                    onChange={(e) => setShipDate(e.target.value)}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-zinc-300/70">출고방법</div>
                  <select className={input} value={shipMethod} onChange={(e) => setShipMethod(e.target.value)}>
                    <option value="택배">택배</option>
                    <option value="퀵">퀵</option>
                    <option value="직접">직접</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-zinc-300/70">메모(title)</div>
                  <input
                    className={input}
                    placeholder='예: "2월 정기 주문"'
                    value={orderTitle}
                    onChange={(e) => setOrderTitle(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm font-semibold">품목(식품유형 자동완성 포함)</div>
                <button className={btn} onClick={addLine}>
                  + 품목 추가
                </button>
              </div>

              {/* ✅✅✅ 여기부터: grid → table + colgroup (정렬 스트레스 0) */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full table-fixed border-separate border-spacing-y-2">
                  <colgroup>
                    <col style={{ width: 180 }} />
                    <col />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 44 }} />
                  </colgroup>

                  <thead>
                    <tr className="text-xs text-zinc-300/70">
                      <th className="px-3 py-1 text-left font-medium">식품유형</th>
                      <th className="px-3 py-1 text-left font-medium">품목명</th>
                      <th className="px-3 py-1 text-left font-medium">무게(g)</th>
                      <th className="px-3 py-1 text-right font-medium">수량</th>
                      <th className="px-3 py-1 text-right font-medium">단가</th>
                      <th className="px-3 py-1 text-right font-medium">공급가</th>
                      <th className="px-3 py-1 text-right font-medium">부가세</th>
                      <th className="px-3 py-1 text-right font-medium">총액</th>
                      <th className="px-1 py-1" />
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((l, i) => {
                      const supply = toInt(l.qty) * toInt(l.unit);
                      const vat = Math.round(supply * 0.1);
                      const total = supply + vat;

                      return (
                        <tr key={i}>
                          {/* 식품유형 */}
                          <td className="px-1 align-middle">
                            <input
                              className={input}
                              list="food-types-list"
                              placeholder="예: 당류가공품"
                              value={l.food_type}
                              onChange={(e) => updateLine(i, { food_type: e.target.value })}
                            />
                          </td>

                          {/* 품목명 */}
                          <td className="px-1 align-middle">
                            <input
                              className={input}
                              placeholder="품목명"
                              value={l.name}
                              onChange={(e) => updateLine(i, { name: e.target.value })}
                            />
                          </td>

                          {/* 무게(g) */}
                          <td className="px-1 align-middle">
                            <input
                              className={`${input} text-right`}
                              inputMode="numeric"
                              placeholder="g"
                              value={String(l.weight_g)}
                              onChange={(e) => updateLine(i, { weight_g: toInt(e.target.value) })}
                            />
                          </td>

                          {/* 수량 */}
                          <td className="px-1 align-middle">
                            <input
                              className={`${input} text-right`}
                              inputMode="numeric"
                              value={String(l.qty)}
                              onChange={(e) => updateLine(i, { qty: toInt(e.target.value) })}
                            />
                          </td>

                          {/* 단가 */}
                          <td className="px-1 align-middle">
                            <input
                              className={`${input} text-right`}
                              inputMode="numeric"
                              value={String(l.unit)}
                              onChange={(e) => updateLine(i, { unit: toInt(e.target.value) })}
                            />
                          </td>

                          {/* 공급가 */}
                          <td className="px-1 align-middle">
                            <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/20 px-3 py-2 text-sm text-right tabular-nums">
                              {formatMoney(supply)}
                            </div>
                          </td>

                          {/* 부가세 */}
                          <td className="px-1 align-middle">
                            <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/20 px-3 py-2 text-sm text-right tabular-nums">
                              {formatMoney(vat)}
                            </div>
                          </td>

                          {/* 총액 */}
                          <td className="px-1 align-middle">
                            <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/20 px-3 py-2 text-sm text-right tabular-nums">
                              {formatMoney(total)}
                            </div>
                          </td>

                          {/* 삭제 */}
                          <td className="px-1 align-middle">
                            <button className={btn} onClick={() => removeLine(i)} title="삭제">
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <datalist id="food-types-list">
                  {foodTypes.map((ft) => (
                    <option key={ft.id} value={ft.name} />
                  ))}
                </datalist>
              </div>
              {/* ✅✅✅ 여기까지: table + colgroup */}

              <div className="mt-4 flex items-center justify-end gap-4 text-sm">
                <div>공급가 {formatMoney(orderTotals.supply)}</div>
                <div>부가세 {formatMoney(orderTotals.vat)}</div>
                <div className="font-semibold">총액 {formatMoney(orderTotals.total)}</div>

                <button className={btnOn} onClick={createOrder}>
                  주문/출고 생성
                </button>
              </div>
            </div>
          ) : null}

          {/* 금전출납 */}
          {mode !== "ORDERS" ? (
            <div className={`${card} p-4`}>
              <div className="mb-3 text-lg font-semibold">금전출납 입력</div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs text-zinc-300/70">일자</div>
                  <input
                    type="date"
                    className={`${input} date-input`}
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs text-zinc-300/70">구분</div>
                  <select className={input} value={direction} onChange={(e) => setDirection(e.target.value as any)}>
                    <option value="IN">입금(+)</option>
                    <option value="OUT">출금(-)</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-xs text-zinc-300/70">결제수단</div>
                  <select className={input} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    <option value="BANK">BANK(계좌)</option>
                    <option value="CARD">CARD</option>
                    <option value="CASH">CASH</option>
                    <option value="ETC">기타</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <div className="mb-1 text-xs text-zinc-300/70">카테고리</div>
                  <div className="flex flex-wrap gap-2">
                    {(["매출입금", "급여", "세금", "기타"] as const).map((c) => (
                      <button key={c} type="button" className={category === c ? btnOn : btn} onClick={() => setCategory(c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-zinc-300/70">메모</div>
                  <input
                    className={input}
                    placeholder="예: 세금계산서 2/10 발행"
                    value={ledgerMemo}
                    onChange={(e) => setLedgerMemo(e.target.value)}
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs text-zinc-300/70">금액(원)</div>
                  <input
                    className={`${input} text-right`}
                    inputMode="numeric"
                    placeholder="예: 100,000"
                    value={amountStr}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d,]/g, "");
                      setAmountStr(v);
                    }}
                    onBlur={() => {
                      const n = Number((amountStr || "0").replaceAll(",", ""));
                      if (Number.isFinite(n) && n > 0) setAmountStr(n.toLocaleString("ko-KR"));
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button className={btnOn} onClick={createLedger}>
                  금전출납 기록
                </button>
              </div>
            </div>
          ) : null}

          {/* 거래내역 */}
          <div className={`${card} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">거래내역</div>
                <div className="text-xs text-zinc-300/70">
                  표시: {mode === "ORDERS" ? "주문/출고" : mode === "LEDGER" ? "금전출납" : "통합"}{" "}
                  {selectedPartner ? `· 거래처: ${selectedPartner.name}` : "· 거래처: 전체"}
                </div>
              </div>

              <div className="text-right text-sm">
                <div>
                  + {formatMoney(unifiedTotals.plus)} &nbsp; {formatMoney(unifiedTotals.minus)} &nbsp; ={" "}
                  <span className="font-semibold">{formatMoney(unifiedTotals.net)}</span>
                </div>
                <div className="text-xs text-zinc-300/70">잔액(최신) {formatMoney(unifiedTotals.endBalance)}</div>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div>
                <div className="mb-1 text-xs text-zinc-300/70">From</div>
                <input
                  type="date"
                  className={`${input} date-input`}
                  value={fromYMD}
                  onChange={(e) => setFromYMD(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-zinc-300/70">To</div>
                <input
                  type="date"
                  className={`${input} date-input`}
                  value={toYMD}
                  onChange={(e) => setToYMD(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className={btn}
                  onClick={() => {
                    setFromYMD(addDays(todayYMD(), -30));
                    setToYMD(todayYMD());
                  }}
                >
                  기간 초기화
                </button>
                <button className={btnOn} onClick={() => loadTrades()}>
                  조회
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {unifiedRows
                .filter((x: any) => {
                  if (mode === "ORDERS") return x.kind === "ORDER";
                  if (mode === "LEDGER") return x.kind === "LEDGER";
                  return true;
                })
                .map((x: any) => (
                  <div key={`${x.kind}-${x.rawId}`} className="rounded-2xl border border-zinc-700/50 bg-zinc-900/20 px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-[110px] shrink-0 text-sm font-semibold">{ymdToDisplay(x.date)}</div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {x.title}
                          {x.sub ? <span className="ml-2 text-xs font-normal text-zinc-300/70">· {x.sub}</span> : null}
                        </div>
                      </div>

                      <div className="w-[110px] shrink-0 text-right text-sm font-semibold tabular-nums">
                        {x.amount >= 0 ? "+" : ""}
                        {formatMoney(x.amount)}
                      </div>

                      <div className="w-[130px] shrink-0 text-right text-sm tabular-nums text-zinc-300/80">
                        {formatMoney(x.balance)}
                      </div>
                    </div>
                  </div>
                ))}

              {unifiedRows.length === 0 ? (
                <div className="rounded-2xl border border-zinc-700/50 bg-zinc-800/20 p-3 text-sm text-zinc-300/70">
                  거래내역이 없습니다. (기간/거래처/모드 필터를 확인하세요)
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex justify-end text-xs text-zinc-300/60">
              <div className="w-[110px] text-right">금액</div>
              <div className="w-[130px] text-right">잔액</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}