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

  // ✅ 배송정보(최근값, partners에 저장)
  ship_to_name: string | null;
  ship_to_address1: string | null;
  ship_to_mobile: string | null;
  ship_to_phone: string | null;
};

type PartnerShippingHistoryRow = {
  id: string;
  partner_id: string;
  ship_to_name: string | null;
  ship_to_address1: string | null;
  ship_to_mobile: string | null;
  ship_to_phone: string | null;
  created_at: string;
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

// ✅ preset_products(기성 품목 자동완성/자동입력)
type PresetProductRow = {
  id: string;
  product_name: string;
  food_type: string | null;
  weight_g: number | string | null; // numeric(10,2) 대응
  barcode: string | null;
};

type Line = {
  food_type: string;
  name: string;
  weight_g: number; // ✅ 소수점 허용
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

// ✅ 소수점(무게) 표시: 0이면 "", 정수면 정수로, 소수면 최대 2자리로
function formatWeight(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return "";
  // 소수부가 0이면 정수로
  if (Math.abs(v - Math.round(v)) < 1e-9) return Math.round(v).toLocaleString("ko-KR");
  // 최대 2자리로 표시 (불필요한 0 제거)
  return v
    .toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .replace(/(\.\d*?[1-9])0+$/g, "$1")
    .replace(/\.0+$/g, "");
}

function toInt(n: any) {
  const v = Number(String(n ?? "").replaceAll(",", ""));
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}

// ✅ 소수점 숫자 파싱 (무게용) : "2.8", "1,234.56" 지원
function toNum(n: any) {
  const s = String(n ?? "").replaceAll(",", "").trim();
  if (!s) return 0;
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

// ✅ 안전한 4칙연산 파서 (+ - * / 괄호)
// - eval() 미사용
// - 숫자, 공백, . + - * / ( ) 만 허용
function calcExpression(exprRaw: string): { ok: true; value: number } | { ok: false; error: string } {
  const expr = (exprRaw ?? "").trim();
  if (!expr) return { ok: true, value: 0 };

  // 허용 문자 체크
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
    return { ok: false, error: "숫자와 + - * / ( ) 만 사용 가능합니다." };
  }

  // 토큰화
  type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "lp" } | { t: "rp" };
  const tokens: Tok[] = [];
  let i = 0;

  const isDigit = (c: string) => c >= "0" && c <= "9";

  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ t: "rp" });
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (isDigit(c) || c === ".") {
      let j = i + 1;
      while (j < expr.length && (isDigit(expr[j]) || expr[j] === ".")) j++;
      const numStr = expr.slice(i, j);
      const num = Number(numStr);
      if (!Number.isFinite(num)) return { ok: false, error: "숫자 형식이 올바르지 않습니다." };
      tokens.push({ t: "num", v: num });
      i = j;
      continue;
    }
    return { ok: false, error: "허용되지 않는 문자가 포함되어 있습니다." };
  }

  // 단항 - 처리:  -3, (-3), 2*-3 같은 케이스를 (0-3) 형태로 변환
  const norm: Tok[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const cur = tokens[k];
    const prev = norm[norm.length - 1];

    if (cur.t === "op" && cur.v === "-") {
      const isUnary = !prev || prev.t === "op" || prev.t === "lp";
      if (isUnary) {
        norm.push({ t: "num", v: 0 });
        norm.push({ t: "op", v: "-" });
        continue;
      }
    }
    norm.push(cur);
  }

  // Shunting-yard -> RPN
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const ops: Tok[] = [];
  const out: Tok[] = [];

  for (const tok of norm) {
    if (tok.t === "num") out.push(tok);
    else if (tok.t === "op") {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === "op" && prec[top.v] >= prec[tok.v]) out.push(ops.pop() as Tok);
        else break;
      }
      ops.push(tok);
    } else if (tok.t === "lp") ops.push(tok);
    else if (tok.t === "rp") {
      let found = false;
      while (ops.length) {
        const top = ops.pop() as Tok;
        if (top.t === "lp") {
          found = true;
          break;
        }
        out.push(top);
      }
      if (!found) return { ok: false, error: "괄호 짝이 맞지 않습니다." };
    }
  }

  while (ops.length) {
    const top = ops.pop() as Tok;
    if (top.t === "lp" || top.t === "rp") return { ok: false, error: "괄호 짝이 맞지 않습니다." };
    out.push(top);
  }

  // RPN 계산
  const st: number[] = [];
  for (const tok of out) {
    if (tok.t === "num") st.push(tok.v);
    else if (tok.t === "op") {
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) return { ok: false, error: "수식이 올바르지 않습니다." };
      let v = 0;
      if (tok.v === "+") v = a + b;
      if (tok.v === "-") v = a - b;
      if (tok.v === "*") v = a * b;
      if (tok.v === "/") {
        if (b === 0) return { ok: false, error: "0으로 나눌 수 없습니다." };
        v = a / b;
      }
      st.push(v);
    }
  }

  if (st.length !== 1) return { ok: false, error: "수식이 올바르지 않습니다." };
  const value = st[0];
  if (!Number.isFinite(value)) return { ok: false, error: "계산 결과가 올바르지 않습니다." };
  return { ok: true, value };
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

function buildMemoText(r: UnifiedRow) {
  if (r.kind === "ORDER") {
    const title = r.order_title ?? "";
    const lines = r.order_lines ?? [];
    const rows = lines
      .map((l, idx) => {
        const qty = Number(l.qty ?? 0);
        const unit = Number(l.unit ?? 0);
        const supply = qty * unit;
        const vat = Math.round(supply * 0.1);
        const total = supply + vat;
        const ft = String(l.food_type ?? "").trim();
        const name = String(l.name ?? "").trim();
        const w = Number(l.weight_g ?? 0);
        return `${idx + 1}. ${ft ? `[${ft}] ` : ""}${name} / ${
          w ? `${formatWeight(w)}g, ` : ""
        }수량 ${formatMoney(qty)} / 단가 ${formatMoney(unit)} / 공급가 ${formatMoney(
          supply
        )} / 부가세 ${formatMoney(vat)} / 총액 ${formatMoney(total)}`;
      })
      .join("\n");
    return `주문/출고 메모\n- 출고방법: ${r.ship_method ?? ""}\n- 제목: ${title || "(없음)"}\n\n품목:\n${
      rows || "(품목 없음)"
    }`;
  }

  const memo = (r.ledger_memo ?? "").trim();
  const cat = r.ledger_category ?? r.category ?? "";
  const method = r.ledger_method ?? r.method ?? "";
  const amt = Number(r.ledger_amount ?? 0);
  return `금전출납 메모\n- 카테고리: ${cat}\n- 결제수단: ${method}\n- 금액: ${formatMoney(amt)}\n\n메모:\n${
    memo || "(없음)"
  }`;
}

function normText(s: any) {
  const v = String(s ?? "").trim();
  return v === "" ? null : v;
}

function fmtKST(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
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

  // ✅ 거래처 수정(모달)
  const [partnerEditOpen, setPartnerEditOpen] = useState(false);
  const [ep_name, setEP_name] = useState("");
  const [ep_businessNo, setEP_businessNo] = useState("");
  const [ep_ceo, setEP_ceo] = useState("");
  const [ep_phone, setEP_phone] = useState("");
  const [ep_address1, setEP_address1] = useState("");
  const [ep_bizType, setEP_bizType] = useState("");
  const [ep_bizItem, setEP_bizItem] = useState("");

  // ✅ 배송정보(최근값) 편집
  const [ship_to_name, setShipToName] = useState("");
  const [ship_to_address1, setShipToAddress1] = useState("");
  const [ship_to_mobile, setShipToMobile] = useState("");
  const [ship_to_phone, setShipToPhone] = useState("");

  // ✅ 배송정보 이력(최근 5건) 보기
  const [shipHistOpen, setShipHistOpen] = useState(false);
  const [shipHistLoading, setShipHistLoading] = useState(false);
  const [shipHist, setShipHist] = useState<PartnerShippingHistoryRow[]>([]);

  // 식품유형(자동완성)
  const [foodTypes, setFoodTypes] = useState<FoodTypeRow[]>([]);

  // ✅ 기성 품목(자동완성/자동 입력)
  const [presetProducts, setPresetProducts] = useState<PresetProductRow[]>([]);

  // 주문/출고 입력
  const [shipDate, setShipDate] = useState(todayYMD());
  const [shipMethod, setShipMethod] = useState("택배");
  const [orderTitle, setOrderTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: 0 }]);

  // ✅ 주문/출고 미니 계산기
  const [calcExpr, setCalcExpr] = useState("");
  const [calcResult, setCalcResult] = useState<number | null>(null);
  const [calcErr, setCalcErr] = useState<string | null>(null);

  // ✅ 총액(부가세 포함) -> 공급가/부가세 분리
  const [totalInclVatStr, setTotalInclVatStr] = useState("");
  const [splitSupply, setSplitSupply] = useState<number | null>(null);
  const [splitVat, setSplitVat] = useState<number | null>(null);

  // 금전출납 입력
  const [entryDate, setEntryDate] = useState(todayYMD());
  const [payMethod, setPayMethod] = useState<"BANK" | "CASH" | "CARD" | "ETC">("BANK");
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

  // ✅ 메모 보기(팝업)
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoTitle, setMemoTitle] = useState("");
  const [memoBody, setMemoBody] = useState("");

  // ✅ 수정(팝업)
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<UnifiedRow | null>(null);

  // 주문 수정용
  const [eShipDate, setEShipDate] = useState(todayYMD());
  const [eShipMethod, setEShipMethod] = useState("택배");
  const [eOrderTitle, setEOrderTitle] = useState("");
  const [eLines, setELines] = useState<Line[]>([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: 0 }]);

  // 금전출납 수정용
  const [eEntryDate, setEEntryDate] = useState(todayYMD());
  const [ePayMethod, setEPayMethod] = useState<"BANK" | "CASH" | "CARD" | "ETC">("BANK");
  const [eCategory, setECategory] = useState<Category>("매출입금");
  const [eAmountStr, setEAmountStr] = useState("");
  const [eLedgerMemo, setELedgerMemo] = useState("");

  // ✅ (현재 입력폼) 주문/출고 합계
  const orderTotals = useMemo(() => {
    const supply = lines.reduce((acc, l) => acc + toInt(l.qty) * toInt(l.unit), 0);
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    return { supply, vat, total };
  }, [lines]);

  // ✅ (수정 모달) 주문/출고 합계
  const editOrderTotals = useMemo(() => {
    const supply = eLines.reduce((acc, l) => acc + toInt(l.qty) * toInt(l.unit), 0);
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    return { supply, vat, total };
  }, [eLines]);

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

  function numFromPresetWeight(w: any) {
    const n = Number(w ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  // ====== Loaders ======
  async function loadPartners() {
    setMsg(null);

    let q = supabase
      .from("partners")
      .select(
        "id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone"
      )
      .order("is_pinned", { ascending: false })
      .order("pin_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);

    const f = partnerFilter.trim();
    if (f) q = q.or(`name.ilike.%${f}%,business_no.ilike.%${f}%`);

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

  // ✅ preset_products 로드
  async function loadPresetProducts() {
    const { data, error } = await supabase
      .from("preset_products")
      .select("id,product_name,food_type,weight_g,barcode")
      .eq("is_active", true)
      .order("product_name", { ascending: true })
      .limit(5000);

    if (error) return;
    setPresetProducts((data ?? []) as PresetProductRow[]);
  }

  async function loadLatestShippingForPartner(partnerId: string) {
    const { data, error } = await supabase
      .from("partner_shipping_history")
      .select("id,partner_id,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone,created_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return null;
    const row = (data?.[0] ?? null) as PartnerShippingHistoryRow | null;
    return row;
  }

  async function loadShippingHistory5(partnerId: string) {
    setShipHistLoading(true);
    try {
      const { data, error } = await supabase
        .from("partner_shipping_history")
        .select("id,partner_id,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone,created_at")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        setMsg(error.message);
        setShipHist([]);
        return;
      }
      setShipHist((data ?? []) as PartnerShippingHistoryRow[]);
    } finally {
      setShipHistLoading(false);
    }
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

    const mapped = (lData ?? []).map((r: any) => ({ ...r, amount: Number(r.amount ?? 0) })) as LedgerRow[];
    setLedgers(mapped);

    // ---- ✅ 기초잔액(기간 시작 전 누적) 계산
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
      opening += -sum; // 주문/출고는 출금
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
    loadPresetProducts(); // ✅ 기성 품목 자동완성 데이터 로드
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

  async function openPartnerEdit() {
    setMsg(null);
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");

    setEP_name(selectedPartner.name ?? "");
    setEP_businessNo(selectedPartner.business_no ?? "");
    setEP_ceo(selectedPartner.ceo_name ?? "");
    setEP_phone(selectedPartner.phone ?? "");
    setEP_address1(selectedPartner.address1 ?? "");
    setEP_bizType(selectedPartner.biz_type ?? "");
    setEP_bizItem(selectedPartner.biz_item ?? "");

    const latest = await loadLatestShippingForPartner(selectedPartner.id);
    const cur = selectedPartner;

    setShipToName((latest?.ship_to_name ?? cur.ship_to_name ?? "") || "");
    setShipToAddress1((latest?.ship_to_address1 ?? cur.ship_to_address1 ?? "") || "");
    setShipToMobile((latest?.ship_to_mobile ?? cur.ship_to_mobile ?? "") || "");
    setShipToPhone((latest?.ship_to_phone ?? cur.ship_to_phone ?? "") || "");

    setShipHistOpen(false);
    setShipHist([]);
    setShipHistLoading(false);

    setPartnerEditOpen(true);
  }

  function closePartnerEdit() {
    setPartnerEditOpen(false);
    setShipHistOpen(false);
  }

  async function savePartnerEdit() {
    setMsg(null);
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");

    const name = ep_name.trim();
    if (!name) return setMsg("업체명(필수)을 입력하세요.");

    const nextPartnerPayload: any = {
      name: name,
      business_no: normText(ep_businessNo),
      ceo_name: normText(ep_ceo),
      phone: normText(ep_phone),
      address1: normText(ep_address1),
      biz_type: normText(ep_bizType),
      biz_item: normText(ep_bizItem),
      ship_to_name: normText(ship_to_name),
      ship_to_address1: normText(ship_to_address1),
      ship_to_mobile: normText(ship_to_mobile),
      ship_to_phone: normText(ship_to_phone),
    };

    const prev = {
      ship_to_name: normText(selectedPartner.ship_to_name),
      ship_to_address1: normText(selectedPartner.ship_to_address1),
      ship_to_mobile: normText(selectedPartner.ship_to_mobile),
      ship_to_phone: normText(selectedPartner.ship_to_phone),
    };

    const next = {
      ship_to_name: normText(ship_to_name),
      ship_to_address1: normText(ship_to_address1),
      ship_to_mobile: normText(ship_to_mobile),
      ship_to_phone: normText(ship_to_phone),
    };

    const shippingChanged =
      prev.ship_to_name !== next.ship_to_name ||
      prev.ship_to_address1 !== next.ship_to_address1 ||
      prev.ship_to_mobile !== next.ship_to_mobile ||
      prev.ship_to_phone !== next.ship_to_phone;

    const { data: updated, error: uErr } = await supabase
      .from("partners")
      .update(nextPartnerPayload)
      .eq("id", selectedPartner.id)
      .select(
        "id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone"
      )
      .single();

    if (uErr) return setMsg(uErr.message);

    if (shippingChanged) {
      const histPayload: any = {
        partner_id: selectedPartner.id,
        ship_to_name: next.ship_to_name,
        ship_to_address1: next.ship_to_address1,
        ship_to_mobile: next.ship_to_mobile,
        ship_to_phone: next.ship_to_phone,
      };

      const { error: hErr } = await supabase.from("partner_shipping_history").insert(histPayload);
      if (hErr) return setMsg(hErr.message);
    }

    const updatedPartner = updated as PartnerRow;

    setPartners((prevList) => prevList.map((p) => (p.id === updatedPartner.id ? updatedPartner : p)));
    setSelectedPartner(updatedPartner);

    if (shipHistOpen) {
      await loadShippingHistory5(updatedPartner.id);
    }

    setPartnerEditOpen(false);
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

  // ====== 수정 모달용 라인 업데이트 ======
  function updateEditLine(i: number, patch: Partial<Line>) {
    setELines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addEditLine() {
    setELines((prev) => [...prev, { food_type: "", name: "", weight_g: 0, qty: 0, unit: 0 }]);
  }
  function removeEditLine(i: number) {
    setELines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function createOrder() {
    setMsg(null);
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    if (lines.length === 0) return setMsg("품목을 1개 이상 입력하세요.");

    const cleanLines = lines
      .map((l) => ({
        food_type: (l.food_type || "").trim(),
        name: l.name.trim(),
        weight_g: toNum(l.weight_g), // ✅ 소수점 유지
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

    if (partnerView === "PINNED") list = list.filter((p) => !!p.is_pinned);
    else if (partnerView === "RECENT") {
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

    // Ledgers
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

  // ====== Copy Fill ======
  function fillFromOrderRow(r: UnifiedRow) {
    setMsg(null);
    setMode("ORDERS");

    setShipDate(todayYMD());
    setShipMethod(r.ship_method ?? "택배");
    setOrderTitle(r.order_title ?? "");

    const nextLines =
      r.order_lines?.length
        ? r.order_lines.map((l) => ({
            food_type: String(l.food_type ?? ""),
            name: String(l.name ?? ""),
            weight_g: Number(l.weight_g ?? 0), // ✅ 소수점 유지
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
    setPayMethod((r.ledger_method as any) ?? "BANK");
    setLedgerMemo(r.ledger_memo ?? "");
    const amt = Number(r.ledger_amount ?? 0);
    setAmountStr(amt > 0 ? amt.toLocaleString("ko-KR") : "");
  }

  function onCopyClick(r: UnifiedRow) {
    if (r.kind === "ORDER") fillFromOrderRow(r);
    else fillFromLedgerRow(r);
  }

  function onMemoClick(r: UnifiedRow) {
    const title = r.kind === "ORDER" ? `주문/출고 메모 - ${r.partnerName}` : `금전출납 메모 - ${r.partnerName}`;
    setMemoTitle(title);
    setMemoBody(buildMemoText(r));
    setMemoOpen(true);
  }

  // ====== ✅ 수정 시작 ======
  function openEdit(r: UnifiedRow) {
    setMsg(null);
    setEditRow(r);

    if (r.kind === "ORDER") {
      setEShipDate(r.date || todayYMD());
      setEShipMethod(r.ship_method ?? r.method ?? "택배");
      setEOrderTitle(r.order_title ?? "");

      const nextLines: Line[] =
        r.order_lines?.length
          ? r.order_lines.map((l) => ({
              food_type: String(l.food_type ?? ""),
              name: String(l.name ?? ""),
              weight_g: Number(l.weight_g ?? 0), // ✅ 소수점 유지
              qty: toInt(l.qty ?? 0),
              unit: toInt(l.unit ?? 0),
            }))
          : [{ food_type: "", name: "", weight_g: 0, qty: 0, unit: 0 }];

      setELines(nextLines);
    } else {
      setEEntryDate(r.date || todayYMD());
      const m = (r.ledger_method ?? r.method ?? "BANK") as any;
      setEPayMethod(m === "BANK" || m === "CASH" || m === "CARD" || m === "ETC" ? m : "BANK");

      const c = (r.ledger_category as Category) ?? (r.category as Category) ?? "기타";
      setECategory(CATEGORIES.includes(c) ? c : "기타");

      const amt = Number(r.ledger_amount ?? (r.inAmt || r.outAmt || 0));
      setEAmountStr(amt > 0 ? amt.toLocaleString("ko-KR") : "");
      setELedgerMemo(r.ledger_memo ?? "");
    }

    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow) return;
    setMsg(null);

    if (editRow.kind === "ORDER") {
      const cleanLines = eLines
        .map((l) => ({
          food_type: (l.food_type || "").trim(),
          name: (l.name || "").trim(),
          weight_g: toNum(l.weight_g), // ✅ 소수점 유지
          qty: toInt(l.qty),
          unit: toInt(l.unit),
        }))
        .filter((l) => l.name && l.qty > 0 && l.unit >= 0);

      if (cleanLines.length === 0) return setMsg("품목명/수량/단가를 올바르게 입력하세요.");

      const memoObj = {
        title: eOrderTitle.trim() || null,
        lines: cleanLines.map((l) => {
          const supply = l.qty * l.unit;
          const vat = Math.round(supply * 0.1);
          const total = supply + vat;
          return { ...l, supply, vat, total };
        }),
      };

      const payload: any = {
        ship_date: eShipDate,
        ship_method: eShipMethod,
        memo: JSON.stringify(memoObj),
        supply_amount: editOrderTotals.supply,
        vat_amount: editOrderTotals.vat,
        total_amount: editOrderTotals.total,
      };

      const { error } = await supabase.from("orders").update(payload).eq("id", editRow.rawId);
      if (error) return setMsg(error.message);
    } else {
      const amount = Number((eAmountStr || "0").replaceAll(",", ""));
      if (!Number.isFinite(amount) || amount <= 0) return setMsg("금액(원)을 올바르게 입력하세요.");

      const dir = categoryToDirection(eCategory);

      const payload: any = {
        entry_date: eEntryDate,
        direction: dir,
        amount,
        category: eCategory,
        method: ePayMethod,
        memo: eLedgerMemo.trim() || null,
      };

      const { error } = await supabase.from("ledger_entries").update(payload).eq("id", editRow.rawId);
      if (error) return setMsg(error.message);
    }

    setEditOpen(false);
    setEditRow(null);
    await loadTrades();
  }

  // ====== UI ======
  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const inputRight = `${input} text-right tabular-nums`;
  const inputNumLeft = `${input} tabular-nums`; // 숫자 인풋이지만 왼쪽 정렬
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";

  const targetLabel = selectedPartner ? selectedPartner.name : "전체";

  return (
    <div className={`${pageBg} min-h-screen`}>
      <div className="mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        {/* ✅ 거래처 수정 팝업 (신규 + 최근 5건 이력 버튼) */}
        {partnerEditOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={closePartnerEdit}>
            <div
              className="w-full max-w-[860px] rounded-2xl border border-slate-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">거래처 수정 · {selectedPartner?.name ?? ""}</div>
                  <div className="mt-1 text-xs text-slate-500">저장하면 즉시 DB에 반영됩니다.</div>
                </div>
                <div className="flex gap-2">
                  <button className={btn} onClick={closePartnerEdit}>
                    취소
                  </button>
                  <button className={btnOn} onClick={savePartnerEdit}>
                    저장
                  </button>
                </div>
              </div>

              <div className="px-5 py-4">
                <div className="mb-2 text-sm font-semibold">업체 기본정보</div>
                <div className="space-y-2">
                  <input className={input} placeholder="업체명(필수)" value={ep_name} onChange={(e) => setEP_name(e.target.value)} />
                  <input
                    className={input}
                    placeholder="사업자등록번호"
                    value={ep_businessNo}
                    onChange={(e) => setEP_businessNo(e.target.value)}
                  />
                  <input className={input} placeholder="대표자" value={ep_ceo} onChange={(e) => setEP_ceo(e.target.value)} />
                  <input className={input} placeholder="연락처" value={ep_phone} onChange={(e) => setEP_phone(e.target.value)} />
                  <input className={input} placeholder="주소" value={ep_address1} onChange={(e) => setEP_address1(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} placeholder="업태" value={ep_bizType} onChange={(e) => setEP_bizType(e.target.value)} />
                    <input className={input} placeholder="종목" value={ep_bizItem} onChange={(e) => setEP_bizItem(e.target.value)} />
                  </div>
                </div>

                <div className="mt-5 mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">배송정보 (변경 이력 저장 / 최근 자료 자동 사용)</div>

                  <button
                    type="button"
                    className={btn}
                    onClick={async () => {
                      if (!selectedPartner) return;
                      const nextOpen = !shipHistOpen;
                      setShipHistOpen(nextOpen);
                      if (nextOpen) {
                        await loadShippingHistory5(selectedPartner.id);
                      }
                    }}
                  >
                    배송정보 이력(최근 5건)
                  </button>
                </div>

                <div className="space-y-2">
                  <input className={input} placeholder="수화주명" value={ship_to_name} onChange={(e) => setShipToName(e.target.value)} />
                  <input
                    className={input}
                    placeholder="주소1"
                    value={ship_to_address1}
                    onChange={(e) => setShipToAddress1(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} placeholder="휴대폰" value={ship_to_mobile} onChange={(e) => setShipToMobile(e.target.value)} />
                    <input className={input} placeholder="전화" value={ship_to_phone} onChange={(e) => setShipToPhone(e.target.value)} />
                  </div>
                  <div className="text-xs text-slate-500">
                    ※ 배송정보가 변경되면 history 테이블에 기록으로 남고, 다음부터는 최근값이 자동으로 사용됩니다.
                  </div>
                </div>

                {shipHistOpen ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">배송정보 이력(최근 5건)</div>
                      <button
                        type="button"
                        className={btn}
                        onClick={async () => {
                          if (!selectedPartner) return;
                          await loadShippingHistory5(selectedPartner.id);
                        }}
                      >
                        새로고침
                      </button>
                    </div>

                    {shipHistLoading ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">불러오는 중...</div>
                    ) : shipHist.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">이력이 없습니다.</div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full table-fixed text-sm">
                          <colgroup>
                            <col style={{ width: "160px" }} />
                            <col style={{ width: "140px" }} />
                            <col style={{ width: "auto" }} />
                            <col style={{ width: "140px" }} />
                            <col style={{ width: "140px" }} />
                          </colgroup>
                          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                            <tr>
                              <th className="px-3 py-2 text-left">변경시각</th>
                              <th className="px-3 py-2 text-left">수화주명</th>
                              <th className="px-3 py-2 text-left">주소1</th>
                              <th className="px-3 py-2 text-left">휴대폰</th>
                              <th className="px-3 py-2 text-left">전화</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shipHist.map((h) => (
                              <tr key={h.id} className="border-t border-slate-200">
                                <td className="px-3 py-2 tabular-nums">{fmtKST(h.created_at)}</td>
                                <td className="px-3 py-2">{h.ship_to_name ?? ""}</td>
                                <td className="px-3 py-2">{h.ship_to_address1 ?? ""}</td>
                                <td className="px-3 py-2">{h.ship_to_mobile ?? ""}</td>
                                <td className="px-3 py-2">{h.ship_to_phone ?? ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="mt-2 text-xs text-slate-500">
                      ※ “저장”은 현재 입력값을 partners에 저장하고, 값이 바뀌었을 때만 history에 1건 추가됩니다.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* ✅ 메모 팝업 */}
        {memoOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setMemoOpen(false)}>
            <div className="w-full max-w-[860px] rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">{memoTitle}</div>
                  <div className="mt-1 text-xs text-slate-500">바깥 클릭으로 닫기</div>
                </div>
                <button className={btn} onClick={() => setMemoOpen(false)}>
                  닫기
                </button>
              </div>
              <div className="px-5 py-4">
                <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                  {memoBody}
                </pre>
              </div>
            </div>
          </div>
        ) : null}

        {/* ✅ 수정 팝업 */}
        {editOpen && editRow ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditOpen(false)}>
            <div className="w-full max-w-[1100px] rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">
                    거래내역 수정 · {editRow.kind === "ORDER" ? "주문/출고" : "금전출납"} · {editRow.partnerName}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">저장하면 즉시 DB에 반영됩니다.</div>
                </div>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => setEditOpen(false)}>
                    취소
                  </button>
                  <button className={btnOn} onClick={saveEdit}>
                    저장
                  </button>
                </div>
              </div>

              <div className="px-5 py-4">
                {editRow.kind === "ORDER" ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <div className="mb-1 text-xs text-slate-600">출고일(주문일)</div>
                        <input type="date" className={input} value={eShipDate} onChange={(e) => setEShipDate(e.target.value)} />
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-slate-600">출고방법</div>
                        <select className={input} value={eShipMethod} onChange={(e) => setEShipMethod(e.target.value)}>
                          <option value="택배">택배</option>
                          <option value="퀵">퀵</option>
                          <option value="직접">직접</option>
                          <option value="기타">기타</option>
                        </select>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-slate-600">메모(title)</div>
                        <input className={input} value={eOrderTitle} onChange={(e) => setEOrderTitle(e.target.value)} />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm font-semibold">품목</div>
                      <button className={btn} onClick={addEditLine}>
                        + 품목 추가
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-[180px_1fr_120px_110px_130px_120px_120px_120px_auto] gap-2 text-xs text-slate-600">
                      <div className="pl-3">식품유형</div>
                      <div className="pl-3">품목명</div>
                      <div className="pl-3">무게(g)</div>
                      <div className="pl-3">수량</div>
                      <div className="pl-3">단가</div>
                      <div className="pl-3">공급가</div>
                      <div className="pl-3">부가세</div>
                      <div className="pl-3">총액</div>
                      <div />
                    </div>

                    <div className="mt-2 space-y-2">
                      {eLines.map((l, i) => {
                        const supply = toInt(l.qty) * toInt(l.unit);
                        const vat = Math.round(supply * 0.1);
                        const total = supply + vat;

                        return (
                          <div key={i} className="grid grid-cols-[180px_1fr_120px_110px_130px_120px_120px_120px_auto] gap-2">
                            <input className={input} list="food-types-list" value={l.food_type} onChange={(e) => updateEditLine(i, { food_type: e.target.value })} />
                            <input
                              className={input}
                              list="preset-products-list"
                              value={l.name}
                              onChange={(e) => {
                                const v = e.target.value;
                                updateEditLine(i, { name: v });

                                const hit = presetProducts.find((p) => p.product_name === v);
                                if (hit) {
                                  updateEditLine(i, {
                                    food_type: hit.food_type ?? "",
                                    weight_g: numFromPresetWeight(hit.weight_g), // ✅ 소수점 유지
                                  });
                                }
                              }}
                            />
                            <input
                              className={inputRight}
                              inputMode="decimal"
                              value={formatWeight(l.weight_g)}
                              onChange={(e) => updateEditLine(i, { weight_g: toNum(e.target.value) })}
                            />
                            <input className={inputRight} inputMode="numeric" value={formatMoney(l.qty)} onChange={(e) => updateEditLine(i, { qty: toInt(e.target.value) })} />
                            <input className={inputRight} inputMode="numeric" value={formatMoney(l.unit)} onChange={(e) => updateEditLine(i, { unit: toInt(e.target.value) })} />

                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{formatMoney(supply)}</div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{formatMoney(vat)}</div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums font-semibold">{formatMoney(total)}</div>

                            <button className={btn} onClick={() => removeEditLine(i)} title="삭제">
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-4 text-sm">
                      <div>공급가 {formatMoney(editOrderTotals.supply)}</div>
                      <div>부가세 {formatMoney(editOrderTotals.vat)}</div>
                      <div className="font-semibold">총액 {formatMoney(editOrderTotals.total)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <div className="mb-1 text-xs text-slate-600">일자</div>
                        <input type="date" className={input} value={eEntryDate} onChange={(e) => setEEntryDate(e.target.value)} />
                      </div>

                      <div>
                        <div className="mb-1 text-slate-600 text-xs">결제수단</div>
                        <select className={input} value={ePayMethod} onChange={(e) => setEPayMethod(e.target.value as any)}>
                          <option value="BANK">계좌입금</option>
                          <option value="CASH">현금</option>
                          <option value="CARD">카드</option>
                          <option value="ETC">기타</option>
                        </select>
                      </div>

                      <div>
                        <div className="mb-1 text-xs text-slate-600">카테고리</div>
                        <div className="flex flex-wrap gap-2">
                          {CATEGORIES.map((c) => (
                            <button key={c} type="button" className={eCategory === c ? btnOn : btn} onClick={() => setECategory(c)}>
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 text-xs text-slate-600">금액(원)</div>
                        <input
                          className={inputRight}
                          inputMode="numeric"
                          value={eAmountStr}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d,]/g, "");
                            setEAmountStr(v);
                          }}
                          onBlur={() => {
                            const n = Number((eAmountStr || "0").replaceAll(",", ""));
                            if (Number.isFinite(n) && n > 0) setEAmountStr(n.toLocaleString("ko-KR"));
                          }}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <div className="mb-1 text-xs text-slate-600">메모</div>
                        <input className={input} value={eLedgerMemo} onChange={(e) => setELedgerMemo(e.target.value)} />
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">※ 방향(IN/OUT)은 카테고리로 자동 결정됩니다.</div>
                  </>
                )}
              </div>

              <datalist id="food-types-list">
                {foodTypes.map((ft) => (
                  <option key={ft.id} value={ft.name} />
                ))}
              </datalist>

              <datalist id="preset-products-list">
                {presetProducts.map((p) => (
                  <option key={p.id} value={p.product_name} />
                ))}
              </datalist>
            </div>
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

                <button className={btn} onClick={openPartnerEdit} title={selectedPartner ? "선택된 거래처 수정" : "거래처를 먼저 선택하세요"}>
                  수정
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

            <input className={`${input} mb-3`} placeholder="목록 필터(이름/사업자번호)" value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)} />

            <div className="mb-2 text-xs text-slate-600">
              선택된 거래처:{" "}
              {selectedPartner ? `${selectedPartner.name}${selectedPartner.business_no ? ` · ${selectedPartner.business_no}` : ""}` : "없음"}
            </div>

            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {partnersToShow.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">표시할 거래처가 없습니다.</div>
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
                    <input className={input} value={orderTitle} onChange={(e) => setOrderTitle(e.target.value)} />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm font-semibold">품목(식품유형 자동완성 포함)</div>
                  <button className={btn} onClick={addLine}>
                    + 품목 추가
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-[180px_1fr_120px_110px_130px_120px_120px_120px_auto] gap-2 text-xs text-slate-600">
                  <div className="pl-3">식품유형</div>
                  <div className="pl-3">품목명</div>
                  <div className="pl-3">무게(g)</div>
                  <div className="pl-3">수량</div>
                  <div className="pl-3">단가</div>
                  <div className="pl-3">공급가</div>
                  <div className="pl-3">부가세</div>
                  <div className="pl-3">총액</div>
                  <div />
                </div>

                <div className="mt-2 space-y-2">
                  {lines.map((l, i) => {
                    const supply = toInt(l.qty) * toInt(l.unit);
                    const vat = Math.round(supply * 0.1);
                    const total = supply + vat;

                    return (
                      <div key={i} className="grid grid-cols-[180px_1fr_120px_110px_130px_120px_120px_120px_auto] gap-2">
                        <input className={input} list="food-types-list" value={l.food_type} onChange={(e) => updateLine(i, { food_type: e.target.value })} />
                        <input
                          className={input}
                          list="preset-products-list"
                          value={l.name}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateLine(i, { name: v });

                            const hit = presetProducts.find((p) => p.product_name === v);
                            if (hit) {
                              updateLine(i, {
                                food_type: hit.food_type ?? "",
                                weight_g: numFromPresetWeight(hit.weight_g), // ✅ 소수점 유지
                              });
                            }
                          }}
                        />
                        <input
                          className={inputRight}
                          inputMode="decimal"
                          value={formatWeight(l.weight_g)}
                          onChange={(e) => updateLine(i, { weight_g: toNum(e.target.value) })}
                        />
                        <input className={inputRight} inputMode="numeric" value={formatMoney(l.qty)} onChange={(e) => updateLine(i, { qty: toInt(e.target.value) })} />
                        <input className={inputRight} inputMode="numeric" value={formatMoney(l.unit)} onChange={(e) => updateLine(i, { unit: toInt(e.target.value) })} />

                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{formatMoney(supply)}</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{formatMoney(vat)}</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums font-semibold">{formatMoney(total)}</div>

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

                <datalist id="preset-products-list">
                  {presetProducts.map((p) => (
                    <option key={p.id} value={p.product_name} />
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

                {/* ✅ 미니 계산기 + 총액 분리 */}
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-semibold">미니 계산기</div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {/* 4칙연산 */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 text-xs text-slate-600">4칙연산 (+ - * /, 괄호 가능)</div>
                      <div className="flex gap-2">
                        <input
                          className={input}
                          placeholder="예) 12000*3 + 5500"
                          value={calcExpr}
                          onChange={(e) => {
                            setCalcExpr(e.target.value);
                            setCalcErr(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const r = calcExpression(calcExpr);
                              if (!r.ok) {
                                setCalcErr(r.error);
                                setCalcResult(null);
                              } else {
                                setCalcErr(null);
                                setCalcResult(r.value);
                              }
                            }
                          }}
                        />
                        <button
                          className={btn}
                          type="button"
                          onClick={() => {
                            const r = calcExpression(calcExpr);
                            if (!r.ok) {
                              setCalcErr(r.error);
                              setCalcResult(null);
                            } else {
                              setCalcErr(null);
                              setCalcResult(r.value);
                            }
                          }}
                        >
                          계산
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums">
                          결과:{" "}
                          <span className="font-semibold">
                            {calcResult === null
                              ? "-"
                              : Number.isInteger(calcResult)
                              ? formatMoney(calcResult)
                              : calcResult.toLocaleString("ko-KR")}
                          </span>
                        </div>

                        <button
                          className={btn}
                          type="button"
                          onClick={async () => {
                            if (calcResult === null) return;
                            try {
                              await navigator.clipboard.writeText(String(calcResult));
                              setMsg("계산 결과를 클립보드에 복사했습니다.");
                            } catch {
                              setMsg("클립보드 복사에 실패했습니다.");
                            }
                          }}
                          title="결과 복사"
                        >
                          결과 복사
                        </button>

                        <button
                          className={btn}
                          type="button"
                          onClick={() => {
                            setCalcExpr("");
                            setCalcResult(null);
                            setCalcErr(null);
                          }}
                        >
                          초기화
                        </button>
                      </div>

                      {calcErr ? (
                        <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{calcErr}</div>
                      ) : null}
                    </div>

                    {/* 총액 -> 공급가/부가세 */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 text-xs text-slate-600">총액(부가세 포함) 입력 시 공급가/부가세 자동 분리</div>

                      <div className="flex gap-2">
                        <input
                          className={inputRight}
                          inputMode="numeric"
                          placeholder="총액(원) 예) 110,000"
                          value={totalInclVatStr}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d,]/g, "");
                            setTotalInclVatStr(v);
                          }}
                          onBlur={() => {
                            const n = Number((totalInclVatStr || "0").replaceAll(",", ""));
                            if (Number.isFinite(n) && n > 0) setTotalInclVatStr(n.toLocaleString("ko-KR"));
                          }}
                        />
                        <button
                          className={btn}
                          type="button"
                          onClick={() => {
                            const total = Number((totalInclVatStr || "0").replaceAll(",", ""));
                            if (!Number.isFinite(total) || total <= 0) {
                              setSplitSupply(null);
                              setSplitVat(null);
                              setMsg("총액(원)을 올바르게 입력하세요.");
                              return;
                            }

                            const supply = Math.round(total / 1.1);
                            const vat = total - supply;

                            setSplitSupply(supply);
                            setSplitVat(vat);
                          }}
                        >
                          분리
                        </button>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                          공급가: <span className="font-semibold tabular-nums">{splitSupply === null ? "-" : formatMoney(splitSupply)}</span>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                          부가세: <span className="font-semibold tabular-nums">{splitVat === null ? "-" : formatMoney(splitVat)}</span>
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        ※ 공급가는 “총액/1.1”을 원단위 반올림, 부가세는 “총액-공급가”로 맞춰서 합계가 정확히 떨어지게 했습니다.
                      </div>
                    </div>
                  </div>
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
                      방향: <span className="font-semibold">{categoryToDirection(category) === "IN" ? "입금(+)" : "출금(-)"}</span>
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
                    <select className={input} value={payMethod} onChange={(e) => setPayMethod(e.target.value as any)}>
                      <option value="BANK">계좌입금</option>
                      <option value="CASH">현금</option>
                      <option value="CARD">카드</option>
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

                  <div>
                    <div className="mb-1 text-xs text-slate-600">금액(원)</div>
                    <input
                      className={inputRight}
                      inputMode="numeric"
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
                    <input className={input} value={ledgerMemo} onChange={(e) => setLedgerMemo(e.target.value)} />
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
                    <div className="text-sm font-semibold tabular-nums">잔액(최신) {formatMoney(unifiedTotals.endBalance)}</div>
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

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "180px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "240px" }} />
                  </colgroup>

                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">날짜</th>
                      <th className="px-3 py-2 text-left">거래처</th>
                      <th className="px-3 py-2 text-left">카테고리</th>
                      <th className="px-3 py-2 text-left">방법</th>
                      <th className="px-3 py-2 text-right">입금</th>
                      <th className="px-3 py-2 text-right">출금</th>
                      <th className="px-3 py-2 text-right">잔액</th>
                      <th className="px-3 py-2 text-center">복사/메모/수정</th>
                    </tr>
                  </thead>

                  <tbody>
                    {unifiedRows
                      .filter((x) => {
                        if (mode === "ORDERS") return x.kind === "ORDER";
                        if (mode === "LEDGER") return x.kind === "LEDGER";
                        return true;
                      })
                      .map((x) => (
                        <tr key={`${x.kind}-${x.rawId}`} className="border-t border-slate-200 bg-white">
                          <td className="px-3 py-2 font-semibold tabular-nums">{x.date}</td>
                          <td className="px-3 py-2 font-semibold">{x.partnerName}</td>
                          <td className="px-3 py-2 font-semibold">{x.category}</td>
                          <td className="px-3 py-2 font-semibold">{x.method}</td>

                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">{x.inAmt ? formatMoney(x.inAmt) : ""}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-600">{x.outAmt ? formatMoney(x.outAmt) : ""}</td>

                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(x.balance)}</td>

                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-2">
                              <button className={`${btn} whitespace-nowrap`} onClick={() => onCopyClick(x)}>
                                복사
                              </button>
                              <button className={`${btn} whitespace-nowrap`} onClick={() => onMemoClick(x)}>
                                메모
                              </button>
                              <button className={`${btn} whitespace-nowrap`} onClick={() => openEdit(x)}>
                                수정
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                    {unifiedRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="bg-white px-4 py-4 text-sm text-slate-500">
                          거래내역이 없습니다. (기간/거래처/모드 필터를 확인하세요)
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 text-xs text-slate-500">※ 주문/출고는 출금으로 표시됩니다. (입금/출금은 모두 양수 입력, 계산에서만 차감 처리)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}