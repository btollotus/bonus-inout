"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * TradeClient.tsx (전체 교체본)
 * - 옵션2(매입 VAT 정확): ledger_entries에 supply_amount / vat_amount / total_amount / vat_type / vat_rate 저장
 * - DB 카테고리 로드/관리: ledger_categories 테이블 기반(추가/수정/활성/정렬/방향)
 *
 * ⚠️ 주의:
 * - 이 파일은 “주문/출고 + 금전출납 + 통합” 페이지를 한 파일에서 운영하는 형태로 작성되어 있습니다.
 * - orders / ledger_entries / partners / ledger_categories 스키마는 대표님이 올려준 컬럼 기준으로 맞췄습니다.
 * - order_items 같은 상세 품목 테이블은 프로젝트마다 다를 수 있어, 주문/출고는 “헤더(orders)” 저장 중심으로 구성했습니다.
 */

type LedgerDirection = "IN" | "OUT";
type VatType = "TAXED" | "EXEMPT" | "ZERO" | "NA";

type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
  ceo_name?: string | null;
  biz_type?: string | null;
  biz_item?: string | null;
  phone?: string | null;
  address1?: string | null;

  is_pinned?: boolean | null;
  pin_order?: number | null;
  partner_type?: string | null;
  group_name?: string | null;

  ship_to_name?: string | null;
  ship_to_address1?: string | null;
  ship_to_mobile?: string | null;
  ship_to_phone?: string | null;
};

type LedgerCategoryRow = {
  id: string;
  name: string;
  direction: LedgerDirection;
  sort_order: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type LedgerRow = {
  id: string;
  entry_date: string; // YYYY-MM-DD
  entry_ts: string;

  direction: LedgerDirection;
  amount: number; // (호환용) 총액 의미로 사용 (옵션2에서는 total_amount를 권장)

  category: string;
  method: string; // USER-DEFINED in DB일 수 있어 string 처리

  counterparty_name: string | null;
  business_no: string | null;

  summary: string | null;
  memo: string | null;

  status: string;

  partner_id: string | null;

  // 옵션2 VAT
  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  vat_type: VatType | null;
  vat_rate: number | null;

  created_at?: string;
  updated_at?: string;
};

type OrderRow = {
  id: string;

  customer_id: string | null;
  customer_name: string;
  title: string | null;

  ship_date: string;
  ship_method: string | null;

  status: string;
  memo: string | null;

  supply_amount: number;
  vat_amount: number;
  total_amount: number;

  created_at?: string;
  updated_at?: string;
};

function ymdToday() {
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

function toNumberSafe(v: any) {
  const n = Number(String(v ?? "").replaceAll(",", "").trim());
  return Number.isFinite(n) ? n : 0;
}

function money(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
}

function clampInt(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

/** 옵션2: 총액 기준(부가세 포함) -> 공급가/부가세 분리 (기본 10%) */
function splitVatFromTotal(total: number, rate: number) {
  const r = rate;
  if (r <= 0) {
    return { supply: total, vat: 0, total };
  }
  const supply = Math.round(total / (1 + r));
  const vat = total - supply;
  return { supply, vat, total };
}

/** 옵션2: 공급가 기준 -> 부가세/총액 계산 */
function calcVatFromSupply(supply: number, rate: number) {
  const vat = Math.round(supply * rate);
  const total = supply + vat;
  return { supply, vat, total };
}

export default function TradeClient() {
  const supabase = useMemo(() => createClient(), []);

  // =========================
  // UI 상태
  // =========================
  const [tab, setTab] = useState<"ORDER" | "LEDGER" | "UNION">("UNION");
  const [msg, setMsg] = useState<string | null>(null);

  // 기간
  const [fromYMD, setFromYMD] = useState(addDays(ymdToday(), -30));
  const [toYMD, setToYMD] = useState(ymdToday());

  // 거래처
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [partnerFilter, setPartnerFilter] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const selectedPartner = useMemo(
    () => partners.find((p) => p.id === selectedPartnerId) ?? null,
    [partners, selectedPartnerId]
  );

  // 카테고리(DB)
  const [cats, setCats] = useState<LedgerCategoryRow[]>([]);
  const [catManageOpen, setCatManageOpen] = useState(false);

  // 주문/출고 (orders)
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const [orderShipDate, setOrderShipDate] = useState(ymdToday());
  const [orderCustomerName, setOrderCustomerName] = useState("");
  const [orderShipMethod, setOrderShipMethod] = useState<string>("택배");
  const [orderTitle, setOrderTitle] = useState("");
  const [orderMemo, setOrderMemo] = useState("");
  const [orderSupply, setOrderSupply] = useState<number>(0);
  const [orderVat, setOrderVat] = useState<number>(0);
  const [orderTotal, setOrderTotal] = useState<number>(0);

  // 금전출납 (ledger_entries)
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);

  // 입력 폼(금전출납)
  const [ledgerDate, setLedgerDate] = useState(ymdToday());
  const [ledgerMethod, setLedgerMethod] = useState<string>("계좌입금");
  const [ledgerCategory, setLedgerCategory] = useState<string>(""); // name
  const [ledgerDirection, setLedgerDirection] = useState<LedgerDirection>("IN");

  const [ledgerCounterpartyName, setLedgerCounterpartyName] = useState<string>("");
  const [ledgerBusinessNo, setLedgerBusinessNo] = useState<string>("");

  const [ledgerMemo, setLedgerMemo] = useState<string>("");

  // 옵션2 VAT 입력 방식
  const [vatType, setVatType] = useState<VatType>("TAXED");
  const [vatRate, setVatRate] = useState<number>(0.1);

  const [ledgerTotalAmount, setLedgerTotalAmount] = useState<number>(0); // 총액(부가세 포함)
  const [ledgerSupplyAmount, setLedgerSupplyAmount] = useState<number>(0); // 공급가
  const [ledgerVatAmount, setLedgerVatAmount] = useState<number>(0); // 부가세

  const [vatBaseMode, setVatBaseMode] = useState<"TOTAL" | "SUPPLY">("TOTAL"); // 총액 기준 vs 공급가 기준

  // =========================
  // 스타일(기존 톤 유지: 흰바탕 + 파란 버튼)
  // =========================
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnBlue = "rounded-xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill = "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700";
  const pillOn = "rounded-full border border-blue-600/20 bg-blue-600 px-3 py-1 text-xs text-white";

  // =========================
  // 카테고리 로드/기본값
  // =========================
  async function loadCategories() {
    const { data, error } = await supabase
      .from("ledger_categories")
      .select("id,name,direction,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);

    if (error) {
      setMsg(error.message);
      return;
    }
    const rows = (data ?? []) as LedgerCategoryRow[];
    setCats(rows);

    // 입력폼 기본 카테고리(없으면 기존값 유지)
    if (!ledgerCategory) {
      const firstActive = rows.find((c) => c.is_active);
      if (firstActive) {
        setLedgerCategory(firstActive.name);
        setLedgerDirection(firstActive.direction);
      }
    }
  }

  function findCatByName(name: string) {
    return cats.find((c) => c.name === name) ?? null;
  }

  // =========================
  // 거래처 로드
  // =========================
  async function loadPartners() {
    // 즐겨찾기(pin_order 우선) + 이름 정렬
    const { data, error } = await supabase
      .from("partners")
      .select(
        "id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone"
      )
      .order("is_pinned", { ascending: false })
      .order("pin_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(2000);

    if (error) {
      setMsg(error.message);
      return;
    }
    setPartners((data ?? []) as PartnerRow[]);
  }

  async function togglePin(partner: PartnerRow) {
    const nextPinned = !Boolean(partner.is_pinned);
    const patch: any = { is_pinned: nextPinned };

    // pin_order는 pinned 될 때만 맨 뒤로(간단)
    if (nextPinned) patch.pin_order = partner.pin_order ?? 9999;
    else patch.pin_order = null;

    const { error } = await supabase.from("partners").update(patch).eq("id", partner.id);
    if (error) {
      setMsg(error.message);
      return;
    }
    await loadPartners();
  }

  // =========================
  // 주문/출고(헤더 orders) 로드
  // =========================
  async function loadOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select("id,customer_id,customer_name,title,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount,created_at,updated_at")
      .gte("ship_date", fromYMD)
      .lte("ship_date", toYMD)
      .order("ship_date", { ascending: false })
      .limit(5000);

    if (error) {
      setMsg(error.message);
      return;
    }
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      supply_amount: toNumberSafe(r.supply_amount),
      vat_amount: toNumberSafe(r.vat_amount),
      total_amount: toNumberSafe(r.total_amount),
    })) as OrderRow[];
    setOrders(rows);
  }

  // =========================
  // 금전출납(ledger_entries) 로드
  // =========================
  async function loadLedgers() {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select(
        "id,entry_date,entry_ts,direction,amount,category,method,counterparty_name,business_no,summary,memo,status,partner_id,supply_amount,vat_amount,total_amount,vat_type,vat_rate,created_at,updated_at"
      )
      .gte("entry_date", fromYMD)
      .lte("entry_date", toYMD)
      .order("entry_date", { ascending: false })
      .order("entry_ts", { ascending: false })
      .limit(20000);

    if (error) {
      setMsg(error.message);
      return;
    }
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      amount: toNumberSafe(r.amount),
      supply_amount: r.supply_amount == null ? null : toNumberSafe(r.supply_amount),
      vat_amount: r.vat_amount == null ? null : toNumberSafe(r.vat_amount),
      total_amount: r.total_amount == null ? null : toNumberSafe(r.total_amount),
      vat_rate: r.vat_rate == null ? null : Number(r.vat_rate),
    })) as LedgerRow[];
    setLedgers(rows);
  }

  async function reloadAll() {
    setMsg(null);
    await Promise.all([loadPartners(), loadCategories(), loadOrders(), loadLedgers()]);
  }

  // 최초 로드
  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 기간 바뀌면 리로드(주문/출고, 금전출납)
  useEffect(() => {
    loadOrders();
    loadLedgers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromYMD, toYMD]);

  // 거래처 선택 시 입력 폼에 반영(편의)
  useEffect(() => {
    if (!selectedPartner) return;

    // 금전출납: 거래처명/사업자번호 자동 세팅(비어 있을 때만)
    if (!ledgerCounterpartyName) setLedgerCounterpartyName(selectedPartner.name ?? "");
    if (!ledgerBusinessNo) setLedgerBusinessNo(selectedPartner.business_no ?? "");

    // 주문/출고: 고객명/ID 세팅(비어 있을 때만)
    if (!orderCustomerName) setOrderCustomerName(selectedPartner.name ?? "");
  }, [
    selectedPartnerId,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    selectedPartner?.id,
  ]);

  // 카테고리 변경 시 direction 자동
  useEffect(() => {
    const c = findCatByName(ledgerCategory);
    if (c) setLedgerDirection(c.direction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerCategory, cats.map((x) => x.id).join("|")]);

  // =========================
  // 옵션2 VAT 계산(입력 즉시 반영)
  // =========================
  useEffect(() => {
    if (vatType !== "TAXED") {
      // 면세/영세/해당없음: VAT 0
      if (vatBaseMode === "TOTAL") {
        const t = clampInt(ledgerTotalAmount);
        setLedgerSupplyAmount(t);
        setLedgerVatAmount(0);
      } else {
        const s = clampInt(ledgerSupplyAmount);
        setLedgerTotalAmount(s);
        setLedgerVatAmount(0);
      }
      return;
    }

    const r = Number(vatRate ?? 0);
    if (vatBaseMode === "TOTAL") {
      const t = clampInt(ledgerTotalAmount);
      const { supply, vat, total } = splitVatFromTotal(t, r);
      setLedgerSupplyAmount(supply);
      setLedgerVatAmount(vat);
      setLedgerTotalAmount(total);
    } else {
      const s = clampInt(ledgerSupplyAmount);
      const { supply, vat, total } = calcVatFromSupply(s, r);
      setLedgerSupplyAmount(supply);
      setLedgerVatAmount(vat);
      setLedgerTotalAmount(total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerTotalAmount, ledgerSupplyAmount, vatType, vatRate, vatBaseMode]);

  // =========================
  // 주문/출고 생성(헤더 저장)
  // =========================
  async function createOrder() {
    setMsg(null);

    const ship_date = orderShipDate || ymdToday();
    const customer_name = (orderCustomerName || "").trim();
    if (!customer_name) return setMsg("주문자(거래처명)를 입력하세요.");

    const supply_amount = clampInt(orderSupply);
    const vat_amount = clampInt(orderVat);
    const total_amount = clampInt(orderTotal);

    const payload: any = {
      customer_id: selectedPartnerId ?? null,
      customer_name,
      title: orderTitle ? orderTitle.trim() : null,
      ship_date,
      ship_method: orderShipMethod ? String(orderShipMethod) : null,
      status: "OK",
      memo: orderMemo ? orderMemo.trim() : null,
      supply_amount,
      vat_amount,
      total_amount,
    };

    const { error } = await supabase.from("orders").insert(payload);
    if (error) return setMsg(error.message);

    // 입력값 일부 초기화(대표님 편의)
    setOrderTitle("");
    setOrderMemo("");
    setOrderSupply(0);
    setOrderVat(0);
    setOrderTotal(0);

    await loadOrders();
  }

  // 주문 VAT 자동 계산(공급가 기준 10%)
  function calcOrderVatFromSupply() {
    const s = clampInt(orderSupply);
    const v = Math.round(s * 0.1);
    setOrderVat(v);
    setOrderTotal(s + v);
  }
  // 주문 VAT 자동 계산(총액 기준 10%)
  function splitOrderVatFromTotal() {
    const t = clampInt(orderTotal);
    const supply = Math.round(t / 1.1);
    const vat = t - supply;
    setOrderSupply(supply);
    setOrderVat(vat);
  }

  // =========================
  // 금전출납 기록(옵션2 VAT 저장)
  // =========================
  async function createLedgerEntry() {
    setMsg(null);

    const entry_date = ledgerDate || ymdToday();
    const category = (ledgerCategory || "").trim();
    if (!category) return setMsg("카테고리를 선택하세요.");

    const method = (ledgerMethod || "").trim() || "ETC";

    const cpName = ledgerCounterpartyName.trim() || null;
    const bizNo = ledgerBusinessNo.trim() || null;

    const t = clampInt(ledgerTotalAmount);
    const s = clampInt(ledgerSupplyAmount);
    const v = clampInt(ledgerVatAmount);

    // amount(호환용) = total_amount
    const payload: any = {
      entry_date,
      direction: ledgerDirection,
      amount: t,
      category,
      method,
      counterparty_name: cpName,
      business_no: bizNo,
      summary: null,
      memo: ledgerMemo.trim() || null,
      status: "OK",
      partner_id: selectedPartnerId ?? null,

      // 옵션2 VAT
      total_amount: t,
      supply_amount: s,
      vat_amount: v,
      vat_type: vatType,
      vat_rate: vatType === "TAXED" ? Number(vatRate ?? 0.1) : 0,
    };

    const { error } = await supabase.from("ledger_entries").insert(payload);
    if (error) return setMsg(error.message);

    // 입력 초기화(대표님 편의)
    setLedgerMemo("");
    setLedgerTotalAmount(0);
    setLedgerSupplyAmount(0);
    setLedgerVatAmount(0);
    setVatType("TAXED");
    setVatRate(0.1);
    setVatBaseMode("TOTAL");

    await loadLedgers();
  }

  // =========================
  // 카테고리 관리(CRUD)
  // =========================
  const [catDraftId, setCatDraftId] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catDir, setCatDir] = useState<LedgerDirection>("IN");
  const [catSort, setCatSort] = useState<number>(0);
  const [catActive, setCatActive] = useState<boolean>(true);

  function openCatNew() {
    setCatDraftId(null);
    setCatName("");
    setCatDir("IN");
    setCatSort(0);
    setCatActive(true);
    setCatManageOpen(true);
  }

  function openCatEdit(row: LedgerCategoryRow) {
    setCatDraftId(row.id);
    setCatName(row.name);
    setCatDir(row.direction);
    setCatSort(row.sort_order ?? 0);
    setCatActive(Boolean(row.is_active));
    setCatManageOpen(true);
  }

  async function saveCategory() {
    setMsg(null);
    const name = catName.trim();
    if (!name) return setMsg("카테고리명을 입력하세요.");

    const payload: any = {
      name,
      direction: catDir,
      sort_order: clampInt(catSort),
      is_active: Boolean(catActive),
    };

    if (catDraftId) {
      const { error } = await supabase.from("ledger_categories").update(payload).eq("id", catDraftId);
      if (error) return setMsg(error.message);
    } else {
      const { error } = await supabase.from("ledger_categories").insert(payload);
      if (error) return setMsg(error.message);
    }

    await loadCategories();
    setCatManageOpen(false);
  }

  async function toggleCategoryActive(row: LedgerCategoryRow) {
    const { error } = await supabase
      .from("ledger_categories")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) return setMsg(error.message);
    await loadCategories();
  }

  // =========================
  // 통합 집계(기간)
  // =========================
  const sumOrders = useMemo(() => {
    const supply = orders.reduce((a, x) => a + toNumberSafe(x.supply_amount), 0);
    const vat = orders.reduce((a, x) => a + toNumberSafe(x.vat_amount), 0);
    const total = orders.reduce((a, x) => a + toNumberSafe(x.total_amount), 0);
    return { supply, vat, total };
  }, [orders]);

  // 매입 VAT 정확(옵션2): ledger_entries OUT + vat_type=TAXED 기준 vat_amount만 집계
  const sumPurchase = useMemo(() => {
    let supply = 0;
    let vat = 0;
    let total = 0;

    for (const l of ledgers) {
      if (l.direction !== "OUT") continue;

      const t = toNumberSafe(l.total_amount ?? l.amount);
      const s = toNumberSafe(l.supply_amount ?? 0);
      const v = toNumberSafe(l.vat_amount ?? 0);

      total += t;

      // 옵션2 채워진 건만 공급가/부가세 반영(정확성 우선)
      const hasVatCols = l.total_amount != null && l.supply_amount != null && l.vat_amount != null;
      if (!hasVatCols) continue;

      supply += s;

      const vt = String(l.vat_type ?? "TAXED").toUpperCase() as VatType;
      if (vt === "TAXED") vat += v;
    }

    return { supply, vat, total };
  }, [ledgers]);

  const expectedVatPayable = useMemo(() => sumOrders.vat - sumPurchase.vat, [sumOrders.vat, sumPurchase.vat]);

  // 매입처별(사업자번호 기준) 집계
  const purchaseByVendor = useMemo(() => {
    const map = new Map<
      string,
      { business_no: string; name: string; supply: number; vat: number; total: number; count: number }
    >();

    for (const l of ledgers) {
      if (l.direction !== "OUT") continue;

      const bn = (l.business_no ?? "").trim() || "(미입력)";
      const nm = (l.counterparty_name ?? "").trim() || "(거래처명 없음)";

      if (!map.has(bn)) map.set(bn, { business_no: bn, name: nm, supply: 0, vat: 0, total: 0, count: 0 });

      const row = map.get(bn)!;

      const t = toNumberSafe(l.total_amount ?? l.amount);
      row.total += t;
      row.count += 1;

      const hasVatCols = l.total_amount != null && l.supply_amount != null && l.vat_amount != null;
      if (hasVatCols) {
        row.supply += toNumberSafe(l.supply_amount);
        const vt = String(l.vat_type ?? "TAXED").toUpperCase() as VatType;
        if (vt === "TAXED") row.vat += toNumberSafe(l.vat_amount);
      }

      if (row.name === "(거래처명 없음)" && nm !== "(거래처명 없음)") row.name = nm;
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => String(a.business_no).localeCompare(String(b.business_no)));
    return arr;
  }, [ledgers]);

  // 매출처 거래원장(orders 기반) - 선택 고객
  const [customerLedgerId, setCustomerLedgerId] = useState<string>("ALL");
  const [customerSearch, setCustomerSearch] = useState<string>("");

  const customers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; business_no: string | null }>();
    for (const o of orders) {
      if (!o.customer_id) continue;
      const p = partners.find((x) => x.id === o.customer_id);
      const name = o.customer_name ?? p?.name ?? "(이름없음)";
      const business_no = p?.business_no ?? null;
      if (!map.has(o.customer_id)) map.set(o.customer_id, { id: o.customer_id, name, business_no });
    }
    let arr = Array.from(map.values());
    const q = customerSearch.trim();
    if (q) arr = arr.filter((x) => (x.name || "").includes(q) || (x.business_no || "").includes(q));
    arr.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return arr;
  }, [orders, partners, customerSearch]);

  const ordersForCustomer = useMemo(() => {
    if (customerLedgerId === "ALL") return [];
    return orders
      .filter((o) => o.customer_id === customerLedgerId)
      .slice()
      .sort((a, b) => String(a.ship_date).localeCompare(String(b.ship_date)));
  }, [orders, customerLedgerId]);

  function printNow() {
    window.print();
  }

  // 거래처 필터
  const filteredPartners = useMemo(() => {
    const q = partnerFilter.trim();
    const rows = partners.slice();
    if (!q) return rows;
    return rows.filter((p) => (p.name || "").includes(q) || (p.business_no || "").includes(q));
  }, [partners, partnerFilter]);

  // =========================
  // 렌더
  // =========================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        {/* 상단: 기간/탭 */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
          <div>
            <div className="text-xl font-semibold">거래(주문/출고 · 금전출납 · 통합)</div>
            <div className="mt-1 text-sm text-slate-600">기간 기준으로 조회/집계됩니다.</div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-xs text-slate-600">From</div>
                <input type="date" className={input} value={fromYMD} onChange={(e) => setFromYMD(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-600">To</div>
                <input type="date" className={input} value={toYMD} onChange={(e) => setToYMD(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <button className={btn} onClick={() => { setFromYMD(addDays(ymdToday(), -30)); setToYMD(ymdToday()); }}>
                최근 30일
              </button>
              <button className={btn} onClick={reloadAll}>조회 갱신</button>
              <button className={btn} onClick={printNow}>인쇄</button>
            </div>
          </div>
        </div>

        {/* 본문: 좌(거래처) / 우(탭 컨텐츠) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[360px_1fr]">
          {/* 좌측 거래처 */}
          <div className={`${card} p-4 print:hidden`}>
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">거래처</div>
              <div className="flex gap-2">
                <button className={btn} onClick={() => setSelectedPartnerId(null)}>선택 해제</button>
                <button className={btn} onClick={loadPartners}>새로고침</button>
              </div>
            </div>

            <div className="mt-3">
              <input
                className={input}
                placeholder="목록 필터(이름/사업자번호)"
                value={partnerFilter}
                onChange={(e) => setPartnerFilter(e.target.value)}
              />
            </div>

            <div className="mt-3 text-xs text-slate-600">
              선택된 거래처:{" "}
              <span className="font-semibold text-slate-900">{selectedPartner ? selectedPartner.name : "없음"}</span>
            </div>

            <div className="mt-3 max-h-[640px] overflow-auto pr-1">
              {filteredPartners.map((p) => {
                const active = selectedPartnerId === p.id;
                return (
                  <div
                    key={p.id}
                    className={[
                      "mb-2 rounded-2xl border p-3",
                      active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="flex-1 text-left"
                        onClick={() => setSelectedPartnerId(p.id)}
                        type="button"
                      >
                        <div className="text-sm font-semibold">{p.name}</div>
                        <div className="mt-1 text-xs text-slate-600">{p.business_no ?? ""}</div>
                      </button>

                      <button
                        className={[
                          "h-9 w-9 rounded-xl border text-sm",
                          p.is_pinned ? "border-slate-300 bg-white" : "border-slate-200 bg-white",
                        ].join(" ")}
                        title="즐겨찾기"
                        onClick={() => togglePin(p)}
                        type="button"
                      >
                        {p.is_pinned ? "★" : "☆"}
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredPartners.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                  거래처가 없습니다.
                </div>
              ) : null}
            </div>
          </div>

          {/* 우측 컨텐츠 */}
          <div className="min-w-0">
            {/* 탭 */}
            <div className="mb-3 flex flex-wrap gap-2 print:hidden">
              <button className={tab === "ORDER" ? pillOn : pill} onClick={() => setTab("ORDER")}>주문/출고</button>
              <button className={tab === "LEDGER" ? pillOn : pill} onClick={() => setTab("LEDGER")}>금전출납</button>
              <button className={tab === "UNION" ? pillOn : pill} onClick={() => setTab("UNION")}>통합</button>
            </div>

            {/* 주문/출고 */}
            {tab === "ORDER" ? (
              <div className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">주문/출고 입력</div>
                    <div className="mt-1 text-xs text-slate-600">현재는 orders(헤더) 기준 저장입니다.</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <div className="mb-1 text-xs text-slate-600">출고일(주문일)</div>
                    <input type="date" className={input} value={orderShipDate} onChange={(e) => setOrderShipDate(e.target.value)} />
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">주문자</div>
                    <input className={input} value={orderCustomerName} onChange={(e) => setOrderCustomerName(e.target.value)} placeholder="거래처명" />
                    <div className="mt-1 text-xs text-slate-500">거래처를 선택하면 자동 입력됩니다.</div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">출고방법</div>
                    <select className={input} value={orderShipMethod} onChange={(e) => setOrderShipMethod(e.target.value)}>
                      <option value="택배">택배</option>
                      <option value="퀵">퀵</option>
                      <option value="방문수령">방문수령</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">메모(title)</div>
                    <input className={input} value={orderTitle} onChange={(e) => setOrderTitle(e.target.value)} placeholder="예: 네이버 주문 / 샘플 동봉" />
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">추가 메모</div>
                    <input className={input} value={orderMemo} onChange={(e) => setOrderMemo(e.target.value)} placeholder="비고" />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
                  <div>
                    <div className="mb-1 text-xs text-slate-600">공급가</div>
                    <input className={input} inputMode="numeric" value={String(orderSupply)} onChange={(e) => setOrderSupply(toNumberSafe(e.target.value))} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-600">부가세</div>
                    <input className={input} inputMode="numeric" value={String(orderVat)} onChange={(e) => setOrderVat(toNumberSafe(e.target.value))} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-600">총액(입력)</div>
                    <input className={input} inputMode="numeric" value={String(orderTotal)} onChange={(e) => setOrderTotal(toNumberSafe(e.target.value))} />
                  </div>
                  <div className="md:col-span-3 flex flex-wrap items-end gap-2">
                    <button className={btn} type="button" onClick={calcOrderVatFromSupply}>공급가→VAT(10%)</button>
                    <button className={btn} type="button" onClick={splitOrderVatFromTotal}>총액→공급/VAT</button>
                    <button className={btnBlue} type="button" onClick={createOrder}>주문/출고 생성</button>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-sm font-semibold">기간 내 주문/출고</div>
                  <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col style={{ width: "110px" }} />
                        <col style={{ width: "260px" }} />
                        <col style={{ width: "160px" }} />
                        <col style={{ width: "120px" }} />
                        <col style={{ width: "130px" }} />
                        <col style={{ width: "130px" }} />
                        <col style={{ width: "130px" }} />
                      </colgroup>
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">출고일</th>
                          <th className="px-3 py-2 text-left">거래처</th>
                          <th className="px-3 py-2 text-left">메모</th>
                          <th className="px-3 py-2 text-left">방법</th>
                          <th className="px-3 py-2 text-right">공급가</th>
                          <th className="px-3 py-2 text-right">부가세</th>
                          <th className="px-3 py-2 text-right">총액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id} className="border-t border-slate-200">
                            <td className="px-3 py-2 font-semibold tabular-nums">{o.ship_date}</td>
                            <td className="px-3 py-2">{o.customer_name}</td>
                            <td className="px-3 py-2 text-slate-700">{o.title ?? ""}</td>
                            <td className="px-3 py-2">{o.ship_method ?? ""}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(o.supply_amount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(o.vat_amount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(o.total_amount)}</td>
                          </tr>
                        ))}
                        {orders.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-4 text-sm text-slate-500">
                              기간 내 주문/출고 데이터가 없습니다.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {/* 금전출납 */}
            {tab === "LEDGER" ? (
              <div className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">금전출납 입력 (옵션2: VAT 정확)</div>
                    <div className="mt-1 text-xs text-slate-600">
                      VAT는 ledger_entries의 supply_amount/vat_amount/total_amount/vat_type/vat_rate에 저장합니다.
                    </div>
                  </div>
                  <div className="flex gap-2 print:hidden">
                    <button className={btn} onClick={openCatNew} type="button">카테고리 추가</button>
                    <button className={btn} onClick={() => setCatManageOpen(true)} type="button">카테고리 관리</button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <div className="mb-1 text-xs text-slate-600">일자</div>
                    <input type="date" className={input} value={ledgerDate} onChange={(e) => setLedgerDate(e.target.value)} />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">결제수단</div>
                    <select className={input} value={ledgerMethod} onChange={(e) => setLedgerMethod(e.target.value)}>
                      <option value="계좌입금">계좌입금</option>
                      <option value="카드">카드</option>
                      <option value="현금">현금</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">카테고리</div>
                    <select
                      className={input}
                      value={ledgerCategory}
                      onChange={(e) => setLedgerCategory(e.target.value)}
                    >
                      {cats.filter((c) => c.is_active).map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-slate-500">
                      방향: <span className="font-semibold">{ledgerDirection === "IN" ? "입금(+)" : "출금(-)"}</span> (카테고리로 자동)
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">VAT 유형</div>
                    <select className={input} value={vatType} onChange={(e) => setVatType(e.target.value as VatType)}>
                      <option value="TAXED">과세(부가세 포함/공제)</option>
                      <option value="EXEMPT">면세</option>
                      <option value="ZERO">영세</option>
                      <option value="NA">해당없음</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">거래처명(매입처/상대방)</div>
                    <input
                      className={input}
                      value={ledgerCounterpartyName}
                      onChange={(e) => setLedgerCounterpartyName(e.target.value)}
                      placeholder="거래처 선택 시 자동 입력"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">사업자등록번호</div>
                    <input
                      className={input}
                      value={ledgerBusinessNo}
                      onChange={(e) => setLedgerBusinessNo(e.target.value)}
                      placeholder="예: 123-45-67890 (거래처 선택 시 자동 입력)"
                    />
                  </div>
                </div>

                {/* VAT 입력 영역 */}
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">VAT 계산 기준</div>
                    <div className="flex gap-2">
                      <button className={vatBaseMode === "TOTAL" ? pillOn : pill} type="button" onClick={() => setVatBaseMode("TOTAL")}>
                        총액 기준
                      </button>
                      <button className={vatBaseMode === "SUPPLY" ? pillOn : pill} type="button" onClick={() => setVatBaseMode("SUPPLY")}>
                        공급가 기준
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      과세일 때만 VAT 분리됩니다. (면세/영세/해당없음은 VAT 0)
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">VAT율</div>
                    <input
                      className={input}
                      inputMode="decimal"
                      value={String(vatRate)}
                      onChange={(e) => setVatRate(toNumberSafe(e.target.value))}
                      disabled={vatType !== "TAXED"}
                    />
                    <div className="mt-1 text-xs text-slate-500">기본 0.1 (10%)</div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">총액(부가세 포함)</div>
                    <input
                      className={input}
                      inputMode="numeric"
                      value={String(ledgerTotalAmount)}
                      onChange={(e) => setLedgerTotalAmount(toNumberSafe(e.target.value))}
                      disabled={vatBaseMode !== "TOTAL"}
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">공급가</div>
                    <input
                      className={input}
                      inputMode="numeric"
                      value={String(ledgerSupplyAmount)}
                      onChange={(e) => setLedgerSupplyAmount(toNumberSafe(e.target.value))}
                      disabled={vatBaseMode !== "SUPPLY"}
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">부가세(자동)</div>
                    <input className={input} inputMode="numeric" value={String(ledgerVatAmount)} readOnly />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
                  <div className="md:col-span-4">
                    <div className="mb-1 text-xs text-slate-600">메모</div>
                    <input className={input} value={ledgerMemo} onChange={(e) => setLedgerMemo(e.target.value)} placeholder="예: 원재료 매입 / 택배비 / 급여" />
                  </div>
                  <div className="md:col-span-2 flex items-end justify-end gap-2">
                    <button className={btnBlue} type="button" onClick={createLedgerEntry}>
                      금전출납 기록
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-sm font-semibold">기간 내 금전출납</div>
                  <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col style={{ width: "110px" }} />
                        <col style={{ width: "70px" }} />
                        <col style={{ width: "150px" }} />
                        <col style={{ width: "160px" }} />
                        <col style={{ width: "160px" }} />
                        <col style={{ width: "120px" }} />
                        <col style={{ width: "120px" }} />
                        <col style={{ width: "120px" }} />
                        <col style={{ width: "220px" }} />
                      </colgroup>
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">일자</th>
                          <th className="px-3 py-2 text-left">방향</th>
                          <th className="px-3 py-2 text-left">카테고리</th>
                          <th className="px-3 py-2 text-left">거래처</th>
                          <th className="px-3 py-2 text-left">사업자번호</th>
                          <th className="px-3 py-2 text-right">공급가</th>
                          <th className="px-3 py-2 text-right">부가세</th>
                          <th className="px-3 py-2 text-right">총액</th>
                          <th className="px-3 py-2 text-left">메모</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgers.map((l) => (
                          <tr key={l.id} className="border-t border-slate-200">
                            <td className="px-3 py-2 font-semibold tabular-nums">{l.entry_date}</td>
                            <td className="px-3 py-2">{l.direction === "IN" ? "입금" : "출금"}</td>
                            <td className="px-3 py-2">{l.category}</td>
                            <td className="px-3 py-2">{l.counterparty_name ?? ""}</td>
                            <td className="px-3 py-2 tabular-nums">{l.business_no ?? ""}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(l.supply_amount ?? 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {String(l.vat_type ?? "TAXED").toUpperCase() === "TAXED" ? money(l.vat_amount ?? 0) : "0"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(l.total_amount ?? l.amount)}</td>
                            <td className="px-3 py-2 text-slate-700">{l.memo ?? ""}</td>
                          </tr>
                        ))}
                        {ledgers.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-4 text-sm text-slate-500">
                              기간 내 금전출납 데이터가 없습니다.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 카테고리 관리 모달 */}
                {catManageOpen ? (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">카테고리 관리</div>
                          <div className="mt-1 text-xs text-slate-600">추가/수정/활성/정렬/방향 설정</div>
                        </div>
                        <button className={btn} onClick={() => setCatManageOpen(false)} type="button">
                          닫기
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
                        <div className="md:col-span-2">
                          <div className="mb-1 text-xs text-slate-600">카테고리명</div>
                          <input className={input} value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="예: 매출입금 / 급여 / 세금 / 기타" />
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-slate-600">방향</div>
                          <select className={input} value={catDir} onChange={(e) => setCatDir(e.target.value as LedgerDirection)}>
                            <option value="IN">IN(입금)</option>
                            <option value="OUT">OUT(출금)</option>
                          </select>
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-slate-600">정렬값</div>
                          <input className={input} inputMode="numeric" value={String(catSort)} onChange={(e) => setCatSort(toNumberSafe(e.target.value))} />
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-slate-600">활성</div>
                          <select className={input} value={catActive ? "Y" : "N"} onChange={(e) => setCatActive(e.target.value === "Y")}>
                            <option value="Y">Y</option>
                            <option value="N">N</option>
                          </select>
                        </div>
                        <div className="flex items-end gap-2">
                          <button className={btn} type="button" onClick={openCatNew}>신규</button>
                          <button className={btnBlue} type="button" onClick={saveCategory}>저장</button>
                        </div>
                      </div>

                      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                        <table className="w-full table-fixed text-sm">
                          <colgroup>
                            <col style={{ width: "220px" }} />
                            <col style={{ width: "90px" }} />
                            <col style={{ width: "110px" }} />
                            <col style={{ width: "90px" }} />
                            <col style={{ width: "180px" }} />
                          </colgroup>
                          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                            <tr>
                              <th className="px-3 py-2 text-left">이름</th>
                              <th className="px-3 py-2 text-left">방향</th>
                              <th className="px-3 py-2 text-right">정렬</th>
                              <th className="px-3 py-2 text-left">활성</th>
                              <th className="px-3 py-2 text-left">작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cats.map((c) => (
                              <tr key={c.id} className="border-t border-slate-200 bg-white">
                                <td className="px-3 py-2 font-semibold">{c.name}</td>
                                <td className="px-3 py-2">{c.direction}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(c.sort_order ?? 0)}</td>
                                <td className="px-3 py-2">{c.is_active ? "Y" : "N"}</td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-2">
                                    <button className={btn} type="button" onClick={() => openCatEdit(c)}>수정</button>
                                    <button className={btn} type="button" onClick={() => toggleCategoryActive(c)}>
                                      {c.is_active ? "비활성" : "활성"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {cats.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-4 py-4 text-sm text-slate-500">카테고리가 없습니다.</td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-3 text-xs text-slate-500">
                        ※ 카테고리를 단순하게(급여/세금/기타) 유지하되, 필요 시 여기서 추가/수정 가능합니다.
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 통합 */}
            {tab === "UNION" ? (
              <div className="space-y-4">
                <div className={`${card} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">통합 요약(기간)</div>
                      <div className="mt-1 text-xs text-slate-600">매출(orders) / 매입(ledger OUT, 옵션2 VAT) / 예상 부가세</div>
                    </div>
                    <div className="flex gap-2 print:hidden">
                      <button className={btn} type="button" onClick={printNow}>인쇄</button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold">매출(orders)</div>
                      <div className="mt-2 text-sm text-slate-600">공급가 {money(sumOrders.supply)}</div>
                      <div className="text-sm text-slate-600">부가세 {money(sumOrders.vat)}</div>
                      <div className="mt-1 text-base font-semibold">총액 {money(sumOrders.total)}</div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold">매입(ledger OUT)</div>
                      <div className="mt-2 text-sm text-slate-600">공급가 {money(sumPurchase.supply)}</div>
                      <div className="text-sm text-slate-600">부가세 {money(sumPurchase.vat)}</div>
                      <div className="mt-1 text-base font-semibold">총액 {money(sumPurchase.total)}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        ※ VAT는 옵션2 컬럼이 채워진 건만 집계(정확성 우선)
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold">예상 부가세 납부(= 매출VAT - 매입VAT)</div>
                      <div className="mt-3 text-2xl font-extrabold tabular-nums">{money(expectedVatPayable)}</div>
                      <div className="mt-2 text-xs text-slate-500">※ 실제 신고/공제는 세무사에서 최종 조정</div>
                    </div>
                  </div>
                </div>

                {/* 매입처별 */}
                <div className={`${card} p-4`}>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">매입처별 집계(사업자등록번호 기준 정렬)</div>
                      <div className="mt-1 text-xs text-slate-600">ledger_entries OUT 기준</div>
                    </div>
                    <div className="text-xs text-slate-500">건수 {purchaseByVendor.reduce((a, x) => a + x.count, 0)}건</div>
                  </div>

                  <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col style={{ width: "160px" }} />
                        <col style={{ width: "260px" }} />
                        <col style={{ width: "140px" }} />
                        <col style={{ width: "140px" }} />
                        <col style={{ width: "140px" }} />
                        <col style={{ width: "90px" }} />
                      </colgroup>
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">사업자번호</th>
                          <th className="px-3 py-2 text-left">매입처</th>
                          <th className="px-3 py-2 text-right">공급가</th>
                          <th className="px-3 py-2 text-right">부가세</th>
                          <th className="px-3 py-2 text-right">총액</th>
                          <th className="px-3 py-2 text-right">건수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseByVendor.map((v) => (
                          <tr key={v.business_no} className="border-t border-slate-200">
                            <td className="px-3 py-2 font-semibold tabular-nums">{v.business_no}</td>
                            <td className="px-3 py-2">{v.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(v.supply)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(v.vat)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(v.total)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(v.count)}</td>
                          </tr>
                        ))}
                        {purchaseByVendor.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-4 text-sm text-slate-500">
                              매입 집계 데이터가 없습니다.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 매출처 거래원장 */}
                <div className={`${card} p-4`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
                    <div>
                      <div className="text-lg font-semibold">매출처 거래원장(기간 내)</div>
                      <div className="mt-1 text-xs text-slate-600">매출처별 기간 거래내역 출력(orders 기반)</div>
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row md:items-end">
                      <div className="w-full md:w-[280px]">
                        <div className="mb-1 text-xs text-slate-600">검색(상호/사업자번호)</div>
                        <input className={input} value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="예: 네이버 / 220-81-..." />
                      </div>
                      <div className="w-full md:w-[360px]">
                        <div className="mb-1 text-xs text-slate-600">매출처 선택</div>
                        <select className={input} value={customerLedgerId} onChange={(e) => setCustomerLedgerId(e.target.value)}>
                          <option value="ALL">전체(선택 안함)</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.business_no ? ` · ${c.business_no}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button className={btn} onClick={printNow} disabled={customerLedgerId === "ALL"} type="button">
                        선택 거래원장 인쇄
                      </button>
                    </div>
                  </div>

                  {customerLedgerId !== "ALL" ? (
                    <div className="mt-4">
                      <div className="mb-3">
                        <div className="text-base font-semibold">
                          거래원장: {customers.find((x) => x.id === customerLedgerId)?.name ?? ""}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          기간: {fromYMD} ~ {toYMD}
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                        <table className="w-full table-fixed text-sm">
                          <colgroup>
                            <col style={{ width: "120px" }} />
                            <col style={{ width: "110px" }} />
                            <col style={{ width: "140px" }} />
                            <col style={{ width: "140px" }} />
                            <col style={{ width: "140px" }} />
                            <col style={{ width: "260px" }} />
                          </colgroup>
                          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                            <tr>
                              <th className="px-3 py-2 text-left">출고일</th>
                              <th className="px-3 py-2 text-left">방법</th>
                              <th className="px-3 py-2 text-right">공급가</th>
                              <th className="px-3 py-2 text-right">부가세</th>
                              <th className="px-3 py-2 text-right">총액</th>
                              <th className="px-3 py-2 text-left">메모</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ordersForCustomer.map((o) => (
                              <tr key={o.id} className="border-t border-slate-200">
                                <td className="px-3 py-2 font-semibold tabular-nums">{o.ship_date}</td>
                                <td className="px-3 py-2">{o.ship_method ?? ""}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(o.supply_amount)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(o.vat_amount)}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(o.total_amount)}</td>
                                <td className="px-3 py-2">{o.title ?? ""}</td>
                              </tr>
                            ))}
                            {ordersForCustomer.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-4 py-4 text-sm text-slate-500">
                                  선택한 매출처의 기간 내 거래가 없습니다.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-3 text-sm font-semibold">
                        합계: 공급가 {money(ordersForCustomer.reduce((a, x) => a + x.supply_amount, 0))} ·
                        부가세 {money(ordersForCustomer.reduce((a, x) => a + x.vat_amount, 0))} ·
                        총액 {money(ordersForCustomer.reduce((a, x) => a + x.total_amount, 0))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-slate-500">매출처를 선택하면 해당 거래원장이 표시됩니다.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* 인쇄용 간단 CSS */}
        <style jsx global>{`
          @media print {
            .print\\:hidden { display: none !important; }
            body { background: white !important; }
          }
        `}</style>
      </div>
    </div>
  );
}