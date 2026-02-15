"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * TradeClient.tsx (완전 복구본)
 * - 거래처/주문·출고/금전출납/통합 한 파일 운영
 * - 자동완성(식품유형/제품명), 무게 자동입력, 총액->공급/부가세 자동,
 *   거래내역 수정, 메모 확인(모달), 배송최근값/배송이력 포함
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

  // ✅ 배송정보(최근값, partners에 저장)
  ship_to_name?: string | null;
  ship_to_address1?: string | null;
  ship_to_mobile?: string | null;
  ship_to_phone?: string | null;
};

type PartnerShipmentRow = {
  id: string;
  partner_id: string;
  ship_date: string; // YYYY-MM-DD
  ship_to_name: string | null;
  ship_to_address1: string | null;
  ship_to_mobile: string | null;
  ship_to_phone: string | null;
  memo: string | null;
  created_at?: string;
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
  entry_ts: string;

  direction: LedgerDirection;

  amount: number; // 호환용 (total)
  category: string;
  method: string;

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

// orders에 아래 컬럼이 있으면 활용 (없어도 insert/update 시 자동 제외 재시도)
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

  // ✅ 복구 기능(있으면 사용)
  product_name?: string | null;
  food_type?: string | null;
  weight_g?: number | null;
  qty?: number | null;

  created_at?: string;
  updated_at?: string;
};

type ProductHint = {
  name: string;
  food_type: string | null;
  weight_g: number | null; // 개당 g(기본값)
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
  const [tab, setTab] = useState<"PARTNER" | "ORDER" | "LEDGER" | "UNION">("UNION");
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

  // ✅ 제품 힌트(자동완성)
  const [productHints, setProductHints] = useState<ProductHint[]>([]);
  const [foodTypeHints, setFoodTypeHints] = useState<string[]>([]);

  // 카테고리
  const [cats, setCats] = useState<LedgerCategoryRow[]>([]);
  const [catManageOpen, setCatManageOpen] = useState(false);

  // 주문/출고 (orders)
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const [orderShipDate, setOrderShipDate] = useState(ymdToday());
  const [orderCustomerName, setOrderCustomerName] = useState("");
  const [orderShipMethod, setOrderShipMethod] = useState<string>("택배");
  const [orderTitle, setOrderTitle] = useState("");
  const [orderMemo, setOrderMemo] = useState("");

  // ✅ 복구: 품목/식품유형/무게/수량
  const [orderProductName, setOrderProductName] = useState<string>("");
  const [orderFoodType, setOrderFoodType] = useState<string>("");
  const [orderWeightG, setOrderWeightG] = useState<number>(0);
  const [orderQty, setOrderQty] = useState<number>(0);

  // ✅ 복구: 총액 입력하면 자동 분리
  const [orderVatRate, setOrderVatRate] = useState<number>(0.1);
  const [orderVatBaseMode, setOrderVatBaseMode] = useState<"TOTAL" | "SUPPLY">("TOTAL");

  const [orderSupply, setOrderSupply] = useState<number>(0);
  const [orderVat, setOrderVat] = useState<number>(0);
  const [orderTotal, setOrderTotal] = useState<number>(0);

  // 금전출납 (ledger_entries)
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);

  const [ledgerDate, setLedgerDate] = useState(ymdToday());
  const [ledgerMethod, setLedgerMethod] = useState<string>("계좌입금");
  const [ledgerCategory, setLedgerCategory] = useState<string>("");
  const [ledgerDirection, setLedgerDirection] = useState<LedgerDirection>("IN");

  const [ledgerCounterpartyName, setLedgerCounterpartyName] = useState<string>("");
  const [ledgerBusinessNo, setLedgerBusinessNo] = useState<string>("");

  const [ledgerMemo, setLedgerMemo] = useState<string>("");

  // 옵션2 VAT
  const [vatType, setVatType] = useState<VatType>("TAXED");
  const [vatRate, setVatRate] = useState<number>(0.1);

  const [ledgerTotalAmount, setLedgerTotalAmount] = useState<number>(0);
  const [ledgerSupplyAmount, setLedgerSupplyAmount] = useState<number>(0);
  const [ledgerVatAmount, setLedgerVatAmount] = useState<number>(0);

  const [vatBaseMode, setVatBaseMode] = useState<"TOTAL" | "SUPPLY">("TOTAL");

  // =========================
  // 거래내역 수정 모달 상태
  // =========================
  const [editOrderOpen, setEditOrderOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);

  const [editLedgerOpen, setEditLedgerOpen] = useState(false);
  const [editLedger, setEditLedger] = useState<LedgerRow | null>(null);

  // =========================
  // 메모 보기 모달
  // =========================
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoTitle, setMemoTitle] = useState("");
  const [memoText, setMemoText] = useState("");

  function openMemo(title: string, text: string) {
    setMemoTitle(title);
    setMemoText(text);
    setMemoOpen(true);
  }

  // =========================
  // 거래처 상세/배송이력(복구)
  // =========================
  const [partnerDetailOpen, setPartnerDetailOpen] = useState<boolean>(false);

  const [pName, setPName] = useState("");
  const [pBizNo, setPBizNo] = useState("");
  const [pCeo, setPCeo] = useState("");
  const [pBizType, setPBizType] = useState("");
  const [pBizItem, setPBizItem] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pAddr1, setPAddr1] = useState("");

  const [pShipName, setPShipName] = useState("");
  const [pShipAddr1, setPShipAddr1] = useState("");
  const [pShipMobile, setPShipMobile] = useState("");
  const [pShipPhone, setPShipPhone] = useState("");

  const [shipHistory, setShipHistory] = useState<PartnerShipmentRow[]>([]);
  const [shipHistoryOpen, setShipHistoryOpen] = useState(true);

  const [shipMemo, setShipMemo] = useState("");
  const [shipDate, setShipDate] = useState(ymdToday());

  // 주문 생성 시 배송최근값을 이력에도 자동 저장할지
  const [autoSaveShipmentHistoryOnOrder, setAutoSaveShipmentHistoryOnOrder] = useState<boolean>(true);

  // =========================
  // 스타일
  // =========================
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50";
  const btnBlue =
    "rounded-xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50";
  const pill = "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 disabled:opacity-50";
  const pillOn = "rounded-full border border-blue-600/20 bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50";
  const modalBackdrop = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4";
  const modalCard = "w-full max-w-4xl rounded-2xl bg-white p-4 shadow-xl";

  // =========================
  // 카테고리 로드
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

  // =========================
  // ✅ 제품 자동완성 로드 (products 기반, 실패 시 fallback)
  // =========================
  async function loadProductHints() {
    setMsg(null);

    // 1차 시도: products(name, food_type, weight_g)
    {
      const { data, error } = await supabase
        .from("products")
        .select("name,food_type,weight_g")
        .order("name", { ascending: true })
        .limit(5000);

      if (!error) {
        const rows = (data ?? []).map((r: any) => ({
          name: String(r.name ?? ""),
          food_type: r.food_type == null ? null : String(r.food_type),
          weight_g: r.weight_g == null ? null : toNumberSafe(r.weight_g),
        })) as ProductHint[];

        setProductHints(rows);

        const ft = Array.from(
          new Set(rows.map((x) => (x.food_type ?? "").trim()).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b));
        setFoodTypeHints(ft);

        return;
      }
    }

    // 2차 시도: products(name, food_type, net_weight_g)
    {
      const { data, error } = await supabase
        .from("products")
        .select("name,food_type,net_weight_g")
        .order("name", { ascending: true })
        .limit(5000);

      if (error) {
        // products 테이블이 없거나 컬럼이 다르면, 자동완성은 비활성으로 둠(실행은 계속)
        return;
      }

      const rows = (data ?? []).map((r: any) => ({
        name: String(r.name ?? ""),
        food_type: r.food_type == null ? null : String(r.food_type),
        weight_g: r.net_weight_g == null ? null : toNumberSafe(r.net_weight_g),
      })) as ProductHint[];

      setProductHints(rows);

      const ft = Array.from(new Set(rows.map((x) => (x.food_type ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      );
      setFoodTypeHints(ft);
    }
  }

  function findProductHintByName(name: string) {
    const q = (name ?? "").trim();
    if (!q) return null;
    return productHints.find((p) => p.name === q) ?? null;
  }

  // =========================
  // 주문/출고 로드 (확장 컬럼 포함 시도 → 실패 시 기본 select로 fallback)
  // =========================
  async function loadOrders() {
    setMsg(null);

    // 1차: 확장 컬럼 포함
    {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,customer_id,customer_name,title,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount,product_name,food_type,weight_g,qty,created_at,updated_at"
        )
        .gte("ship_date", fromYMD)
        .lte("ship_date", toYMD)
        .order("ship_date", { ascending: false })
        .limit(5000);

      if (!error) {
        const rows = (data ?? []).map((r: any) => ({
          ...r,
          supply_amount: toNumberSafe(r.supply_amount),
          vat_amount: toNumberSafe(r.vat_amount),
          total_amount: toNumberSafe(r.total_amount),
          weight_g: r.weight_g == null ? null : toNumberSafe(r.weight_g),
          qty: r.qty == null ? null : toNumberSafe(r.qty),
        })) as OrderRow[];
        setOrders(rows);
        return;
      }
    }

    // 2차: 기본 컬럼만
    {
      const { data, error } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name,title,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount,created_at,updated_at")
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
  }

  // =========================
  // 금전출납 로드
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

  async function reloadAll() {
    setMsg(null);
    await Promise.all([loadPartners(), loadCategories(), loadProductHints(), loadOrders(), loadLedgers()]);
  }

  // 최초 로드
  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 기간 변경시 리로드
  useEffect(() => {
    loadOrders();
    loadLedgers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromYMD, toYMD]);

  // 거래처 선택 시 폼 자동 채움(기존 유지)
  useEffect(() => {
    if (!selectedPartner) return;

    if (!ledgerCounterpartyName) setLedgerCounterpartyName(selectedPartner.name ?? "");
    if (!ledgerBusinessNo) setLedgerBusinessNo(selectedPartner.business_no ?? "");

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
  // ✅ 주문 VAT 자동(총액<->공급가 기준)
  // =========================
  useEffect(() => {
    const r = Number(orderVatRate ?? 0.1);
    if (orderVatBaseMode === "TOTAL") {
      const t = clampInt(orderTotal);
      const { supply, vat, total } = splitVatFromTotal(t, r);
      setOrderSupply(supply);
      setOrderVat(vat);
      setOrderTotal(total);
    } else {
      const s = clampInt(orderSupply);
      const { supply, vat, total } = calcVatFromSupply(s, r);
      setOrderSupply(supply);
      setOrderVat(vat);
      setOrderTotal(total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderTotal, orderSupply, orderVatRate, orderVatBaseMode]);

  // =========================
  // ✅ 금전출납 VAT 자동(기존 유지)
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
  // ✅ 제품명 선택 -> 식품유형/무게 자동 입력
  // =========================
  useEffect(() => {
    const hit = findProductHintByName(orderProductName);
    if (!hit) return;

    // 비어있을 때만 자동 채움(대표님 입력 방해 안 하게)
    if (!orderFoodType && hit.food_type) setOrderFoodType(hit.food_type);
    if (!orderWeightG && hit.weight_g != null) setOrderWeightG(hit.weight_g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderProductName]);

  // =========================
  // 거래처 상세 오픈/초기화
  // =========================
  function openPartnerDetail() {
    if (!selectedPartner) return setMsg("거래처를 선택하세요.");

    setPName(selectedPartner.name ?? "");
    setPBizNo(selectedPartner.business_no ?? "");
    setPCeo(selectedPartner.ceo_name ?? "");
    setPBizType(selectedPartner.biz_type ?? "");
    setPBizItem(selectedPartner.biz_item ?? "");
    setPPhone(selectedPartner.phone ?? "");
    setPAddr1(selectedPartner.address1 ?? "");

    setPShipName(selectedPartner.ship_to_name ?? "");
    setPShipAddr1(selectedPartner.ship_to_address1 ?? "");
    setPShipMobile(selectedPartner.ship_to_mobile ?? "");
    setPShipPhone(selectedPartner.ship_to_phone ?? "");

    setPartnerDetailOpen(true);
    loadShipHistory(selectedPartner.id);
  }

  async function savePartnerDetail() {
    if (!selectedPartner) return;

    setMsg(null);

    const patch: any = {
      name: pName.trim(),
      business_no: pBizNo.trim() || null,
      ceo_name: pCeo.trim() || null,
      biz_type: pBizType.trim() || null,
      biz_item: pBizItem.trim() || null,
      phone: pPhone.trim() || null,
      address1: pAddr1.trim() || null,

      ship_to_name: pShipName.trim() || null,
      ship_to_address1: pShipAddr1.trim() || null,
      ship_to_mobile: pShipMobile.trim() || null,
      ship_to_phone: pShipPhone.trim() || null,
    };

    if (!patch.name) return setMsg("거래처명은 필수입니다.");

    const { error } = await supabase.from("partners").update(patch).eq("id", selectedPartner.id);
    if (error) return setMsg(error.message);

    await loadPartners();
    setPartnerDetailOpen(false);
  }

  // =========================
  // 배송이력 로드/추가
  // =========================
  async function loadShipHistory(partnerId: string) {
    setMsg(null);

    // partner_shipments 테이블 기준(없으면 조용히 비활성)
    const { data, error } = await supabase
      .from("partner_shipments")
      .select("id,partner_id,ship_date,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone,memo,created_at")
      .eq("partner_id", partnerId)
      .order("ship_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      // 배송이력 테이블이 없을 수 있으므로 메시지로만 남기지 않고 조용히 처리(대표님 운영 중 끊기지 않게)
      setShipHistory([]);
      return;
    }

    setShipHistory((data ?? []) as PartnerShipmentRow[]);
  }

  async function addShipHistoryFromCurrent() {
    if (!selectedPartner) return setMsg("거래처를 선택하세요.");

    setMsg(null);

    const payload: any = {
      partner_id: selectedPartner.id,
      ship_date: shipDate || ymdToday(),
      ship_to_name: (pShipName || selectedPartner.ship_to_name || "").trim() || null,
      ship_to_address1: (pShipAddr1 || selectedPartner.ship_to_address1 || "").trim() || null,
      ship_to_mobile: (pShipMobile || selectedPartner.ship_to_mobile || "").trim() || null,
      ship_to_phone: (pShipPhone || selectedPartner.ship_to_phone || "").trim() || null,
      memo: shipMemo.trim() || null,
    };

    const { error } = await supabase.from("partner_shipments").insert(payload);
    if (error) return setMsg(error.message);

    setShipMemo("");
    await loadShipHistory(selectedPartner.id);
  }

  // =========================
  // 주문/출고 생성 (확장 컬럼 포함 insert 시도 → 실패하면 제외하고 재시도)
  // =========================
  async function createOrder() {
    setMsg(null);

    const ship_date = orderShipDate || ymdToday();
    const customer_name = (orderCustomerName || "").trim();
    if (!customer_name) return setMsg("주문자(거래처명)를 입력하세요.");

    const supply_amount = clampInt(orderSupply);
    const vat_amount = clampInt(orderVat);
    const total_amount = clampInt(orderTotal);

    // ✅ 확장 필드
    const product_name = orderProductName.trim() || null;
    const food_type = orderFoodType.trim() || null;
    const weight_g = orderWeightG ? clampInt(orderWeightG) : null;
    const qty = orderQty ? clampInt(orderQty) : null;

    const basePayload: any = {
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

    const extendedPayload: any = {
      ...basePayload,
      product_name,
      food_type,
      weight_g,
      qty,
    };

    // 1차: 확장 포함
    {
      const { error } = await supabase.from("orders").insert(extendedPayload);
      if (!error) {
        // 주문 생성 후: 배송최근값 자동 이력 저장(옵션)
        if (autoSaveShipmentHistoryOnOrder && selectedPartner) {
          await addShipHistorySilent(selectedPartner.id);
        }

        resetOrderInputs();
        await loadOrders();
        return;
      }
    }

    // 2차: 기본만
    {
      const { error } = await supabase.from("orders").insert(basePayload);
      if (error) return setMsg(error.message);

      if (autoSaveShipmentHistoryOnOrder && selectedPartner) {
        await addShipHistorySilent(selectedPartner.id);
      }

      resetOrderInputs();
      await loadOrders();
    }
  }

  function resetOrderInputs() {
    setOrderTitle("");
    setOrderMemo("");
    setOrderProductName("");
    setOrderFoodType("");
    setOrderWeightG(0);
    setOrderQty(0);
    setOrderSupply(0);
    setOrderVat(0);
    setOrderTotal(0);
    setOrderVatBaseMode("TOTAL");
    setOrderVatRate(0.1);
  }

  async function addShipHistorySilent(partnerId: string) {
    // 배송이력 테이블이 없으면 그냥 패스
    const payload: any = {
      partner_id: partnerId,
      ship_date: orderShipDate || ymdToday(),
      ship_to_name: selectedPartner?.ship_to_name ?? null,
      ship_to_address1: selectedPartner?.ship_to_address1 ?? null,
      ship_to_mobile: selectedPartner?.ship_to_mobile ?? null,
      ship_to_phone: selectedPartner?.ship_to_phone ?? null,
      memo: "주문/출고 생성 자동 기록",
    };
    const { error } = await supabase.from("partner_shipments").insert(payload);
    if (!error && selectedPartnerId === partnerId) await loadShipHistory(partnerId);
  }

  // =========================
  // 금전출납 생성
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

      // 옵션2 VAT
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
    const { error } = await supabase.from("ledger_categories").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) return setMsg(error.message);
    await loadCategories();
  }

  // =========================
  // ✅ 거래내역 수정 (orders)
  // =========================
  function openOrderEdit(o: OrderRow) {
    setEditOrder({ ...o });
    setEditOrderOpen(true);
  }

  async function saveOrderEdit() {
    if (!editOrder) return;
    setMsg(null);

    const basePatch: any = {
      ship_date: editOrder.ship_date,
      ship_method: editOrder.ship_method ?? null,
      customer_name: (editOrder.customer_name ?? "").trim(),
      customer_id: editOrder.customer_id ?? null,
      title: editOrder.title ? String(editOrder.title).trim() : null,
      memo: editOrder.memo ? String(editOrder.memo).trim() : null,
      supply_amount: clampInt(editOrder.supply_amount),
      vat_amount: clampInt(editOrder.vat_amount),
      total_amount: clampInt(editOrder.total_amount),
    };

    const extendedPatch: any = {
      ...basePatch,
      product_name: editOrder.product_name ?? null,
      food_type: editOrder.food_type ?? null,
      weight_g: editOrder.weight_g == null ? null : clampInt(toNumberSafe(editOrder.weight_g)),
      qty: editOrder.qty == null ? null : clampInt(toNumberSafe(editOrder.qty)),
    };

    // 1차: 확장 update 시도
    {
      const { error } = await supabase.from("orders").update(extendedPatch).eq("id", editOrder.id);
      if (!error) {
        setEditOrderOpen(false);
        setEditOrder(null);
        await loadOrders();
        return;
      }
    }

    // 2차: 기본만
    {
      const { error } = await supabase.from("orders").update(basePatch).eq("id", editOrder.id);
      if (error) return setMsg(error.message);

      setEditOrderOpen(false);
      setEditOrder(null);
      await loadOrders();
    }
  }

  // =========================
  // ✅ 거래내역 수정 (ledger)
  // =========================
  function openLedgerEdit(l: LedgerRow) {
    setEditLedger({ ...l });
    setEditLedgerOpen(true);
  }

  async function saveLedgerEdit() {
    if (!editLedger) return;
    setMsg(null);

    const patch: any = {
      entry_date: editLedger.entry_date,
      direction: editLedger.direction,
      category: (editLedger.category ?? "").trim(),
      method: (editLedger.method ?? "").trim(),
      counterparty_name: editLedger.counterparty_name ? String(editLedger.counterparty_name).trim() : null,
      business_no: editLedger.business_no ? String(editLedger.business_no).trim() : null,
      memo: editLedger.memo ? String(editLedger.memo).trim() : null,

      // 호환 amount = total
      amount: clampInt(toNumberSafe(editLedger.total_amount ?? editLedger.amount)),

      total_amount: clampInt(toNumberSafe(editLedger.total_amount ?? editLedger.amount)),
      supply_amount: clampInt(toNumberSafe(editLedger.supply_amount ?? 0)),
      vat_amount: clampInt(toNumberSafe(editLedger.vat_amount ?? 0)),
      vat_type: (String(editLedger.vat_type ?? "TAXED").toUpperCase() as VatType) ?? "TAXED",
      vat_rate: Number(editLedger.vat_rate ?? 0.1),
    };

    const { error } = await supabase.from("ledger_entries").update(patch).eq("id", editLedger.id);
    if (error) return setMsg(error.message);

    setEditLedgerOpen(false);
    setEditLedger(null);
    await loadLedgers();
  }

  // =========================
  // 통합 집계
  // =========================
  const sumOrders = useMemo(() => {
    const supply = orders.reduce((a, x) => a + toNumberSafe(x.supply_amount), 0);
    const vat = orders.reduce((a, x) => a + toNumberSafe(x.vat_amount), 0);
    const total = orders.reduce((a, x) => a + toNumberSafe(x.total_amount), 0);
    return { supply, vat, total };
  }, [orders]);

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

      const hasVatCols = l.total_amount != null && l.supply_amount != null && l.vat_amount != null;
      if (!hasVatCols) continue;

      supply += s;

      const vt = String(l.vat_type ?? "TAXED").toUpperCase() as VatType;
      if (vt === "TAXED") vat += v;
    }

    return { supply, vat, total };
  }, [ledgers]);

  const expectedVatPayable = useMemo(() => sumOrders.vat - sumPurchase.vat, [sumOrders.vat, sumPurchase.vat]);

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

  // 매출처 거래원장
  const [customerLedgerId, setCustomerLedgerId] = useState<string>("ALL");
  const [customerSearch, setCustomerSearch] = useState<string>("");
  const [externalLedgerMode, setExternalLedgerMode] = useState<boolean>(true);

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

  // 거래처 필터
  const filteredPartners = useMemo(() => {
    const q = partnerFilter.trim();
    const rows = partners.slice();
    if (!q) return rows;
    return rows.filter((p) => (p.name || "").includes(q) || (p.business_no || "").includes(q));
  }, [partners, partnerFilter]);

  const orderTotalWeightG = useMemo(() => clampInt(orderWeightG) * clampInt(orderQty), [orderWeightG, orderQty]);

  // =========================
  // 렌더
  // =========================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* datalist: 자동완성 */}
      <datalist id="dl-product-name">
        {productHints.map((p) => (
          <option key={p.name} value={p.name} />
        ))}
      </datalist>
      <datalist id="dl-food-type">
        {foodTypeHints.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="mx-auto w-full max-w-[1600px] px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        {/* 상단: 기간/탭 */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
          <div>
            <div className="text-xl font-semibold">거래(거래처 · 주문/출고 · 금전출납 · 통합)</div>
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
              <button
                className={btn}
                onClick={() => {
                  setFromYMD(addDays(ymdToday(), -30));
                  setToYMD(ymdToday());
                }}
                type="button"
              >
                최근 30일
              </button>
              <button className={btn} onClick={reloadAll} type="button">
                조회 갱신
              </button>
              <button className={btn} onClick={downloadTaxExcel} type="button">
                세무사용 엑셀
              </button>
              <button className={btn} onClick={printNow} type="button">
                인쇄
              </button>
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
                <button className={btn} onClick={() => setSelectedPartnerId(null)} type="button">
                  선택 해제
                </button>
                <button className={btn} onClick={loadPartners} type="button">
                  새로고침
                </button>
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

            <div className="mt-3 flex gap-2">
              <button className={btnBlue} type="button" onClick={openPartnerDetail} disabled={!selectedPartner}>
                거래처 상세/배송
              </button>
              <button className={btn} type="button" onClick={() => setTab("PARTNER")}>
                거래처 탭
              </button>
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
              <button className={tab === "PARTNER" ? pillOn : pill} onClick={() => setTab("PARTNER")} type="button">
                거래처
              </button>
              <button className={tab === "ORDER" ? pillOn : pill} onClick={() => setTab("ORDER")} type="button">
                주문/출고
              </button>
              <button className={tab === "LEDGER" ? pillOn : pill} onClick={() => setTab("LEDGER")} type="button">
                금전출납
              </button>
              <button className={tab === "UNION" ? pillOn : pill} onClick={() => setTab("UNION")} type="button">
                통합
              </button>
            </div>

            {/* 거래처 탭(요약+배송최근값/이력 빠른보기) */}
            {tab === "PARTNER" ? (
              <div className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">거래처(배송 최근값/이력)</div>
                    <div className="mt-1 text-xs text-slate-600">
                      선택 거래처의 배송 최근값(partners.ship_to_*) 확인 및 배송이력(partner_shipments) 관리
                    </div>
                  </div>
                  <div className="flex gap-2 print:hidden">
                    <button className={btn} type="button" onClick={openPartnerDetail} disabled={!selectedPartner}>
                      상세/수정
                    </button>
                    <button
                      className={btn}
                      type="button"
                      onClick={() => selectedPartner && loadShipHistory(selectedPartner.id)}
                      disabled={!selectedPartner}
                    >
                      이력 새로고침
                    </button>
                  </div>
                </div>

                {!selectedPartner ? (
                  <div className="mt-4 text-sm text-slate-500">좌측에서 거래처를 선택하세요.</div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold">배송 최근값(거래처에 저장된 값)</div>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <div className="mb-1 text-xs text-slate-600">수령인</div>
                          <div className="text-sm">{selectedPartner.ship_to_name ?? ""}</div>
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-slate-600">주소</div>
                          <div className="text-sm">{selectedPartner.ship_to_address1 ?? ""}</div>
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-slate-600">휴대폰</div>
                          <div className="text-sm">{selectedPartner.ship_to_mobile ?? ""}</div>
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-slate-600">전화</div>
                          <div className="text-sm">{selectedPartner.ship_to_phone ?? ""}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">배송이력</div>
                        <button className={btn} type="button" onClick={() => setShipHistoryOpen((v) => !v)}>
                          {shipHistoryOpen ? "접기" : "펼치기"}
                        </button>
                      </div>

                      {shipHistoryOpen ? (
                        <>
                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6">
                            <div>
                              <div className="mb-1 text-xs text-slate-600">날짜</div>
                              <input type="date" className={input} value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
                            </div>
                            <div className="md:col-span-4">
                              <div className="mb-1 text-xs text-slate-600">메모</div>
                              <input className={input} value={shipMemo} onChange={(e) => setShipMemo(e.target.value)} placeholder="예: 설 선물세트 / 퀵" />
                            </div>
                            <div className="flex items-end">
                              <button className={btnBlue} type="button" onClick={addShipHistoryFromCurrent}>
                                최근값→이력추가
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
                            <table className="w-full table-fixed text-sm">
                              <colgroup>
                                <col style={{ width: "110px" }} />
                                <col style={{ width: "140px" }} />
                                <col style={{ width: "340px" }} />
                                <col style={{ width: "140px" }} />
                                <col style={{ width: "140px" }} />
                                <col style={{ width: "260px" }} />
                              </colgroup>
                              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                                <tr>
                                  <th className="px-3 py-2 text-left">날짜</th>
                                  <th className="px-3 py-2 text-left">수령인</th>
                                  <th className="px-3 py-2 text-left">주소</th>
                                  <th className="px-3 py-2 text-left">휴대폰</th>
                                  <th className="px-3 py-2 text-left">전화</th>
                                  <th className="px-3 py-2 text-left">메모</th>
                                </tr>
                              </thead>
                              <tbody>
                                {shipHistory.map((h) => (
                                  <tr key={h.id} className="border-t border-slate-200 bg-white">
                                    <td className="px-3 py-2 font-semibold tabular-nums">{h.ship_date}</td>
                                    <td className="px-3 py-2">{h.ship_to_name ?? ""}</td>
                                    <td className="px-3 py-2">{h.ship_to_address1 ?? ""}</td>
                                    <td className="px-3 py-2 tabular-nums">{h.ship_to_mobile ?? ""}</td>
                                    <td className="px-3 py-2 tabular-nums">{h.ship_to_phone ?? ""}</td>
                                    <td className="px-3 py-2">
                                      {h.memo ? (
                                        <button className={btn} type="button" onClick={() => openMemo("배송이력 메모", h.memo ?? "")}>
                                          보기
                                        </button>
                                      ) : (
                                        ""
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                {shipHistory.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="px-4 py-4 text-sm text-slate-500">
                                      배송이력 데이터가 없거나, partner_shipments 테이블이 없을 수 있습니다.
                                    </td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* 주문/출고 */}
            {tab === "ORDER" ? (
              <div className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">주문/출고 입력</div>
                    <div className="mt-1 text-xs text-slate-600">
                      자동완성(제품명/식품유형) · 무게 자동 · 총액→공급/VAT 자동 · 거래내역 수정 포함
                    </div>
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

                  {/* ✅ 복구: 제품명/식품유형/무게/수량 */}
                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">제품명(자동완성)</div>
                    <input
                      className={input}
                      list="dl-product-name"
                      value={orderProductName}
                      onChange={(e) => setOrderProductName(e.target.value)}
                      placeholder="제품명 입력(자동완성)"
                    />
                    <div className="mt-1 text-xs text-slate-500">products 테이블 기반(없으면 자동완성 비활성)</div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">식품유형(자동완성)</div>
                    <input
                      className={input}
                      list="dl-food-type"
                      value={orderFoodType}
                      onChange={(e) => setOrderFoodType(e.target.value)}
                      placeholder="식품유형"
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">무게(g) (자동)</div>
                    <input className={input} inputMode="numeric" value={String(orderWeightG)} onChange={(e) => setOrderWeightG(toNumberSafe(e.target.value))} />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">수량</div>
                    <input className={input} inputMode="numeric" value={String(orderQty)} onChange={(e) => setOrderQty(toNumberSafe(e.target.value))} />
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">총중량(g)</div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums">
                      {money(orderTotalWeightG)} g
                    </div>
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

                {/* ✅ 총액->공급/VAT 자동 */}
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-8">
                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">VAT 기준</div>
                    <div className="flex gap-2">
                      <button className={orderVatBaseMode === "TOTAL" ? pillOn : pill} type="button" onClick={() => setOrderVatBaseMode("TOTAL")}>
                        총액 기준
                      </button>
                      <button className={orderVatBaseMode === "SUPPLY" ? pillOn : pill} type="button" onClick={() => setOrderVatBaseMode("SUPPLY")}>
                        공급가 기준
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">VAT율</div>
                    <input className={input} inputMode="decimal" value={String(orderVatRate)} onChange={(e) => setOrderVatRate(toNumberSafe(e.target.value))} />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">공급가</div>
                    <input
                      className={input}
                      inputMode="numeric"
                      value={String(orderSupply)}
                      onChange={(e) => setOrderSupply(toNumberSafe(e.target.value))}
                      disabled={orderVatBaseMode !== "SUPPLY"}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-600">부가세(자동)</div>
                    <input className={input} inputMode="numeric" value={String(orderVat)} readOnly />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-600">총액</div>
                    <input
                      className={input}
                      inputMode="numeric"
                      value={String(orderTotal)}
                      onChange={(e) => setOrderTotal(toNumberSafe(e.target.value))}
                      disabled={orderVatBaseMode !== "TOTAL"}
                    />
                  </div>

                  <div className="md:col-span-2 flex flex-wrap items-end gap-2">
                    <button
                      className={autoSaveShipmentHistoryOnOrder ? pillOn : pill}
                      type="button"
                      onClick={() => setAutoSaveShipmentHistoryOnOrder((v) => !v)}
                    >
                      배송이력 자동기록 {autoSaveShipmentHistoryOnOrder ? "ON" : "OFF"}
                    </button>
                    <button className={btnBlue} type="button" onClick={createOrder}>
                      주문/출고 생성
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-sm font-semibold">기간 내 주문/출고</div>
                  <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col style={{ width: "110px" }} />
                        <col style={{ width: "240px" }} />
                        <col style={{ width: "160px" }} />
                        <col style={{ width: "140px" }} />
                        <col style={{ width: "90px" }} />
                        <col style={{ width: "90px" }} />
                        <col style={{ width: "120px" }} />
                        <col style={{ width: "130px" }} />
                        <col style={{ width: "130px" }} />
                        <col style={{ width: "130px" }} />
                        <col style={{ width: "120px" }} />
                      </colgroup>
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">출고일</th>
                          <th className="px-3 py-2 text-left">거래처</th>
                          <th className="px-3 py-2 text-left">제품명</th>
                          <th className="px-3 py-2 text-left">식품유형</th>
                          <th className="px-3 py-2 text-right">무게(g)</th>
                          <th className="px-3 py-2 text-right">수량</th>
                          <th className="px-3 py-2 text-left">방법</th>
                          <th className="px-3 py-2 text-right">공급가</th>
                          <th className="px-3 py-2 text-right">부가세</th>
                          <th className="px-3 py-2 text-right">총액</th>
                          <th className="px-3 py-2 text-left">작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id} className="border-t border-slate-200">
                            <td className="px-3 py-2 font-semibold tabular-nums">{o.ship_date}</td>
                            <td className="px-3 py-2">{o.customer_name}</td>
                            <td className="px-3 py-2">{o.product_name ?? o.title ?? ""}</td>
                            <td className="px-3 py-2">{o.food_type ?? ""}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(o.weight_g ?? 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(o.qty ?? 0)}</td>
                            <td className="px-3 py-2">{o.ship_method ?? ""}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(o.supply_amount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(o.vat_amount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(o.total_amount)}</td>
                            <td className="px-3 py-2">
                              <div className="flex gap-2">
                                <button className={btn} type="button" onClick={() => openOrderEdit(o)}>
                                  수정
                                </button>
                                {o.memo ? (
                                  <button className={btn} type="button" onClick={() => openMemo("주문/출고 메모", o.memo ?? "")}>
                                    메모
                                  </button>
                                ) : (
                                  ""
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {orders.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-4 py-4 text-sm text-slate-500">
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
                      총액 입력 → 공급가/부가세 자동 · 거래내역 수정 · 메모 확인 포함
                    </div>
                  </div>
                  <div className="flex gap-2 print:hidden">
                    <button className={btn} onClick={openCatNew} type="button">
                      카테고리 추가
                    </button>
                    <button className={btn} onClick={() => setCatManageOpen(true)} type="button">
                      카테고리 관리
                    </button>
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
                    <select className={input} value={ledgerCategory} onChange={(e) => setLedgerCategory(e.target.value)}>
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
                    <input className={input} value={ledgerCounterpartyName} onChange={(e) => setLedgerCounterpartyName(e.target.value)} placeholder="거래처 선택 시 자동 입력" />
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-slate-600">사업자등록번호</div>
                    <input className={input} value={ledgerBusinessNo} onChange={(e) => setLedgerBusinessNo(e.target.value)} placeholder="예: 123-45-67890" />
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
                    <div className="mt-2 text-xs text-slate-500">과세일 때만 VAT 분리됩니다. (면세/영세/해당없음은 VAT 0)</div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">VAT율</div>
                    <input className={input} inputMode="decimal" value={String(vatRate)} onChange={(e) => setVatRate(toNumberSafe(e.target.value))} disabled={vatType !== "TAXED"} />
                    <div className="mt-1 text-xs text-slate-500">기본 0.1 (10%)</div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">총액(부가세 포함)</div>
                    <input className={input} inputMode="numeric" value={String(ledgerTotalAmount)} onChange={(e) => setLedgerTotalAmount(toNumberSafe(e.target.value))} disabled={vatBaseMode !== "TOTAL"} />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">공급가</div>
                    <input className={input} inputMode="numeric" value={String(ledgerSupplyAmount)} onChange={(e) => setLedgerSupplyAmount(toNumberSafe(e.target.value))} disabled={vatBaseMode !== "SUPPLY"} />
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
                        <col style={{ width: "120px" }} />
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
                          <th className="px-3 py-2 text-left">작업</th>
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
                            <td className="px-3 py-2 text-slate-700">
                              {l.memo ? (
                                <button className={btn} type="button" onClick={() => openMemo("금전출납 메모", l.memo ?? "")}>
                                  보기
                                </button>
                              ) : (
                                ""
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <button className={btn} type="button" onClick={() => openLedgerEdit(l)}>
                                수정
                              </button>
                            </td>
                          </tr>
                        ))}
                        {ledgers.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-4 py-4 text-sm text-slate-500">
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
                  <div className={modalBackdrop}>
                    <div className={modalCard}>
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

                      <div className="mt-3 text-xs text-slate-500">※ 카테고리를 단순하게 유지하되, 필요 시 여기서 추가/수정 가능합니다.</div>
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
                      <button className={btn} type="button" onClick={printNow}>
                        인쇄
                      </button>
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
                      <div className="mt-2 text-xs text-slate-500">※ VAT는 옵션2 컬럼이 채워진 건만 집계(정확성 우선)</div>
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
                  <div className="no-print flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
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
                              {c.name}
                              {c.business_no ? ` · ${c.business_no}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button className={btn} onClick={printNow} disabled={customerLedgerId === "ALL"} type="button">
                        선택 거래원장 인쇄
                      </button>
                      <button
                        className={externalLedgerMode ? pillOn : pill}
                        type="button"
                        onClick={() => setExternalLedgerMode((v) => !v)}
                        disabled={customerLedgerId === "ALL"}
                      >
                        {externalLedgerMode ? "외부전달용 ON" : "외부전달용 OFF"}
                      </button>
                    </div>
                  </div>

                  {customerLedgerId !== "ALL" ? (
                    <div className="print-area mt-4">
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
                            {externalLedgerMode ? (
                              <col style={{ width: "320px" }} />
                            ) : (
                              <>
                                <col style={{ width: "110px" }} />
                                <col style={{ width: "260px" }} />
                              </>
                            )}
                            <col style={{ width: "140px" }} />
                            <col style={{ width: "140px" }} />
                            <col style={{ width: "140px" }} />
                            {!externalLedgerMode ? <col style={{ width: "260px" }} /> : null}
                          </colgroup>
                          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                            <tr>
                              <th className="px-3 py-2 text-left">출고일</th>
                              {externalLedgerMode ? (
                                <th className="px-3 py-2 text-left">품목/적요</th>
                              ) : (
                                <>
                                  <th className="px-3 py-2 text-left">방법</th>
                                  <th className="px-3 py-2 text-left">품목/적요</th>
                                </>
                              )}
                              <th className="px-3 py-2 text-right">공급가</th>
                              <th className="px-3 py-2 text-right">부가세</th>
                              <th className="px-3 py-2 text-right">총액</th>
                              {!externalLedgerMode ? <th className="px-3 py-2 text-left">메모(내부)</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {ordersForCustomer.map((o) => (
                              <tr key={o.id} className="border-t border-slate-200">
                                <td className="px-3 py-2 font-semibold tabular-nums">{o.ship_date}</td>

                                {externalLedgerMode ? (
                                  <td className="px-3 py-2">{o.product_name ?? o.title ?? ""}</td>
                                ) : (
                                  <>
                                    <td className="px-3 py-2">{o.ship_method ?? ""}</td>
                                    <td className="px-3 py-2">{o.product_name ?? o.title ?? ""}</td>
                                  </>
                                )}

                                <td className="px-3 py-2 text-right tabular-nums">{money(o.supply_amount)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(o.vat_amount)}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(o.total_amount)}</td>

                                {!externalLedgerMode ? <td className="px-3 py-2">{o.memo ?? ""}</td> : null}
                              </tr>
                            ))}
                            {ordersForCustomer.length === 0 ? (
                              <tr>
                                <td colSpan={externalLedgerMode ? 5 : 6} className="px-4 py-4 text-sm text-slate-500">
                                  선택한 매출처의 기간 내 거래가 없습니다.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-3 text-sm font-semibold">
                        합계: 공급가 {money(ordersForCustomer.reduce((a, x) => a + x.supply_amount, 0))} · 부가세{" "}
                        {money(ordersForCustomer.reduce((a, x) => a + x.vat_amount, 0))} · 총액{" "}
                        {money(ordersForCustomer.reduce((a, x) => a + x.total_amount, 0))}
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

        {/* =========================
            모달: 거래처 상세/배송최근값 수정
           ========================= */}
        {partnerDetailOpen ? (
          <div className={modalBackdrop}>
            <div className={modalCard}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">거래처 상세 / 배송 최근값</div>
                  <div className="mt-1 text-xs text-slate-600">partners + ship_to_* 저장</div>
                </div>
                <button className={btn} type="button" onClick={() => setPartnerDetailOpen(false)}>
                  닫기
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">거래처명</div>
                  <input className={input} value={pName} onChange={(e) => setPName(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">사업자번호</div>
                  <input className={input} value={pBizNo} onChange={(e) => setPBizNo(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">대표자</div>
                  <input className={input} value={pCeo} onChange={(e) => setPCeo(e.target.value)} />
                </div>

                <div className="md:col-span-3">
                  <div className="mb-1 text-xs text-slate-600">업태</div>
                  <input className={input} value={pBizType} onChange={(e) => setPBizType(e.target.value)} />
                </div>
                <div className="md:col-span-3">
                  <div className="mb-1 text-xs text-slate-600">종목</div>
                  <input className={input} value={pBizItem} onChange={(e) => setPBizItem(e.target.value)} />
                </div>

                <div className="md:col-span-3">
                  <div className="mb-1 text-xs text-slate-600">전화</div>
                  <input className={input} value={pPhone} onChange={(e) => setPPhone(e.target.value)} />
                </div>
                <div className="md:col-span-3">
                  <div className="mb-1 text-xs text-slate-600">주소</div>
                  <input className={input} value={pAddr1} onChange={(e) => setPAddr1(e.target.value)} />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">배송 수령인</div>
                  <input className={input} value={pShipName} onChange={(e) => setPShipName(e.target.value)} />
                </div>
                <div className="md:col-span-4">
                  <div className="mb-1 text-xs text-slate-600">배송 주소</div>
                  <input className={input} value={pShipAddr1} onChange={(e) => setPShipAddr1(e.target.value)} />
                </div>

                <div className="md:col-span-3">
                  <div className="mb-1 text-xs text-slate-600">배송 휴대폰</div>
                  <input className={input} value={pShipMobile} onChange={(e) => setPShipMobile(e.target.value)} />
                </div>
                <div className="md:col-span-3">
                  <div className="mb-1 text-xs text-slate-600">배송 전화</div>
                  <input className={input} value={pShipPhone} onChange={(e) => setPShipPhone(e.target.value)} />
                </div>

                <div className="md:col-span-6 flex justify-end gap-2">
                  <button className={btn} type="button" onClick={() => setPartnerDetailOpen(false)}>
                    취소
                  </button>
                  <button className={btnBlue} type="button" onClick={savePartnerDetail}>
                    저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* =========================
            모달: 주문 수정
           ========================= */}
        {editOrderOpen && editOrder ? (
          <div className={modalBackdrop}>
            <div className={modalCard}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">주문/출고 수정</div>
                  <div className="mt-1 text-xs text-slate-600">orders 업데이트 (확장컬럼은 있으면 반영)</div>
                </div>
                <button className={btn} type="button" onClick={() => setEditOrderOpen(false)}>
                  닫기
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
                <div>
                  <div className="mb-1 text-xs text-slate-600">출고일</div>
                  <input type="date" className={input} value={editOrder.ship_date} onChange={(e) => setEditOrder({ ...editOrder, ship_date: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">거래처명</div>
                  <input className={input} value={editOrder.customer_name} onChange={(e) => setEditOrder({ ...editOrder, customer_name: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">방법</div>
                  <input className={input} value={editOrder.ship_method ?? ""} onChange={(e) => setEditOrder({ ...editOrder, ship_method: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">제품명</div>
                  <input className={input} list="dl-product-name" value={editOrder.product_name ?? ""} onChange={(e) => setEditOrder({ ...editOrder, product_name: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">식품유형</div>
                  <input className={input} list="dl-food-type" value={editOrder.food_type ?? ""} onChange={(e) => setEditOrder({ ...editOrder, food_type: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">무게(g)</div>
                  <input className={input} inputMode="numeric" value={String(editOrder.weight_g ?? 0)} onChange={(e) => setEditOrder({ ...editOrder, weight_g: toNumberSafe(e.target.value) })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">수량</div>
                  <input className={input} inputMode="numeric" value={String(editOrder.qty ?? 0)} onChange={(e) => setEditOrder({ ...editOrder, qty: toNumberSafe(e.target.value) })} />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">적요(title)</div>
                  <input className={input} value={editOrder.title ?? ""} onChange={(e) => setEditOrder({ ...editOrder, title: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">메모</div>
                  <input className={input} value={editOrder.memo ?? ""} onChange={(e) => setEditOrder({ ...editOrder, memo: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">공급가</div>
                  <input className={input} inputMode="numeric" value={String(editOrder.supply_amount)} onChange={(e) => setEditOrder({ ...editOrder, supply_amount: toNumberSafe(e.target.value) })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">부가세</div>
                  <input className={input} inputMode="numeric" value={String(editOrder.vat_amount)} onChange={(e) => setEditOrder({ ...editOrder, vat_amount: toNumberSafe(e.target.value) })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">총액</div>
                  <input className={input} inputMode="numeric" value={String(editOrder.total_amount)} onChange={(e) => setEditOrder({ ...editOrder, total_amount: toNumberSafe(e.target.value) })} />
                </div>

                <div className="md:col-span-6 flex justify-end gap-2">
                  <button className={btn} type="button" onClick={() => setEditOrderOpen(false)}>
                    취소
                  </button>
                  <button className={btnBlue} type="button" onClick={saveOrderEdit}>
                    저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* =========================
            모달: 금전출납 수정
           ========================= */}
        {editLedgerOpen && editLedger ? (
          <div className={modalBackdrop}>
            <div className={modalCard}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">금전출납 수정</div>
                  <div className="mt-1 text-xs text-slate-600">ledger_entries 업데이트</div>
                </div>
                <button className={btn} type="button" onClick={() => setEditLedgerOpen(false)}>
                  닫기
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
                <div>
                  <div className="mb-1 text-xs text-slate-600">일자</div>
                  <input type="date" className={input} value={editLedger.entry_date} onChange={(e) => setEditLedger({ ...editLedger, entry_date: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">방향</div>
                  <select className={input} value={editLedger.direction} onChange={(e) => setEditLedger({ ...editLedger, direction: e.target.value as LedgerDirection })}>
                    <option value="IN">IN(입금)</option>
                    <option value="OUT">OUT(출금)</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">카테고리</div>
                  <input className={input} value={editLedger.category} onChange={(e) => setEditLedger({ ...editLedger, category: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">수단</div>
                  <input className={input} value={editLedger.method} onChange={(e) => setEditLedger({ ...editLedger, method: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">거래처명</div>
                  <input className={input} value={editLedger.counterparty_name ?? ""} onChange={(e) => setEditLedger({ ...editLedger, counterparty_name: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-slate-600">사업자번호</div>
                  <input className={input} value={editLedger.business_no ?? ""} onChange={(e) => setEditLedger({ ...editLedger, business_no: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">VAT 유형</div>
                  <select className={input} value={(editLedger.vat_type ?? "TAXED") as VatType} onChange={(e) => setEditLedger({ ...editLedger, vat_type: e.target.value as VatType })}>
                    <option value="TAXED">과세</option>
                    <option value="EXEMPT">면세</option>
                    <option value="ZERO">영세</option>
                    <option value="NA">해당없음</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">공급가</div>
                  <input className={input} inputMode="numeric" value={String(editLedger.supply_amount ?? 0)} onChange={(e) => setEditLedger({ ...editLedger, supply_amount: toNumberSafe(e.target.value) })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">부가세</div>
                  <input className={input} inputMode="numeric" value={String(editLedger.vat_amount ?? 0)} onChange={(e) => setEditLedger({ ...editLedger, vat_amount: toNumberSafe(e.target.value) })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-slate-600">총액</div>
                  <input className={input} inputMode="numeric" value={String(editLedger.total_amount ?? editLedger.amount)} onChange={(e) => setEditLedger({ ...editLedger, total_amount: toNumberSafe(e.target.value) })} />
                </div>

                <div className="md:col-span-6">
                  <div className="mb-1 text-xs text-slate-600">메모</div>
                  <input className={input} value={editLedger.memo ?? ""} onChange={(e) => setEditLedger({ ...editLedger, memo: e.target.value })} />
                </div>

                <div className="md:col-span-6 flex justify-end gap-2">
                  <button className={btn} type="button" onClick={() => setEditLedgerOpen(false)}>
                    취소
                  </button>
                  <button className={btnBlue} type="button" onClick={saveLedgerEdit}>
                    저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* =========================
            모달: 메모 보기
           ========================= */}
        {memoOpen ? (
          <div className={modalBackdrop}>
            <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{memoTitle}</div>
                  <div className="mt-1 text-xs text-slate-600">메모 확인</div>
                </div>
                <button className={btn} type="button" onClick={() => setMemoOpen(false)}>
                  닫기
                </button>
              </div>
              <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                {memoText}
              </div>
            </div>
          </div>
        ) : null}

        {/* 인쇄용 CSS */}
        <style jsx global>{`
          @media print {
            .print\\:hidden {
              display: none !important;
            }
            body {
              background: white !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}