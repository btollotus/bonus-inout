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
type PartnerView = "FAVORITE" | "RECENT" | "ALL";

type Line = {
  food_type: string; // ✅ 식품유형 (자동완성)
  name: string;
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

function ymdToDisplay(ymd: string | null | undefined) {
  if (!ymd) return "";
  return ymd;
}

function addDays(ymd: string, delta: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function TradeClient() {
  const supabase = useMemo(() => createClient(), []);

  const [msg, setMsg] = useState<string | null>(null);

  // =====================
  // 거래처 (Partners)
  // =====================
  const [partnerFilter, setPartnerFilter] = useState("");
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerRow | null>(null);

  // ✅ 원복: 즐겨찾기/최근/전체 탭
  const [partnerView, setPartnerView] = useState<PartnerView>("ALL");
  const [recentPartnerIds, setRecentPartnerIds] = useState<string[]>([]);

  // =====================
  // 모드
  // =====================
  const [mode, setMode] = useState<Mode>("UNIFIED");

  // =====================
  // 거래처 등록 폼
  // =====================
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [p_name, setP_name] = useState("");
  const [p_businessNo, setP_businessNo] = useState("");
  const [p_ceo, setP_ceo] = useState("");
  const [p_phone, setP_phone] = useState("");
  const [p_address1, setP_address1] = useState("");
  const [p_bizType, setP_bizType] = useState("");
  const [p_bizItem, setP_bizItem] = useState("");

  // =====================
  // 식품유형 (자동완성)
  // =====================
  const [foodTypes, setFoodTypes] = useState<string[]>([]);

  async function loadFoodTypes() {
    const { data, error } = await supabase
      .from("food_types")
      .select("name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(200);

    if (error) {
      // 식품유형은 부가 기능이라 에러를 메시지로 띄우진 않고 조용히 둡니다.
      return;
    }
    const names = (data ?? []).map((r: any) => String(r.name)).filter(Boolean);
    setFoodTypes(names);
  }

  // =====================
  // 주문/출고 입력
  // =====================
  const [shipDate, setShipDate] = useState(todayYMD());
  const [shipMethod, setShipMethod] = useState("택배");
  const [orderTitle, setOrderTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([{ food_type: "", name: "", qty: 0, unit: 0 }]);

  const orderTotals = useMemo(() => {
    const supply = lines.reduce((acc, l) => acc + toInt(l.qty) * toInt(l.unit), 0);
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    return { supply, vat, total };
  }, [lines]);

  // =====================
  // 금전출납 입력
  // =====================
  const [entryDate, setEntryDate] = useState(todayYMD());
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [payMethod, setPayMethod] = useState("BANK");

  // ✅ 요청: 카테고리 4개 라디오(버튼) + 저장값 통일
  const [category, setCategory] = useState<"매출입금" | "급여" | "세금" | "기타">("매출입금");

  const [amountStr, setAmountStr] = useState("");
  const [ledgerMemo, setLedgerMemo] = useState("");

  // =====================
  // 조회 기간 / 데이터
  // =====================
  const [fromYMD, setFromYMD] = useState(addDays(todayYMD(), -30));
  const [toYMD, setToYMD] = useState(todayYMD());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);

  // =====================
  // Loaders
  // =====================
  async function loadPartners() {
    setMsg(null);

    let q = supabase
      .from("partners")
      .select("id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name")
      .order("is_pinned", { ascending: false })
      .order("pin_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(200);

    const f = partnerFilter.trim();
    if (f) {
      q = q.or(`name.ilike.%${f}%,business_no.ilike.%${f}%`);
    }

    const { data, error } = await q;
    if (error) return setMsg(error.message);
    setPartners((data ?? []) as PartnerRow[]);
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
      .limit(200);

    if (selectedPartnerId) {
      oq = oq.or(
        `customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`
      );
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
      .limit(300);

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

  // =====================
  // Effects
  // =====================
  useEffect(() => {
    loadPartners();
    loadFoodTypes();

    // ✅ 최근 거래처 로드
    try {
      const raw = localStorage.getItem("trade_recent_partners");
      const ids = raw ? (JSON.parse(raw) as string[]) : [];
      if (Array.isArray(ids)) setRecentPartnerIds(ids.filter(Boolean));
    } catch {}

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

  // =====================
  // Partner Form
  // =====================
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
  }

  // =====================
  // Lines
  // =====================
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { food_type: "", name: "", qty: 0, unit: 0 }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  // =====================
  // Create Order
  // =====================
  async function createOrder() {
    setMsg(null);
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    if (lines.length === 0) return setMsg("품목을 1개 이상 입력하세요.");

    const cleanLines = lines
      .map((l) => ({
        food_type: l.food_type.trim(),
        name: l.name.trim(),
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
    setLines([{ food_type: "", name: "", qty: 0, unit: 0 }]);

    await loadTrades();
  }

  // =====================
  // Create Ledger
  // =====================
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
      category, // ✅ 4개 중 하나로 저장 (정렬/엑셀에 유리)
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

  // =====================
  // Partners view (FAV/RECENT/ALL)
  // =====================
  const partnersToShow = useMemo(() => {
    if (partnerView === "FAVORITE") {
      return partners.filter((p) => !!p.is_pinned);
    }
    if (partnerView === "RECENT") {
      const map = new Map(partners.map((p) => [p.id, p] as const));
      return recentPartnerIds.map((id) => map.get(id)).filter(Boolean) as PartnerRow[];
    }
    return partners;
  }, [partnerView, partners, recentPartnerIds]);

  function selectPartner(p: PartnerRow) {
    setSelectedPartner(p);
    setMsg(null);

    // ✅ 최근 거래처 저장 (최대 12개)
    setRecentPartnerIds((prev) => {
      const next = [p.id, ...prev.filter((id) => id !== p.id)].slice(0, 12);
      try {
        localStorage.setItem("trade_recent_partners", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // =====================
  // Unified list
  // =====================
  const unified = useMemo(() => {
    const items: Array<
      | { kind: "ORDER"; date: string; amount: number; title: string; sub: string; raw: OrderRow }
      | { kind: "LEDGER"; date: string; amount: number; title: string; sub: string; raw: LedgerRow }
    > = [];

    for (const o of orders) {
      const memo = safeJsonParse<{ title: string | null; lines: any[] }>(o.memo);

      const title = memo?.title
        ? `주문/출고 · ${memo.title}`
        : `주문/출고 · ${o.ship_method ?? ""}`.trim();

      const linesText =
        memo?.lines?.length
          ? memo.lines
              .slice(0, 3)
              .map((l) => `${l.name} ${formatMoney(l.qty)}×${formatMoney(l.unit)}`)
              .join(", ") + (memo.lines.length > 3 ? ` 외 ${memo.lines.length - 3}건` : "")
          : o.memo
          ? "메모 있음"
          : "";

      // ✅ 택배가 2번 보이던 문제 예방: sub에는 ship_method를 다시 붙이지 않습니다.
      const sub = linesText ? linesText : "";

      items.push({
        kind: "ORDER",
        date: o.ship_date ?? (o.created_at ? o.created_at.slice(0, 10) : ""),
        amount: -Number(o.total_amount ?? 0),
        title,
        sub,
        raw: o,
      });
    }

    for (const l of ledgers) {
      const sign = String(l.direction) === "OUT" ? -1 : 1;
      const title = `${l.category ?? "금전출납"} · ${l.method ?? ""}`.trim();
      const sub = `${l.counterparty_name ?? ""}${l.memo ? " · " + l.memo : ""}`.trim();

      items.push({
        kind: "LEDGER",
        date: l.entry_date,
        amount: sign * Number(l.amount ?? 0),
        title,
        sub,
        raw: l,
      });
    }

    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return items;
  }, [orders, ledgers]);

  const unifiedTotals = useMemo(() => {
    const plus = unified.filter((x) => x.amount > 0).reduce((a, x) => a + x.amount, 0);
    const minus = unified.filter((x) => x.amount < 0).reduce((a, x) => a + x.amount, 0);
    return { plus, minus, net: plus + minus };
  }, [unified]);

  return (
    <div className="mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6 text-white">
      {msg ? (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm">
          {msg}
        </div>
      ) : null}

      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* ===================== LEFT: Partners ===================== */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-lg font-semibold">거래처</div>
            <div className="flex gap-2">
              <button
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                onClick={() => {
                  setShowPartnerForm((v) => !v);
                  setMsg(null);
                }}
              >
                + 등록
              </button>
              <button
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                onClick={() => loadPartners()}
              >
                새로고침
              </button>
            </div>
          </div>

          {/* ✅ 원복: 즐겨찾기/최근/전체 */}
          <div className="mb-3 flex gap-2">
            <button
              className={`rounded-xl border px-3 py-2 text-sm ${
                partnerView === "FAVORITE"
                  ? "border-white/30 bg-white/15"
                  : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
              onClick={() => setPartnerView("FAVORITE")}
            >
              즐겨찾기
            </button>
            <button
              className={`rounded-xl border px-3 py-2 text-sm ${
                partnerView === "RECENT"
                  ? "border-white/30 bg-white/15"
                  : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
              onClick={() => setPartnerView("RECENT")}
            >
              최근
            </button>
            <button
              className={`rounded-xl border px-3 py-2 text-sm ${
                partnerView === "ALL"
                  ? "border-white/30 bg-white/15"
                  : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
              onClick={() => setPartnerView("ALL")}
            >
              전체
            </button>
          </div>

          {showPartnerForm ? (
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 text-sm font-semibold">거래처 등록</div>

              <div className="space-y-2">
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  placeholder="업체명(필수)"
                  value={p_name}
                  onChange={(e) => setP_name(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  placeholder="사업자등록번호"
                  value={p_businessNo}
                  onChange={(e) => setP_businessNo(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  placeholder="대표자"
                  value={p_ceo}
                  onChange={(e) => setP_ceo(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  placeholder="연락처"
                  value={p_phone}
                  onChange={(e) => setP_phone(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  placeholder="주소"
                  value={p_address1}
                  onChange={(e) => setP_address1(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    placeholder="업태"
                    value={p_bizType}
                    onChange={(e) => setP_bizType(e.target.value)}
                  />
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    placeholder="종목"
                    value={p_bizItem}
                    onChange={(e) => setP_bizItem(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                    onClick={() => {
                      setShowPartnerForm(false);
                      resetPartnerForm();
                    }}
                  >
                    취소
                  </button>
                  <button
                    className="flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                    onClick={createPartner}
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <input
            className="mb-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
            placeholder="목록 필터(이름/사업자번호)"
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
          />

          <div className="mb-2 text-xs text-white/60">
            선택된 거래처:{" "}
            {selectedPartner
              ? `${selectedPartner.name}${selectedPartner.business_no ? ` · ${selectedPartner.business_no}` : ""}`
              : "없음"}
          </div>

          <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
            {partnersToShow.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                표시할 거래처가 없습니다.
              </div>
            ) : (
              partnersToShow.map((p) => {
                const active = selectedPartner?.id === p.id;
                return (
                  <button
                    key={p.id}
                    className={`w-full rounded-2xl border px-3 py-3 text-left ${
                      active ? "border-white/30 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                    onClick={() => selectPartner(p)}
                  >
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-white/70">{p.business_no ?? ""}</div>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              onClick={() => setSelectedPartner(null)}
            >
              선택 해제
            </button>
            <button
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              onClick={() => loadTrades()}
            >
              조회 갱신
            </button>
          </div>
        </div>

        {/* ===================== RIGHT ===================== */}
        <div className="min-w-0 space-y-6">
          <div className="flex gap-2">
            <button
              className={`rounded-xl border px-4 py-2 text-sm ${
                mode === "ORDERS" ? "border-white/30 bg-white/15" : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
              onClick={() => setMode("ORDERS")}
            >
              주문/출고
            </button>
            <button
              className={`rounded-xl border px-4 py-2 text-sm ${
                mode === "LEDGER" ? "border-white/30 bg-white/15" : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
              onClick={() => setMode("LEDGER")}
            >
              금전출납
            </button>
            <button
              className={`rounded-xl border px-4 py-2 text-sm ${
                mode === "UNIFIED" ? "border-white/30 bg-white/15" : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
              onClick={() => setMode("UNIFIED")}
            >
              통합
            </button>
          </div>

          {/* ===================== 주문/출고 입력 ===================== */}
          {mode !== "LEDGER" ? (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="mb-3 text-lg font-semibold">주문/출고 입력</div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs text-white/70">출고일(주문일)</div>
                  <input
                    type="date"
                    className="date-input w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    value={shipDate}
                    onChange={(e) => setShipDate(e.target.value)}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-white/70">출고방법</div>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    value={shipMethod}
                    onChange={(e) => setShipMethod(e.target.value)}
                  >
                    <option value="택배">택배</option>
                    <option value="퀵">퀵</option>
                    <option value="직접">직접</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-white/70">메모(title)</div>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    placeholder='예: "2월 정기 주문"'
                    value={orderTitle}
                    onChange={(e) => setOrderTitle(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm font-semibold">품목(식품유형 자동완성 포함)</div>
                <button
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                  onClick={addLine}
                >
                  + 품목 추가
                </button>
              </div>

              {/* ✅ 헤더와 입력칸 그리드 완전 동일(정렬 문제 방지) */}
              <div className="mt-3 grid grid-cols-[1.3fr_2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 text-xs text-white/60">
                <div>식품유형</div>
                <div>품목명</div>
                <div className="text-right">수량</div>
                <div className="text-right">단가</div>
                <div className="text-right">공급가</div>
                <div className="text-right">부가세</div>
                <div className="text-right">총액</div>
                <div />
              </div>

              {/* ✅ 식품유형 datalist (자동완성) */}
              <datalist id="foodTypesList">
                {foodTypes.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>

              <div className="mt-2 space-y-2">
                {lines.map((l, i) => {
                  const supply = toInt(l.qty) * toInt(l.unit);
                  const vat = Math.round(supply * 0.1);
                  const total = supply + vat;

                  return (
                    <div key={i} className="grid grid-cols-[1.3fr_2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2">
                      <input
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                        placeholder="예: 당류가공품"
                        value={l.food_type}
                        list="foodTypesList"
                        onChange={(e) => updateLine(i, { food_type: e.target.value })}
                      />

                      <input
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                        placeholder="품목명"
                        value={l.name}
                        onChange={(e) => updateLine(i, { name: e.target.value })}
                      />

                      <input
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-right"
                        inputMode="numeric"
                        value={String(l.qty)}
                        onChange={(e) => updateLine(i, { qty: toInt(e.target.value) })}
                      />

                      <input
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-right"
                        inputMode="numeric"
                        value={String(l.unit)}
                        onChange={(e) => updateLine(i, { unit: toInt(e.target.value) })}
                      />

                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-right">
                        {formatMoney(supply)}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-right">
                        {formatMoney(vat)}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-right">
                        {formatMoney(total)}
                      </div>

                      <button
                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                        onClick={() => removeLine(i)}
                        title="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-end gap-4 text-sm">
                <div>공급가 {formatMoney(orderTotals.supply)}</div>
                <div>부가세 {formatMoney(orderTotals.vat)}</div>
                <div className="font-semibold">총액 {formatMoney(orderTotals.total)}</div>

                <button
                  className="ml-4 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                  onClick={createOrder}
                >
                  주문/출고 생성
                </button>
              </div>
            </div>
          ) : null}

          {/* ===================== 금전출납 입력 ===================== */}
          {mode !== "ORDERS" ? (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="mb-3 text-lg font-semibold">금전출납 입력</div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs text-white/70">일자</div>
                  <input
                    type="date"
                    className="date-input w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs text-white/70">구분</div>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as any)}
                  >
                    <option value="IN">입금(+)</option>
                    <option value="OUT">출금(-)</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-xs text-white/70">결제수단</div>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    <option value="BANK">BANK(계좌)</option>
                    <option value="CARD">CARD</option>
                    <option value="CASH">CASH</option>
                    <option value="ETC">기타</option>
                  </select>
                </div>

                {/* ✅ 요청: 카테고리 라디오(버튼) */}
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-white/70">카테고리</div>
                  <div className="flex flex-wrap gap-2">
                    {(["매출입금", "급여", "세금", "기타"] as const).map((c) => {
                      const active = category === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          className={`rounded-xl border px-3 py-2 text-sm ${
                            active ? "border-white/30 bg-white/15" : "border-white/15 bg-white/5 hover:bg-white/10"
                          }`}
                          onClick={() => setCategory(c)}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs text-white/70">금액(원)</div>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-right"
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

                <div className="md:col-span-3">
                  <div className="mb-1 text-xs text-white/70">메모</div>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    placeholder="예: 세금계산서 2/10 발행"
                    value={ledgerMemo}
                    onChange={(e) => setLedgerMemo(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                  onClick={createLedger}
                >
                  금전출납 기록
                </button>
              </div>
            </div>
          ) : null}

          {/* ===================== 거래내역 ===================== */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">거래내역</div>
                <div className="text-xs text-white/60">
                  표시: {mode === "ORDERS" ? "주문/출고" : mode === "LEDGER" ? "금전출납" : "통합"}{" "}
                  {selectedPartner ? `· 거래처: ${selectedPartner.name}` : "· 거래처: 전체"}
                </div>
              </div>

              <div className="text-right text-sm">
                <div>
                  + {formatMoney(unifiedTotals.plus)} &nbsp; {formatMoney(unifiedTotals.minus)} &nbsp; ={" "}
                  <span className="font-semibold">{formatMoney(unifiedTotals.net)}</span>
                </div>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div>
                <div className="mb-1 text-xs text-white/70">From</div>
                <input
                  type="date"
                  className="date-input w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  value={fromYMD}
                  onChange={(e) => setFromYMD(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-white/70">To</div>
                <input
                  type="date"
                  className="date-input w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  value={toYMD}
                  onChange={(e) => setToYMD(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                  onClick={() => {
                    setFromYMD(addDays(todayYMD(), -30));
                    setToYMD(todayYMD());
                  }}
                >
                  기간 초기화
                </button>
                <button
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                  onClick={() => loadTrades()}
                >
                  조회
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {unified
                .filter((x) => {
                  if (mode === "ORDERS") return x.kind === "ORDER";
                  if (mode === "LEDGER") return x.kind === "LEDGER";
                  return true;
                })
                .map((x) => (
                  <div key={`${x.kind}-${x.raw.id}`} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {ymdToDisplay(x.date)} · {x.title}
                        </div>
                        {x.sub ? <div className="mt-1 text-xs text-white/70">{x.sub}</div> : null}
                      </div>
                      <div className="shrink-0 text-right text-sm font-semibold">
                        {x.amount >= 0 ? "+" : ""}
                        {formatMoney(x.amount)}
                      </div>
                    </div>
                  </div>
                ))}

              {unified.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                  거래내역이 없습니다. (기간/거래처/모드 필터를 확인하세요)
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}