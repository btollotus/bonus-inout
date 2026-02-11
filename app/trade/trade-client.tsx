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
  weight_g: number;
  qty: number;
  unit: number;
};

type UnifiedRow = {
  kind: "ORDER" | "LEDGER";
  date: string;
  tsKey: string;
  partnerName: string;
  category: string; // 표의 "카테고리"
  method: string; // 표의 "방법"
  inAmt: number;
  outAmt: number;
  balance: number;
  rawId: string;

  // 복사용(주문)
  ship_method?: string;
  order_title?: string | null;
  order_lines?: Array<{
    food_type?: string;
    name: string;
    weight_g?: number;
    qty: number;
    unit: number;
  }>;

  // 복사용(금전출납)
  ledger_category?: string | null;
  ledger_method?: string | null;
  ledger_memo?: string | null;
  ledger_amount?: number;
};

function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
}

function toInt(n: any) {
  const v = Number(String(n ?? "").replaceAll(",", ""));
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

const LS_RECENT_PARTNERS = "bonus_trade_recent_partners_v1";

const CATEGORIES = ["매출입금", "급여", "세금", "기타"] as const;
type Category = (typeof CATEGORIES)[number];

function categoryToDirection(c: Category): "IN" | "OUT" {
  return c === "매출입금" ? "IN" : "OUT";
}

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
  const [lines, setLines] = useState<Line[]>([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: 0 }]);

  // 금전출납 입력 (구분 삭제: 카테고리로 자동 결정)
  const [entryDate, setEntryDate] = useState(todayYMD());
  const [payMethod, setPayMethod] = useState("BANK");
  const [category, setCategory] = useState<Category>("매출입금");
  const [amountStr, setAmountStr] = useState("");
  const [ledgerMemo, setLedgerMemo] = useState("");

  // 조회기간/데이터
  const [fromYMD, setFromYMD] = useState(addDays(todayYMD(), -30));
  const [toYMD, setToYMD] = useState(todayYMD());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);

  // ✅ 기초잔액 포함 러닝잔액
  const [includeOpening, setIncludeOpening] = useState(true);
  const [openingBalance, setOpeningBalance] = useState(0);

  // ✅ (현재 기간) 주문/출고 합계
  const orderTotals = useMemo(() => {
    const supply = lines.reduce((acc, l) => acc + toInt(l.qty) * toInt(l.unit), 0);
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    return { supply, vat, total };
  }, [lines]);

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
      .select(
        "id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name"
      )
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

    // ---- 현재 기간 Orders
    let oq = supabase
      .from("orders")
      .select(
        "id,customer_id,customer_name,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount,created_at"
      )
      .gte("ship_date", f)
      .lte("ship_date", t)
      .order("ship_date", { ascending: false })
      .limit(500);

    if (selectedPartnerId) {
      oq = oq.or(
        `customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`
      );
    }

    const { data: oData, error: oErr } = await oq;
    if (oErr) return setMsg(oErr.message);
    setOrders((oData ?? []) as OrderRow[]);

    // ---- 현재 기간 Ledgers
    let lq = supabase
      .from("ledger_entries")
      .select(
        "id,entry_date,entry_ts,direction,amount,category,method,counterparty_name,business_no,memo,status,partner_id,created_at"
      )
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

    // ---- ✅ 기초잔액(기간 시작 전 누적) 계산
    // MVP 방식: 기간 시작 전 데이터를 가져와서 클라에서 합산 (많으면 limit 조정)
    let opening = 0;

    // Orders before f
    let oq2 = supabase
      .from("orders")
      .select("id,ship_date,total_amount,customer_id,customer_name")
      .lt("ship_date", f)
      .order("ship_date", { ascending: false })
      .limit(5000);

    if (selectedPartnerId) {
      oq2 = oq2.or(
        `customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`
      );
    }

    const { data: oPrev, error: oPrevErr } = await oq2;
    if (!oPrevErr && oPrev) {
      const sum = oPrev.reduce((acc: number, r: any) => acc + Number(r.total_amount ?? 0), 0);
      opening += -sum; // 주문/출고는 출금으로 처리
    }

    // Ledgers before f
    let lq2 = supabase
      .from("ledger_entries")
      .select("id,entry_date,direction,amount,partner_id,business_no,counterparty_name")
      .lt("entry_date", f)
      .order("entry_date", { ascending: false })
      .limit(10000);

    if (selectedPartnerId || selectedBusinessNo) {
      const ors: string[] = [];
      if (selectedPartnerId) ors.push(`partner_id.eq.${selectedPartnerId}`);
      if (selectedBusinessNo) ors.push(`business_no.eq.${selectedBusinessNo}`);
      if (selectedPartner?.name) ors.push(`counterparty_name.eq.${selectedPartner.name.replaceAll(",", "")}`);
      lq2 = lq2.or(ors.join(","));
    }

    const { data: lPrev, error: lPrevErr } = await lq2;
    if (!lPrevErr && lPrev) {
      const sum = lPrev.reduce((acc: number, r: any) => {
        const sign = String(r.direction) === "OUT" ? -1 : 1;
        return acc + sign * Number(r.amount ?? 0);
      }, 0);
      opening += sum;
    }

    setOpeningBalance(opening);
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

    const dir = categoryToDirection(category);

    const payload: any = {
      entry_date: entryDate,
      entry_ts: new Date().toISOString(),
      direction: dir,
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

  // ✅ 통합표(장부 스타일)
  const unifiedRows = useMemo<UnifiedRow[]>(() => {
    const items: Array<Omit<UnifiedRow, "balance"> & { signed: number }> = [];

    // Orders -> 출금
    for (const o of orders) {
      const memo = safeJsonParse<{ title: string | null; lines: any[] }>(o.memo);
      const date = o.ship_date ?? (o.created_at ? o.created_at.slice(0, 10) : "");
      const tsKey = `${date}T12:00:00.000Z`;
      const total = Number(o.total_amount ?? 0);

      items.push({
        kind: "ORDER",
        date,
        tsKey,
        partnerName: o.customer_name ?? "",
        category: "주문/출고",
        method: o.ship_method ?? "",
        inAmt: 0,
        outAmt: total,
        signed: -total,
        rawId: o.id,
        ship_method: o.ship_method ?? "택배",
        order_title: memo?.title ?? null,
        order_lines: (memo?.lines ?? []).map((l) => ({
          food_type: l.food_type ?? "",
          name: l.name ?? "",
          weight_g: Number(l.weight_g ?? 0),
          qty: Number(l.qty ?? 0),
          unit: Number(l.unit ?? 0),
        })),
      });
    }

    // Ledgers -> category 기반 direction 그대로 사용
    for (const l of ledgers) {
      const sign = String(l.direction) === "OUT" ? -1 : 1;
      const amt = Number(l.amount ?? 0);

      items.push({
        kind: "LEDGER",
        date: l.entry_date,
        tsKey: l.entry_ts || `${l.entry_date}T12:00:00.000Z`,
        partnerName: l.counterparty_name ?? "",
        category: l.category ?? "금전출납",
        method: l.method ?? "",
        inAmt: sign > 0 ? amt : 0,
        outAmt: sign < 0 ? amt : 0,
        signed: sign * amt,
        rawId: l.id,
        ledger_category: l.category ?? null,
        ledger_method: l.method ?? null,
        ledger_memo: l.memo ?? null,
        ledger_amount: amt,
      });
    }

    // ✅ 러닝잔액은 “오래된 → 최신”으로 계산
    items.sort((a, b) => String(a.tsKey || a.date).localeCompare(String(b.tsKey || b.date)));

    let running = includeOpening ? openingBalance : 0;

    const withBal: UnifiedRow[] = items.map((x) => {
      running += x.signed;
      return {
        kind: x.kind,
        date: x.date,
        tsKey: x.tsKey,
        partnerName: x.partnerName,
        category: x.category,
        method: x.method,
        inAmt: x.inAmt,
        outAmt: x.outAmt,
        balance: running,
        rawId: x.rawId,
        ship_method: x.ship_method,
        order_title: x.order_title,
        order_lines: x.order_lines,
        ledger_category: x.ledger_category,
        ledger_method: x.ledger_method,
        ledger_memo: x.ledger_memo,
        ledger_amount: x.ledger_amount,
      };
    });

    // 화면 표시는 “최신 → 오래된”
    withBal.sort((a, b) => String(b.tsKey || b.date).localeCompare(String(a.tsKey || a.date)));
    return withBal;
  }, [orders, ledgers, includeOpening, openingBalance]);

  const unifiedTotals = useMemo(() => {
    const plus = unifiedRows.reduce((a, x) => a + x.inAmt, 0);
    const minus = unifiedRows.reduce((a, x) => a + x.outAmt, 0);
    const net = plus - minus;
    const endBalance = unifiedRows.length ? unifiedRows[0].balance : includeOpening ? openingBalance : 0;
    return { plus, minus, net, endBalance };
  }, [unifiedRows, includeOpening, openingBalance]);

  // ====== Copy Fill (여러 번 반복 가능) ======
  function fillFromOrderRow(r: UnifiedRow) {
    setMsg(null);
    setMode("ORDERS");

    // 반복 주문이 대부분이니: 날짜는 오늘로 자동
    setShipDate(todayYMD());
    setShipMethod(r.ship_method ?? "택배");
    setOrderTitle(r.order_title ?? "");

    const nextLines =
      r.order_lines?.length
        ? r.order_lines.map((l) => ({
            food_type: String(l.food_type ?? ""),
            name: String(l.name ?? ""),
            weight_g: toInt(l.weight_g ?? 0),
            qty: toInt(l.qty ?? 0),
            unit: toInt(l.unit ?? 0),
          }))
        : [{ food_type: "", name: "", weight_g: 0, qty: 0, unit: 0 }];

    setLines(nextLines);
  }

  function fillFromLedgerRow(r: UnifiedRow) {
    setMsg(null);
    setMode("LEDGER");

    setEntryDate(todayYMD());
    const c = (r.ledger_category as Category) ?? "기타";
    setCategory(CATEGORIES.includes(c) ? c : "기타");
    setPayMethod(r.ledger_method ?? "BANK");
    setLedgerMemo(r.ledger_memo ?? "");
    const amt = Number(r.ledger_amount ?? 0);
    setAmountStr(amt > 0 ? amt.toLocaleString("ko-KR") : "");
  }

  function onCopyClick(r: UnifiedRow) {
    if (r.kind === "ORDER") fillFromOrderRow(r);
    else fillFromLedgerRow(r);
  }

  // ====== UI (KB 느낌 라이트) ======
  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const inputRight = `${input} text-right tabular-nums`;
  const btn =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";

  // 조회대상 텍스트
  const targetLabel = selectedPartner ? selectedPartner.name : "전체";

  return (
    <div className={`${pageBg} min-h-screen`}>
      <div className="mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {msg}
          </div>
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
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
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

            <div className="mb-2 text-xs text-slate-600">
              선택된 거래처:{" "}
              {selectedPartner
                ? `${selectedPartner.name}${selectedPartner.business_no ? ` · ${selectedPartner.business_no}` : ""}`
                : "없음"}
            </div>

            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {partnersToShow.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
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
                        active ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <button className="flex-1 rounded-2xl px-3 py-3 text-left" onClick={() => selectPartner(p)}>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.business_no ?? ""}</div>
                      </button>

                      <button
                        type="button"
                        className="mr-2 my-2 w-10 rounded-xl border border-slate-200 bg-white text-lg hover:bg-slate-50"
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
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">주문/출고 입력</div>
                    <div className="mt-2">
                      <span className={pill}>조회대상: {targetLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <div className="mb-1 text-xs text-slate-600">출고일(주문일)</div>
                    <input type="date" className={input} value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-600">출고방법</div>
                    <select className={input} value={shipMethod} onChange={(e) => setShipMethod(e.target.value)}>
                      <option value="택배">택배</option>
                      <option value="퀵">퀵</option>
                      <option value="직접">직접</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-600">메모(title)</div>
                    <input
                      className={input}
                      placeholder=""
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

                {/* ✅ 헤더/입력칸 “왼쪽 맞춤” 핵심:
                    - 헤더: 각 칸을 pl-3
                    - 입력: input 자체가 px-3 (왼쪽 3)
                    - 그래서 시작점이 동일해짐 */}
                <div className="mt-3 grid grid-cols-[175px_1fr_180px_110px_130px_120px_120px_120px_auto] gap-2 text-xs text-slate-600">
                  <div className="pl-3">식품유형</div>
                  <div className="pl-3">품목명</div>
                  <div className="pl-3">무게(g)</div>
                  <div className="pl-3 text-right">수량</div>
                  <div className="pl-3 text-right">단가</div>
                  <div className="pl-3 text-right">공급가</div>
                  <div className="pl-3 text-right">부가세</div>
                  <div className="pl-3 text-right">총액</div>
                  <div />
                </div>

                <div className="mt-2 space-y-2">
                  {lines.map((l, i) => {
                    const supply = toInt(l.qty) * toInt(l.unit);
                    const vat = Math.round(supply * 0.1);
                    const total = supply + vat;

                    return (
                      <div key={i} className="grid grid-cols-[180px_1fr_120px_110px_130px_120px_120px_120px_auto] gap-2">
                        {/* 식품유형 */}
                        <input
                          className={input}
                          list="food-types-list"
                          placeholder=""
                          value={l.food_type}
                          onChange={(e) => updateLine(i, { food_type: e.target.value })}
                        />

                        {/* 품목명 */}
                        <input
                          className={input}
                          placeholder=""
                          value={l.name}
                          onChange={(e) => updateLine(i, { name: e.target.value })}
                        />

                        {/* 무게(g) */}
                        <input
                          className={inputRight}
                          inputMode="numeric"
                          value={formatMoney(l.weight_g)}
                          onChange={(e) => updateLine(i, { weight_g: toInt(e.target.value) })}
                        />

                        {/* ✅ 수량(콤마) */}
                        <input
                          className={inputRight}
                          inputMode="numeric"
                          value={formatMoney(l.qty)}
                          onChange={(e) => updateLine(i, { qty: toInt(e.target.value) })}
                        />

                        {/* ✅ 단가(콤마) */}
                        <input
                          className={inputRight}
                          inputMode="numeric"
                          value={formatMoney(l.unit)}
                          onChange={(e) => updateLine(i, { unit: toInt(e.target.value) })}
                        />

                        {/* 공급가/부가세/총액 */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">
                          {formatMoney(supply)}
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">
                          {formatMoney(vat)}
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums font-semibold">
                          {formatMoney(total)}
                        </div>

                        <button className={btn} onClick={() => removeLine(i)} title="삭제">
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>

                <datalist id="food-types-list">
                  {foodTypes.map((ft) => (
                    <option key={ft.id} value={ft.name} />
                  ))}
                </datalist>

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
                <div className="mb-2">
                  <div className="text-lg font-semibold">금전출납 입력</div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className={pill}>조회대상: {targetLabel}</span>
                    <div className="text-sm text-slate-600">
                      방향:{" "}
                      <span className="font-semibold">
                        {categoryToDirection(category) === "IN" ? "입금(+)" : "출금(-)"}
                      </span>
                      <span className="ml-2 text-xs text-slate-500">(카테고리로 자동)</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <div className="mb-1 text-xs text-slate-600">일자</div>
                    <input type="date" className={input} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">결제수단</div>
                    <select className={input} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                      <option value="BANK">BANK(계좌)</option>
                      <option value="CARD">CARD</option>
                      <option value="CASH">CASH</option>
                      <option value="ETC">기타</option>
                    </select>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">카테고리</div>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((c) => (
                        <button key={c} type="button" className={category === c ? btnOn : btn} onClick={() => setCategory(c)}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ✅ 요청: 메모/금액 좌우 위치 변경 => 금액 먼저, 메모가 넓게 */}
                  <div>
                    <div className="mb-1 text-xs text-slate-600">금액(원)</div>
                    <input
                      className={inputRight}
                      inputMode="numeric"
                      placeholder=""
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

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">메모</div>
                    <input className={input} placeholder="" value={ledgerMemo} onChange={(e) => setLedgerMemo(e.target.value)} />
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
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-lg font-semibold">거래내역</div>
                  <div className="mt-2">
                    <span className={pill}>조회대상: {targetLabel}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    표시: {mode === "ORDERS" ? "주문/출고" : mode === "LEDGER" ? "금전출납" : "통합"}
                    {includeOpening ? " · 기초잔액 포함" : ""}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-sm">
                  <div className="text-xs text-slate-600">기간 시작 전 기초잔액</div>
                  <div className="font-semibold tabular-nums">{formatMoney(openingBalance)}</div>
                  <div className="mt-2">
                    <div className="text-xs text-slate-600">
                      입금 {formatMoney(unifiedTotals.plus)} · 출금 {formatMoney(unifiedTotals.minus)}
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      잔액(최신) {formatMoney(unifiedTotals.endBalance)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div>
                  <div className="mb-1 text-xs text-slate-600">From</div>
                  <input type="date" className={input} value={fromYMD} onChange={(e) => setFromYMD(e.target.value)} />
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-600">To</div>
                  <input type="date" className={input} value={toYMD} onChange={(e) => setToYMD(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
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
                  <button
                    className={includeOpening ? btnOn : btn}
                    onClick={() => setIncludeOpening((v) => !v)}
                    title="기간 시작 전 기초잔액을 러닝잔액에 포함"
                  >
                    기초잔액 포함 러닝잔액
                  </button>
                </div>
              </div>

              {/* ✅ 장부형 표 */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-[120px_200px_160px_140px_140px_140px_140px_120px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                    <div className="pl-3">날짜</div>
                    <div className="pl-3">거래처</div>
                    <div className="pl-3">카테고리</div>
                    <div className="pl-3">방법</div>
                    <div className="pl-3 text-right">입금</div>
                    <div className="pl-3 text-right">출금</div>
                    <div className="pl-3 text-right">잔액</div>
                    <div className="pl-3 text-center">복사</div>
                  </div>

                  {unifiedRows
                    .filter((x) => {
                      if (mode === "ORDERS") return x.kind === "ORDER";
                      if (mode === "LEDGER") return x.kind === "LEDGER";
                      return true;
                    })
                    .map((x) => (
                      <div
                        key={`${x.kind}-${x.rawId}`}
                        className="grid grid-cols-[120px_200px_160px_140px_140px_140px_140px_120px] border-t border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <div className="pl-3 font-semibold tabular-nums">{x.date}</div>

                        {/* ✅ 요청: 전체 조회에서 사업자번호 행 표시는 없어도 됨 => 이름만 */}
                        <div className="pl-3 font-semibold">{x.partnerName}</div>

                        <div className="pl-3 font-semibold">{x.category}</div>
                        <div className="pl-3 font-semibold">{x.method}</div>

                        <div className="pl-3 text-right tabular-nums font-semibold text-blue-700">
                          {x.inAmt ? formatMoney(x.inAmt) : ""}
                        </div>
                        <div className="pl-3 text-right tabular-nums font-semibold text-red-600">
                          {x.outAmt ? formatMoney(x.outAmt) : ""}
                        </div>

                        <div className="pl-3 text-right tabular-nums font-semibold">{formatMoney(x.balance)}</div>

                        <div className="pl-3 text-center">
                          <button className={btn} onClick={() => onCopyClick(x)}>
                            복사
                          </button>
                        </div>
                      </div>
                    ))}

                  {unifiedRows.length === 0 ? (
                    <div className="bg-white px-4 py-4 text-sm text-slate-500">
                      거래내역이 없습니다. (기간/거래처/모드 필터를 확인하세요)
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 text-xs text-slate-500">
                ※ 주문/출고는 출금으로 표시됩니다. (입금/출금은 모두 양수 입력, 계산에서만 차감 처리)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}