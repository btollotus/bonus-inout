"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// ─────────────────────── Types ───────────────────────
type PartnerRow = {
  id: string; name: string; business_no: string | null; ceo_name: string | null;
  biz_type: string | null; biz_item: string | null; phone: string | null;
  address1: string | null; is_pinned: boolean | null; pin_order: number | null;
  partner_type: string | null; group_name: string | null;
  ship_to_name: string | null; ship_to_address1: string | null;
  ship_to_mobile: string | null; ship_to_phone: string | null;
};
type PartnerShippingHistoryRow = {
  id: string; partner_id: string; ship_to_name: string | null;
  ship_to_address1: string | null; ship_to_mobile: string | null;
  ship_to_phone: string | null; created_at: string;
};
type OrderShipmentRow = {
  id: string; order_id: string; seq: number;
  ship_to_name: string; ship_to_address1: string; ship_to_address2: string | null;
  ship_to_mobile: string | null; ship_to_phone: string | null;
  ship_zipcode: string | null; delivery_message: string | null;
  created_at: string; updated_at: string;
};
type OrderLineRow = {
  id: string; order_id: string; line_no: number | null; food_type: string | null;
  name: string; weight_g: number | string | null; qty: number; unit: number;
  unit_type: "EA" | "BOX" | string; pack_ea: number; actual_ea: number;
  supply_amount: number | null; vat_amount: number | null; total_amount: number | null;
  created_at: string;
};
type OrderRow = {
  id: string; customer_id: string | null; customer_name: string | null;
  ship_date: string | null; ship_method: string | null; status: string | null;
  memo: string | null; supply_amount: number | null; vat_amount: number | null;
  total_amount: number | null; created_at: string;
  order_lines?: OrderLineRow[]; order_shipments?: OrderShipmentRow[];
};
type LedgerRow = {
  id: string; entry_date: string; entry_ts: string; direction: "IN" | "OUT" | string;
  amount: number; category: string | null; method: string | null;
  counterparty_name: string | null; business_no: string | null; memo: string | null;
  status: string | null; partner_id: string | null; created_at: string;
  supply_amount?: number | null; vat_amount?: number | null; total_amount?: number | null;
};
type Mode = "ORDERS" | "LEDGER" | "UNIFIED";
type PartnerView = "PINNED" | "RECENT" | "ALL";
type FoodTypeRow = { id: string; name: string };
type PresetProductRow = { id: string; product_name: string; food_type: string | null; weight_g: number | string | null; barcode: string | null };
type MasterProductRow = { product_name: string; food_type: string | null; report_no: string | null; weight_g: number | null; unit_type: "EA" | "BOX" | string | null; pack_ea: number | null; barcode: string | null };
type Line = { food_type: string; name: string; weight_g: number | string; qty: number; unit: number | string; total_incl_vat: number | string };
type ShipmentSnap = { seq: number; ship_to_name: string; ship_to_address1: string; ship_to_address2?: string | null; ship_to_mobile?: string | null; ship_to_phone?: string | null; ship_zipcode?: string | null; delivery_message?: string | null };
type UnifiedRow = {
  kind: "ORDER" | "LEDGER"; date: string; tsKey: string; partnerName: string;
  ordererName: string; category: string; method: string; inAmt: number;
  outAmt: number; balance: number; rawId: string; businessNo?: string;
  ledger_partner_id?: string | null; ship_method?: string; order_title?: string | null;
  orderer_name?: string | null;
  order_lines?: Array<{ food_type?: string; name: string; weight_g?: number; qty: number; unit: number; total_amount?: number; unit_type?: "EA" | "BOX" | string; pack_ea?: number; actual_ea?: number }>;
  order_shipments?: ShipmentSnap[];
  ledger_category?: string | null; ledger_method?: string | null;
  ledger_memo?: string | null; ledger_amount?: number;
  ledger_supply_amount?: number | null; ledger_vat_amount?: number | null; ledger_total_amount?: number | null;
};

// ─────────────────────── Constants ───────────────────────
const CATEGORIES = ["매출입금", "급여", "세금", "기타"] as const;
type Category = (typeof CATEGORIES)[number];
const PARTNER_TYPES = ["CUSTOMER", "VENDOR", "BOTH"] as const;
type PartnerType = (typeof PARTNER_TYPES)[number];
const LS_RECENT_PARTNERS = "bonus_trade_recent_partners_v1";
const TRADE_TABLE_MIN_WIDTH = 1210;

// ─────────────────────── Helpers ───────────────────────
const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("ko-KR");

function formatWeight(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return "";
  if (Math.abs(v - Math.round(v)) < 1e-9) return Math.round(v).toLocaleString("ko-KR");
  return v.toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .replace(/(\.\d*?[1-9])0+$/g, "$1").replace(/\.0+$/g, "");
}

const toInt = (n: any) => { const v = Number(String(n ?? "").replaceAll(",", "")); return Number.isFinite(v) ? Math.trunc(v) : 0; };
const toIntSigned = (n: any) => { const s = String(n ?? "").replaceAll(",", "").trim(); if (!s || s === "-") return 0; const v = Number(s); return Number.isFinite(v) ? Math.trunc(v) : 0; };
const toNum = (n: any) => { const s = String(n ?? "").replaceAll(",", "").trim(); if (!s) return 0; const v = Number(s); return Number.isFinite(v) ? v : 0; };

function sanitizeSignedIntInput(raw: string) {
  let v = raw.replace(/[^\d,-]/g, "");
  v = v.replace(/(?!^)-/g, "");
  return v;
}
function sanitizeDecimalInput(raw: string) {
  let v = raw.replace(/[^\d.,]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot >= 0) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replaceAll(".", "");
  return v;
}
const safeJsonParse = <T,>(s: string | null): T | null => { if (!s) return null; try { return JSON.parse(s) as T; } catch { return null; } };
const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function addDays(ymd: string, delta: number) {
  const d = new Date(ymd + "T00:00:00"); d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const categoryToDirection = (c: Category): "IN" | "OUT" => c === "매출입금" ? "IN" : "OUT";
const methodLabel = (m: any) => ({ BANK: "입금", CASH: "현금", CARD: "카드", ETC: "기타" }[String(m ?? "").trim()] ?? String(m ?? "").trim());
const normText = (s: any) => { const v = String(s ?? "").trim(); return v === "" ? null : v; };
const fmtKST = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function calcLineAmounts(qtyRaw: any, unitRaw: any, totalInclVatRaw: any) {
  const qty = toInt(qtyRaw), unit = toIntSigned(unitRaw), totalInclVat = toIntSigned(totalInclVatRaw);
  if (unit !== 0) {
    if (qty <= 0) return { supply: 0, vat: 0, total: 0 };
    const supply = qty * unit, vat = Math.round(supply * 0.1);
    return { supply, vat, total: supply + vat };
  }
  if (totalInclVat !== 0) {
    const supply = Math.round(totalInclVat / 1.1), vat = totalInclVat - supply;
    return { supply, vat, total: totalInclVat };
  }
  return { supply: 0, vat: 0, total: 0 };
}

function splitVatFromTotal(totalInclVatRaw: any) {
  const total = toIntSigned(totalInclVatRaw);
  if (!Number.isFinite(total) || total === 0) return { supply: 0, vat: 0, total: 0 };
  const supply = Math.round(total / 1.1);
  const vat = total - supply;
  return { supply, vat, total };
}

function splitVatFromTotalFlexible(totalInclVatRaw: any, vatFree: boolean) {
  const total = toIntSigned(totalInclVatRaw);
  if (!Number.isFinite(total) || total === 0) return { supply: 0, vat: 0, total: 0 };
  if (vatFree) return { supply: total, vat: 0, total };
  const supply = Math.round(total / 1.1);
  const vat = total - supply;
  return { supply, vat, total };
}

function inferPackEaFromName(name: string) {
  const m = String(name ?? "").match(/(\d+)\s*개/);
  if (!m) return 1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
}

function buildMemoText(r: UnifiedRow) {
  if (r.kind === "ORDER") {
    const title = r.order_title ?? "", orderer = r.orderer_name ?? "";
    const shipList = (r.order_shipments ?? []).slice()
      .sort((a, b) => (a.seq ?? 1) - (b.seq ?? 1))
      .map((s) => {
        const msg = String(s.delivery_message ?? "").trim();
        const mobile = String(s.ship_to_mobile ?? "").trim(), phone = String(s.ship_to_phone ?? "").trim();
        return `- 배송지${s.seq}: ${s.ship_to_name}\n  주소: ${s.ship_to_address1}\n  연락처: ${mobile || "-"} / ${phone || "-"}${msg ? `\n  요청사항: ${msg}` : ""}`;
      }).join("\n");
    const rows = (r.order_lines ?? []).map((l, idx) => {
      const qty = Number(l.qty ?? 0), unit = Number(l.unit ?? 0), totalAmount = Number(l.total_amount ?? 0);
      let supply = 0, vat = 0, total = 0;
      if (unit !== 0) { supply = qty * unit; vat = Math.round(supply * 0.1); total = supply + vat; }
      else if (totalAmount !== 0) { total = totalAmount; supply = Math.round(total / 1.1); vat = total - supply; }
      const ft = String(l.food_type ?? "").trim(), name = String(l.name ?? "").trim(), w = Number(l.weight_g ?? 0);
      const unitType = String(l.unit_type ?? "EA"), packEa = Number(l.pack_ea ?? 1), actualEa = Number(l.actual_ea ?? (unitType === "BOX" ? qty * packEa : qty));
      const qtyText = unitType === "BOX" ? `박스 ${fmt(qty)} (입수 ${fmt(packEa)} / 실제 ${fmt(actualEa)}ea)` : `수량 ${fmt(qty)}`;
      const unitText = unit !== 0 ? `단가 ${fmt(unit)}` : `총액입력 ${fmt(total)}`;
      return `${idx + 1}. ${ft ? `[${ft}] ` : ""}${name} / ${w ? `${formatWeight(w)}g, ` : ""}${qtyText} / ${unitText} / 공급가 ${fmt(supply)} / 부가세 ${fmt(vat)} / 총액 ${fmt(total)}`;
    }).join("\n");
    return `주문/출고 메모\n- 출고방법: ${r.ship_method ?? ""}\n- 주문자: ${orderer || "(없음)"}\n- 제목: ${title || "(없음)"}\n\n배송정보:\n${shipList || "(배송정보 없음)"}\n\n품목:\n${rows || "(품목 없음)"}`;
  }
  const memo = (r.ledger_memo ?? "").trim(), cat = r.ledger_category ?? r.category ?? "";
  const method = methodLabel(r.ledger_method ?? r.method ?? ""), amt = Number(r.ledger_amount ?? 0);
  return `금전출납 메모\n- 카테고리: ${cat}\n- 결제수단: ${method}\n- 금액: ${fmt(amt)}\n\n메모:\n${memo || "(없음)"}`;
}

function loadRecentFromLS(): string[] {
  try {
    const raw = localStorage.getItem(LS_RECENT_PARTNERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}
function saveRecentToLS(ids: string[]) { try { localStorage.setItem(LS_RECENT_PARTNERS, JSON.stringify(ids)); } catch { } }
const isMallPartner = (p: PartnerRow | null) => ["네이버", "쿠팡", "카카오"].some((k) => String(p?.name ?? "").includes(k));

function buildOrderSummaryText(r: UnifiedRow) {
  if (r.kind !== "ORDER") return (r.ledger_memo ?? "").trim();
  const lines = (r.order_lines ?? []) as Array<{ name: string }>;
  if (!lines.length) return (r.order_title ?? "").trim();
  const first = String(lines[0]?.name ?? "").trim();
  const rest = Math.max(0, lines.length - 1);
  if (first && rest > 0) return `${first} 외 ${rest}건`;
  if (first) return first;
  return rest > 0 ? `외 ${rest}건` : "";
}

// ─────────────────────── Sub-components ───────────────────────
type ShipFormState = { name: string; addr: string; mobile: string; phone: string; msg: string };
const emptyShip = (): ShipFormState => ({ name: "", addr: "", mobile: "", phone: "", msg: "" });

function ImeSafeInput({
  value,
  onValueChange,
  className,
  placeholder,
  name,
  autoComplete,
  inputMode,
  disabled,
}: {
  value: string;
  onValueChange: (v: string) => void;
  className: string;
  placeholder?: string;
  name?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  disabled?: boolean;
}) {
  const [local, setLocal] = useState<string>(value ?? "");
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) setLocal(value ?? "");
  }, [value]);

  return (
    <input
      className={className}
      placeholder={placeholder}
      name={name}
      autoComplete={autoComplete}
      inputMode={inputMode}
      disabled={disabled}
      value={local}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        const v = (e.currentTarget as HTMLInputElement).value;
        setLocal(v);
        onValueChange(v);
      }}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (!composingRef.current) onValueChange(v);
      }}
    />
  );
}

function ShipmentForm({
  label,
  value,
  onChange,
  cls,
  namePrefix,
}: {
  label: string;
  value: ShipFormState;
  onChange: (p: Partial<ShipFormState>) => void;
  cls: string;
  namePrefix: string;
}) {
  return (
    <div className="space-y-2">
      <div className="mb-2 text-sm font-semibold">{label}</div>
      <ImeSafeInput
        className={cls}
        placeholder="수화주명"
        value={value.name}
        name={`${namePrefix}_name`}
        autoComplete="off"
        onValueChange={(v) => onChange({ name: v })}
      />
      <ImeSafeInput
        className={cls}
        placeholder="주소1"
        value={value.addr}
        name={`${namePrefix}_addr`}
        autoComplete="off"
        onValueChange={(v) => onChange({ addr: v })}
      />
      <ImeSafeInput
        className={cls}
        placeholder="요청사항"
        value={value.msg}
        name={`${namePrefix}_msg`}
        autoComplete="off"
        onValueChange={(v) => onChange({ msg: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <ImeSafeInput
          className={cls}
          placeholder="휴대폰"
          value={value.mobile}
          name={`${namePrefix}_mobile`}
          autoComplete="off"
          onValueChange={(v) => onChange({ mobile: v })}
        />
        <ImeSafeInput
          className={cls}
          placeholder="전화"
          value={value.phone}
          name={`${namePrefix}_phone`}
          autoComplete="off"
          onValueChange={(v) => onChange({ phone: v })}
        />
      </div>
    </div>
  );
}

type LineRowProps = {
  l: Line; i: number;
  onUpdate: (i: number, p: Partial<Line>) => void;
  onRemove: (i: number) => void;
  masterByName: Map<string, MasterProductRow>;
  inputCls: string; inputRightCls: string; btnCls: string;
  gridCols: string; qtyBadgeCls: string;
};
function LineRow({ l, i, onUpdate, onRemove, masterByName, inputCls, inputRightCls, btnCls, gridCols, qtyBadgeCls }: LineRowProps) {
  const r = calcLineAmounts(l.qty, l.unit, l.total_incl_vat);
  const pack = inferPackEaFromName(l.name);
  return (
    <div className={`grid ${gridCols} gap-2`}>
      <input className={inputCls} list="food-types-list" value={l.food_type} onChange={(e) => onUpdate(i, { food_type: e.target.value })} />
      <input className={inputCls} list="master-product-list" value={l.name}
        onChange={(e) => {
          const v = e.target.value; onUpdate(i, { name: v });
          const hit = masterByName.get(v);
          if (hit) onUpdate(i, { food_type: hit.food_type ?? "", weight_g: Number(hit.weight_g ?? 0) });
        }}
      />
      <input className={inputRightCls} inputMode="decimal"
        value={typeof l.weight_g === "string" ? l.weight_g : formatWeight(l.weight_g)}
        onChange={(e) => onUpdate(i, { weight_g: sanitizeDecimalInput(e.target.value) })}
        onBlur={() => onUpdate(i, { weight_g: toNum(l.weight_g) })}
      />
      <div className="flex items-center gap-1">
        <input className={inputRightCls} inputMode="numeric"
          value={l.qty ? fmt(l.qty) : ""}
          onChange={(e) => { const raw = e.target.value.replace(/[^\d,]/g, ""); onUpdate(i, { qty: raw === "" ? 0 : toInt(raw) }); }}
        />
        <span className={qtyBadgeCls}>{pack > 1 ? "BOX" : "EA"}</span>
      </div>
      <input className={inputRightCls} inputMode="text"
        value={typeof l.unit === "string" ? l.unit : l.unit !== 0 ? fmt(l.unit) : ""}
        onChange={(e) => { const raw = sanitizeSignedIntInput(e.target.value); onUpdate(i, { unit: raw, ...(toIntSigned(raw) !== 0 ? { total_incl_vat: "" } : {}) }); }}
      />
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{fmt(r.supply)}</div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{fmt(r.vat)}</div>
      <input className={inputRightCls} inputMode="text" placeholder="총액"
        disabled={toIntSigned(l.unit) !== 0}
        value={toIntSigned(l.unit) !== 0 ? fmt(r.total) : typeof l.total_incl_vat === "string" ? l.total_incl_vat : l.total_incl_vat !== 0 ? fmt(l.total_incl_vat) : ""}
        onChange={(e) => onUpdate(i, { total_incl_vat: sanitizeSignedIntInput(e.target.value) })}
      />
      <button className={btnCls} onClick={() => onRemove(i)} title="삭제">✕</button>
    </div>
  );
}

const LineHeader = ({ gridCols }: { gridCols: string }) => (
  <div className={`mt-3 grid ${gridCols} gap-2 text-xs text-slate-600`}>
    {["식품유형", "품목명", "무게(g)", "수량", "단가", "공급가", "부가세", "총액(입력)", ""].map((h, i) => (
      <div key={i} className={i < 8 ? "pl-3" : ""}>{h}</div>
    ))}
  </div>
);

// ✅ ShipBlock을 컴포넌트 밖으로 빼서(함수 재생성 방지) 커서 튕김/IME 문제 예방
function ShipBlock({
  s1, setS1, s2, setS2, two, setTwo, prefix, inpClass,
}: {
  s1: ShipFormState; setS1: (v: ShipFormState) => void;
  s2: ShipFormState; setS2: (v: ShipFormState) => void;
  two: boolean; setTwo: (v: boolean) => void;
  prefix: string;
  inpClass: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-sm font-semibold">배송정보(주문 스냅샷)</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <ShipmentForm label="배송지 1" value={s1} onChange={(p) => setS1({ ...s1, ...p })} cls={inpClass} namePrefix={`${prefix}_ship1`} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">배송지 2 (선택)</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={two} onChange={(e) => setTwo(e.target.checked)} />2곳 배송</label>
          </div>
          {two ? <ShipmentForm label="" value={s2} onChange={(p) => setS2({ ...s2, ...p })} cls={inpClass} namePrefix={`${prefix}_ship2`} /> : <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">2곳 배송이 아니면 비워둡니다.</div>}
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">※ 배송정보는 주문마다 저장됩니다(스냅샷). 거래처(업체)명과 수화주명은 다를 수 있습니다.</div>
    </div>
  );
}

// ─────────────────────── Main Component ───────────────────────
export default function TradeClient() {
  const supabase = useMemo(() => createClient(), []);

  // ✅ 브라우저 탭 제목
  useEffect(() => {
    if (typeof document !== "undefined") document.title = "BONUSMATE ERP 거래내역(통합)";
  }, []);

  // ✅ 주소창에서 /trade 경로 숨김(표시만 변경)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (/\/trade\/?$/.test(window.location.pathname)) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // UI state
  const [msg, setMsg] = useState<string | null>(null);
  const [showTopBtn, setShowTopBtn] = useState(false);
  const [mode, setMode] = useState<Mode>("UNIFIED");
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoTitle, setMemoTitle] = useState("");
  const [memoBody, setMemoBody] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<UnifiedRow | null>(null);
  const [partnerEditOpen, setPartnerEditOpen] = useState(false);
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [shipHistOpen, setShipHistOpen] = useState(false);
  const [shipHistLoading, setShipHistLoading] = useState(false);
  const [shipHist, setShipHist] = useState<PartnerShippingHistoryRow[]>([]);
  const [includeOpening, setIncludeOpening] = useState(true);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [tradeSearch, setTradeSearch] = useState("");

  // ✅ To 날짜 자동맞춤(사용자 직접 변경 여부)
  const [toTouched, setToTouched] = useState(false);

  // ✅ 상단 에러 배너 대신 alert로 표시
  useEffect(() => {
    if (!msg) return;
    window.alert(msg);
    setMsg(null);
  }, [msg]);

  // Partner state
  const [partnerView, setPartnerView] = useState<PartnerView>("ALL");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerRow | null>(null);
  const [recentPartnerIds, setRecentPartnerIds] = useState<string[]>([]);

  // Partner form (new)
  const [p_name, setP_name] = useState(""); const [p_businessNo, setP_businessNo] = useState("");
  const [p_ceo, setP_ceo] = useState(""); const [p_phone, setP_phone] = useState("");
  const [p_address1, setP_address1] = useState(""); const [p_bizType, setP_bizType] = useState("");
  const [p_bizItem, setP_bizItem] = useState(""); const [p_partnerType, setP_partnerType] = useState<PartnerType>("CUSTOMER");

  // Partner form (edit)
  const [ep_name, setEP_name] = useState(""); const [ep_businessNo, setEP_businessNo] = useState("");
  const [ep_ceo, setEP_ceo] = useState(""); const [ep_phone, setEP_phone] = useState("");
  const [ep_address1, setEP_address1] = useState(""); const [ep_bizType, setEP_bizType] = useState("");
  const [ep_bizItem, setEP_bizItem] = useState(""); const [ep_partnerType, setEP_partnerType] = useState<PartnerType>("CUSTOMER");

  // Shipping info (partner edit modal)
  const [shipEdit, setShipEdit] = useState<ShipFormState>(emptyShip());

  // Reference data
  const [foodTypes, setFoodTypes] = useState<FoodTypeRow[]>([]);
  const [presetProducts, setPresetProducts] = useState<PresetProductRow[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProductRow[]>([]);
  const masterByName = useMemo(() => { const m = new Map<string, MasterProductRow>(); for (const p of masterProducts) m.set(p.product_name, p); return m; }, [masterProducts]);

  // Order form
  const [shipDate, setShipDate] = useState(todayYMD());
  const [ordererName, setOrdererName] = useState("");
  const [shipMethod, setShipMethod] = useState("택배");
  const [orderTitle, setOrderTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  const [ship1, setShip1] = useState<ShipFormState>(emptyShip());
  const [ship2, setShip2] = useState<ShipFormState>(emptyShip());
  const [twoShip, setTwoShip] = useState(false);

  // Ledger form
  const [entryDate, setEntryDate] = useState(todayYMD());
  const [payMethod, setPayMethod] = useState<"BANK" | "CASH" | "CARD" | "ETC">("BANK");
  const [category, setCategory] = useState<Category>("매출입금");
  const [amountStr, setAmountStr] = useState("");
  const [ledgerMemo, setLedgerMemo] = useState("");
  const [manualCounterpartyName, setManualCounterpartyName] = useState("");
  const [manualBusinessNo, setManualBusinessNo] = useState("");
  const [vatFree, setVatFree] = useState(false);

  // Edit modal - order
  const [eShipDate, setEShipDate] = useState(todayYMD());
  const [eOrdererName, setEOrdererName] = useState("");
  const [eShipMethod, setEShipMethod] = useState("택배");
  const [eOrderTitle, setEOrderTitle] = useState("");
  const [eLines, setELines] = useState<Line[]>([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  const [eShip1, setEShip1] = useState<ShipFormState>(emptyShip());
  const [eShip2, setEShip2] = useState<ShipFormState>(emptyShip());
  const [eTwoShip, setETwoShip] = useState(false);

  // Edit modal - ledger
  const [eEntryDate, setEEntryDate] = useState(todayYMD());
  const [ePayMethod, setEPayMethod] = useState<"BANK" | "CASH" | "CARD" | "ETC">("BANK");
  const [eCategory, setECategory] = useState<Category>("매출입금");
  const [eAmountStr, setEAmountStr] = useState("");
  const [eLedgerMemo, setELedgerMemo] = useState("");
  const [eCounterpartyName, setECounterpartyName] = useState("");
  const [eBusinessNo, setEBusinessNo] = useState("");
  const [eVatFree, setEVatFree] = useState(false);

  // Query range
  const [fromYMD, setFromYMD] = useState(addDays(todayYMD(), -30));
  const [toYMD, setToYMD] = useState(todayYMD());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);

  // Scroll sync refs
  const tradeTopScrollRef = useRef<HTMLDivElement | null>(null);
  const tradeBottomScrollRef = useRef<HTMLDivElement | null>(null);
  const tradeSyncingRef = useRef<"TOP" | "BOTTOM" | null>(null);
  const syncDateRef = useRef<"SHIP" | "ENTRY" | null>(null);

  // ─── Date sync ───
  useEffect(() => {
    if (syncDateRef.current === "ENTRY") { syncDateRef.current = null; return; }
    syncDateRef.current = "SHIP"; setEntryDate(shipDate);

    // ✅ (1) 입력 날짜가 거래내역 From보다 이전이면, 거래내역 From도 같이 당김
    if (shipDate && fromYMD && shipDate < fromYMD) setFromYMD(shipDate);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipDate]);

  useEffect(() => {
    if (syncDateRef.current === "SHIP") { syncDateRef.current = null; return; }
    syncDateRef.current = "ENTRY"; setShipDate(entryDate);

    // ✅ (1) 입력 날짜가 거래내역 From보다 이전이면, 거래내역 From도 같이 당김
    if (entryDate && fromYMD && entryDate < fromYMD) setFromYMD(entryDate);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDate]);

  // ─── TOP button ───
  useEffect(() => {
    const onScroll = () => setShowTopBtn((window.scrollY || 0) > 300);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ─── Partner selection side effects ───
  useEffect(() => {
    setManualCounterpartyName(selectedPartner?.name ?? "");
    setManualBusinessNo(selectedPartner?.business_no ?? "");
    setShip1({ name: selectedPartner?.ship_to_name ?? "", addr: selectedPartner?.ship_to_address1 ?? "", mobile: selectedPartner?.ship_to_mobile ?? "", phone: selectedPartner?.ship_to_phone ?? "", msg: "" });
    setShip2(emptyShip()); setTwoShip(false);

    // ✅ 거래처 바뀌면 To 자동맞춤 기본으로 복귀
    setToTouched(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartner?.id]);

  // ─── Computed totals ───
  const orderTotals = useMemo(() => lines.reduce((acc, l) => { const r = calcLineAmounts(l.qty, l.unit, l.total_incl_vat); return { supply: acc.supply + r.supply, vat: acc.vat + r.vat, total: acc.total + r.total }; }, { supply: 0, vat: 0, total: 0 }), [lines]);
  const editOrderTotals = useMemo(() => eLines.reduce((acc, l) => { const r = calcLineAmounts(l.qty, l.unit, l.total_incl_vat); return { supply: acc.supply + r.supply, vat: acc.vat + r.vat, total: acc.total + r.total }; }, { supply: 0, vat: 0, total: 0 }), [eLines]);

  const ledgerSplit = useMemo(() => splitVatFromTotalFlexible(amountStr, vatFree), [amountStr, vatFree]);
  const editLedgerSplit = useMemo(() => splitVatFromTotalFlexible(eAmountStr, eVatFree), [eAmountStr, eVatFree]);

  const partnersToShow = useMemo(() => {
    if (partnerView === "PINNED") return partners.filter((p) => !!p.is_pinned);
    if (partnerView === "RECENT") { const map = new Map(partners.map((p) => [p.id, p])); return recentPartnerIds.map((id) => map.get(id)).filter(Boolean) as PartnerRow[]; }
    return partners;
  }, [partners, partnerView, recentPartnerIds]);

  // ─── Unified rows ───
  const unifiedRows = useMemo<UnifiedRow[]>(() => {
    const normalizeIso = (s: string | null | undefined) => {
      let v = String(s ?? "").trim();
      if (!v) return "";
      // "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DDTHH:mm:ss"
      if (v.includes(" ") && !v.includes("T")) v = v.replace(" ", "T");
      // timezone 없는 "YYYY-MM-DDTHH:mm:ss" → "Z" 부착(UTC로 파싱되게)
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) v = `${v}Z`;
      return v;
    };

    const safeParseMs = (isoLike: string) => {
      const ms = Date.parse(isoLike);
      return Number.isFinite(ms) ? ms : 0;
    };

    const ymdToMs = (ymd: string) => {
      const v = String(ymd ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 0;
      const ms = Date.parse(`${v}T00:00:00.000Z`);
      return Number.isFinite(ms) ? ms : 0;
    };

    const items: Array<Omit<UnifiedRow, "balance"> & { signed: number; tsMs: number; dateMs: number }> = [];

    for (const o of orders) {
      const memo = safeJsonParse<{ title: string | null; orderer_name?: string | null }>(o.memo);
      const date = o.ship_date ?? (o.created_at ? o.created_at.slice(0, 10) : "");
      const total = Number(o.total_amount ?? 0);
      const orderer = (memo?.orderer_name ?? null) as string | null;

      const oIso = normalizeIso(o.created_at);
      const tsKey = oIso || (date ? `${date}T12:00:00.000Z` : "");
      const tsMs = oIso ? safeParseMs(oIso) : (date ? safeParseMs(`${date}T12:00:00.000Z`) : 0);
      const dateMs = ymdToMs(date) || (tsMs ? ymdToMs(new Date(tsMs).toISOString().slice(0, 10)) : 0);

      items.push({
        kind: "ORDER",
        date,
        tsKey,
        tsMs,
        dateMs,
        partnerName: o.customer_name ?? "",
        businessNo: "",
        ordererName: orderer ?? "",
        category: "주문/출고",
        method: o.ship_method ?? "",
        inAmt: 0,
        outAmt: total,
        signed: -total,
        rawId: o.id,
        ship_method: o.ship_method ?? "택배",
        order_title: memo?.title ?? null,
        orderer_name: orderer,
        order_lines: (o.order_lines ?? []).map((l) => ({
          food_type: l.food_type ?? "",
          name: l.name ?? "",
          weight_g: Number(l.weight_g ?? 0),
          qty: Number(l.qty ?? 0),
          unit: Number(l.unit ?? 0),
          total_amount: Number(l.total_amount ?? 0),
          unit_type: (l.unit_type ?? "EA") as any,
          pack_ea: Number(l.pack_ea ?? 1),
          actual_ea: Number(l.actual_ea ?? 0),
        })),
        order_shipments: (o.order_shipments ?? []).map((s) => ({
          seq: Number(s.seq ?? 1),
          ship_to_name: String(s.ship_to_name ?? ""),
          ship_to_address1: String(s.ship_to_address1 ?? ""),
          ship_to_address2: s.ship_to_address2 ?? null,
          ship_to_mobile: s.ship_to_mobile ?? null,
          ship_to_phone: s.ship_to_phone ?? null,
          ship_zipcode: s.ship_zipcode ?? null,
          delivery_message: s.delivery_message ?? null,
        })),
      });
    }

    for (const l of ledgers) {
      const sign = String(l.direction) === "OUT" ? -1 : 1;
      const amt = Number(l.amount ?? 0);

      const lIso = normalizeIso(l.entry_ts) || normalizeIso(l.created_at);
      const tsKey = lIso || (l.entry_date ? `${l.entry_date}T12:00:00.000Z` : "");
      const tsMs = lIso ? safeParseMs(lIso) : (l.entry_date ? safeParseMs(`${l.entry_date}T12:00:00.000Z`) : 0);
      const dateMs = ymdToMs(l.entry_date) || (tsMs ? ymdToMs(new Date(tsMs).toISOString().slice(0, 10)) : 0);

      items.push({
        kind: "LEDGER",
        date: l.entry_date,
        tsKey,
        tsMs,
        dateMs,
        partnerName: l.counterparty_name ?? "",
        businessNo: l.business_no ?? "",
        ledger_partner_id: l.partner_id ?? null,
        ordererName: "",
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
        ledger_supply_amount: (l.supply_amount ?? null) as any,
        ledger_vat_amount: (l.vat_amount ?? null) as any,
        ledger_total_amount: (l.total_amount ?? null) as any,
      });
    }

    // ✅ 1) 러닝잔액 계산은 "과거 → 현재" (날짜 오름차순 → 같은 날짜는 시간 오름차순)
    items.sort((a, b) => (a.dateMs - b.dateMs) || (a.tsMs - b.tsMs) || String(a.rawId).localeCompare(String(b.rawId)));

    let running = includeOpening ? openingBalance : 0;
    const withBal: UnifiedRow[] = items.map((x) => {
      running += x.signed;
      const { signed, tsMs, dateMs, ...rest } = x;
      return { ...rest, balance: running };
    });

    // ✅ 2) 화면 표시는 "현재 → 과거" (날짜 내림차순 → 같은 날짜는 시간 내림차순)
    withBal.sort((a, b) => {
      const aDateMs = /^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? "")) ? Date.parse(`${a.date}T00:00:00.000Z`) : 0;
      const bDateMs = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? "")) ? Date.parse(`${b.date}T00:00:00.000Z`) : 0;
      const ad = Number.isFinite(aDateMs) ? aDateMs : 0;
      const bd = Number.isFinite(bDateMs) ? bDateMs : 0;
      if (ad !== bd) return bd - ad;

      const am = Date.parse(a.tsKey);
      const bm = Date.parse(b.tsKey);
      const aMs = Number.isFinite(am) ? am : 0;
      const bMs = Number.isFinite(bm) ? bm : 0;
      if (aMs !== bMs) return bMs - aMs;

      return String(b.rawId).localeCompare(String(a.rawId));
    });

    return withBal;
  }, [orders, ledgers, includeOpening, openingBalance]);

  const unifiedTotals = useMemo(() => {
    const plus = unifiedRows.reduce((a, x) => a + x.inAmt, 0);
    const minus = unifiedRows.reduce((a, x) => a + x.outAmt, 0);
    return { plus, minus, net: plus - minus, endBalance: unifiedRows.length ? unifiedRows[0].balance : includeOpening ? openingBalance : 0 };
  }, [unifiedRows, includeOpening, openingBalance]);

  // ─── Scroll sync ───
  useEffect(() => {
    const top = tradeTopScrollRef.current, bottom = tradeBottomScrollRef.current;
    if (top && bottom) top.scrollLeft = bottom.scrollLeft;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unifiedRows.length, mode]);

  // ─── Recent partners ───
  function pushRecentPartner(id: string) {
    setRecentPartnerIds((prev) => { const next = [id, ...prev.filter((x) => x !== id)].slice(0, 20); saveRecentToLS(next); return next; });
  }

  // ─── Loaders ───
  async function loadPartners() {
    setMsg(null);
    let q = supabase.from("partners")
      .select("id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone")
      .order("is_pinned", { ascending: false }).order("pin_order", { ascending: true }).order("name", { ascending: true }).limit(500);
    const f = partnerFilter.trim();
    if (f) q = q.or(`name.ilike.%${f}%,business_no.ilike.%${f}%`);
    const { data, error } = await q;
    if (error) return setMsg(error.message);
    setPartners((data ?? []) as PartnerRow[]);
  }

  async function loadFoodTypes() {
    const { data } = await supabase.from("food_types").select("id,name").eq("is_active", true).order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(200);
    if (data) setFoodTypes(data as FoodTypeRow[]);
  }
  async function loadPresetProducts() {
    const { data } = await supabase.from("preset_products").select("id,product_name,food_type,weight_g,barcode").eq("is_active", true).order("product_name", { ascending: true }).limit(5000);
    if (data) setPresetProducts(data as PresetProductRow[]);
  }
  async function loadMasterProducts() {
    const { data } = await supabase.from("v_tradeclient_products").select("product_name,food_type,report_no,weight_g,unit_type,pack_ea,barcode").order("product_name", { ascending: true }).limit(10000);
    if (data) setMasterProducts(data as MasterProductRow[]);
  }

  async function loadLatestShippingForPartner(partnerId: string) {
    const { data, error } = await supabase.from("partner_shipping_history").select("id,partner_id,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone,created_at").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(1);
    if (error) return null;
    return (data?.[0] ?? null) as PartnerShippingHistoryRow | null;
  }

  async function loadShippingHistory5(partnerId: string) {
    setShipHistLoading(true);
    try {
      const { data, error } = await supabase.from("partner_shipping_history").select("id,partner_id,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone,created_at").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(5);
      if (error) { setMsg(error.message); setShipHist([]); return; }
      setShipHist((data ?? []) as PartnerShippingHistoryRow[]);
    } finally { setShipHistLoading(false); }
  }

  async function loadTrades() {
    setMsg(null);
    const f = fromYMD || addDays(todayYMD(), -30);

    // ✅ (2) 기본 To는 "마지막 거래내역 날짜"로 자동 맞춤(사용자가 To를 직접 만진 경우 제외)
    if (!toTouched) {
      const selectedBusinessNo = selectedPartner?.business_no ?? null;
      const selectedPartnerId = selectedPartner?.id ?? null;

      let latestOrderDate = "";
      let latestLedgerDate = "";

      let oqLatest = supabase.from("orders").select("ship_date,customer_id,customer_name").not("ship_date", "is", null).order("ship_date", { ascending: false }).limit(1);
      if (selectedPartnerId) oqLatest = oqLatest.or(`customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`);
      const { data: oLatest, error: oLatestErr } = await oqLatest;
      if (!oLatestErr && oLatest && oLatest[0]?.ship_date) latestOrderDate = String(oLatest[0].ship_date);

      let lqLatest = supabase.from("ledger_entries").select("entry_date,partner_id,business_no,counterparty_name").not("entry_date", "is", null).order("entry_date", { ascending: false }).limit(1);
      if (selectedPartnerId || selectedBusinessNo) {
        const ors: string[] = [];
        if (selectedPartnerId) ors.push(`partner_id.eq.${selectedPartnerId}`);
        if (selectedBusinessNo) ors.push(`business_no.eq.${selectedBusinessNo}`);
        if (selectedPartner?.name) ors.push(`counterparty_name.eq.${selectedPartner.name.replaceAll(",", "")}`);
        lqLatest = lqLatest.or(ors.join(","));
      }
      const { data: lLatest, error: lLatestErr } = await lqLatest;
      if (!lLatestErr && lLatest && lLatest[0]?.entry_date) latestLedgerDate = String(lLatest[0].entry_date);

      const latest = [latestOrderDate, latestLedgerDate].filter(Boolean).sort().pop() || todayYMD();
      if (latest && latest !== toYMD) { setToYMD(latest); return; }
    }

    const t = toYMD || todayYMD();
    const selectedBusinessNo = selectedPartner?.business_no ?? null;
    const selectedPartnerId = selectedPartner?.id ?? null;

    let oq = supabase.from("orders").select("id,customer_id,customer_name,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount,created_at,order_lines(id,order_id,line_no,food_type,name,weight_g,qty,unit,unit_type,pack_ea,actual_ea,supply_amount,vat_amount,total_amount,created_at),order_shipments(id,order_id,seq,ship_to_name,ship_to_address1,ship_to_address2,ship_to_mobile,ship_to_phone,ship_zipcode,delivery_message,created_at,updated_at)").gte("ship_date", f).lte("ship_date", t).order("ship_date", { ascending: false }).limit(500);
    if (selectedPartnerId) oq = oq.or(`customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`);
    const { data: oData, error: oErr } = await oq;
    if (oErr) return setMsg(oErr.message);
    setOrders((oData ?? []) as OrderRow[]);

    let lq = supabase.from("ledger_entries").select("id,entry_date,entry_ts,direction,amount,category,method,counterparty_name,business_no,memo,status,partner_id,created_at,supply_amount,vat_amount,total_amount").gte("entry_date", f).lte("entry_date", t).order("entry_date", { ascending: false }).limit(1000);
    if (selectedPartnerId || selectedBusinessNo) {
      const ors: string[] = [];
      if (selectedPartnerId) ors.push(`partner_id.eq.${selectedPartnerId}`);
      if (selectedBusinessNo) ors.push(`business_no.eq.${selectedBusinessNo}`);
      if (selectedPartner?.name) ors.push(`counterparty_name.eq.${selectedPartner.name.replaceAll(",", "")}`);
      lq = lq.or(ors.join(","));
    }
    const { data: lData, error: lErr } = await lq;
    if (lErr) return setMsg(lErr.message);
    setLedgers(((lData ?? []).map((r: any) => ({ ...r, amount: Number(r.amount ?? 0) }))) as LedgerRow[]);

    // Opening balance
    let opening = 0;
    let oq2 = supabase.from("orders").select("id,ship_date,total_amount,customer_id,customer_name").lt("ship_date", f).order("ship_date", { ascending: false }).limit(5000);
    if (selectedPartnerId) oq2 = oq2.or(`customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`);
    const { data: oPrev, error: oPrevErr } = await oq2;
    if (!oPrevErr && oPrev) opening += -(oPrev.reduce((acc: number, r: any) => acc + Number(r.total_amount ?? 0), 0));

    let lq2 = supabase.from("ledger_entries").select("id,entry_date,direction,amount,partner_id,business_no,counterparty_name").lt("entry_date", f).order("entry_date", { ascending: false }).limit(10000);
    if (selectedPartnerId || selectedBusinessNo) {
      const ors: string[] = [];
      if (selectedPartnerId) ors.push(`partner_id.eq.${selectedPartnerId}`);
      if (selectedBusinessNo) ors.push(`business_no.eq.${selectedBusinessNo}`);
      if (selectedPartner?.name) ors.push(`counterparty_name.eq.${selectedPartner.name.replaceAll(",", "")}`);
      lq2 = lq2.or(ors.join(","));
    }
    const { data: lPrev, error: lPrevErr } = await lq2;
    if (!lPrevErr && lPrev) opening += lPrev.reduce((acc: number, r: any) => acc + (String(r.direction) === "OUT" ? -1 : 1) * Number(r.amount ?? 0), 0);
    setOpeningBalance(opening);
  }

  // ─── Init ───
  useEffect(() => { setRecentPartnerIds(loadRecentFromLS()); loadPartners(); loadFoodTypes(); loadPresetProducts(); loadMasterProducts(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadPartners(); /* eslint-disable-next-line */ }, [partnerFilter]);
  useEffect(() => { loadTrades(); /* eslint-disable-next-line */ }, [selectedPartner?.id, fromYMD, toYMD, toTouched]);

  // ─── Partner CRUD ───
  function resetPartnerForm() { setP_name(""); setP_businessNo(""); setP_ceo(""); setP_phone(""); setP_address1(""); setP_bizType(""); setP_bizItem(""); setP_partnerType("CUSTOMER"); }

  async function createPartner() {
    setMsg(null);
    const name = p_name.trim();
    if (!name) return setMsg("업체명(필수)을 입력하세요.");
    const { data, error } = await supabase.from("partners").insert({ name, business_no: p_businessNo.trim() || null, ceo_name: p_ceo.trim() || null, phone: p_phone.trim() || null, address1: p_address1.trim() || null, biz_type: p_bizType.trim() || null, biz_item: p_bizItem.trim() || null, partner_type: p_partnerType, is_pinned: false, pin_order: 9999 }).select("*").single();
    if (error) return setMsg(error.message);
    setShowPartnerForm(false); resetPartnerForm();
    await loadPartners(); setSelectedPartner(data as PartnerRow); pushRecentPartner((data as PartnerRow).id);
  }

  function selectPartner(p: PartnerRow) { setSelectedPartner(p); setMsg(null); pushRecentPartner(p.id); }

  async function togglePinned(p: PartnerRow) {
    const { error } = await supabase.from("partners").update({ is_pinned: !(p.is_pinned ?? false) }).eq("id", p.id);
    if (error) return setMsg(error.message);
    setPartners((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_pinned: !(p.is_pinned ?? false) } : x)));
  }

  async function openPartnerEdit() {
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    setEP_name(selectedPartner.name ?? ""); setEP_businessNo(selectedPartner.business_no ?? "");
    setEP_ceo(selectedPartner.ceo_name ?? ""); setEP_phone(selectedPartner.phone ?? "");
    setEP_address1(selectedPartner.address1 ?? ""); setEP_bizType(selectedPartner.biz_type ?? "");
    setEP_bizItem(selectedPartner.biz_item ?? "");
    const pt = String(selectedPartner.partner_type ?? "CUSTOMER") as any;
    setEP_partnerType(["CUSTOMER", "VENDOR", "BOTH"].includes(pt) ? pt : "CUSTOMER");
    const latest = await loadLatestShippingForPartner(selectedPartner.id);
    const cur = selectedPartner;
    setShipEdit({ name: (latest?.ship_to_name ?? cur.ship_to_name ?? "") || "", addr: (latest?.ship_to_address1 ?? cur.ship_to_address1 ?? "") || "", mobile: (latest?.ship_to_mobile ?? cur.ship_to_mobile ?? "") || "", phone: (latest?.ship_to_phone ?? cur.ship_to_phone ?? "") || "", msg: "" });
    setShipHistOpen(false); setShipHist([]); setShipHistLoading(false);
    setPartnerEditOpen(true);
  }

  async function savePartnerEdit() {
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    const name = ep_name.trim();
    if (!name) return setMsg("업체명(필수)을 입력하세요.");
    const nextShip = { ship_to_name: normText(shipEdit.name), ship_to_address1: normText(shipEdit.addr), ship_to_mobile: normText(shipEdit.mobile), ship_to_phone: normText(shipEdit.phone) };
    const prevShip = { ship_to_name: normText(selectedPartner.ship_to_name), ship_to_address1: normText(selectedPartner.ship_to_address1), ship_to_mobile: normText(selectedPartner.ship_to_mobile), ship_to_phone: normText(selectedPartner.ship_to_phone) };
    const shippingChanged = JSON.stringify(prevShip) !== JSON.stringify(nextShip);
    const { data: updated, error: uErr } = await supabase.from("partners").update({ name, business_no: normText(ep_businessNo), ceo_name: normText(ep_ceo), phone: normText(ep_phone), address1: normText(ep_address1), biz_type: normText(ep_bizType), biz_item: normText(ep_bizItem), partner_type: ep_partnerType, ...nextShip }).eq("id", selectedPartner.id).select("id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone").single();
    if (uErr) return setMsg(uErr.message);
    if (shippingChanged) {
      const { error: hErr } = await supabase.from("partner_shipping_history").insert({ partner_id: selectedPartner.id, ...nextShip });
      if (hErr) return setMsg(hErr.message);
    }
    const updatedPartner = updated as PartnerRow;
    setPartners((prev) => prev.map((p) => (p.id === updatedPartner.id ? updatedPartner : p)));
    setSelectedPartner(updatedPartner);
    if (shipHistOpen) await loadShippingHistory5(updatedPartner.id);
    setPartnerEditOpen(false);
  }

  // ─── Order/Line helpers ───
  const updateLine = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateEditLine = (i: number, patch: Partial<Line>) => setELines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addEditLine = () => setELines((prev) => [...prev, { food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  const removeEditLine = (i: number) => setELines((prev) => prev.filter((_, idx) => idx !== i));

  function insertShippingFee(totalInclVat: number) {
    setLines((prev) => [...prev, { food_type: "", name: "택배비", weight_g: 0, qty: 1, unit: "", total_incl_vat: String(totalInclVat) }]);
  }

  function insertEditShippingFee(totalInclVat: number) {
    setELines((prev) => [...prev, { food_type: "", name: "택배비", weight_g: 0, qty: 1, unit: "", total_incl_vat: String(totalInclVat) }]);
  }

  // ─── Ship state helpers ───
  function applyShipmentsToForm(
    shipments: ShipmentSnap[],
    setS1: (v: ShipFormState) => void,
    setS2: (v: ShipFormState) => void,
    setTwo: (v: boolean) => void
  ) {
    const sorted = [...shipments].sort((a, b) => (a.seq ?? 1) - (b.seq ?? 1));
    const s1 = sorted.find((x) => (x.seq ?? 1) === 1);
    const s2 = sorted.find((x) => (x.seq ?? 1) === 2);
    setS1(s1 ? { name: String(s1.ship_to_name ?? ""), addr: String(s1.ship_to_address1 ?? ""), mobile: String(s1.ship_to_mobile ?? ""), phone: String(s1.ship_to_phone ?? ""), msg: String(s1.delivery_message ?? "") } : emptyShip());
    if (s2) { setTwo(true); setS2({ name: String(s2.ship_to_name ?? ""), addr: String(s2.ship_to_address1 ?? ""), mobile: String(s2.ship_to_mobile ?? ""), phone: String(s2.ship_to_phone ?? ""), msg: String(s2.delivery_message ?? "") }); }
    else { setTwo(false); setS2(emptyShip()); }
  }

  function buildShipPayloads(orderId: string, s1: ShipFormState, s2: ShipFormState, two: boolean) {
    const payloads: any[] = [{ order_id: orderId, seq: 1, ship_to_name: s1.name.trim(), ship_to_address1: s1.addr.trim(), ship_to_mobile: normText(s1.mobile), ship_to_phone: normText(s1.phone), delivery_message: normText(s1.msg), created_by: null }];
    if (two) payloads.push({ order_id: orderId, seq: 2, ship_to_name: s2.name.trim(), ship_to_address1: s2.addr.trim(), ship_to_mobile: normText(s2.mobile), ship_to_phone: normText(s2.phone), delivery_message: normText(s2.msg), created_by: null });
    return payloads;
  }

  // ─── Create order ───
  async function createOrder() {
    setMsg(null);
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    if (lines.length === 0) return setMsg("품목을 1개 이상 입력하세요.");
    const isMall = isMallPartner(selectedPartner);
    const cleanLines = lines.map((l) => {
      const name = l.name.trim(), qty = toInt(l.qty), unit = toIntSigned(l.unit), weight_g = toNum(l.weight_g), food_type = (l.food_type || "").trim();
      const unit_type = isMall ? "BOX" : "EA", pack_ea = isMall ? inferPackEaFromName(name) : 1, actual_ea = unit_type === "BOX" ? qty * pack_ea : qty;
      const r = calcLineAmounts(qty, unit, l.total_incl_vat);
      return { food_type, name, weight_g, qty, unit, unit_type, pack_ea, actual_ea, supply_amount: r.supply, vat_amount: r.vat, total_amount: r.total };
    }).filter((l) => l.name && l.qty > 0 && (l.total_amount ?? 0) !== 0);
    if (cleanLines.length === 0) return setMsg("품목명/수량과 (단가 또는 총액)을 올바르게 입력하세요.");
    const { data: createdOrder, error: oErr } = await supabase.from("orders").insert({ customer_id: selectedPartner.id, customer_name: selectedPartner.name, title: null, ship_date: shipDate, ship_method: shipMethod, status: "DRAFT", memo: JSON.stringify({ title: orderTitle.trim() || null, orderer_name: ordererName.trim() || null }), supply_amount: orderTotals.supply, vat_amount: orderTotals.vat, total_amount: orderTotals.total, created_by: null }).select("id").single();
    if (oErr) return setMsg(oErr.message);
    const orderId = (createdOrder as any)?.id as string;
    if (!orderId) return setMsg("주문 생성 후 ID를 가져오지 못했습니다.");
    const { error: lErr } = await supabase.from("order_lines").insert(cleanLines.map((l, idx) => ({ order_id: orderId, line_no: idx + 1, food_type: l.food_type || null, name: l.name, weight_g: l.weight_g || null, qty: l.qty, unit: l.unit, unit_type: l.unit_type, pack_ea: l.pack_ea, actual_ea: l.actual_ea, supply_amount: l.supply_amount, vat_amount: l.vat_amount, total_amount: l.total_amount })));
    if (lErr) return setMsg(lErr.message);
    const { error: sErr } = await supabase.from("order_shipments").insert(buildShipPayloads(orderId, ship1, ship2, twoShip));
    if (sErr) return setMsg(sErr.message);
    setOrderTitle(""); setOrdererName(""); setLines([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
    setShip1(emptyShip()); setShip2(emptyShip()); setTwoShip(false);
    await loadTrades();
  }

  // ─── Create ledger ───
  async function createLedger() {
    setMsg(null);
    const amount = Number((amountStr || "0").replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0) return setMsg("금액(원)을 올바르게 입력하세요.");
    const counterparty_name = manualCounterpartyName.trim() || selectedPartner?.name || null;
    const business_no = manualBusinessNo.trim() || selectedPartner?.business_no || null;
    if (!counterparty_name) return setMsg("업체명(매입처/상대방)을 입력하거나 왼쪽에서 거래처를 선택하세요.");
    const { error } = await supabase.from("ledger_entries").insert({
      entry_date: entryDate,
      entry_ts: new Date().toISOString(),
      direction: categoryToDirection(category),
      amount,
      supply_amount: ledgerSplit.supply,
      vat_amount: ledgerSplit.vat,
      total_amount: ledgerSplit.total,
      category,
      method: payMethod,
      counterparty_name,
      business_no,
      memo: ledgerMemo.trim() || null,
      status: "POSTED",
      partner_id: selectedPartner?.id ?? null
    });
    if (error) return setMsg(error.message);
    setAmountStr(""); setLedgerMemo("");
    setVatFree(false); // ✅ 입력단 체크는 입력 기준으로만 사용(저장 후 초기화)
    if (!selectedPartner) { setManualCounterpartyName(""); setManualBusinessNo(""); }
    await loadTrades();
  }

  // ─── Copy fill ───
  function onCopyClick(r: UnifiedRow) {
    setMsg(null);
    if (r.kind === "ORDER") {
      setMode("ORDERS"); setShipDate(todayYMD()); setOrdererName(r.orderer_name ?? r.ordererName ?? "");
      setShipMethod(r.ship_method ?? "택배"); setOrderTitle(r.order_title ?? "");
      setLines(r.order_lines?.length ? r.order_lines.map((l) => ({ food_type: String(l.food_type ?? ""), name: String(l.name ?? ""), weight_g: Number(l.weight_g ?? 0), qty: toInt(l.qty ?? 0), unit: Number(l.unit ?? 0), total_incl_vat: Number(l.total_amount ?? 0) })) : [{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
      applyShipmentsToForm(r.order_shipments ?? [], setShip1, setShip2, setTwoShip);
    } else {
      setMode("LEDGER"); setEntryDate(todayYMD());
      const c = (r.ledger_category as Category) ?? "기타"; setCategory(CATEGORIES.includes(c) ? c : "기타");
      setPayMethod((r.ledger_method as any) ?? "BANK"); setLedgerMemo(r.ledger_memo ?? "");
      const amt = Number(r.ledger_amount ?? 0); setAmountStr(amt > 0 ? amt.toLocaleString("ko-KR") : "");
      setManualCounterpartyName(r.partnerName ?? ""); setManualBusinessNo(r.businessNo ?? "");
      setVatFree(false);
    }
  }

  function onMemoClick(r: UnifiedRow) {
    setMemoTitle(r.kind === "ORDER" ? `주문/출고 메모 - ${r.partnerName}` : `금전출납 메모 - ${r.partnerName}`);
    setMemoBody(buildMemoText(r)); setMemoOpen(true);
  }

  // ─── Edit ───
  function openEdit(r: UnifiedRow) {
    setMsg(null); setEditRow(r);
    if (r.kind === "ORDER") {
      setEShipDate(r.date || todayYMD()); setEOrdererName(r.orderer_name ?? r.ordererName ?? "");
      setEShipMethod(r.ship_method ?? r.method ?? "택배"); setEOrderTitle(r.order_title ?? "");
      setELines(r.order_lines?.length ? r.order_lines.map((l) => ({ food_type: String(l.food_type ?? ""), name: String(l.name ?? ""), weight_g: Number(l.weight_g ?? 0), qty: toInt(l.qty ?? 0), unit: Number(l.unit ?? 0), total_incl_vat: Number(l.total_amount ?? 0) })) : [{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
      applyShipmentsToForm(r.order_shipments ?? [], setEShip1, setEShip2, setETwoShip);
    } else {
      setEEntryDate(r.date || todayYMD());
      const m = (r.ledger_method ?? r.method ?? "BANK") as any;
      setEPayMethod(["BANK", "CASH", "CARD", "ETC"].includes(m) ? m : "BANK");
      const c = (r.ledger_category as Category) ?? (r.category as Category) ?? "기타";
      setECategory(CATEGORIES.includes(c) ? c : "기타");
      const amt = Number(r.ledger_amount ?? (r.inAmt || r.outAmt || 0));
      setEAmountStr(amt > 0 ? amt.toLocaleString("ko-KR") : "");
      setELedgerMemo(r.ledger_memo ?? ""); setECounterpartyName(r.partnerName ?? ""); setEBusinessNo(r.businessNo ?? "");

      const vatAmt = Number(r.ledger_vat_amount ?? 0);
      const supplyAmt = Number(r.ledger_supply_amount ?? 0);
      const totalAmt = Number(r.ledger_total_amount ?? 0);
      setEVatFree(amt > 0 && vatAmt === 0 && supplyAmt === amt && totalAmt === amt);
    }
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow) return; setMsg(null);
    if (editRow.kind === "ORDER") {
      const isMall = selectedPartner ? isMallPartner(selectedPartner) : false;
      const cleanLines = eLines.map((l) => {
        const name = (l.name || "").trim(), qty = toInt(l.qty), unit = toIntSigned(l.unit), weight_g = toNum(l.weight_g), food_type = (l.food_type || "").trim();
        const unit_type = isMall ? "BOX" : "EA", pack_ea = isMall ? inferPackEaFromName(name) : 1, actual_ea = unit_type === "BOX" ? qty * pack_ea : qty;
        const r = calcLineAmounts(qty, unit, l.total_incl_vat);
        return { food_type, name, weight_g, qty, unit, unit_type, pack_ea, actual_ea, supply_amount: r.supply, vat_amount: r.vat, total_amount: r.total };
      }).filter((l) => l.name && l.qty > 0 && (l.total_amount ?? 0) !== 0);
      if (cleanLines.length === 0) return setMsg("품목명/수량과 (단가 또는 총액)을 올바르게 입력하세요.");
      const { error } = await supabase.from("orders").update({ ship_date: eShipDate, ship_method: eShipMethod, memo: JSON.stringify({ title: eOrderTitle.trim() || null, orderer_name: eOrdererName.trim() || null }), supply_amount: editOrderTotals.supply, vat_amount: editOrderTotals.vat, total_amount: editOrderTotals.total }).eq("id", editRow.rawId);
      if (error) return setMsg(error.message);
      const { error: dErr } = await supabase.from("order_lines").delete().eq("order_id", editRow.rawId);
      if (dErr) return setMsg(dErr.message);
      const { error: iErr } = await supabase.from("order_lines").insert(cleanLines.map((l, idx) => ({ order_id: editRow.rawId, line_no: idx + 1, food_type: l.food_type || null, name: l.name, weight_g: l.weight_g || null, qty: l.qty, unit: l.unit, unit_type: l.unit_type, pack_ea: l.pack_ea, actual_ea: l.actual_ea, supply_amount: l.supply_amount, vat_amount: l.vat_amount, total_amount: l.total_amount })));
      if (iErr) return setMsg(iErr.message);
      const { error: sdErr } = await supabase.from("order_shipments").delete().eq("order_id", editRow.rawId);
      if (sdErr) return setMsg(sdErr.message);
      const { error: siErr } = await supabase.from("order_shipments").insert(buildShipPayloads(editRow.rawId, eShip1, eShip2, eTwoShip));
      if (siErr) return setMsg(siErr.message);
    } else {
      const amount = Number((eAmountStr || "0").replaceAll(",", ""));
      if (!Number.isFinite(amount) || amount <= 0) return setMsg("금액(원)을 올바르게 입력하세요.");
      const counterparty_name = eCounterpartyName.trim() || null;
      if (!counterparty_name) return setMsg("업체명(매입처/상대방)은 비울 수 없습니다.");
      const { error } = await supabase.from("ledger_entries").update({
        entry_date: eEntryDate,
        direction: categoryToDirection(eCategory),
        amount,
        supply_amount: editLedgerSplit.supply,
        vat_amount: editLedgerSplit.vat,
        total_amount: editLedgerSplit.total,
        category: eCategory,
        method: ePayMethod,
        memo: eLedgerMemo.trim() || null,
        counterparty_name,
        business_no: eBusinessNo.trim() || null,
        partner_id: editRow.ledger_partner_id ?? null
      }).eq("id", editRow.rawId);
      if (error) return setMsg(error.message);
    }
    setEditOpen(false); setEditRow(null); await loadTrades();
  }

  // ─── Delete ───
  async function deleteTradeRow(r: UnifiedRow) {
    if (!window.confirm("정말 삭제하시겠습니까?\n삭제하면 복구할 수 없습니다.")) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (r.kind === "ORDER") {
      const { error: sErr } = await supabase.from("order_shipments").delete().eq("order_id", r.rawId); if (sErr) return setMsg(sErr.message);
      const { error: dErr } = await supabase.from("order_lines").delete().eq("order_id", r.rawId); if (dErr) return setMsg(dErr.message);
      const { error: oErr } = await supabase.from("orders").delete().eq("id", r.rawId); if (oErr) return setMsg(oErr.message);
    } else {
      const { error } = await supabase.from("ledger_entries").delete().eq("id", r.rawId); if (error) return setMsg(error.message);
    }
    await loadTrades();
  }

  // ─────────────────────── Style constants ───────────────────────
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const inpR = `${inp} text-right tabular-nums`;
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn = "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill = "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";
  const qtyBadge = "shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-slate-900 px-2 py-1 text-[11px] font-extrabold text-white";
  const miniBtn = "rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] hover:bg-slate-50 active:bg-slate-100";
  const lineGridCols = "grid-cols-[180px_minmax(0,1fr)_120px_110px_130px_120px_120px_130px_44px]";
  const targetLabel = selectedPartner ? selectedPartner.name : "전체";

  // ─── Datalists (shared) ───
  const Datalists = () => (
    <>
      <datalist id="food-types-list">{foodTypes.map((ft) => <option key={ft.id} value={ft.name} />)}</datalist>
      <datalist id="preset-products-list">{presetProducts.map((p) => <option key={p.id} value={p.product_name} />)}</datalist>
      <datalist id="master-product-list">{masterProducts.map((p) => <option key={p.product_name} value={p.product_name} />)}</datalist>
    </>
  );

  // ─── Partner type select ───
  const PartnerTypeSelect = ({ value, onChange }: { value: PartnerType; onChange: (v: PartnerType) => void }) => (
    <select className={inp} value={value} onChange={(e) => onChange(e.target.value as any)}>
      <option value="CUSTOMER">매출처(CUSTOMER)</option>
      <option value="VENDOR">매입처(VENDOR)</option>
      <option value="BOTH">둘다(BOTH)</option>
    </select>
  );

  // ─────────────────────── RENDER ───────────────────────
  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen">
      <div className="mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6">
        {/* ✅ msg 배너 출력 제거 (alert로 표시) */}

        {/* ──── Partner edit modal ──── */}
        {partnerEditOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-[860px] rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">거래처 수정 · {selectedPartner?.name ?? ""}</div>
                  <div className="mt-1 text-xs text-slate-500">저장하면 즉시 DB에 반영됩니다.</div>
                </div>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => { setPartnerEditOpen(false); setShipHistOpen(false); }}>취소</button>
                  <button className={btnOn} onClick={savePartnerEdit}>저장</button>
                </div>
              </div>
              <div className="px-5 py-4">
                <div className="mb-2 text-sm font-semibold">업체 기본정보</div>
                <div className="space-y-2">
                  <input className={inp} placeholder="업체명(필수)" value={ep_name} onChange={(e) => setEP_name(e.target.value)} />
                  <input className={inp} placeholder="사업자등록번호" value={ep_businessNo} onChange={(e) => setEP_businessNo(e.target.value)} />
                  <PartnerTypeSelect value={ep_partnerType} onChange={setEP_partnerType} />
                  <input className={inp} placeholder="대표자" value={ep_ceo} onChange={(e) => setEP_ceo(e.target.value)} />
                  <input className={inp} placeholder="연락처" value={ep_phone} onChange={(e) => setEP_phone(e.target.value)} />
                  <input className={inp} placeholder="주소" value={ep_address1} onChange={(e) => setEP_address1(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inp} placeholder="업태" value={ep_bizType} onChange={(e) => setEP_bizType(e.target.value)} />
                    <input className={inp} placeholder="종목" value={ep_bizItem} onChange={(e) => setEP_bizItem(e.target.value)} />
                  </div>
                </div>
                <div className="mt-5 mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">배송정보 (변경 이력 저장 / 최근 자료 자동 사용)</div>
                  <button className={btn} onClick={async () => { const next = !shipHistOpen; setShipHistOpen(next); if (next && selectedPartner) await loadShippingHistory5(selectedPartner.id); }}>배송정보 이력(최근 5건)</button>
                </div>
                <div className="space-y-2">
                  <ImeSafeInput
                    className={inp}
                    placeholder="수화주명"
                    value={shipEdit.name}
                    onValueChange={(v) => setShipEdit({ ...shipEdit, name: v })}
                  />
                  <ImeSafeInput
                    className={inp}
                    placeholder="주소1"
                    value={shipEdit.addr}
                    onValueChange={(v) => setShipEdit({ ...shipEdit, addr: v })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <ImeSafeInput
                      className={inp}
                      placeholder="휴대폰"
                      value={shipEdit.mobile}
                      onValueChange={(v) => setShipEdit({ ...shipEdit, mobile: v })}
                    />
                    <ImeSafeInput
                      className={inp}
                      placeholder="전화"
                      value={shipEdit.phone}
                      onValueChange={(v) => setShipEdit({ ...shipEdit, phone: v })}
                    />
                  </div>
                  <div className="text-xs text-slate-500">※ 배송정보가 변경되면 history 테이블에 기록으로 남고, 다음부터는 최근값이 자동으로 사용됩니다.</div>
                </div>
                {shipHistOpen ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">배송정보 이력(최근 5건)</div>
                      <button className={btn} onClick={() => selectedPartner && loadShippingHistory5(selectedPartner.id)}>새로고침</button>
                    </div>
                    {shipHistLoading ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">불러오는 중...</div>
                    ) : shipHist.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">이력이 없습니다.</div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full table-fixed text-sm">
                          <colgroup><col style={{ width: "160px" }} /><col style={{ width: "140px" }} /><col style={{ width: "auto" }} /><col style={{ width: "140px" }} /><col style={{ width: "140px" }} /></colgroup>
                          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                            <tr>{["변경시각", "수화주명", "주소1", "휴대폰", "전화"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
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
                    <div className="mt-2 text-xs text-slate-500">※ "저장"은 현재 입력값을 partners에 저장하고, 값이 바뀌었을 때만 history에 1건 추가됩니다.</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* ──── Memo modal ──── */}
        {memoOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setMemoOpen(false)}>
            <div className="w-full max-w-[860px] rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div><div className="text-base font-semibold">{memoTitle}</div><div className="mt-1 text-xs text-slate-500">바깥 클릭으로 닫기</div></div>
                <button className={btn} onClick={() => setMemoOpen(false)}>닫기</button>
              </div>
              <div className="px-5 py-4"><pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">{memoBody}</pre></div>
            </div>
          </div>
        ) : null}

        {/* ──── Edit modal ──── */}
        {editOpen && editRow ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-[1400px] max-h-[92vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">거래내역 수정 · {editRow.kind === "ORDER" ? "주문/출고" : "금전출납"} · {editRow.partnerName}</div>
                  <div className="mt-1 text-xs text-slate-500">저장하면 즉시 DB에 반영됩니다.</div>
                </div>
                <div className="flex gap-2"><button className={btn} onClick={() => setEditOpen(false)}>취소</button><button className={btnOn} onClick={saveEdit}>저장</button></div>
              </div>
              <div className="px-5 py-4 overflow-y-auto">
                {editRow.kind === "ORDER" ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div><div className="mb-1 text-xs text-slate-600">출고일(주문일)</div><input type="date" className={inp} value={eShipDate} onChange={(e) => setEShipDate(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-600">주문자</div><input className={inp} value={eOrdererName} onChange={(e) => setEOrdererName(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-600">출고방법</div>
                        <select className={inp} value={eShipMethod} onChange={(e) => setEShipMethod(e.target.value)}>
                          {["택배", "퀵-신용", "퀵-착불", "방문", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div><div className="mb-1 text-xs text-slate-600">메모(title)</div><input className={inp} value={eOrderTitle} onChange={(e) => setEOrderTitle(e.target.value)} /></div>
                    </div>
                    <ShipBlock s1={eShip1} setS1={setEShip1} s2={eShip2} setS2={setEShip2} two={eTwoShip} setTwo={setETwoShip} prefix={`edit_${editRow.rawId}`} inpClass={inp} />
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm font-semibold">품목</div>
                      <div className="flex items-center gap-2">
                        <button className={btn} onClick={() => insertEditShippingFee(3300)}>+ 택배비 3,300</button>
                        <button className={btn} onClick={() => insertEditShippingFee(4000)}>+ 택배비 4,000</button>
                        <button className={btn} onClick={addEditLine}>+ 품목 추가</button>
                      </div>
                    </div>
                    <LineHeader gridCols={lineGridCols} />
                    <div className="mt-2 space-y-2">
                      {eLines.map((l, i) => <LineRow key={i} l={l} i={i} onUpdate={updateEditLine} onRemove={removeEditLine} masterByName={masterByName} inputCls={inp} inputRightCls={inpR} btnCls={btn} gridCols={lineGridCols} qtyBadgeCls={qtyBadge} />)}
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-4 text-sm">
                      <div>공급가 {fmt(editOrderTotals.supply)}</div><div>부가세 {fmt(editOrderTotals.vat)}</div><div className="font-semibold">총액 {fmt(editOrderTotals.total)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div><div className="mb-1 text-xs text-slate-600">일자</div><input type="date" className={inp} value={eEntryDate} onChange={(e) => setEEntryDate(e.target.value)} /></div>
                      <div><div className="mb-1 text-slate-600 text-xs">결제수단</div>
                        <select className={inp} value={ePayMethod} onChange={(e) => setEPayMethod(e.target.value as any)}>
                          {[["BANK", "입금"], ["CASH", "현금"], ["CARD", "카드"], ["ETC", "기타"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div><div className="mb-1 text-xs text-slate-600">카테고리</div><div className="flex flex-wrap gap-2">{CATEGORIES.map((c) => <button key={c} type="button" className={eCategory === c ? btnOn : btn} onClick={() => setECategory(c)}>{c}</button>)}</div></div>
                      <div>
                        <div className="mb-1 text-xs text-slate-600">금액(원)</div>
                        <input className={inpR} inputMode="numeric" value={eAmountStr} onChange={(e) => setEAmountStr(e.target.value.replace(/[^\d,]/g, ""))} onBlur={() => { const n = Number((eAmountStr || "0").replaceAll(",", "")); if (Number.isFinite(n) && n > 0) setEAmountStr(n.toLocaleString("ko-KR")); }} />
                        <div className="mt-2 flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" checked={eVatFree} onChange={(e) => setEVatFree(e.target.checked)} />
                            부가세 없음(총액=공급가)
                          </label>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <div className="mb-1 text-xs text-slate-600">공급가</div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{editLedgerSplit.total ? fmt(editLedgerSplit.supply) : ""}</div>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-slate-600">부가세</div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{editLedgerSplit.total ? fmt(editLedgerSplit.vat) : ""}</div>
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">※ 금액(총액)을 입력하면 공급가/부가세(10%)가 자동 분리됩니다. (부가세 없음 체크 시 총액=공급가)</div>
                      </div>
                      <div><div className="mb-1 text-xs text-slate-600">업체명(매입처/상대방)</div><input className={inp} value={eCounterpartyName} onChange={(e) => setECounterpartyName(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-600">사업자등록번호</div><input className={inp} value={eBusinessNo} onChange={(e) => setEBusinessNo(e.target.value)} /></div>
                      <div className="md:col-span-3"><div className="mb-1 text-xs text-slate-600">메모</div><input className={inp} value={eLedgerMemo} onChange={(e) => setELedgerMemo(e.target.value)} /></div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">※ 방향(IN/OUT)은 카테고리로 자동 결정됩니다.</div>
                  </>
                )}
              </div>
              <Datalists />
            </div>
          </div>
        ) : null}

        {/* ──── Main layout ──── */}
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* LEFT: Partners */}
          <div className={`${card} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">거래처</div>
              <div className="flex gap-2">
                <button className={btn} onClick={() => { setShowPartnerForm((v) => !v); setMsg(null); }}>+ 등록</button>
                <button className={btn} onClick={openPartnerEdit} title={selectedPartner ? "선택된 거래처 수정" : "거래처를 먼저 선택하세요"}>수정</button>
                <button className={btn} onClick={loadPartners}>새로고침</button>
              </div>
            </div>
            <div className="mb-3 flex gap-2">
              {(["PINNED", "RECENT", "ALL"] as PartnerView[]).map((v) => {
                const labels: Record<PartnerView, string> = { PINNED: "즐겨찾기", RECENT: "최근", ALL: "전체" };
                return <button key={v} className={partnerView === v ? btnOn : btn} onClick={() => setPartnerView(v)}>{labels[v]}</button>;
              })}
            </div>
            {showPartnerForm ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-sm font-semibold">거래처 등록</div>
                <div className="space-y-2">
                  <input className={inp} placeholder="업체명(필수)" value={p_name} onChange={(e) => setP_name(e.target.value)} />
                  <input className={inp} placeholder="사업자등록번호" value={p_businessNo} onChange={(e) => setP_businessNo(e.target.value)} />
                  <PartnerTypeSelect value={p_partnerType} onChange={setP_partnerType} />
                  <input className={inp} placeholder="대표자" value={p_ceo} onChange={(e) => setP_ceo(e.target.value)} />
                  <input className={inp} placeholder="연락처" value={p_phone} onChange={(e) => setP_phone(e.target.value)} />
                  <input className={inp} placeholder="주소" value={p_address1} onChange={(e) => setP_address1(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inp} placeholder="업태" value={p_bizType} onChange={(e) => setP_bizType(e.target.value)} />
                    <input className={inp} placeholder="종목" value={p_bizItem} onChange={(e) => setP_bizItem(e.target.value)} />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button className={`${btn} flex-1`} onClick={() => { setShowPartnerForm(false); resetPartnerForm(); }}>취소</button>
                    <button className={`${btnOn} flex-1`} onClick={createPartner}>저장</button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ✅ 거래처 목록 키워드 입력 시, 거래내역 검색어(tradeSearch) 초기화 */}
            <input
              className={`${inp} mb-3`}
              placeholder="목록 필터(이름/사업자번호)"
              value={partnerFilter}
              onChange={(e) => {
                setTradeSearch("");
                setPartnerFilter(e.target.value);
              }}
            />

            <div className="mb-2 text-xs text-slate-600">선택된 거래처: {selectedPartner ? `${selectedPartner.name}${selectedPartner.business_no ? ` · ${selectedPartner.business_no}` : ""}` : "없음"}</div>
            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {partnersToShow.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">표시할 거래처가 없습니다.</div>
              ) : partnersToShow.map((p) => {
                const active = selectedPartner?.id === p.id;
                return (
                  <div key={p.id} className={`flex items-stretch gap-2 rounded-2xl border ${active ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <button className="flex-1 rounded-2xl px-3 py-3 text-left" onClick={() => selectPartner(p)}>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.business_no ?? ""}</div>
                    </button>
                    <button type="button" className="mr-2 my-2 w-10 rounded-xl border border-slate-200 bg-white text-lg hover:bg-slate-50" title={p.is_pinned ? "즐겨찾기 해제" : "즐겨찾기 등록"} onClick={(e) => { e.stopPropagation(); togglePinned(p); }}>
                      {p.is_pinned ? "★" : "☆"}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button className={`${btn} flex-1`} onClick={() => { setSelectedPartner(null); setPartnerFilter(""); }}>선택 해제</button>
              <button className={`${btn} flex-1`} onClick={loadTrades}>조회 갱신</button>
            </div>
          </div>

          {/* RIGHT */}
          <div className="min-w-0 space-y-6">
            <div className="flex gap-2">
              {(["ORDERS", "LEDGER", "UNIFIED"] as Mode[]).map((m) => {
                const labels: Record<Mode, string> = { ORDERS: "주문/출고", LEDGER: "금전출납", UNIFIED: "통합" };
                return <button key={m} className={mode === m ? btnOn : btn} onClick={() => setMode(m)}>{labels[m]}</button>;
              })}
            </div>

            {/* ── Order input ── */}
            {mode !== "LEDGER" ? (
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center gap-3"><div className="text-lg font-semibold">주문/출고 입력</div><span className={pill}>조회대상: {targetLabel}</span></div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div><div className="mb-1 text-xs text-slate-600">출고일(주문일)</div><input type="date" className={inp} value={shipDate} onChange={(e) => setShipDate(e.target.value)} /></div>
                  <div><div className="mb-1 text-xs text-slate-600">주문자</div><input className={inp} value={ordererName} onChange={(e) => setOrdererName(e.target.value)} /></div>
                  <div><div className="mb-1 text-xs text-slate-600">출고방법</div>
                    <select className={inp} value={shipMethod} onChange={(e) => setShipMethod(e.target.value)}>
                      {["택배", "퀵-신용", "퀵-착불", "방문", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div><div className="mb-1 text-xs text-slate-600">메모(title)</div><input className={inp} value={orderTitle} onChange={(e) => setOrderTitle(e.target.value)} /></div>
                </div>
                <ShipBlock s1={ship1} setS1={setShip1} s2={ship2} setS2={setShip2} two={twoShip} setTwo={setTwoShip} prefix="create" inpClass={inp} />
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm font-semibold">품목(식품유형 자동완성 포함)</div>
                  <div className="flex items-center gap-2">
                    <button className={btn} onClick={() => insertShippingFee(3300)}>+ 택배비 3,300</button>
                    <button className={btn} onClick={() => insertShippingFee(4000)}>+ 택배비 4,000</button>
                    <button className={btn} onClick={addLine}>+ 품목 추가</button>
                  </div>
                </div>
                <LineHeader gridCols={lineGridCols} />
                <div className="mt-2 space-y-2">
                  {lines.map((l, i) => <LineRow key={i} l={l} i={i} onUpdate={updateLine} onRemove={removeLine} masterByName={masterByName} inputCls={inp} inputRightCls={inpR} btnCls={btn} gridCols={lineGridCols} qtyBadgeCls={qtyBadge} />)}
                </div>
                <Datalists />
                <div className="mt-4 flex items-center justify-end gap-4 text-sm">
                  <div>공급가 {fmt(orderTotals.supply)}</div><div>부가세 {fmt(orderTotals.vat)}</div>
                  <div className="font-semibold">총액 {fmt(orderTotals.total)}</div>
                  <button className={btnOn} onClick={createOrder}>주문/출고 생성</button>
                </div>
              </div>
            ) : null}

            {/* ── Ledger input ── */}
            {mode !== "ORDERS" ? (
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center gap-3"><div className="text-lg font-semibold">금전출납 입력</div><span className={pill}>조회대상: {targetLabel}</span></div>
                <div className="mb-2 flex items-center justify-end">
                  <div className="text-sm text-slate-600">방향: <span className="font-semibold">{categoryToDirection(category) === "IN" ? "입금(+)" : "출금(-)"}</span><span className="ml-2 text-xs text-slate-500">(카테고리로 자동)</span></div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div><div className="mb-1 text-xs text-slate-600">일자</div><input type="date" className={inp} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></div>
                  <div><div className="mb-1 text-xs text-slate-600">결제수단</div>
                    <select className={inp} value={payMethod} onChange={(e) => setPayMethod(e.target.value as any)}>
                      {[["BANK", "입금"], ["CASH", "현금"], ["CARD", "카드"], ["ETC", "기타"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div><div className="mb-1 text-xs text-slate-600">카테고리</div><div className="flex flex-wrap gap-2">{CATEGORIES.map((c) => <button key={c} type="button" className={category === c ? btnOn : btn} onClick={() => setCategory(c)}>{c}</button>)}</div></div>
                  <div>
                    <div className="mb-1 text-xs text-slate-600">금액(원)</div>
                    <input className={inpR} inputMode="numeric" value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(/[^\d,]/g, ""))} onBlur={() => { const n = Number((amountStr || "0").replaceAll(",", "")); if (Number.isFinite(n) && n > 0) setAmountStr(n.toLocaleString("ko-KR")); }} />
                    <div className="mt-2 flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={vatFree} onChange={(e) => setVatFree(e.target.checked)} />
                        부가세 없음(총액=공급가)
                      </label>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1 text-xs text-slate-600">공급가</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{ledgerSplit.total ? fmt(ledgerSplit.supply) : ""}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-slate-600">부가세</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{ledgerSplit.total ? fmt(ledgerSplit.vat) : ""}</div>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">※ 금액(총액)을 입력하면 공급가/부가세(10%)가 자동 분리됩니다. (부가세 없음 체크 시 총액=공급가)</div>
                  </div>
                  <div><div className="mb-1 text-xs text-slate-600">업체명(매입처/상대방)</div><input className={inp} value={manualCounterpartyName} onChange={(e) => setManualCounterpartyName(e.target.value)} placeholder="예: 쿠팡 / 이마트 / 네이버페이 / ㅇㅇ상사" /></div>
                  <div><div className="mb-1 text-xs text-slate-600">사업자등록번호</div><input className={inp} value={manualBusinessNo} onChange={(e) => setManualBusinessNo(e.target.value)} placeholder="예: 123-45-67890" /></div>
                  <div className="md:col-span-3"><div className="mb-1 text-xs text-slate-600">메모</div><input className={inp} value={ledgerMemo} onChange={(e) => setLedgerMemo(e.target.value)} /></div>
                </div>
                <div className="mt-4 flex justify-end"><button className={btnOn} onClick={createLedger}>금전출납 기록</button></div>
              </div>
            ) : null}

            {/* ── Trade history ── */}
            <div className={`${card} p-4`}>
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-lg font-semibold">거래내역</div>
                  <div className="mt-2"><span className={pill}>조회대상: {targetLabel}</span></div>
                  <div className="mt-2 text-xs text-slate-600">표시: {mode === "ORDERS" ? "주문/출고" : mode === "LEDGER" ? "금전출납" : "통합"}{includeOpening ? " · 기초잔액 포함" : ""}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-sm">
                  <div className="text-xs text-slate-600">기간 시작 전 기초잔액</div>
                  <div className="font-semibold tabular-nums">{fmt(openingBalance)}</div>
                  <div className="mt-2">
                    <div className="text-xs text-slate-600">입금 {fmt(unifiedTotals.plus)} · 출금 {fmt(unifiedTotals.minus)}</div>
                    <div className="text-sm font-semibold tabular-nums">잔액(최신) {fmt(unifiedTotals.endBalance)}</div>
                  </div>
                </div>
              </div>
              <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div><div className="mb-1 text-xs text-slate-600">From</div><input type="date" className={inp} value={fromYMD} onChange={(e) => setFromYMD(e.target.value)} /></div>
                <div><div className="mb-1 text-xs text-slate-600">To</div><input type="date" className={inp} value={toYMD} onChange={(e) => { setToTouched(true); setToYMD(e.target.value); }} /></div>
                <div className="flex flex-wrap gap-2">
                  <button className={btn} onClick={() => { setFromYMD(addDays(todayYMD(), -30)); setToYMD(todayYMD()); setToTouched(false); }}>기간 초기화</button>
                  <button className={btnOn} onClick={loadTrades}>조회</button>
                  <button className={includeOpening ? btnOn : btn} onClick={() => setIncludeOpening((v) => !v)} title="기간 시작 전 기초잔액을 러닝잔액에 포함">기초잔액 포함 러닝잔액</button>
                </div>
              </div>
              <div className="mb-3"><input className={inp} value={tradeSearch} onChange={(e) => setTradeSearch(e.target.value)} placeholder="검색: 매입처/사업자번호/메모(제품명)/품목명/카테고리/방법" /></div>

              <div className="rounded-2xl border border-slate-200">
                <div ref={tradeTopScrollRef} className="overflow-x-auto"
                  onScroll={(e) => { const top = e.currentTarget, bottom = tradeBottomScrollRef.current; if (!bottom || tradeSyncingRef.current === "BOTTOM") return; tradeSyncingRef.current = "TOP"; bottom.scrollLeft = top.scrollLeft; tradeSyncingRef.current = null; }}>
                  <div style={{ width: TRADE_TABLE_MIN_WIDTH, height: 1 }} />
                </div>

                {/* ✅ (3) 줄간격 축소 + 15줄 보이도록 */}
                <div ref={tradeBottomScrollRef} className="max-h-[680px] overflow-x-auto overflow-y-auto"
                  onScroll={(e) => { const bottom = e.currentTarget, top = tradeTopScrollRef.current; if (!top || tradeSyncingRef.current === "TOP") return; tradeSyncingRef.current = "BOTTOM"; top.scrollLeft = bottom.scrollLeft; tradeSyncingRef.current = null; }}>
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: "110px" }} />
                      <col style={{ width: "180px" }} />
                      <col style={{ width: "140px" }} />
                      <col style={{ width: "220px" }} />
                      <col style={{ width: "120px" }} />
                      <col style={{ width: "90px" }} />
                      <col style={{ width: "110px" }} />
                      <col style={{ width: "110px" }} />
                      <col style={{ width: "130px" }} />
                      <col style={{ width: "220px" }} />
                    </colgroup>
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">날짜</th>
                        <th className="px-3 py-2 text-left">거래처</th>
                        <th className="px-3 py-2 text-left">주문자</th>
                        <th className="px-3 py-2 text-left">적요</th>
                        <th className="px-3 py-2 text-left">카테고리</th>
                        <th className="px-3 py-2 text-left">방법</th>
                        <th className="sticky right-[460px] z-20 bg-slate-50 px-3 py-2 text-right">입금</th>
                        <th className="sticky right-[350px] z-20 bg-slate-50 px-3 py-2 text-right">출금</th>
                        <th className="sticky right-[220px] z-20 bg-slate-50 px-3 py-2 text-right">잔액</th>
                        <th className="sticky right-0 z-30 bg-slate-50 px-3 py-2 text-center" title="복사/메모/수정/삭제">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unifiedRows.filter((x) => {
                        if (mode === "ORDERS") return x.kind === "ORDER";
                        if (mode === "LEDGER") return x.kind === "LEDGER";
                        return true;
                      }).filter((x) => {
                        const q = tradeSearch.trim().toLowerCase();
                        if (!q) return true;
                        const orderLineText = x.kind === "ORDER" ? (x.order_lines ?? []).map((l) => `${l.name ?? ""} ${l.food_type ?? ""}`).join(" ") : "";
                        const summaryText = buildOrderSummaryText(x);
                        return [x.partnerName, x.businessNo ?? "", x.ordererName, summaryText, x.category, x.method, x.order_title ?? "", x.ledger_memo ?? "", orderLineText].filter(Boolean).join(" ").toLowerCase().includes(q);
                      }).map((x) => (
                        <tr key={`${x.kind}-${x.rawId}`} className="border-t border-slate-200 bg-white">
                          <td className="px-3 py-1 font-semibold tabular-nums leading-tight">{x.date}</td>
                          <td className="px-3 py-1 font-semibold leading-tight">{x.partnerName}</td>
                          <td className="px-3 py-1 font-semibold leading-tight">{x.ordererName}</td>
                          <td className="px-3 py-1 font-semibold leading-tight">{buildOrderSummaryText(x)}</td>
                          <td className="px-3 py-1 font-semibold leading-tight">{x.category}</td>
                          <td className="px-3 py-1 font-semibold leading-tight">{x.kind === "LEDGER" ? methodLabel(x.method) : x.method}</td>
                          <td className="sticky right-[460px] z-10 bg-white px-3 py-1 text-right tabular-nums font-semibold text-blue-700 leading-tight">{x.inAmt ? fmt(x.inAmt) : ""}</td>
                          <td className="sticky right-[350px] z-10 bg-white px-3 py-1 text-right tabular-nums font-semibold text-red-600 leading-tight">{x.outAmt ? fmt(x.outAmt) : ""}</td>
                          <td className="sticky right-[220px] z-10 bg-white px-3 py-1 text-right tabular-nums font-semibold leading-tight">{fmt(x.balance)}</td>
                          <td className="sticky right-0 z-20 bg-white px-2 py-1">
                            <div className="grid grid-cols-2 gap-1">
                              <button className={miniBtn} onClick={() => onCopyClick(x)}>복사</button>
                              <button className={miniBtn} onClick={() => onMemoClick(x)}>메모</button>
                              <button className={miniBtn} onClick={() => openEdit(x)}>수정</button>
                              <button className={miniBtn} onClick={() => deleteTradeRow(x)}>삭제</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {unifiedRows.length === 0 ? (
                        <tr><td colSpan={10} className="bg-white px-4 py-4 text-sm text-slate-500">거래내역이 없습니다. (기간/거래처/모드 필터를 확인하세요)</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">※ 주문/출고는 출금으로 표시됩니다. (입금/출금은 모두 양수 입력, 계산에서만 차감 처리)</div>
            </div>
          </div>
        </div>

        {showTopBtn ? (
          <button type="button" className="fixed bottom-6 right-6 z-50 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold shadow-lg hover:bg-slate-50 active:bg-slate-100" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="맨 위로">TOP</button>
        ) : null}
      </div>
    </div>
  );
}