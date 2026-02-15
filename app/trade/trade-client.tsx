"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * TradeClient.tsx (복원본)
 * 목표: 기존 캡쳐 화면 수준으로 기능 복구
 * - 통합 탭: 주문/출고 입력 + 금전출납 입력 + 거래내역(수정/메모확인)
 * - 주문/출고: 품목 row + 자동완성(식품유형/제품명) + 제품 선택시 무게 자동입력
 * - 주문/출고: 총액 입력 -> 공급가/부가세 자동 계산(10%)
 * - 거래내역: 주문/출고, 금전출납 기록 수정(간단 모달)
 *
 * 주의:
 * - 자동완성/무게 자동입력은 products(권장) 또는 product_variants 테이블에 의존합니다.
 * - DB 컬럼명이 다르면(예: weight가 weight_g가 아닌 경우) 그 부분만 맞춰주면 됩니다.
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
};

type LedgerRow = {
  id: string;
  entry_date: string; // YYYY-MM-DD
  entry_ts: string | null;

  direction: LedgerDirection;
  amount: number; // (호환) total 의미

  category: string;
  method: string;

  counterparty_name: string | null;
  business_no: string | null;

  summary: string | null;
  memo: string | null;

  status: string;
  partner_id: string | null;

  // VAT 옵션2
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

// (복원) 주문 품목 row
type OrderItemDraft = {
  id: string; // client id
  food_type: string;
  product_name: string;
  weight_g: number; // 자동입력
  qty: number;
  unit: "EA" | "BOX";
  unit_price: number; // 단가
  supply_amount: number; // 자동 계산
  vat_amount: number; // 자동 계산
  total_amount: number; // 총액(입력 가능)
  note: string; // 품목 메모(적요)
};

type ProductSuggest = {
  name: string;
  food_type: string | null;
  weight_g: number | null;
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

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

function splitVatFromTotal(total: number, rate: number) {
  const r = rate;
  if (r <= 0) return { supply: total, vat: 0, total };
  const supply = Math.round(total / (1 + r));
  const vat = total - supply;
  return { supply, vat, total };
}

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

  // 거래처 상단 필터(캡쳐 느낌)
  const [partnerListMode, setPartnerListMode] = useState<"PIN" | "RECENT" | "ALL">("ALL");
  const [recentPartnerIds, setRecentPartnerIds] = useState<string[]>([]);

  // 카테고리(DB)
  const [cats, setCats] = useState<LedgerCategoryRow[]>([]);
  const [catManageOpen, setCatManageOpen] = useState(false);

  // 주문/출고(orders)
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderShipDate, setOrderShipDate] = useState(ymdToday());
  const [orderCustomerName, setOrderCustomerName] = useState("");
  const [orderShipMethod, setOrderShipMethod] = useState<string>("택배");
  const [orderTitle, setOrderTitle] = useState("");
  const [orderMemo, setOrderMemo] = useState("");

  // (복원) 주문 품목 rows
  const [items, setItems] = useState<OrderItemDraft[]>([
    {
      id: uid(),
      food_type: "",
      product_name: "",
      weight_g: 0,
      qty: 0,
      unit: "EA",
      unit_price: 0,
      supply_amount: 0,
      vat_amount: 0,
      total_amount: 0,
      note: "",
    },
  ]);

  // 자동완성 데이터
  const [productSuggests, setProductSuggests] = useState<ProductSuggest[]>([]);
  const foodTypeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of productSuggests) {
      if (p.food_type) s.add(p.food_type);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [productSuggests]);

  const productNameOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of productSuggests) {
      if (p.name) s.add(p.name);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [productSuggests]);

  // 금전출납(ledger_entries)
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);

  // 입력 폼(금전출납)
  const [ledgerDate, setLedgerDate] = useState(ymdToday());
  const [ledgerMethod, setLedgerMethod] = useState<string>("계좌입금");

  // (캡쳐처럼 “칩” 형태도 유지하되, DB 카테고리도 병행)
  const [ledgerCategory, setLedgerCategory] = useState<string>("매출입금"); // name
  const [ledgerDirection, setLedgerDirection] = useState<LedgerDirection>("IN");

  const [ledgerCounterpartyName, setLedgerCounterpartyName] = useState<string>("");
  const [ledgerBusinessNo, setLedgerBusinessNo] = useState<string>("");
  const [ledgerMemo, setLedgerMemo] = useState<string>("");

  // VAT
  const [vatType, setVatType] = useState<VatType>("TAXED");
  const [vatRate, setVatRate] = useState<number>(0.1);
  const [ledgerTotalAmount, setLedgerTotalAmount] = useState<number>(0);
  const [ledgerSupplyAmount, setLedgerSupplyAmount] = useState<number>(0);
  const [ledgerVatAmount, setLedgerVatAmount] = useState<number>(0);
  const [vatBaseMode, setVatBaseMode] = useState<"TOTAL" | "SUPPLY">("TOTAL");

  // =========================
  // 스타일(기존 톤 유지)
  // =========================
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnBlue = "rounded-xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill = "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700";
  const pillOn = "rounded-full border border-blue-600/20 bg-blue-600 px-3 py-1 text-xs text-white";

  // =========================
  // 로드 함수
  // =========================
  async function loadCategories() {
    const { data, error } = await supabase
      .from("ledger_categories")
      .select("id,name,direction,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);

    if (error) return setMsg(error.message);
    const rows = (data ?? []) as LedgerCategoryRow[];
    setCats(rows);

    // 기본 카테고리 동기화(없으면 유지)
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

  async function loadPartners() {
    const { data, error } = await supabase
      .from("partners")
      .select(
        "id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone"
      )
      .order("is_pinned", { ascending: false })
      .order("pin_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(2000);

    if (error) return setMsg(error.message);
    setPartners((data ?? []) as PartnerRow[]);
  }

  async function togglePin(partner: PartnerRow) {
    const nextPinned = !Boolean(partner.is_pinned);
    const patch: any = { is_pinned: nextPinned };
    if (nextPinned) patch.pin_order = partner.pin_order ?? 9999;
    else patch.pin_order = null;

    const { error } = await supabase.from("partners").update(patch).eq("id", partner.id);
    if (error) return setMsg(error.message);
    await loadPartners();
  }

  async function loadOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id,customer_id,customer_name,title,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount,created_at,updated_at"
      )
      .gte("ship_date", fromYMD)
      .lte("ship_date", toYMD)
      .order("ship_date", { ascending: false })
      .limit(5000);

    if (error) return setMsg(error.message);
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      supply_amount: toNumberSafe(r.supply_amount),
      vat_amount: toNumberSafe(r.vat_amount),
      total_amount: toNumberSafe(r.total_amount),
    })) as OrderRow[];
    setOrders(rows);
  }

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

    if (error) return setMsg(error.message);
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

  // (복원) 자동완성/무게용 제품 마스터 로드
  async function loadProductSuggests() {
    // 1) products 테이블 우선
    const p1 = await supabase.from("products").select("name,food_type,weight_g").limit(5000);
    if (!p1.error) {
      const rows = (p1.data ?? []) as any[];
      const mapped: ProductSuggest[] = rows.map((r) => ({
        name: String(r.name ?? ""),
        food_type: r.food_type == null ? null : String(r.food_type),
        weight_g: r.weight_g == null ? null : toNumberSafe(r.weight_g),
      }));
      setProductSuggests(mapped.filter((x) => x.name));
      return;
    }

    // 2) fallback: product_variants
    const p2 = await supabase.from("product_variants").select("name,food_type,weight_g").limit(5000);
    if (!p2.error) {
      const rows = (p2.data ?? []) as any[];
      const mapped: ProductSuggest[] = rows.map((r) => ({
        name: String(r.name ?? ""),
        food_type: r.food_type == null ? null : String(r.food_type),
        weight_g: r.weight_g == null ? null : toNumberSafe(r.weight_g),
      }));
      setProductSuggests(mapped.filter((x) => x.name));
      return;
    }

    // 테이블이 없거나 컬럼이 다르면 메시지(기능은 입력으로는 계속 가능)
    // (대표님 DB에 맞추면 여기만 손보면 됨)
  }

  async function reloadAll() {
    setMsg(null);
    await Promise.all([loadPartners(), loadCategories(), loadOrders(), loadLedgers(), loadProductSuggests()]);
  }

  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadOrders();
    loadLedgers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromYMD, toYMD]);

  // 거래처 선택 시 입력 폼에 반영(편의)
  useEffect(() => {
    if (!selectedPartner) return;

    // 최근 선택 기록
    setRecentPartnerIds((prev) => {
      const next = [selectedPartner.id, ...prev.filter((x) => x !== selectedPartner.id)];
      return next.slice(0, 30);
    });

    if (!ledgerCounterpartyName) setLedgerCounterpartyName(selectedPartner.name ?? "");
    if (!ledgerBusinessNo) setLedgerBusinessNo(selectedPartner.business_no ?? "");
    if (!orderCustomerName) setOrderCustomerName(selectedPartner.name ?? "");
  }, [selectedPartnerId, selectedPartner?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 카테고리 변경 시 direction 자동
  useEffect(() => {
    const c = findCatByName(ledgerCategory);
    if (c) setLedgerDirection(c.direction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerCategory, cats.map((x) => x.id).join("|")]);

  // =========================
  // (복원) 주문 품목 계산 로직
  // - 총액 입력하면 공급가/부가세 자동
  // - 단가/수량으로도 자동 계산되게
  // =========================
  const ORDER_VAT_RATE = 0.1;

  function recalcItemByTotal(next: OrderItemDraft) {
    const t = clampInt(next.total_amount);
    const { supply, vat, total } = splitVatFromTotal(t, ORDER_VAT_RATE);
    return {
      ...next,
      supply_amount: supply,
      vat_amount: vat,
      total_amount: total,
    };
  }

  function recalcItemByQtyPrice(next: OrderItemDraft) {
    const qty = clampInt(next.qty);
    const unit_price = clampInt(next.unit_price);
    const supply = qty * unit_price;
    const { vat, total } = calcVatFromSupply(supply, ORDER_VAT_RATE);
    return {
      ...next,
      supply_amount: supply,
      vat_amount: vat,
      total_amount: total,
    };
  }

  function applyProductAutoFill(next: OrderItemDraft) {
    const name = next.product_name.trim();
    if (!name) return next;

    // 동일명 매칭(가장 첫번째)
    const hit = productSuggests.find((p) => p.name === name);
    if (!hit) return next;

    let updated = { ...next };
    if (!updated.food_type && hit.food_type) updated.food_type = hit.food_type;
    if ((!updated.weight_g || updated.weight_g === 0) && hit.weight_g != null) updated.weight_g = hit.weight_g;
    return updated;
  }

  function updateItem(id: string, patch: Partial<OrderItemDraft>, mode?: "TOTAL" | "QTYPRICE") {
    setItems((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        let next = { ...x, ...patch };

        // 제품명 변경 시 무게/식품유형 자동 입력
        if (patch.product_name !== undefined) {
          next = applyProductAutoFill(next);
        }

        // 계산
        if (mode === "TOTAL") next = recalcItemByTotal(next);
        else if (mode === "QTYPRICE") next = recalcItemByQtyPrice(next);

        return next;
      })
    );
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        food_type: "",
        product_name: "",
        weight_g: 0,
        qty: 0,
        unit: "EA",
        unit_price: 0,
        supply_amount: 0,
        vat_amount: 0,
        total_amount: 0,
        note: "",
      },
    ]);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const next = prev.filter((x) => x.id !== id);
      return next.length ? next : prev; // 최소 1행 유지
    });
  }

  const orderSums = useMemo(() => {
    const supply = items.reduce((a, x) => a + toNumberSafe(x.supply_amount), 0);
    const vat = items.reduce((a, x) => a + toNumberSafe(x.vat_amount), 0);
    const total = items.reduce((a, x) => a + toNumberSafe(x.total_amount), 0);
    return { supply, vat, total };
  }, [items]);

  // =========================
  // 금전출납 VAT 계산(입력 즉시 반영)
  // =========================
  useEffect(() => {
    if (vatType !== "TAXED") {
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
  // 주문/출고 생성(헤더 저장) - 복원: 품목합계로 저장
  // =========================
  async function createOrder() {
    setMsg(null);

    const ship_date = orderShipDate || ymdToday();
    const customer_name = (orderCustomerName || "").trim();
    if (!customer_name) return setMsg("주문자(거래처명)를 입력하세요.");

    // 최소 1개 품목 유효성(대표님 편의)
    const hasAny = items.some((x) => x.product_name.trim() || x.note.trim());
    if (!hasAny) return setMsg("품목을 1개 이상 입력하세요.");

    const payload: any = {
      customer_id: selectedPartnerId ?? null,
      customer_name,
      title: orderTitle ? orderTitle.trim() : null,
      ship_date,
      ship_method: orderShipMethod ? String(orderShipMethod) : null,
      status: "OK",
      memo: orderMemo ? orderMemo.trim() : null,

      supply_amount: clampInt(orderSums.supply),
      vat_amount: clampInt(orderSums.vat),
      total_amount: clampInt(orderSums.total),
    };

    const { error } = await supabase.from("orders").insert(payload);
    if (error) return setMsg(error.message);

    // 입력 초기화(캡쳐 느낌)
    setOrderTitle("");
    setOrderMemo("");
    setItems([
      {
        id: uid(),
        food_type: "",
        product_name: "",
        weight_g: 0,
        qty: 0,
        unit: "EA",
        unit_price: 0,
        supply_amount: 0,
        vat_amount: 0,
        total_amount: 0,
        note: "",
      },
    ]);

    await loadOrders();
  }

  // =========================
  // 금전출납 기록
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

      total_amount: t,
      supply_amount: s,
      vat_amount: v,
      vat_type: vatType,
      vat_rate: vatType === "TAXED" ? Number(vatRate ?? 0.1) : 0,
    };

    const { error } = await supabase.from("ledger_entries").insert(payload);
    if (error) return setMsg(error.message);

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
  // 카테고리 관리(CRUD) - 기존 유지
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
    const { error } = await supabase.from("ledger_categories").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) return setMsg(error.message);
    await loadCategories();
  }

  // =========================
  // 거래내역(통합) - 주문 + 금전출납 합쳐서 표시
  // + 수정 모달(복원)
  // =========================
  type UnifiedRow =
    | { kind: "ORDER"; id: string; date: string; counterparty: string; memo: string; supply: number; vat: number; total: number; ship_method: string | null }
    | { kind: "LEDGER"; id: string; date: string; counterparty: string; memo: string; supply: number; vat: number; total: number; category: string; direction: LedgerDirection };

  const unifiedRows = useMemo(() => {
    const a: UnifiedRow[] = [];

    for (const o of orders) {
      a.push({
        kind: "ORDER",
        id: o.id,
        date: o.ship_date,
        counterparty: o.customer_name,
        memo: o.title ?? "",
        supply: toNumberSafe(o.supply_amount),
        vat: toNumberSafe(o.vat_amount),
        total: toNumberSafe(o.total_amount),
        ship_method: o.ship_method ?? null,
      });
    }

    for (const l of ledgers) {
      a.push({
        kind: "LEDGER",
        id: l.id,
        date: l.entry_date,
        counterparty: l.counterparty_name ?? "",
        memo: l.memo ?? "",
        supply: toNumberSafe(l.supply_amount ?? 0),
        vat: String(l.vat_type ?? "TAXED").toUpperCase() === "TAXED" ? toNumberSafe(l.vat_amount ?? 0) : 0,
        total: toNumberSafe(l.total_amount ?? l.amount),
        category: l.category,
        direction: l.direction,
      });
    }

    a.sort((x, y) => String(y.date).localeCompare(String(x.date)));
    return a;
  }, [orders, ledgers]);

  // 수정 모달 상태
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<UnifiedRow | null>(null);

  function openEdit(r: UnifiedRow) {
    setEditRow(r);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow) return;
    setMsg(null);

    if (editRow.kind === "ORDER") {
      const payload: any = {
        ship_date: editRow.date,
        customer_name: editRow.counterparty,
        title: editRow.memo,
        ship_method: editRow.ship_method ?? null,
        supply_amount: clampInt(editRow.supply),
        vat_amount: clampInt(editRow.vat),
        total_amount: clampInt(editRow.total),
      };
      const { error } = await supabase.from("orders").update(payload).eq("id", editRow.id);
      if (error) return setMsg(error.message);
      await loadOrders();
    } else {
      const payload: any = {
        entry_date: editRow.date,
        counterparty_name: editRow.counterparty || null,
        memo: editRow.memo || null,
        category: editRow.category,
        direction: editRow.direction,
        // VAT 옵션2 저장(총액 기준)
        total_amount: clampInt(editRow.total),
        amount: clampInt(editRow.total),
        // 공급/부가세는 화면에서 편집 가능하도록 유지
        supply_amount: clampInt(editRow.supply),
        vat_amount: clampInt(editRow.vat),
      };
      const { error } = await supabase.from("ledger_entries").update(payload).eq("id", editRow.id);
      if (error) return setMsg(error.message);
      await loadLedgers();
    }

    setEditOpen(false);
    setEditRow(null);
  }

  // =========================
  // 기타
  // =========================
  function printNow() {
    window.print();
  }

  async function downloadTaxExcel() {
    setMsg(null);
    try {
      const qs = new URLSearchParams({ from: fromYMD, to: toYMD });
      const res = await fetch(`/api/export/tax-ledger?${qs.toString()}`);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `엑셀 다운로드 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `세무사용_통합장부_${fromYMD}~${toYMD}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setMsg(e?.message ?? "엑셀 다운로드 중 오류");
    }
  }

  // 거래처 필터 + 모드
  const filteredPartners = useMemo(() => {
    let rows = partners.slice();

    if (partnerListMode === "PIN") rows = rows.filter((p) => Boolean(p.is_pinned));
    if (partnerListMode === "RECENT") rows = rows.filter((p) => recentPartnerIds.includes(p.id));

    const q = partnerFilter.trim();
    if (!q) return rows;
    return rows.filter((p) => (p.name || "").includes(q) || (p.business_no || "").includes(q));
  }, [partners, partnerFilter, partnerListMode, recentPartnerIds]);

  // =========================
  // 렌더(캡쳐 구조 복원)
  // =========================
  const OrderBlock = (
    <div className={`${card} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">주문/출고 입력</div>
          <div className="mt-1 text-xs text-slate-600">
            품목(식품유형/제품명 자동완성 포함) · 총액 입력시 공급가/부가세 자동 계산
          </div>
        </div>
        <div className="print:hidden">
          <span className={pillOn}>조회대상: 전체</span>
        </div>
      </div>

      {/* 헤더 */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <div className="mb-1 text-xs text-slate-600">출고일(주문일)</div>
          <input type="date" className={input} value={orderShipDate} onChange={(e) => setOrderShipDate(e.target.value)} />
        </div>

        <div className="md:col-span-1">
          <div className="mb-1 text-xs text-slate-600">주문자</div>
          <input className={input} value={orderCustomerName} onChange={(e) => setOrderCustomerName(e.target.value)} placeholder="거래처명" />
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

        <div>
          <div className="mb-1 text-xs text-slate-600">메모(title)</div>
          <input className={input} value={orderTitle} onChange={(e) => setOrderTitle(e.target.value)} placeholder="예: 네이버 주문 / 샘플 동봉" />
        </div>
      </div>

      {/* 품목 */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">품목(식품유형 자동완성 포함)</div>
          <button className={btn} type="button" onClick={addItem}>
            + 품목 추가
          </button>
        </div>

        {/* datalist(자동완성) */}
        <datalist id="foodTypeList">
          {foodTypeOptions.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <datalist id="productNameList">
          {productNameOptions.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>

        <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: "140px" }} />
              <col style={{ width: "220px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "70px" }} />
            </colgroup>
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">식품유형</th>
                <th className="px-3 py-2 text-left">품목명</th>
                <th className="px-3 py-2 text-left">무게(g)</th>
                <th className="px-3 py-2 text-left">수량</th>
                <th className="px-3 py-2 text-left">단위</th>
                <th className="px-3 py-2 text-right">단가</th>
                <th className="px-3 py-2 text-right">공급가</th>
                <th className="px-3 py-2 text-right">부가세</th>
                <th className="px-3 py-2 text-right">총액(입력)</th>
                <th className="px-3 py-2 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">
                    <input
                      className={input}
                      list="foodTypeList"
                      value={it.food_type}
                      onChange={(e) => updateItem(it.id, { food_type: e.target.value })}
                      placeholder="식품유형"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={input}
                      list="productNameList"
                      value={it.product_name}
                      onChange={(e) => updateItem(it.id, { product_name: e.target.value })}
                      placeholder="품목명"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={input}
                      inputMode="numeric"
                      value={String(it.weight_g)}
                      onChange={(e) => updateItem(it.id, { weight_g: toNumberSafe(e.target.value) })}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={input}
                      inputMode="numeric"
                      value={String(it.qty)}
                      onChange={(e) => updateItem(it.id, { qty: toNumberSafe(e.target.value) }, "QTYPRICE")}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        className={it.unit === "EA" ? pillOn : pill}
                        type="button"
                        onClick={() => updateItem(it.id, { unit: "EA" })}
                      >
                        EA
                      </button>
                      <button
                        className={it.unit === "BOX" ? pillOn : pill}
                        type="button"
                        onClick={() => updateItem(it.id, { unit: "BOX" })}
                      >
                        BOX
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className={input}
                      inputMode="numeric"
                      value={String(it.unit_price)}
                      onChange={(e) => updateItem(it.id, { unit_price: toNumberSafe(e.target.value) }, "QTYPRICE")}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(it.supply_amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(it.vat_amount)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className={input}
                      inputMode="numeric"
                      value={String(it.total_amount)}
                      onChange={(e) => updateItem(it.id, { total_amount: toNumberSafe(e.target.value) }, "TOTAL")}
                      placeholder="총액"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button className={btn} type="button" onClick={() => removeItem(it.id)} title="삭제">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={6} className="px-3 py-3 text-right text-sm font-semibold text-slate-700">
                  합계
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(orderSums.supply)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(orderSums.vat)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(orderSums.total)}</td>
                <td className="px-3 py-3"></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-slate-500">
            ※ “총액(입력)” 변경 시 공급가/부가세가 자동 계산됩니다. (기본 10%)
          </div>
          <button className={btnBlue} type="button" onClick={createOrder}>
            주문/출고 생성
          </button>
        </div>
      </div>
    </div>
  );

  const LedgerBlock = (
    <div className={`${card} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">금전출납 입력</div>
          <div className="mt-1 text-xs text-slate-600">총액 입력 시 공급가/부가세 자동 분리(옵션2 컬럼 저장)</div>
        </div>
        <div className="print:hidden">
          <span className={pillOn}>조회대상: 전체</span>
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

        {/* 캡쳐처럼 카테고리 칩(대표님 선호) */}
        <div className="md:col-span-2">
          <div className="mb-1 text-xs text-slate-600">카테고리</div>
          <div className="flex flex-wrap gap-2">
            {["매출입금", "급여", "세금", "기타"].map((x) => (
              <button
                key={x}
                className={ledgerCategory === x ? pillOn : pill}
                type="button"
                onClick={() => setLedgerCategory(x)}
              >
                {x}
              </button>
            ))}
            <button className={btn} type="button" onClick={openCatNew}>
              + 추가
            </button>
            <button className={btn} type="button" onClick={() => setCatManageOpen(true)}>
              관리
            </button>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            방향: <span className="font-semibold">{ledgerDirection === "IN" ? "입금(+)" : "출금(-)"}</span> (카테고리/설정으로 자동)
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="mb-1 text-xs text-slate-600">거래처명</div>
          <input className={input} value={ledgerCounterpartyName} onChange={(e) => setLedgerCounterpartyName(e.target.value)} placeholder="거래처 선택 시 자동 입력" />
        </div>
        <div className="md:col-span-2">
          <div className="mb-1 text-xs text-slate-600">사업자등록번호</div>
          <input className={input} value={ledgerBusinessNo} onChange={(e) => setLedgerBusinessNo(e.target.value)} placeholder="예: 123-45-67890" />
        </div>
      </div>

      {/* VAT 영역 */}
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
        </div>

        <div>
          <div className="mb-1 text-xs text-slate-600">VAT 유형</div>
          <select className={input} value={vatType} onChange={(e) => setVatType(e.target.value as VatType)}>
            <option value="TAXED">과세</option>
            <option value="EXEMPT">면세</option>
            <option value="ZERO">영세</option>
            <option value="NA">해당없음</option>
          </select>
        </div>

        <div>
          <div className="mb-1 text-xs text-slate-600">VAT율</div>
          <input className={input} inputMode="decimal" value={String(vatRate)} onChange={(e) => setVatRate(toNumberSafe(e.target.value))} disabled={vatType !== "TAXED"} />
        </div>

        <div>
          <div className="mb-1 text-xs text-slate-600">총액(원)</div>
          <input className={input} inputMode="numeric" value={String(ledgerTotalAmount)} onChange={(e) => setLedgerTotalAmount(toNumberSafe(e.target.value))} disabled={vatBaseMode !== "TOTAL"} />
        </div>

        <div>
          <div className="mb-1 text-xs text-slate-600">공급가</div>
          <input className={input} inputMode="numeric" value={String(ledgerSupplyAmount)} onChange={(e) => setLedgerSupplyAmount(toNumberSafe(e.target.value))} disabled={vatBaseMode !== "SUPPLY"} />
        </div>

        <div>
          <div className="mb-1 text-xs text-slate-600">부가세</div>
          <input className={input} inputMode="numeric" value={String(ledgerVatAmount)} readOnly />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
        <div className="md:col-span-4">
          <div className="mb-1 text-xs text-slate-600">메모</div>
          <input className={input} value={ledgerMemo} onChange={(e) => setLedgerMemo(e.target.value)} placeholder="예: 원재료 매입 / 택배비 / 급여" />
        </div>
        <div className="md:col-span-2 flex items-end justify-end">
          <button className={btnBlue} type="button" onClick={createLedgerEntry}>
            금전출납 기록
          </button>
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
                <button className={btn} type="button" onClick={openCatNew}>
                  신규
                </button>
                <button className={btnBlue} type="button" onClick={saveCategory}>
                  저장
                </button>
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
                          <button className={btn} type="button" onClick={() => openCatEdit(c)}>
                            수정
                          </button>
                          <button className={btn} type="button" onClick={() => toggleCategoryActive(c)}>
                            {c.is_active ? "비활성" : "활성"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {cats.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-sm text-slate-500">
                        카테고리가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-slate-500">※ 대표님 기존처럼 단순 카테고리를 유지하면서 필요시만 확장</div>
          </div>
        </div>
      ) : null}
    </div>
  );

  const HistoryBlock = (
    <div className={`${card} p-4`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">거래내역</div>
          <div className="mt-1 text-xs text-slate-600">주문/출고 + 금전출납 통합 표시 · 클릭해서 수정/메모 확인</div>
        </div>
        <div className="text-xs text-slate-500">건수 {unifiedRows.length}건</div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "90px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "220px" }} />
            <col style={{ width: "220px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "90px" }} />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">구분</th>
              <th className="px-3 py-2 text-left">일자</th>
              <th className="px-3 py-2 text-left">거래처</th>
              <th className="px-3 py-2 text-left">메모/적요</th>
              <th className="px-3 py-2 text-right">공급가</th>
              <th className="px-3 py-2 text-right">부가세</th>
              <th className="px-3 py-2 text-right">총액</th>
              <th className="px-3 py-2 text-left">수정</th>
            </tr>
          </thead>
          <tbody>
            {unifiedRows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="border-t border-slate-200">
                <td className="px-3 py-2">
                  <span className={r.kind === "ORDER" ? pillOn : pill}>
                    {r.kind === "ORDER" ? "주문/출고" : "금전출납"}
                  </span>
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums">{r.date}</td>
                <td className="px-3 py-2">{r.counterparty}</td>
                <td className="px-3 py-2 text-slate-700">{r.memo}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.supply)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.vat)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(r.total)}</td>
                <td className="px-3 py-2">
                  <button className={btn} type="button" onClick={() => openEdit(r)}>
                    수정
                  </button>
                </td>
              </tr>
            ))}
            {unifiedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-sm text-slate-500">
                  기간 내 거래내역이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* 수정 모달 */}
      {editOpen && editRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">거래내역 수정</div>
                <div className="mt-1 text-xs text-slate-600">
                  {editRow.kind === "ORDER" ? "주문/출고(orders)" : "금전출납(ledger_entries)"} 수정
                </div>
              </div>
              <button className={btn} type="button" onClick={() => setEditOpen(false)}>
                닫기
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs text-slate-600">일자</div>
                <input className={input} type="date" value={editRow.date} onChange={(e) => setEditRow({ ...editRow, date: e.target.value } as any)} />
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-600">거래처</div>
                <input className={input} value={editRow.counterparty} onChange={(e) => setEditRow({ ...editRow, counterparty: e.target.value } as any)} />
              </div>

              {editRow.kind === "ORDER" ? (
                <div>
                  <div className="mb-1 text-xs text-slate-600">출고방법</div>
                  <select
                    className={input}
                    value={(editRow as any).ship_method ?? ""}
                    onChange={(e) => setEditRow({ ...(editRow as any), ship_method: e.target.value } as any)}
                  >
                    <option value="">(없음)</option>
                    <option value="택배">택배</option>
                    <option value="퀵">퀵</option>
                    <option value="방문수령">방문수령</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
              ) : (
                <div>
                  <div className="mb-1 text-xs text-slate-600">카테고리</div>
                  <input className={input} value={(editRow as any).category} onChange={(e) => setEditRow({ ...(editRow as any), category: e.target.value } as any)} />
                </div>
              )}

              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-slate-600">메모/적요</div>
                <input className={input} value={editRow.memo} onChange={(e) => setEditRow({ ...editRow, memo: e.target.value } as any)} />
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-600">공급가</div>
                <input className={input} inputMode="numeric" value={String(editRow.supply)} onChange={(e) => setEditRow({ ...editRow, supply: toNumberSafe(e.target.value) } as any)} />
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-600">부가세</div>
                <input className={input} inputMode="numeric" value={String(editRow.vat)} onChange={(e) => setEditRow({ ...editRow, vat: toNumberSafe(e.target.value) } as any)} />
              </div>
              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-slate-600">총액</div>
                <input className={input} inputMode="numeric" value={String(editRow.total)} onChange={(e) => setEditRow({ ...editRow, total: toNumberSafe(e.target.value) } as any)} />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className={btn} type="button" onClick={() => setEditOpen(false)}>
                취소
              </button>
              <button className={btnBlue} type="button" onClick={saveEdit}>
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

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
              <button className={btn} onClick={downloadTaxExcel} type="button">세무사용 엑셀</button>
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
                <button className={btn} onClick={() => setSelectedPartnerId(null)} type="button">선택 해제</button>
                <button className={btn} onClick={loadPartners} type="button">조회 갱신</button>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button className={partnerListMode === "PIN" ? pillOn : pill} type="button" onClick={() => setPartnerListMode("PIN")}>즐겨찾기</button>
              <button className={partnerListMode === "RECENT" ? pillOn : pill} type="button" onClick={() => setPartnerListMode("RECENT")}>최근</button>
              <button className={partnerListMode === "ALL" ? pillOn : pill} type="button" onClick={() => setPartnerListMode("ALL")}>전체</button>
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
                      <button className="flex-1 text-left" onClick={() => setSelectedPartnerId(p.id)} type="button">
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

            {tab === "ORDER" ? <div className="space-y-4">{OrderBlock}</div> : null}
            {tab === "LEDGER" ? <div className="space-y-4">{LedgerBlock}</div> : null}

            {/* 통합(캡쳐처럼 한 화면에 전부) */}
            {tab === "UNION" ? (
              <div className="space-y-4">
                {OrderBlock}
                {LedgerBlock}
                {HistoryBlock}
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