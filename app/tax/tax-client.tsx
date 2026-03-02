"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type LedgerCategoryRow = {
  id: string;
  name: string;
  direction: "IN" | "OUT" | string;
  sort_order: number | null;
  is_active: boolean;
};

type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  ship_date: string;
  ship_method: string | null;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
};

type LedgerRow = {
  id: string;
  entry_date: string;
  entry_ts: string;
  direction: "IN" | "OUT" | string;
  amount: number; // 기존 amount 유지(총액 의미로 사용)
  category: string;
  method: string | null;
  counterparty_name: string | null;
  business_no: string | null;
  memo: string | null;

  // ✅ 옵션2(정확 VAT) 컬럼들 (migration 완료 기준)
  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  vat_type: string | null; // TAXED/EXEMPT/ZERO/NA 등
  vat_rate: number | null;
};

type ARSummaryRow = {
  partner_id: string;
  partner_name: string;
  business_no: string | null;
  sales_out: number;
  cash_in: number;
  balance: number;
  last_ship_date: string | null;
  last_in_date: string | null;
};

function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
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

function toInt(n: any) {
  const v = Number(String(n ?? "").replaceAll(",", ""));
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}

type ViewMode = "PURCHASE" | "SALES" | "AR";

export default function TaxClient() {
  const supabase = useMemo(() => createClient(), []);

  const [msg, setMsg] = useState<string | null>(null);

  // 기간
  const [fromYMD, setFromYMD] = useState(addDays(todayYMD(), -30));
  const [toYMD, setToYMD] = useState(todayYMD());

  // 카테고리(관리/필터)
  const [cats, setCats] = useState<LedgerCategoryRow[]>([]);
  const outCatNames = useMemo(
    () =>
      cats
        .filter((c) => c.is_active && String(c.direction) === "OUT")
        .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
        .map((c) => c.name),
    [cats]
  );

  // ✅ 매입집계 포함 카테고리 (기본: OUT 카테고리 전체)
  const [purchaseCatFilter, setPurchaseCatFilter] = useState<string[]>([]);
  useEffect(() => {
    // 최초 로드 후, 비어있으면 OUT 전체를 기본 선택
    if (purchaseCatFilter.length === 0 && outCatNames.length) {
      setPurchaseCatFilter(outCatNames);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outCatNames.join("|")]);

  // 데이터
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);
  const [partnersById, setPartnersById] = useState<Map<string, PartnerRow>>(new Map());

  // ✅ 뷰 모드(매입처/매출처/미수금)
  const [viewMode, setViewMode] = useState<ViewMode>("PURCHASE");

  // ✅ 미수금(AR) 옵션/데이터
  const [includeChannelsAR, setIncludeChannelsAR] = useState<boolean>(false);
  const [arRows, setArRows] = useState<ARSummaryRow[]>([]);

  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";

  // ✅ (추가) 매출 환불 카테고리
  const SALES_REFUND_CATEGORY = "매출환불";

  // ✅ 탭 타이틀
  useEffect(() => {
    document.title = "BONUSMATE ERP 세무";
  }, []);

  async function loadCats() {
    const { data, error } = await supabase
      .from("ledger_categories")
      .select("id,name,direction,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);

    if (error) return setMsg(error.message);
    setCats((data ?? []) as LedgerCategoryRow[]);
  }

  async function loadPeriod() {
    setMsg(null);

    const f = fromYMD || addDays(todayYMD(), -30);
    const t = toYMD || todayYMD();

    // 1) 매출(orders)
    const { data: oData, error: oErr } = await supabase
      .from("orders")
      .select("id,customer_id,customer_name,ship_date,ship_method,supply_amount,vat_amount,total_amount")
      .gte("ship_date", f)
      .lte("ship_date", t)
      .order("ship_date", { ascending: true })
      .limit(10000);

    if (oErr) return setMsg(oErr.message);
    const oRows = (oData ?? []).map((r: any) => ({
      ...r,
      supply_amount: Number(r.supply_amount ?? 0),
      vat_amount: Number(r.vat_amount ?? 0),
      total_amount: Number(r.total_amount ?? 0),
    })) as OrderRow[];
    setOrders(oRows);

    // 2) 금전출납(ledger_entries) - VAT 정확 컬럼 포함
    const { data: lData, error: lErr } = await supabase
      .from("ledger_entries")
      .select(
        "id,entry_date,entry_ts,direction,amount,category,method,counterparty_name,business_no,memo,supply_amount,vat_amount,total_amount,vat_type,vat_rate"
      )
      .gte("entry_date", f)
      .lte("entry_date", t)
      .order("entry_date", { ascending: true })
      .limit(20000);

    if (lErr) return setMsg(lErr.message);
    const lRows = (lData ?? []).map((r: any) => ({
      ...r,
      amount: Number(r.amount ?? 0),
      supply_amount: r.supply_amount == null ? null : Number(r.supply_amount),
      vat_amount: r.vat_amount == null ? null : Number(r.vat_amount),
      total_amount: r.total_amount == null ? null : Number(r.total_amount),
      vat_rate: r.vat_rate == null ? null : Number(r.vat_rate),
    })) as LedgerRow[];
    setLedgers(lRows);

    // 3) 고객 business_no 매핑(orders.customer_id -> partners.business_no)
    const ids = Array.from(new Set(oRows.map((x) => x.customer_id).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: pData, error: pErr } = await supabase
        .from("partners")
        .select("id,name,business_no")
        .in("id", ids)
        .limit(5000);

      if (!pErr) {
        const map = new Map<string, PartnerRow>();
        for (const p of (pData ?? []) as any[]) map.set(p.id, p as PartnerRow);
        setPartnersById(map);
      }
    } else {
      setPartnersById(new Map());
    }
  }

  async function loadAR() {
    // ✅ 거래원장 기준과 동일하게: "최초 기록부터 ~ 기준일(toYMD)까지 누적"으로 미수금 계산
    setMsg(null);
    const asOf = toYMD || todayYMD();
    const START = "1900-01-01";

    const CHANNEL_NAMES = new Set(["네이버-판매", "쿠팡-판매", "카카오플러스-판매"]);

    function normBizNo(bn: string | null | undefined) {
      const s = String(bn ?? "").trim();
      if (!s) return "";
      return s.replaceAll(/[^0-9]/g, "");
    }
    function normName(n: string | null | undefined) {
      return String(n ?? "").trim();
    }

    try {
      // 1) 누적 출고(매출): orders (START ~ asOf)
      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name,ship_date,ship_method,supply_amount,vat_amount,total_amount")
        .gte("ship_date", START)
        .lte("ship_date", asOf)
        .order("ship_date", { ascending: true })
        .limit(20000);

      if (oErr) return setMsg(oErr.message);

      const oRows = (oData ?? []).map((r: any) => ({
        ...r,
        supply_amount: Number(r.supply_amount ?? 0),
        vat_amount: Number(r.vat_amount ?? 0),
        total_amount: Number(r.total_amount ?? 0),
      })) as OrderRow[];

      // 2) 누적 입금: ledger_entries(IN) (START ~ asOf)
      const { data: lData, error: lErr } = await supabase
        .from("ledger_entries")
        .select(
          "id,entry_date,entry_ts,direction,amount,category,method,counterparty_name,business_no,memo,supply_amount,vat_amount,total_amount,vat_type,vat_rate"
        )
        .gte("entry_date", START)
        .lte("entry_date", asOf)
        .order("entry_date", { ascending: true })
        .limit(50000);

      if (lErr) return setMsg(lErr.message);

      const lRows = (lData ?? []).map((r: any) => ({
        ...r,
        amount: Number(r.amount ?? 0),
        supply_amount: r.supply_amount == null ? null : Number(r.supply_amount),
        vat_amount: r.vat_amount == null ? null : Number(r.vat_amount),
        total_amount: r.total_amount == null ? null : Number(r.total_amount),
        vat_rate: r.vat_rate == null ? null : Number(r.vat_rate),
      })) as LedgerRow[];

      // 3) partners 매핑(가능하면 넓게 가져옴): orders.customer_id 기반
      const ids = Array.from(new Set(oRows.map((x) => x.customer_id).filter(Boolean) as string[]));
      let pMap = new Map<string, PartnerRow>();
      if (ids.length) {
        const { data: pData, error: pErr } = await supabase.from("partners").select("id,name,business_no").in("id", ids).limit(20000);
        if (!pErr) {
          for (const p of (pData ?? []) as any[]) pMap.set(String(p.id), p as PartnerRow);
        }
      }

      const bizToPartnerId = new Map<string, string>();
      const nameToPartnerId = new Map<string, string>();

      for (const [pid, p] of pMap.entries()) {
        const bn = normBizNo(p.business_no);
        const nm = normName(p.name);
        if (bn) bizToPartnerId.set(bn, pid);
        if (nm) nameToPartnerId.set(nm, pid);
      }

      const map = new Map<string, ARSummaryRow>();

      // 누적 출고 합산
      for (const o of oRows) {
        const pid = String(o.customer_id ?? "").trim();
        if (!pid) continue;

        const p = pMap.get(pid);
        const pname = String(o.customer_name ?? p?.name ?? "").trim();

        if (!includeChannelsAR && CHANNEL_NAMES.has(pname)) continue;

        if (!map.has(pid)) {
          map.set(pid, {
            partner_id: pid,
            partner_name: pname || "(이름없음)",
            business_no: p?.business_no ?? null,
            sales_out: 0,
            cash_in: 0,
            balance: 0,
            last_ship_date: null,
            last_in_date: null,
          });
        }

        const row = map.get(pid)!;
        row.sales_out += Number(o.total_amount ?? 0);

        const sd = String(o.ship_date ?? "");
        if (sd) {
          if (!row.last_ship_date || sd > row.last_ship_date) row.last_ship_date = sd;
        }

        if (!row.business_no && p?.business_no) row.business_no = p.business_no;
        if (row.partner_name === "(이름없음)" && pname) row.partner_name = pname;
      }

      // ✅ (추가) 누적 매출환불 반영: ledger_entries.category === "매출환불" 은 "매출(-)"로 처리 (입금 합산에서 제외)
      for (const l of lRows) {
        if (String(l.category ?? "") !== SALES_REFUND_CATEGORY) continue;

        const lBiz = normBizNo(l.business_no);
        const lName = normName(l.counterparty_name);

        let pid = "";
        if (lBiz && bizToPartnerId.has(lBiz)) pid = bizToPartnerId.get(lBiz)!;
        else if (lName && nameToPartnerId.has(lName)) pid = nameToPartnerId.get(lName)!;

        if (!pid || !map.has(pid)) continue;

        const row = map.get(pid)!;
        if (!includeChannelsAR && CHANNEL_NAMES.has(row.partner_name)) continue;

        const amt = Number(l.total_amount ?? l.amount ?? 0);
        row.sales_out -= amt;
      }

      // 누적 입금 합산 (IN만) - 단, 매출환불은 제외
      for (const l of lRows) {
        if (String(l.direction) !== "IN") continue;
        if (String(l.category ?? "") === SALES_REFUND_CATEGORY) continue;

        const lBiz = normBizNo(l.business_no);
        const lName = normName(l.counterparty_name);

        let pid = "";
        if (lBiz && bizToPartnerId.has(lBiz)) pid = bizToPartnerId.get(lBiz)!;
        else if (lName && nameToPartnerId.has(lName)) pid = nameToPartnerId.get(lName)!;

        // 출고가 있는 거래처만 누적 입금 반영(리포트 AR 표 구조 유지)
        if (!pid || !map.has(pid)) continue;

        const row = map.get(pid)!;
        if (!includeChannelsAR && CHANNEL_NAMES.has(row.partner_name)) continue;

        const amt = Number(l.total_amount ?? l.amount ?? 0);
        row.cash_in += amt;

        const idt = String(l.entry_date ?? "");
        if (idt) {
          if (!row.last_in_date || idt > row.last_in_date) row.last_in_date = idt;
        }
      }

      const rows = Array.from(map.values()).map((r) => ({
        ...r,
        balance: Number(r.sales_out ?? 0) - Number(r.cash_in ?? 0),
      }));

      rows.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
      setArRows(rows);
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    loadCats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadPeriod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromYMD, toYMD]);

  useEffect(() => {
    if (viewMode === "AR") loadAR();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, toYMD, includeChannelsAR]);

  // =========================
  // 집계: 매출/매입/VAT
  // =========================

  // ✅ 공급가/부가세 계산: (1) 컬럼이 있으면 그대로, (2) 없으면 vat_type/vat_rate로 total에서 역산
  function calcLedgerSVT(l: LedgerRow) {
    const vt = String(l.vat_type ?? "TAXED").toUpperCase();
    const total = Number(l.total_amount ?? l.amount ?? 0);

    // 컬럼이 있으면 우선 사용
    if (l.supply_amount != null && l.vat_amount != null && l.total_amount != null) {
      const supply = Number(l.supply_amount ?? 0);
      const vat = vt === "TAXED" ? Number(l.vat_amount ?? 0) : 0;
      return { supply, vat, total: Number(l.total_amount ?? total) };
    }

    // 컬럼이 없으면 total에서 계산
    if (vt === "TAXED") {
      const rate = Number.isFinite(Number(l.vat_rate)) ? Number(l.vat_rate) : 0.1;
      const supply = Math.round(total / (1 + (rate || 0)));
      const vat = total - supply;
      return { supply, vat, total };
    }

    // EXEMPT/ZERO/NA 등은 VAT 0, 총액=공급가
    return { supply: total, vat: 0, total };
  }

  // ✅ (추가) 매출 환불(ledger_entries.category === "매출환불") 집계
  const salesRefundSummary = useMemo(() => {
    let supply = 0;
    let vat = 0;
    let total = 0;

    for (const l of ledgers) {
      if (String(l.category ?? "") !== SALES_REFUND_CATEGORY) continue;
      const x = calcLedgerSVT(l);
      total += Number(x.total ?? 0);
      supply += Number(x.supply ?? 0);
      vat += Number(x.vat ?? 0);
    }

    return { supply, vat, total };
  }, [ledgers]);

  // ✅ 매출 요약: orders - 매출환불
  const salesSummary = useMemo(() => {
    const supply0 = orders.reduce((a, x) => a + Number(x.supply_amount ?? 0), 0);
    const vat0 = orders.reduce((a, x) => a + Number(x.vat_amount ?? 0), 0);
    const total0 = orders.reduce((a, x) => a + Number(x.total_amount ?? 0), 0);

    return {
      supply: supply0 - Number(salesRefundSummary.supply ?? 0),
      vat: vat0 - Number(salesRefundSummary.vat ?? 0),
      total: total0 - Number(salesRefundSummary.total ?? 0),
    };
  }, [orders, salesRefundSummary]);

  // ✅ 매입집계 대상: OUT + (선택카테고리 포함) + (VAT 컬럼 있는 행 우선)
  const purchaseLedgerRows = useMemo(() => {
    const set = new Set(purchaseCatFilter);
    return ledgers.filter((l) => {
      if (String(l.direction) !== "OUT") return false;
      if (String(l.category ?? "") === SALES_REFUND_CATEGORY) return false; // ✅ 매출환불은 매입집계에서 제외
      if (purchaseCatFilter.length && !set.has(l.category)) return false;
      return true;
    });
  }, [ledgers, purchaseCatFilter]);

  const purchaseSummary = useMemo(() => {
    let supply = 0;
    let vat = 0;
    let total = 0;

    for (const l of purchaseLedgerRows) {
      const x = calcLedgerSVT(l);
      total += Number(x.total ?? 0);
      supply += Number(x.supply ?? 0);
      vat += Number(x.vat ?? 0);
    }
    return { supply, vat, total };
  }, [purchaseLedgerRows]);

  const expectedVatPayable = useMemo(() => {
    // 예상 납부VAT = 매출VAT - 매입VAT
    return salesSummary.vat - purchaseSummary.vat;
  }, [salesSummary.vat, purchaseSummary.vat]);

  // ✅ 이익(단순): 매출총액 - 매입총액
  const profitSummary = useMemo(() => {
    return salesSummary.total - purchaseSummary.total;
  }, [salesSummary.total, purchaseSummary.total]);

  // =========================
  // 매입처별 집계(총액 많은 순서 + 비율)
  // =========================
  const purchaseByVendor = useMemo(() => {
    const map = new Map<
      string,
      { _key: string; business_no: string; name: string; supply: number; vat: number; total: number; count: number }
    >();

    for (const l of purchaseLedgerRows) {
      const bn = String(l.business_no ?? "").trim() || "(미입력)";
      const name = String(l.counterparty_name ?? "").trim() || "(거래처명 없음)";

      // ✅ 사업자번호 없는 매입은 거래처명 기준으로 구분
      const key = bn === "(미입력)" ? `NAME||${name}` : `BIZ||${bn}`;

      if (!map.has(key)) map.set(key, { _key: key, business_no: bn, name, supply: 0, vat: 0, total: 0, count: 0 });

      const row = map.get(key)!;

      const x = calcLedgerSVT(l);

      row.total += Number(x.total ?? 0);
      row.supply += Number(x.supply ?? 0);
      row.vat += Number(x.vat ?? 0);
      row.count += 1;

      if (row.name === "(거래처명 없음)" && name !== "(거래처명 없음)") row.name = name;
    }

    const arr = Array.from(map.values());
    // ✅ 총액 많은 순
    arr.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    return arr;
  }, [purchaseLedgerRows]);

  const purchaseTotalAll = useMemo(() => purchaseByVendor.reduce((a, x) => a + (x.total ?? 0), 0), [purchaseByVendor]);

  // =========================
  // 매출처별 집계(총액 많은 순서 + 비율)
  // =========================
  const salesByCustomer = useMemo(() => {
    const map = new Map<
      string,
      {
        customer_id: string;
        name: string;
        business_no: string | null;
        supply: number;
        vat: number;
        total: number;
        count: number;
      }
    >();

    for (const o of orders) {
      const id = String(o.customer_id ?? "").trim();
      if (!id) continue;
      const p = partnersById.get(id);
      const name = String(o.customer_name ?? p?.name ?? "(이름없음)").trim() || "(이름없음)";
      const bn = p?.business_no ?? null;

      if (!map.has(id)) map.set(id, { customer_id: id, name, business_no: bn, supply: 0, vat: 0, total: 0, count: 0 });

      const row = map.get(id)!;
      row.supply += Number(o.supply_amount ?? 0);
      row.vat += Number(o.vat_amount ?? 0);
      row.total += Number(o.total_amount ?? 0);
      row.count += 1;

      if (!row.business_no && bn) row.business_no = bn;
      if (row.name === "(이름없음)" && name !== "(이름없음)") row.name = name;
    }

    // ✅ (추가) 매출환불을 매출처별 집계에서 차감(가능한 경우: business_no 또는 counterparty_name 매칭)
    function normBizNo(bn: string | null | undefined) {
      const s = String(bn ?? "").trim();
      if (!s) return "";
      return s.replaceAll(/[^0-9]/g, "");
    }
    function normName(n: string | null | undefined) {
      return String(n ?? "").trim();
    }

    const bizToId = new Map<string, string>();
    const nameToId = new Map<string, string>();
    for (const [id, row] of map.entries()) {
      const b = normBizNo(row.business_no);
      const n = normName(row.name);
      if (b) bizToId.set(b, id);
      if (n) nameToId.set(n, id);
    }

    for (const l of ledgers) {
      if (String(l.category ?? "") !== SALES_REFUND_CATEGORY) continue;

      const b = normBizNo(l.business_no);
      const n = normName(l.counterparty_name);

      let id = "";
      if (b && bizToId.has(b)) id = bizToId.get(b)!;
      else if (n && nameToId.has(n)) id = nameToId.get(n)!;

      if (!id || !map.has(id)) continue;

      const row = map.get(id)!;
      const x = calcLedgerSVT(l);

      row.supply -= Number(x.supply ?? 0);
      row.vat -= Number(x.vat ?? 0);
      row.total -= Number(x.total ?? 0);
    }

    const arr = Array.from(map.values());
    // ✅ 총액 많은 순
    arr.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    return arr;
  }, [orders, partnersById, ledgers]);

  const salesTotalAll = useMemo(() => salesByCustomer.reduce((a, x) => a + (x.total ?? 0), 0), [salesByCustomer]);

  // =========================
  // 인쇄
  // =========================
  function printNow() {
    window.print();
  }

  // ✅ (추가) 세무사 전달용 엑셀 다운로드: 매출+매입(OUT) 통합
  async function downloadTaxExcel() {
    try {
      const qs = new URLSearchParams();
      qs.set("from", fromYMD);
      qs.set("to", toYMD);

      // 현재 화면의 "매입 집계 포함 카테고리" 선택값을 그대로 전달
      if (purchaseCatFilter.length) qs.set("outCats", purchaseCatFilter.join(","));

      // ✅ (요청1) 판매채널(카카오플러스-판매/네이버-판매/쿠팡-판매)도 엑셀 세부내역 포함하도록 플래그 전달
      qs.set("includeSalesChannels", "1");

      // ✅ (요청2) 엑셀 헤더/컬럼 순서 요청: 날짜/구분/사업자등록번호/거래처/주문자/비고/공급가/VAT/총액
      qs.set("excelHeaderOrder", "date,type,bizno,partner,orderer,note,supply,vat,total");

      const res = await fetch(`/api/tax/excel?${qs.toString()}`, { method: "GET" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        alert(`엑셀 다운로드 실패\n${txt}`);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `세무사_통합_${fromYMD}_${toYMD}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`엑셀 다운로드 실패\n${String(e?.message ?? e)}`);
    }
  }

  return (
    <div className={`${pageBg} min-h-screen`}>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
          <div>
            <div className="text-xl font-semibold">세무사 전달용 통합장부(리포트)</div>
            <div className="mt-1 text-sm text-slate-600">기간별 매출/매입/VAT 요약 + 매입/매출/미수 집계</div>
          </div>

          {/* ✅ 상단 메뉴 버튼 수정 */}
          <div className="flex flex-wrap gap-2">
            <button className={viewMode === "PURCHASE" ? btnOn : btn} onClick={() => setViewMode("PURCHASE")}>
              매입처
            </button>
            <button className={viewMode === "SALES" ? btnOn : btn} onClick={() => setViewMode("SALES")}>
              매출처
            </button>
            <button className={viewMode === "AR" ? btnOn : btn} onClick={() => setViewMode("AR")}>
              미수금
            </button>

            <button className={btn} onClick={printNow}>
              인쇄
            </button>

            <button className={btn} onClick={downloadTaxExcel}>
              엑셀 다운로드
            </button>

            <button className={btn} onClick={() => loadCats()}>
              카테고리 새로고침
            </button>
            <button
              className={btnOn}
              onClick={() => {
                loadPeriod();
                if (viewMode === "AR") loadAR();
              }}
            >
              기간 재조회
            </button>
          </div>
        </div>

        {/* 기간 */}
        <div className={`${card} p-4 print:hidden`}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
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
                최근 30일
              </button>
              <button
                className={btn}
                onClick={() => {
                  setFromYMD(todayYMD().slice(0, 8) + "01");
                  setToYMD(todayYMD());
                }}
              >
                이번달
              </button>
            </div>
          </div>

          {/* 매입집계 카테고리 */}
          <div className="mt-4">
            <div className="mb-1 text-xs text-slate-600">
              매입 집계에 포함할 OUT 카테고리(복식부기는 세무사에서 하므로, 여기서는 단순 선택만)
            </div>
            <div className="flex flex-wrap gap-2">
              {outCatNames.length === 0 ? (
                <div className="text-sm text-slate-500">OUT 카테고리가 없습니다. (ledger_categories 확인)</div>
              ) : (
                outCatNames.map((name) => {
                  const on = purchaseCatFilter.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={on ? btnOn : btn}
                      onClick={() => {
                        setPurchaseCatFilter((prev) => {
                          const has = prev.includes(name);
                          if (has) return prev.filter((x) => x !== name);
                          return [...prev, name];
                        });
                      }}
                    >
                      {name}
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              ※ 옵션2(정확 VAT) 기준으로, 매입 VAT는 ledger_entries.vat_amount(TAXED)만 집계합니다. 과거 데이터(vat 컬럼 비어있는 건)는 VAT 0으로
              처리됩니다.
            </div>
          </div>
        </div>

        {/* 요약 (✅ 요청: 매출, 매입 순서로 변경) */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className={`${card} p-4`}>
            <div className="text-sm font-semibold">매출(orders)</div>
            <div className="mt-2 text-sm text-slate-600">공급가 {formatMoney(salesSummary.supply)}</div>
            <div className="text-sm text-slate-600">부가세 {formatMoney(salesSummary.vat)}</div>
            <div className="mt-1 text-base font-semibold">총액 {formatMoney(salesSummary.total)}</div>
          </div>

          <div className={`${card} p-4`}>
            <div className="text-sm font-semibold">매입(ledger_entries OUT)</div>
            <div className="mt-2 text-sm text-slate-600">공급가 {formatMoney(purchaseSummary.supply)}</div>
            <div className="text-sm text-slate-600">부가세 {formatMoney(purchaseSummary.vat)}</div>
            <div className="mt-1 text-base font-semibold">총액 {formatMoney(purchaseSummary.total)}</div>
          </div>

          <div className={`${card} p-4`}>
            <div className="text-sm font-semibold">이익(= 매출총액 - 매입총액)</div>
            <div className="mt-3 text-2xl font-extrabold tabular-nums">{formatMoney(profitSummary)}</div>
            <div className="mt-2 text-xs text-slate-500">※ 단순 계산(참고용)</div>
          </div>

          <div className={`${card} p-4`}>
            <div className="text-sm font-semibold">예상 부가세 납부(= 매출VAT - 매입VAT)</div>
            <div className="mt-3 text-2xl font-extrabold tabular-nums">{formatMoney(expectedVatPayable)}</div>
            <div className="mt-2 text-xs text-slate-500">※ 실제 신고는 세무사에서 조정됩니다(공제불가/면세/간이/신용카드 등 반영).</div>
          </div>
        </div>

        {/* ====== 뷰 모드별 집계 ====== */}

        {/* 매입처별 집계 */}
        {viewMode === "PURCHASE" ? (
          <div className={`${card} mt-6 p-4`}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">매입처별 집계</div>
                <div className="mt-1 text-xs text-slate-600">정렬: 총액 많은 순 · 비율(%) 표시</div>
              </div>
              <div className="text-xs text-slate-500">건수 {purchaseByVendor.reduce((a, x) => a + x.count, 0)}건</div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "160px" }} />
                  <col style={{ width: "260px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "90px" }} />
                </colgroup>
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">사업자번호</th>
                    <th className="px-3 py-2 text-left">매입처</th>
                    <th className="px-3 py-2 text-right">공급가</th>
                    <th className="px-3 py-2 text-right">부가세</th>
                    <th className="px-3 py-2 text-right">총액</th>
                    <th className="px-3 py-2 text-right">비율</th>
                    <th className="px-3 py-2 text-right">건수</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseByVendor.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="bg-white px-4 py-4 text-sm text-slate-500">
                        매입 집계 대상 데이터가 없습니다. (기간/카테고리 선택을 확인하세요)
                      </td>
                    </tr>
                  ) : (
                    purchaseByVendor.map((v) => {
                      const pct =
                        purchaseTotalAll > 0 ? Math.round(((v.total ?? 0) / purchaseTotalAll) * 1000) / 10 : 0;
                      return (
                        <tr key={v._key} className="border-t border-slate-200 bg-white">
                          <td className="px-3 py-2 font-semibold tabular-nums">{v.business_no}</td>
                          <td className="px-3 py-2 font-semibold">{v.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(v.supply)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(v.vat)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(v.total)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{pct.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(v.count)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* 매출처별 집계 */}
        {viewMode === "SALES" ? (
          <div className={`${card} mt-6 p-4`}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">매출처별 집계</div>
                <div className="mt-1 text-xs text-slate-600">정렬: 총액 많은 순 · 비율(%) 표시</div>
              </div>
              <div className="text-xs text-slate-500">건수 {salesByCustomer.reduce((a, x) => a + x.count, 0)}건</div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "160px" }} />
                  <col style={{ width: "320px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "90px" }} />
                </colgroup>
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">사업자번호</th>
                    <th className="px-3 py-2 text-left">매출처</th>
                    <th className="px-3 py-2 text-right">공급가</th>
                    <th className="px-3 py-2 text-right">부가세</th>
                    <th className="px-3 py-2 text-right">총액</th>
                    <th className="px-3 py-2 text-right">비율</th>
                    <th className="px-3 py-2 text-right">건수</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByCustomer.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="bg-white px-4 py-4 text-sm text-slate-500">
                        매출 집계 대상 데이터가 없습니다. (기간을 확인하세요)
                      </td>
                    </tr>
                  ) : (
                    salesByCustomer.map((v) => {
                      const pct = salesTotalAll > 0 ? Math.round(((v.total ?? 0) / salesTotalAll) * 1000) / 10 : 0;
                      return (
                        <tr key={v.customer_id} className="border-t border-slate-200 bg-white">
                          <td className="px-3 py-2 font-semibold tabular-nums">{v.business_no ?? "(미입력)"}</td>
                          <td className="px-3 py-2 font-semibold">{v.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(v.supply)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(v.vat)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(v.total)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{pct.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(v.count)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* 미수금(AR) */}
        {viewMode === "AR" ? (
          <div className={`${card} mt-6 p-4`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-lg font-semibold">미수금(거래처별)</div>
                <div className="mt-1 text-xs text-slate-600">기준일: {toYMD} · 최초기록부터 누적(=출고-입금)</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={includeChannelsAR ? btnOn : btn}
                  onClick={() => setIncludeChannelsAR((v) => !v)}
                  type="button"
                >
                  판매채널 포함
                </button>
                <button className={btn} onClick={loadAR} type="button">
                  미수금 재조회
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "160px" }} />
                  <col style={{ width: "320px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "160px" }} />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "130px" }} />
                </colgroup>
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">사업자번호</th>
                    <th className="px-3 py-2 text-left">거래처</th>
                    <th className="px-3 py-2 text-right">출고(매출)</th>
                    <th className="px-3 py-2 text-right">입금</th>
                    <th className="px-3 py-2 text-right">미수금(=출고-입금)</th>
                    <th className="px-3 py-2 text-left">최근출고</th>
                    <th className="px-3 py-2 text-left">최근입금</th>
                  </tr>
                </thead>
                <tbody>
                  {arRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="bg-white px-4 py-4 text-sm text-slate-500">
                        미수금 데이터가 없습니다. (기준일/판매채널 포함 여부를 확인하세요)
                      </td>
                    </tr>
                  ) : (
                    arRows.map((r) => (
                      <tr key={r.partner_id} className="border-t border-slate-200 bg-white">
                        <td className="px-3 py-2 font-semibold tabular-nums">{r.business_no ?? "(미입력)"}</td>
                        <td className="px-3 py-2 font-semibold">{r.partner_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.sales_out)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.cash_in)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(r.balance)}</td>
                        <td className="px-3 py-2 tabular-nums">{r.last_ship_date ?? ""}</td>
                        <td className="px-3 py-2 tabular-nums">{r.last_in_date ?? ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="mt-6 text-xs text-slate-500">
          ※ 이 페이지는 “세무사 전달/인쇄/집계” 전용입니다. 입력은 기존 주문/출고/금전출납 화면에서 하시면 됩니다.
        </div>
      </div>
    </div>
  );
}