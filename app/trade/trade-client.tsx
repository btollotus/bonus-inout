"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

type OrderShipmentRow = {
  id: string;
  order_id: string;
  seq: number; // 1 or 2
  ship_to_name: string;
  ship_to_address1: string;
  ship_to_address2: string | null;
  ship_to_mobile: string | null;
  ship_to_phone: string | null;
  ship_zipcode: string | null;
  delivery_message: string | null;
  created_at: string;
  updated_at: string;
};

type OrderLineRow = {
  id: string;
  order_id: string;
  line_no: number | null;

  food_type: string | null;
  name: string;
  weight_g: number | string | null;

  qty: number;
  unit: number;

  unit_type: "EA" | "BOX" | string;
  pack_ea: number;
  actual_ea: number;

  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;

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

  // ✅ order_lines 테이블 분리 (정석 구조)
  order_lines?: OrderLineRow[];

  // ✅ 주문별 배송지 스냅샷(1~2곳)
  order_shipments?: OrderShipmentRow[];
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

// ✅ product_master + variant 기반(TradeClient 자동완성용 뷰)
type MasterProductRow = {
  product_name: string;
  food_type: string | null;
  report_no: string | null;
  weight_g: number | null;
  unit_type: "EA" | "BOX" | string | null;
  pack_ea: number | null;
  barcode: string | null;
};

type Line = {
  food_type: string;
  name: string;
  weight_g: number | string; // ✅ 소수점 + 중간입력 허용
  qty: number;
  unit: number | string; // ✅ 마이너스/중간입력("-") 허용
  total_incl_vat: number | string; // ✅ 마이너스/중간입력("-") 허용
};

type UnifiedRow = {
  kind: "ORDER" | "LEDGER";
  date: string;
  tsKey: string;
  partnerName: string;
  ordererName: string; // ✅ 표의 "주문자"
  category: string; // 표의 "카테고리"
  method: string; // 표의 "방법"
  inAmt: number;
  outAmt: number;
  balance: number;
  rawId: string;

  // ✅ 검색/편집용 추가
  businessNo?: string; // 사업자번호(검색/표시용)
  ledger_partner_id?: string | null; // ledger 수정 저장 시 유지용

  // 복사용(주문)
  ship_method?: string;
  order_title?: string | null;
  orderer_name?: string | null; // ✅ 주문자(저장/복사용)
  order_lines?: Array<{
    food_type?: string;
    name: string;
    weight_g?: number;
    qty: number;
    unit: number;
    total_amount?: number; // ✅ DB의 품목 총액(부가세 포함)

    // ✅ order_lines 분리 구조용(쇼핑몰 BOX 지원)
    unit_type?: "EA" | "BOX" | string;
    pack_ea?: number;
    actual_ea?: number;
  }>;

  // ✅ 주문별 배송지(메모/편집용)
  order_shipments?: Array<{
    seq: number;
    ship_to_name: string;
    ship_to_address1: string;
    ship_to_address2?: string | null;
    ship_to_mobile?: string | null;
    ship_to_phone?: string | null;
    ship_zipcode?: string | null;
    delivery_message?: string | null;
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

// ✅ (추가) 부호(마이너스) 허용 정수 파싱: "-1,234" 지원
function toIntSigned(n: any) {
  const s = String(n ?? "").replaceAll(",", "").trim();
  if (!s || s === "-") return 0;
  const v = Number(s);
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}

// ✅ (추가) 입력 중간값 허용(숫자/콤마/선행 - 만 허용)
function sanitizeSignedIntInput(raw: string) {
  let v = raw.replace(/[^\d,-]/g, "");
  v = v.replace(/(?!^)-/g, ""); // 선행 '-'만 허용
  return v;
}

// ✅ (추가) 소수점 입력 중간값 허용(무게용): 숫자/콤마/점만 허용, 점 1개만
function sanitizeDecimalInput(raw: string) {
  let v = raw.replace(/[^\d.,]/g, "");
  // 콤마는 그대로 두되, 점은 1개만 허용
  const firstDot = v.indexOf(".");
  if (firstDot >= 0) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replaceAll(".", "");
  }
  return v;
}

// ✅ 소수점 숫자 파싱 (무게용) : "2.8", "1,234.56" 지원
function toNum(n: any) {
  const s = String(n ?? "").replaceAll(",", "").trim();
  if (!s) return 0;
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
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

// ✅ 품목 1줄 계산 (단가 방식 or 총액(부가세포함) 방식)
function calcLineAmounts(qtyRaw: any, unitRaw: any, totalInclVatRaw: any) {
  const qty = toInt(qtyRaw);
  const unit = toIntSigned(unitRaw);
  const totalInclVat = toIntSigned(totalInclVatRaw);

  // ✅ (수정) 단가 방식은 qty 필요 / 총액 방식은 qty가 0이어도 공급가/부가세 분리 표시
  if (unit !== 0) {
    if (qty <= 0) return { supply: 0, vat: 0, total: 0 };
    const supply = qty * unit;
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    return { supply, vat, total };
  }

  // 총액(부가세 포함) 입력 방식
  if (totalInclVat !== 0) {
    const supply = Math.round(totalInclVat / 1.1);
    const vat = totalInclVat - supply;
    const total = totalInclVat;
    return { supply, vat, total };
  }

  return { supply: 0, vat: 0, total: 0 };
}

function methodLabel(m: any) {
  const v = String(m ?? "").trim();
  if (v === "BANK") return "입금";
  if (v === "CASH") return "현금";
  if (v === "CARD") return "카드";
  if (v === "ETC") return "기타";
  return v;
}

function buildMemoText(r: UnifiedRow) {
  if (r.kind === "ORDER") {
    const title = r.order_title ?? "";
    const orderer = r.orderer_name ?? "";
    const lines = r.order_lines ?? [];

    const shipList = (r.order_shipments ?? [])
      .slice()
      .sort((a, b) => (a.seq ?? 1) - (b.seq ?? 1))
      .map((s) => {
        const msg = String(s.delivery_message ?? "").trim();
        const mobile = String(s.ship_to_mobile ?? "").trim();
        const phone = String(s.ship_to_phone ?? "").trim();
        return `- 배송지${s.seq}: ${s.ship_to_name}
  주소: ${s.ship_to_address1}
  연락처: ${mobile || "-"} / ${phone || "-"}${msg ? `\n  요청사항: ${msg}` : ""}`;
      })
      .join("\n");

    const rows = lines
      .map((l, idx) => {
        const qty = Number(l.qty ?? 0);
        const unit = Number(l.unit ?? 0);
        const totalAmount = Number(l.total_amount ?? 0);

        let supply = 0;
        let vat = 0;
        let total = 0;

        if (unit !== 0) {
          supply = qty * unit;
          vat = Math.round(supply * 0.1);
          total = supply + vat;
        } else if (totalAmount !== 0) {
          total = totalAmount;
          supply = Math.round(total / 1.1);
          vat = total - supply;
        }

        const ft = String(l.food_type ?? "").trim();
        const name = String(l.name ?? "").trim();
        const w = Number(l.weight_g ?? 0);

        const unitType = String(l.unit_type ?? "EA");
        const packEa = Number(l.pack_ea ?? 1);
        const actualEa = Number(l.actual_ea ?? (unitType === "BOX" ? qty * packEa : qty));

        const qtyText =
          unitType === "BOX"
            ? `박스 ${formatMoney(qty)} (입수 ${formatMoney(packEa)} / 실제 ${formatMoney(actualEa)}ea)`
            : `수량 ${formatMoney(qty)}`;

        const unitText = unit !== 0 ? `단가 ${formatMoney(unit)}` : `총액입력 ${formatMoney(total)}`;

        return `${idx + 1}. ${ft ? `[${ft}] ` : ""}${name} / ${w ? `${formatWeight(w)}g, ` : ""}${qtyText} / ${unitText} / 공급가 ${formatMoney(
          supply
        )} / 부가세 ${formatMoney(vat)} / 총액 ${formatMoney(total)}`;
      })
      .join("\n");

    return `주문/출고 메모
- 출고방법: ${r.ship_method ?? ""}
- 주문자: ${orderer || "(없음)"}
- 제목: ${title || "(없음)"}

배송정보:
${shipList || "(배송정보 없음)"}

품목:
${rows || "(품목 없음)"}`;
  }

  const memo = (r.ledger_memo ?? "").trim();
  const cat = r.ledger_category ?? r.category ?? "";
  const method = methodLabel(r.ledger_method ?? r.method ?? "");
  const amt = Number(r.ledger_amount ?? 0);
  return `금전출납 메모\n- 카테고리: ${cat}\n- 결제수단: ${method}\n- 금액: ${formatMoney(amt)}\n\n메모:\n${memo || "(없음)"}`;
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

// ✅ (추가) partner_type 옵션
const PARTNER_TYPES = ["CUSTOMER", "VENDOR", "BOTH"] as const;
type PartnerType = (typeof PARTNER_TYPES)[number];

export default function TradeClient() {
  const supabase = useMemo(() => createClient(), []);

  const [msg, setMsg] = useState<string | null>(null);

  // ✅ TOP 버튼 표시
  const [showTopBtn, setShowTopBtn] = useState(false);

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
  const [p_partnerType, setP_partnerType] = useState<PartnerType>("CUSTOMER"); // ✅ 추가

  // ✅ 거래처 수정(모달)
  const [partnerEditOpen, setPartnerEditOpen] = useState(false);
  const [ep_name, setEP_name] = useState("");
  const [ep_businessNo, setEP_businessNo] = useState("");
  const [ep_ceo, setEP_ceo] = useState("");
  const [ep_phone, setEP_phone] = useState("");
  const [ep_address1, setEP_address1] = useState("");
  const [ep_bizType, setEP_bizType] = useState("");
  const [ep_bizItem, setEP_bizItem] = useState("");
  const [ep_partnerType, setEP_partnerType] = useState<PartnerType>("CUSTOMER"); // ✅ 추가

  // ✅ 배송정보(최근값) 편집 (거래처)
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

  // ✅ 마스터 품목(TradeClient 자동완성: v_tradeclient_products)
  const [masterProducts, setMasterProducts] = useState<MasterProductRow[]>([]);

  const masterByName = useMemo(() => {
    const map = new Map<string, MasterProductRow>();
    for (const p of masterProducts) map.set(p.product_name, p);
    return map;
  }, [masterProducts]);

  // 주문/출고 입력
  const [shipDate, setShipDate] = useState(todayYMD());
  const [ordererName, setOrdererName] = useState(""); // ✅ 주문자
  const [shipMethod, setShipMethod] = useState("택배");
  const [orderTitle, setOrderTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);

  // ✅ 주문별 배송정보(스냅샷) - 1~2곳
  const [shipToName1, setShipToName1] = useState("");
  const [shipToAddr1_1, setShipToAddr1_1] = useState("");
  const [shipToMobile1, setShipToMobile1] = useState("");
  const [shipToPhone1, setShipToPhone1] = useState("");
  const [deliveryMsg1, setDeliveryMsg1] = useState("");

  const [twoShip, setTwoShip] = useState(false);

  const [shipToName2, setShipToName2] = useState("");
  const [shipToAddr1_2, setShipToAddr1_2] = useState("");
  const [shipToMobile2, setShipToMobile2] = useState("");
  const [shipToPhone2, setShipToPhone2] = useState("");
  const [deliveryMsg2, setDeliveryMsg2] = useState("");

  // 금전출납 입력
  const [entryDate, setEntryDate] = useState(todayYMD());
  const [payMethod, setPayMethod] = useState<"BANK" | "CASH" | "CARD" | "ETC">("BANK");
  const [category, setCategory] = useState<Category>("매출입금");
  const [amountStr, setAmountStr] = useState("");
  const [ledgerMemo, setLedgerMemo] = useState("");

  // ✅ 금전출납: 거래처 미등록 매입처 수기 입력
  const [manualCounterpartyName, setManualCounterpartyName] = useState("");
  const [manualBusinessNo, setManualBusinessNo] = useState("");

  // ✅ (추가) 날짜 동기화(주문/출고 ↔ 금전출납)
  const syncDateRef = useRef<"SHIP" | "ENTRY" | null>(null);
  useEffect(() => {
    if (syncDateRef.current === "ENTRY") {
      syncDateRef.current = null;
      return;
    }
    syncDateRef.current = "SHIP";
    setEntryDate(shipDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipDate]);
  useEffect(() => {
    if (syncDateRef.current === "SHIP") {
      syncDateRef.current = null;
      return;
    }
    syncDateRef.current = "ENTRY";
    setShipDate(entryDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDate]);

  // 조회기간/데이터
  const [fromYMD, setFromYMD] = useState(addDays(todayYMD(), -30));
  const [toYMD, setToYMD] = useState(todayYMD());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);

  // ✅ 기초잔액 포함 러닝잔액
  const [includeOpening, setIncludeOpening] = useState(true);
  const [openingBalance, setOpeningBalance] = useState(0);

  // ✅ 거래내역 검색(매입 내용/제품 등)
  const [tradeSearch, setTradeSearch] = useState("");

  // ✅ 메모 보기(팝업)
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoTitle, setMemoTitle] = useState("");
  const [memoBody, setMemoBody] = useState("");

  // ✅ 수정(팝업)
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<UnifiedRow | null>(null);

  // 주문 수정용
  const [eShipDate, setEShipDate] = useState(todayYMD());
  const [eOrdererName, setEOrdererName] = useState(""); // ✅ 주문자(수정)
  const [eShipMethod, setEShipMethod] = useState("택배");
  const [eOrderTitle, setEOrderTitle] = useState("");
  const [eLines, setELines] = useState<Line[]>([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);

  // ✅ 주문 수정용 배송지(1~2)
  const [eShipToName1, setEShipToName1] = useState("");
  const [eShipToAddr1_1, setEShipToAddr1_1] = useState("");
  const [eShipToMobile1, setEShipToMobile1] = useState("");
  const [eShipToPhone1, setEShipToPhone1] = useState("");
  const [eDeliveryMsg1, setEDeliveryMsg1] = useState("");

  const [eTwoShip, setETwoShip] = useState(false);

  const [eShipToName2, setEShipToName2] = useState("");
  const [eShipToAddr1_2, setEShipToAddr1_2] = useState("");
  const [eShipToMobile2, setEShipToMobile2] = useState("");
  const [eShipToPhone2, setEShipToPhone2] = useState("");
  const [eDeliveryMsg2, setEDeliveryMsg2] = useState("");

  // 금전출납 수정용
  const [eEntryDate, setEEntryDate] = useState(todayYMD());
  const [ePayMethod, setEPayMethod] = useState<"BANK" | "CASH" | "CARD" | "ETC">("BANK");
  const [eCategory, setECategory] = useState<Category>("매출입금");
  const [eAmountStr, setEAmountStr] = useState("");
  const [eLedgerMemo, setELedgerMemo] = useState("");
  const [eCounterpartyName, setECounterpartyName] = useState("");
  const [eBusinessNo, setEBusinessNo] = useState("");

  // ✅ (A안) 거래내역 상단 가로 스크롤바(크롬/엣지) 동기화용
  const tradeTopScrollRef = useRef<HTMLDivElement | null>(null);
  const tradeBottomScrollRef = useRef<HTMLDivElement | null>(null);
  const tradeSyncingRef = useRef<"TOP" | "BOTTOM" | null>(null);
  const tradeTableMinWidthPx = 1210; // col widths 합계(110+180+140+120+90+110+110+130+220)

  // ✅ (현재 입력폼) 주문/출고 합계
  const orderTotals = useMemo(() => {
    const summed = lines.reduce(
      (acc, l) => {
        const r = calcLineAmounts(l.qty, l.unit, l.total_incl_vat);
        acc.supply += r.supply;
        acc.vat += r.vat;
        acc.total += r.total;
        return acc;
      },
      { supply: 0, vat: 0, total: 0 }
    );
    return summed;
  }, [lines]);

  // ✅ (수정 모달) 주문/출고 합계
  const editOrderTotals = useMemo(() => {
    const summed = eLines.reduce(
      (acc, l) => {
        const r = calcLineAmounts(l.qty, l.unit, l.total_incl_vat);
        acc.supply += r.supply;
        acc.vat += r.vat;
        acc.total += r.total;
        return acc;
      },
      { supply: 0, vat: 0, total: 0 }
    );
    return summed;
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

  // ✅ 쇼핑몰 거래처 판별 (DB 컬럼 추가 전 임시: 이름 기준)
  function isMallPartner(p: PartnerRow | null) {
    const name = String(p?.name ?? "");
    return name.includes("네이버") || name.includes("쿠팡") || name.includes("카카오");
  }

  // ✅ 품목명에서 "(100개)" 같은 박스입수 추출
  function inferPackEaFromName(name: string) {
    const s = String(name ?? "");
    const m = s.match(/(\d+)\s*개/);
    if (!m) return 1;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
  }

  // ✅ 택배비(고정) 품목 자동 삽입
  function insertShippingFee(totalInclVat: number) {
    setLines((prev) => [
      ...prev,
      {
        food_type: "",
        name: "택배비",
        weight_g: 0,
        qty: 1,
        unit: "",
        total_incl_vat: String(totalInclVat),
      },
    ]);
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

  // ✅ v_tradeclient_products 로드 (product_master/variant 기반)
  async function loadMasterProducts() {
    const { data, error } = await supabase
      .from("v_tradeclient_products")
      .select("product_name,food_type,report_no,weight_g,unit_type,pack_ea,barcode")
      .order("product_name", { ascending: true })
      .limit(10000);

    if (error) return;
    setMasterProducts((data ?? []) as MasterProductRow[]);
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

    // ---- 현재 기간 Orders (✅ order_lines + ✅ order_shipments 포함)
    let oq = supabase
      .from("orders")
      .select(
        "id,customer_id,customer_name,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount,created_at,order_lines(id,order_id,line_no,food_type,name,weight_g,qty,unit,unit_type,pack_ea,actual_ea,supply_amount,vat_amount,total_amount,created_at),order_shipments(id,order_id,seq,ship_to_name,ship_to_address1,ship_to_address2,ship_to_mobile,ship_to_phone,ship_zipcode,delivery_message,created_at,updated_at)"
      )
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

    // ---- 현재 기간 Ledgers
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
      oq2 = oq2.or(`customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`);
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
    loadMasterProducts(); // ✅ v_tradeclient_products 로드
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

  // ✅ TOP 버튼 표시/숨김
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      setShowTopBtn(y > 300);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ✅ 거래처 선택 변경 시, 금전출납 수기 입력칸을 선택된 거래처 값으로 초기화
  useEffect(() => {
    setManualCounterpartyName(selectedPartner?.name ?? "");
    setManualBusinessNo(selectedPartner?.business_no ?? "");

    // ✅ 주문/출고 배송정보 기본값: partners.ship_to_* (수화주명/주소/연락처)
    setShipToName1(selectedPartner?.ship_to_name ?? "");
    setShipToAddr1_1(selectedPartner?.ship_to_address1 ?? "");
    setShipToMobile1(selectedPartner?.ship_to_mobile ?? "");
    setShipToPhone1(selectedPartner?.ship_to_phone ?? "");

    // 2곳 배송은 기본 OFF, 2번 배송지는 비움
    setTwoShip(false);
    setShipToName2("");
    setShipToAddr1_2("");
    setShipToMobile2("");
    setShipToPhone2("");
    setDeliveryMsg2("");

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartner?.id]);

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

    const timePart = (iso: string | null | undefined) => {
      const s = String(iso ?? "").trim();
      if (!s) return "";
      const idx = s.indexOf("T");
      if (idx < 0) return "";
      return s.slice(idx + 1); // "HH:mm:ss.sssZ"
    };

    // Orders -> 출금
    for (const o of orders) {
      const memo = safeJsonParse<{ title: string | null; orderer_name?: string | null }>(o.memo);
      const date = o.ship_date ?? (o.created_at ? o.created_at.slice(0, 10) : "");
      const tp = timePart(o.created_at);
      const tsKey = tp ? `${date}T${tp}` : `${date}T12:00:00.000Z`;
      const total = Number(o.total_amount ?? 0);

      const orderer = (memo?.orderer_name ?? null) as string | null;

      items.push({
        kind: "ORDER",
        date,
        tsKey,
        partnerName: o.customer_name ?? "",
        businessNo: "", // (orders에서 사업자번호를 안불러오므로 빈값 유지)
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

    // Ledgers
    for (const l of ledgers) {
      const sign = String(l.direction) === "OUT" ? -1 : 1;
      const amt = Number(l.amount ?? 0);

      const tp = timePart(l.entry_ts) || timePart(l.created_at);
      const tsKey = tp ? `${l.entry_date}T${tp}` : `${l.entry_date}T12:00:00.000Z`;

      items.push({
        kind: "LEDGER",
        date: l.entry_date,
        tsKey: tsKey,
        partnerName: l.counterparty_name ?? "",
        businessNo: l.business_no ?? "",
        ledger_partner_id: l.partner_id ?? null,
        ordererName: "", // ✅ 금전출납은 주문자 없음
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
        businessNo: x.businessNo,
        ledger_partner_id: x.ledger_partner_id ?? null,
        ordererName: x.ordererName,
        category: x.category,
        method: x.method,
        inAmt: x.inAmt,
        outAmt: x.outAmt,
        balance: running,
        rawId: x.rawId,
        ship_method: x.ship_method,
        order_title: x.order_title,
        orderer_name: x.orderer_name,
        order_lines: x.order_lines,
        order_shipments: x.order_shipments,
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

  // ✅ (A안) 거래내역 상단 스크롤바 동기화
  useEffect(() => {
    const top = tradeTopScrollRef.current;
    const bottom = tradeBottomScrollRef.current;
    if (!top || !bottom) return;

    // 최초 동기(현재 위치 유지)
    top.scrollLeft = bottom.scrollLeft;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unifiedRows.length, mode]);

  function resetPartnerForm() {
    setP_name("");
    setP_businessNo("");
    setP_ceo("");
    setP_phone("");
    setP_address1("");
    setP_bizType("");
    setP_bizItem("");
    setP_partnerType("CUSTOMER"); // ✅ 추가
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
      partner_type: p_partnerType, // ✅ 변경(하드코딩 제거)
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
    // ✅ 추가
    const pt = String(selectedPartner.partner_type ?? "CUSTOMER") as any;
    setEP_partnerType(pt === "CUSTOMER" || pt === "VENDOR" || pt === "BOTH" ? pt : "CUSTOMER");

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
      partner_type: ep_partnerType, // ✅ 추가
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
    setLines((prev) => [...prev, { food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  // ====== 수정 모달용 라인 업데이트 ======
  function updateEditLine(i: number, patch: Partial<Line>) {
    setELines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addEditLine() {
    setELines((prev) => [...prev, { food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  }
  function removeEditLine(i: number) {
    setELines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function createOrder() {
    setMsg(null);
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    if (lines.length === 0) return setMsg("품목을 1개 이상 입력하세요.");

    const isMall = isMallPartner(selectedPartner);

    const cleanLines = lines
      .map((l) => {
        const name = l.name.trim();
        const qty = toInt(l.qty);
        const unit = toIntSigned(l.unit);
        const weight_g = toNum(l.weight_g);
        const food_type = (l.food_type || "").trim();

        const unit_type = isMall ? "BOX" : "EA";
        const pack_ea = isMall ? inferPackEaFromName(name) : 1;
        const actual_ea = unit_type === "BOX" ? qty * pack_ea : qty;

        const r = calcLineAmounts(qty, unit, l.total_incl_vat);

        return {
          food_type,
          name,
          weight_g,
          qty,
          unit,
          unit_type,
          pack_ea,
          actual_ea,
          supply_amount: r.supply,
          vat_amount: r.vat,
          total_amount: r.total,
        };
      })
      .filter((l) => l.name && l.qty > 0 && (l.total_amount ?? 0) !== 0);

    if (cleanLines.length === 0) return setMsg("품목명/수량과 (단가 또는 총액)을 올바르게 입력하세요.");

    // ✅ orders.memo에는 헤더만 저장 (lines는 order_lines로 분리)
    const memoObj = {
      title: orderTitle.trim() || null,
      orderer_name: ordererName.trim() || null, // ✅ 주문자 저장
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

    const { data: createdOrder, error: oErr } = await supabase.from("orders").insert(payload).select("id").single();
    if (oErr) return setMsg(oErr.message);

    const orderId = (createdOrder as any)?.id as string;
    if (!orderId) return setMsg("주문 생성 후 ID를 가져오지 못했습니다.");

    // ✅ order_lines insert
    const linePayloads = cleanLines.map((l, idx) => ({
      order_id: orderId,
      line_no: idx + 1,
      food_type: l.food_type || null,
      name: l.name,
      weight_g: l.weight_g || null,
      qty: l.qty,
      unit: l.unit,
      unit_type: l.unit_type,
      pack_ea: l.pack_ea,
      actual_ea: l.actual_ea,
      supply_amount: l.supply_amount,
      vat_amount: l.vat_amount,
      total_amount: l.total_amount,
    }));

    const { error: lErr } = await supabase.from("order_lines").insert(linePayloads);
    if (lErr) return setMsg(lErr.message);

    // ✅ order_shipments insert (1~2곳)  (배송정보 없어도 생성 가능)
    const shipPayloads: any[] = [
      {
        order_id: orderId,
        seq: 1,
        ship_to_name: shipToName1.trim(),
        ship_to_address1: shipToAddr1_1.trim(),
        ship_to_mobile: normText(shipToMobile1),
        ship_to_phone: normText(shipToPhone1),
        delivery_message: normText(deliveryMsg1),
        created_by: null,
      },
    ];

    if (twoShip) {
      shipPayloads.push({
        order_id: orderId,
        seq: 2,
        ship_to_name: shipToName2.trim(),
        ship_to_address1: shipToAddr1_2.trim(),
        ship_to_mobile: normText(shipToMobile2),
        ship_to_phone: normText(shipToPhone2),
        delivery_message: normText(deliveryMsg2),
        created_by: null,
      });
    }

    const { error: sErr } = await supabase.from("order_shipments").insert(shipPayloads);
    if (sErr) return setMsg(sErr.message);

    setOrderTitle("");
    setOrdererName(""); // ✅ 초기화
    setLines([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);

    // ✅ 요청: 주문/출고 생성 후 배송정보 입력창도 초기화
    setShipToName1("");
    setShipToAddr1_1("");
    setShipToMobile1("");
    setShipToPhone1("");
    setDeliveryMsg1("");

    setTwoShip(false);
    setShipToName2("");
    setShipToAddr1_2("");
    setShipToMobile2("");
    setShipToPhone2("");
    setDeliveryMsg2("");

    await loadTrades();
  }

  // ✅ 거래처 선택 필수 제거 + 수기 업체명/사업자번호 저장
  async function createLedger() {
    setMsg(null);

    const amount = Number((amountStr || "0").replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0) return setMsg("금액(원)을 올바르게 입력하세요.");

    const dir = categoryToDirection(category);

    const counterparty_name = manualCounterpartyName.trim() || selectedPartner?.name || null;
    const business_no = manualBusinessNo.trim() || selectedPartner?.business_no || null;

    if (!counterparty_name) {
      return setMsg("업체명(매입처/상대방)을 입력하거나 왼쪽에서 거래처를 선택하세요.");
    }

    const payload: any = {
      entry_date: entryDate,
      entry_ts: new Date().toISOString(),
      direction: dir,
      amount,
      category,
      method: payMethod,
      counterparty_name,
      business_no,
      memo: ledgerMemo.trim() || null,
      status: "POSTED",
      partner_id: selectedPartner?.id ?? null,
    };

    const { error } = await supabase.from("ledger_entries").insert(payload);
    if (error) return setMsg(error.message);

    setAmountStr("");
    setLedgerMemo("");

    // 거래처 미선택 상태에서 수기입력으로 기록한 경우, 다음 입력을 위해 비움
    if (!selectedPartner) {
      setManualCounterpartyName("");
      setManualBusinessNo("");
    }

    await loadTrades();
  }

  // ====== Copy Fill ======
  function fillFromOrderRow(r: UnifiedRow) {
    setMsg(null);
    setMode("ORDERS");

    setShipDate(todayYMD());
    setOrdererName(r.orderer_name ?? r.ordererName ?? ""); // ✅ 주문자 복사
    setShipMethod(r.ship_method ?? "택배");
    setOrderTitle(r.order_title ?? "");

    const nextLines =
      r.order_lines?.length
        ? r.order_lines.map((l) => ({
            food_type: String(l.food_type ?? ""),
            name: String(l.name ?? ""),
            weight_g: Number(l.weight_g ?? 0), // ✅ 소수점 유지
            qty: toInt(l.qty ?? 0),
            unit: Number(l.unit ?? 0),
            total_incl_vat: Number(l.total_amount ?? 0),
          }))
        : [{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }];

    setLines(nextLines);

    // ✅ 배송지 복사(있으면)
    const ships = (r.order_shipments ?? []).slice().sort((a, b) => (a.seq ?? 1) - (b.seq ?? 1));
    const s1 = ships.find((x) => (x.seq ?? 1) === 1);
    const s2 = ships.find((x) => (x.seq ?? 1) === 2);

    if (s1) {
      setShipToName1(String(s1.ship_to_name ?? ""));
      setShipToAddr1_1(String(s1.ship_to_address1 ?? ""));
      setShipToMobile1(String(s1.ship_to_mobile ?? ""));
      setShipToPhone1(String(s1.ship_to_phone ?? ""));
      setDeliveryMsg1(String(s1.delivery_message ?? ""));
    }

    if (s2) {
      setTwoShip(true);
      setShipToName2(String(s2.ship_to_name ?? ""));
      setShipToAddr1_2(String(s2.ship_to_address1 ?? ""));
      setShipToMobile2(String(s2.ship_to_mobile ?? ""));
      setShipToPhone2(String(s2.ship_to_phone ?? ""));
      setDeliveryMsg2(String(s2.delivery_message ?? ""));
    } else {
      setTwoShip(false);
      setShipToName2("");
      setShipToAddr1_2("");
      setShipToMobile2("");
      setShipToPhone2("");
      setDeliveryMsg2("");
    }
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

    // ✅ 수기 입력칸도 같이 복사
    setManualCounterpartyName(r.partnerName ?? "");
    setManualBusinessNo(r.businessNo ?? "");
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
      setEOrdererName(r.orderer_name ?? r.ordererName ?? ""); // ✅ 주문자(수정)
      setEShipMethod(r.ship_method ?? r.method ?? "택배");
      setEOrderTitle(r.order_title ?? "");

      const nextLines: Line[] =
        r.order_lines?.length
          ? r.order_lines.map((l) => ({
              food_type: String(l.food_type ?? ""),
              name: String(l.name ?? ""),
              weight_g: Number(l.weight_g ?? 0), // ✅ 소수점 유지
              qty: toInt(l.qty ?? 0),
              unit: Number(l.unit ?? 0),
              total_incl_vat: Number(l.total_amount ?? 0),
            }))
          : [{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }];

      setELines(nextLines);

      // ✅ 배송지 세팅
      const ships = (r.order_shipments ?? []).slice().sort((a, b) => (a.seq ?? 1) - (b.seq ?? 1));
      const s1 = ships.find((x) => (x.seq ?? 1) === 1);
      const s2 = ships.find((x) => (x.seq ?? 1) === 2);

      setEShipToName1(String(s1?.ship_to_name ?? ""));
      setEShipToAddr1_1(String(s1?.ship_to_address1 ?? ""));
      setEShipToMobile1(String(s1?.ship_to_mobile ?? ""));
      setEShipToPhone1(String(s1?.ship_to_phone ?? ""));
      setEDeliveryMsg1(String(s1?.delivery_message ?? ""));

      if (s2) {
        setETwoShip(true);
        setEShipToName2(String(s2.ship_to_name ?? ""));
        setEShipToAddr1_2(String(s2.ship_to_address1 ?? ""));
        setEShipToMobile2(String(s2.ship_to_mobile ?? ""));
        setEShipToPhone2(String(s2.ship_to_phone ?? ""));
        setEDeliveryMsg2(String(s2.delivery_message ?? ""));
      } else {
        setETwoShip(false);
        setEShipToName2("");
        setEShipToAddr1_2("");
        setEShipToMobile2("");
        setEShipToPhone2("");
        setEDeliveryMsg2("");
      }
    } else {
      setEEntryDate(r.date || todayYMD());
      const m = (r.ledger_method ?? r.method ?? "BANK") as any;
      setEPayMethod(m === "BANK" || m === "CASH" || m === "CARD" || m === "ETC" ? m : "BANK");

      const c = (r.ledger_category as Category) ?? (r.category as Category) ?? "기타";
      setECategory(CATEGORIES.includes(c) ? c : "기타");

      const amt = Number(r.ledger_amount ?? (r.inAmt || r.outAmt || 0));
      setEAmountStr(amt > 0 ? amt.toLocaleString("ko-KR") : "");
      setELedgerMemo(r.ledger_memo ?? "");

      // ✅ 업체명/사업자번호도 수정 가능하게 세팅
      setECounterpartyName(r.partnerName ?? "");
      setEBusinessNo(r.businessNo ?? "");
    }

    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow) return;
    setMsg(null);

    if (editRow.kind === "ORDER") {
      // ✅ (오류 가능성 보완) selectedPartner가 null인 상태에서도 저장 시 에러 방지
      const isMall = selectedPartner ? isMallPartner(selectedPartner) : false;

      const cleanLines = eLines
        .map((l) => {
          const name = (l.name || "").trim();
          const qty = toInt(l.qty);
          const unit = toIntSigned(l.unit);
          const weight_g = toNum(l.weight_g);
          const food_type = (l.food_type || "").trim();

          const unit_type = isMall ? "BOX" : "EA";
          const pack_ea = isMall ? inferPackEaFromName(name) : 1;
          const actual_ea = unit_type === "BOX" ? qty * pack_ea : qty;

          const r = calcLineAmounts(qty, unit, l.total_incl_vat);

          return {
            food_type,
            name,
            weight_g,
            qty,
            unit,
            unit_type,
            pack_ea,
            actual_ea,
            supply_amount: r.supply,
            vat_amount: r.vat,
            total_amount: r.total,
          };
        })
        .filter((l) => l.name && l.qty > 0 && (l.total_amount ?? 0) !== 0);

      if (cleanLines.length === 0) return setMsg("품목명/수량과 (단가 또는 총액)을 올바르게 입력하세요.");

      const memoObj = {
        title: eOrderTitle.trim() || null,
        orderer_name: eOrdererName.trim() || null, // ✅ 주문자 저장(수정)
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

      // ✅ 라인 교체: 기존 order_lines 삭제 후 재삽입
      const { error: dErr } = await supabase.from("order_lines").delete().eq("order_id", editRow.rawId);
      if (dErr) return setMsg(dErr.message);

      const linePayloads = cleanLines.map((l, idx) => ({
        order_id: editRow.rawId,
        line_no: idx + 1,
        food_type: l.food_type || null,
        name: l.name,
        weight_g: l.weight_g || null,
        qty: l.qty,
        unit: l.unit,
        unit_type: l.unit_type,
        pack_ea: l.pack_ea,
        actual_ea: l.actual_ea,
        supply_amount: l.supply_amount,
        vat_amount: l.vat_amount,
        total_amount: l.total_amount,
      }));

      const { error: iErr } = await supabase.from("order_lines").insert(linePayloads);
      if (iErr) return setMsg(iErr.message);

      // ✅ 배송지 교체: 기존 order_shipments 삭제 후 재삽입 (1~2곳)  (배송정보 없어도 저장 가능)
      const { error: sdErr } = await supabase.from("order_shipments").delete().eq("order_id", editRow.rawId);
      if (sdErr) return setMsg(sdErr.message);

      const shipPayloads: any[] = [
        {
          order_id: editRow.rawId,
          seq: 1,
          ship_to_name: eShipToName1.trim(),
          ship_to_address1: eShipToAddr1_1.trim(),
          ship_to_mobile: normText(eShipToMobile1),
          ship_to_phone: normText(eShipToPhone1),
          delivery_message: normText(eDeliveryMsg1),
          created_by: null,
        },
      ];

      if (eTwoShip) {
        shipPayloads.push({
          order_id: editRow.rawId,
          seq: 2,
          ship_to_name: eShipToName2.trim(),
          ship_to_address1: eShipToAddr1_2.trim(),
          ship_to_mobile: normText(eShipToMobile2),
          ship_to_phone: normText(eShipToPhone2),
          delivery_message: normText(eDeliveryMsg2),
          created_by: null,
        });
      }

      const { error: siErr } = await supabase.from("order_shipments").insert(shipPayloads);
      if (siErr) return setMsg(siErr.message);
    } else {
      const amount = Number((eAmountStr || "0").replaceAll(",", ""));
      if (!Number.isFinite(amount) || amount <= 0) return setMsg("금액(원)을 올바르게 입력하세요.");

      const dir = categoryToDirection(eCategory);

      const counterparty_name = eCounterpartyName.trim() || null;
      const business_no = eBusinessNo.trim() || null;

      if (!counterparty_name) return setMsg("업체명(매입처/상대방)은 비울 수 없습니다.");

      const payload: any = {
        entry_date: eEntryDate,
        direction: dir,
        amount,
        category: eCategory,
        method: ePayMethod,
        memo: eLedgerMemo.trim() || null,

        // ✅ 추가(세무사/검색용 핵심)
        counterparty_name,
        business_no,
        partner_id: editRow.ledger_partner_id ?? null,
      };

      const { error } = await supabase.from("ledger_entries").update(payload).eq("id", editRow.rawId);
      if (error) return setMsg(error.message);
    }

    setEditOpen(false);
    setEditRow(null);
    await loadTrades();
  }

  // ✅ 거래내역 삭제
  async function deleteTradeRow(r: UnifiedRow) {
    setMsg(null);

    const ok = window.confirm("삭제할까요? (삭제하면 복구할 수 없습니다.)");
    if (!ok) return;

    // ✅ INP 개선: confirm 이후 UI 업데이트가 먼저 처리되도록 이벤트 핸들러를 양보
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    if (r.kind === "ORDER") {
      // ✅ shipments 먼저 삭제(혹시 FK cascade가 있어도 안전하게)
      const { error: sErr } = await supabase.from("order_shipments").delete().eq("order_id", r.rawId);
      if (sErr) return setMsg(sErr.message);

      const { error: dErr } = await supabase.from("order_lines").delete().eq("order_id", r.rawId);
      if (dErr) return setMsg(dErr.message);

      const { error: oErr } = await supabase.from("orders").delete().eq("id", r.rawId);
      if (oErr) return setMsg(oErr.message);
    } else {
      const { error: lErr } = await supabase.from("ledger_entries").delete().eq("id", r.rawId);
      if (lErr) return setMsg(lErr.message);
    }

    await loadTrades();
  }

  // ====== UI ======
  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const inputRight = `${input} text-right tabular-nums`;
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";
  // ✅ 추가: BOX/EA 배지 (눈에 띄게)
  const qtyBadge =
    "shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-slate-900 px-2 py-1 text-[11px] font-extrabold text-white";
  // ✅ 작업 버튼 최소 크기
  const miniBtn = "rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] hover:bg-slate-50 active:bg-slate-100";
  const targetLabel = selectedPartner ? selectedPartner.name : "전체";

  // ✅ 품목 그리드(품목명 최소 폭 확보)
  // ✅ FIX: 품목명이 길어져도 그리드가 카드 밖으로 튀지 않도록 minmax(0,1fr) + 마지막 컬럼(삭제) 고정폭
  const lineGridCols = "grid-cols-[180px_minmax(0,1fr)_120px_110px_130px_120px_120px_130px_44px]";
  const lineGridHeadCols = "grid-cols-[180px_minmax(0,1fr)_120px_110px_130px_120px_120px_130px_44px]";

  return (
    <div className={`${pageBg} min-h-screen`}>
      <div className="mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        {/* ✅ 거래처 수정 팝업 (신규 + 최근 5건 이력 버튼) */}
        {partnerEditOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
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
                  <input className={input} placeholder="사업자등록번호" value={ep_businessNo} onChange={(e) => setEP_businessNo(e.target.value)} />

                  <select className={input} value={ep_partnerType} onChange={(e) => setEP_partnerType(e.target.value as any)}>
                    <option value="CUSTOMER">매출처(CUSTOMER)</option>
                    <option value="VENDOR">매입처(VENDOR)</option>
                    <option value="BOTH">둘다(BOTH)</option>
                  </select>

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
                  <input className={input} placeholder="주소1" value={ship_to_address1} onChange={(e) => setShipToAddress1(e.target.value)} />
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
                <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">{memoBody}</pre>
              </div>
            </div>
          </div>
        ) : null}

        {/* ✅ 수정 팝업 */}
        {editOpen && editRow ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div
              className="w-full max-w-[1400px] max-h-[92vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
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

              <div className="px-5 py-4 overflow-y-auto">
                {editRow.kind === "ORDER" ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div>
                        <div className="mb-1 text-xs text-slate-600">출고일(주문일)</div>
                        <input type="date" className={input} value={eShipDate} onChange={(e) => setEShipDate(e.target.value)} />
                      </div>

                      <div>
                        <div className="mb-1 text-xs text-slate-600">주문자</div>
                        <input className={input} value={eOrdererName} onChange={(e) => setEOrdererName(e.target.value)} />
                      </div>

                      <div>
                        <div className="mb-1 text-xs text-slate-600">출고방법</div>
                        <select className={input} value={eShipMethod} onChange={(e) => setEShipMethod(e.target.value)}>
                          <option value="택배">택배</option>
                          <option value="퀵-신용">퀵-신용</option>
                          <option value="퀵-착불">퀵-착불</option>
                          <option value="기타">기타</option>
                        </select>
                      </div>

                      <div>
                        <div className="mb-1 text-xs text-slate-600">메모(title)</div>
                        <input className={input} value={eOrderTitle} onChange={(e) => setEOrderTitle(e.target.value)} />
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 text-sm font-semibold">배송정보(주문 스냅샷)</div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="mb-2 text-sm font-semibold">배송지 1</div>
                          <div className="space-y-2">
                            <input className={input} placeholder="수화주명" value={eShipToName1} onChange={(e) => setEShipToName1(e.target.value)} />
                            <input className={input} placeholder="주소1" value={eShipToAddr1_1} onChange={(e) => setEShipToAddr1_1(e.target.value)} />
                            <input className={input} placeholder="요청사항" value={eDeliveryMsg1} onChange={(e) => setEDeliveryMsg1(e.target.value)} />
                            <div className="grid grid-cols-2 gap-2">
                              <input className={input} placeholder="휴대폰" value={eShipToMobile1} onChange={(e) => setEShipToMobile1(e.target.value)} />
                              <input className={input} placeholder="전화" value={eShipToPhone1} onChange={(e) => setEShipToPhone1(e.target.value)} />
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-semibold">배송지 2 (선택)</div>
                            <label className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={eTwoShip} onChange={(e) => setETwoShip(e.target.checked)} />
                              2곳 배송
                            </label>
                          </div>

                          {eTwoShip ? (
                            <div className="space-y-2">
                              <input className={input} placeholder="수화주명" value={eShipToName2} onChange={(e) => setEShipToName2(e.target.value)} />
                              <input className={input} placeholder="주소1" value={eShipToAddr1_2} onChange={(e) => setEShipToAddr1_2(e.target.value)} />
                              <input className={input} placeholder="요청사항" value={eDeliveryMsg2} onChange={(e) => setEDeliveryMsg2(e.target.value)} />
                              <div className="grid grid-cols-2 gap-2">
                                <input className={input} placeholder="휴대폰" value={eShipToMobile2} onChange={(e) => setEShipToMobile2(e.target.value)} />
                                <input className={input} placeholder="전화" value={eShipToPhone2} onChange={(e) => setEShipToPhone2(e.target.value)} />
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">2곳 배송이 아니면 비워둡니다.</div>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        ※ 주문별 배송정보는 “스냅샷”으로 저장됩니다. 거래처 배송정보를 바꿔도 과거 주문은 유지됩니다.
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm font-semibold">품목</div>
                      <button className={btn} onClick={addEditLine}>
                        + 품목 추가
                      </button>
                    </div>

                    <div className={`mt-3 grid ${lineGridHeadCols} gap-2 text-xs text-slate-600`}>
                      <div className="pl-3">식품유형</div>
                      <div className="pl-3">품목명</div>
                      <div className="pl-3">무게(g)</div>
                      <div className="pl-3">수량</div>
                      <div className="pl-3">단가</div>
                      <div className="pl-3">공급가</div>
                      <div className="pl-3">부가세</div>
                      <div className="pl-3">총액(입력)</div>
                      <div />
                    </div>

                    <div className="mt-2 space-y-2">
                      {eLines.map((l, i) => {
                        const r = calcLineAmounts(l.qty, l.unit, l.total_incl_vat);

                        return (
                          <div key={i} className={`grid ${lineGridCols} gap-2`}>
                            <input className={input} list="food-types-list" value={l.food_type} onChange={(e) => updateEditLine(i, { food_type: e.target.value })} />
                            <input
                              className={input}
                              list="master-product-list"
                              value={l.name}
                              onChange={(e) => {
                                const v = e.target.value;
                                updateEditLine(i, { name: v });

                                const hit = masterByName.get(v);
                                if (hit) {
                                  updateEditLine(i, {
                                    food_type: hit.food_type ?? "",
                                    weight_g: Number(hit.weight_g ?? 0),
                                  });
                                }
                              }}
                            />
                            <input
                              className={inputRight}
                              inputMode="decimal"
                              value={typeof l.weight_g === "string" ? l.weight_g : formatWeight(l.weight_g)}
                              onChange={(e) => updateEditLine(i, { weight_g: sanitizeDecimalInput(e.target.value) })}
                              onBlur={() => updateEditLine(i, { weight_g: toNum(l.weight_g) })}
                            />
                            <div className="flex items-center gap-1">
                              <input
                                className={inputRight}
                                inputMode="numeric"
                                value={l.qty ? formatMoney(l.qty) : ""}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^\d,]/g, "");
                                  updateEditLine(i, { qty: raw === "" ? 0 : toInt(raw) });
                                }}
                              />
                              {(() => {
                                const pack = inferPackEaFromName(l.name);
                                const isBox = pack > 1;
                                return <span className={qtyBadge}>{isBox ? `BOX` : `EA`}</span>;
                              })()}
                            </div>

                            <input
                              className={inputRight}
                              inputMode="text"
                              value={typeof l.unit === "string" ? l.unit : l.unit !== 0 ? formatMoney(l.unit) : ""}
                              onChange={(e) => {
                                const raw = sanitizeSignedIntInput(e.target.value);
                                updateEditLine(i, { unit: raw, ...(toIntSigned(raw) !== 0 ? { total_incl_vat: "" } : {}) });
                              }}
                            />

                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{formatMoney(r.supply)}</div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{formatMoney(r.vat)}</div>

                            <input
                              className={inputRight}
                              inputMode="text"
                              placeholder="총액"
                              disabled={toIntSigned(l.unit) !== 0}
                              value={
                                toIntSigned(l.unit) !== 0
                                  ? formatMoney(r.total)
                                  : typeof l.total_incl_vat === "string"
                                    ? l.total_incl_vat
                                    : l.total_incl_vat !== 0
                                      ? formatMoney(l.total_incl_vat)
                                      : ""
                              }
                              onChange={(e) => updateEditLine(i, { total_incl_vat: sanitizeSignedIntInput(e.target.value) })}
                            />

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
                          <option value="BANK">입금</option>
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

                      <div>
                        <div className="mb-1 text-xs text-slate-600">업체명(매입처/상대방)</div>
                        <input className={input} value={eCounterpartyName} onChange={(e) => setECounterpartyName(e.target.value)} />
                      </div>

                      <div>
                        <div className="mb-1 text-xs text-slate-600">사업자등록번호</div>
                        <input className={input} value={eBusinessNo} onChange={(e) => setEBusinessNo(e.target.value)} />
                      </div>

                      <div className="md:col-span-3">
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

              <datalist id="master-product-list">
                {masterProducts.map((p) => (
                  <option key={p.product_name} value={p.product_name} />
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

                  <select className={input} value={p_partnerType} onChange={(e) => setP_partnerType(e.target.value as any)}>
                    <option value="CUSTOMER">매출처(CUSTOMER)</option>
                    <option value="VENDOR">매입처(VENDOR)</option>
                    <option value="BOTH">둘다(BOTH)</option>
                  </select>

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
              <button
                className={`${btn} flex-1`}
                onClick={() => {
                  setSelectedPartner(null);
                  setPartnerFilter("");
                }}
              >
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
                {/* ✅ 수정: 조회대상 pill을 제목 바로 옆으로 이동 */}
                <div className="mb-3 flex items-center gap-3">
                  <div className="text-lg font-semibold">주문/출고 입력</div>
                  <span className={pill}>조회대상: {targetLabel}</span>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <div className="mb-1 text-xs text-slate-600">출고일(주문일)</div>
                    <input type="date" className={input} value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">주문자</div>
                    <input className={input} value={ordererName} onChange={(e) => setOrdererName(e.target.value)} />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">출고방법</div>
                    <select className={input} value={shipMethod} onChange={(e) => setShipMethod(e.target.value)}>
                      <option value="택배">택배</option>
                      <option value="퀵-신용">퀵-신용</option>
                      <option value="퀵-착불">퀵-착불</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">메모(title)</div>
                    <input className={input} value={orderTitle} onChange={(e) => setOrderTitle(e.target.value)} />
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-semibold">배송정보(주문 스냅샷)</div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 text-sm font-semibold">배송지 1</div>
                      <div className="space-y-2">
                        <input className={input} placeholder="수화주명" value={shipToName1} onChange={(e) => setShipToName1(e.target.value)} />
                        <input className={input} placeholder="주소1" value={shipToAddr1_1} onChange={(e) => setShipToAddr1_1(e.target.value)} />
                        <input className={input} placeholder="요청사항" value={deliveryMsg1} onChange={(e) => setDeliveryMsg1(e.target.value)} />
                        <div className="grid grid-cols-2 gap-2">
                          <input className={input} placeholder="휴대폰" value={shipToMobile1} onChange={(e) => setShipToMobile1(e.target.value)} />
                          <input className={input} placeholder="전화" value={shipToPhone1} onChange={(e) => setShipToPhone1(e.target.value)} />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-semibold">배송지 2 (선택)</div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={twoShip} onChange={(e) => setTwoShip(e.target.checked)} />
                          2곳 배송
                        </label>
                      </div>

                      {twoShip ? (
                        <div className="space-y-2">
                          <input className={input} placeholder="수화주명" value={shipToName2} onChange={(e) => setShipToName2(e.target.value)} />
                          <input className={input} placeholder="주소1" value={shipToAddr1_2} onChange={(e) => setShipToAddr1_2(e.target.value)} />
                          <input className={input} placeholder="요청사항" value={deliveryMsg2} onChange={(e) => setDeliveryMsg2(e.target.value)} />
                          <div className="grid grid-cols-2 gap-2">
                            <input className={input} placeholder="휴대폰" value={shipToMobile2} onChange={(e) => setShipToMobile2(e.target.value)} />
                            <input className={input} placeholder="전화" value={shipToPhone2} onChange={(e) => setShipToPhone2(e.target.value)} />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">2곳 배송이 아니면 비워둡니다.</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    ※ 배송정보는 주문마다 저장됩니다(스냅샷). 거래처(업체)명과 수화주명은 다를 수 있습니다.
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm font-semibold">품목(식품유형 자동완성 포함)</div>
                  <div className="flex items-center gap-2">
                    <button className={btn} onClick={() => insertShippingFee(3300)}>
                      + 택배비 3,300
                    </button>
                    <button className={btn} onClick={() => insertShippingFee(4000)}>
                      + 택배비 4,000
                    </button>
                    <button className={btn} onClick={addLine}>
                      + 품목 추가
                    </button>
                  </div>
                </div>

                <div className={`mt-3 grid ${lineGridHeadCols} gap-2 text-xs text-slate-600`}>
                  <div className="pl-3">식품유형</div>
                  <div className="pl-3">품목명</div>
                  <div className="pl-3">무게(g)</div>
                  <div className="pl-3">수량</div>
                  <div className="pl-3">단가</div>
                  <div className="pl-3">공급가</div>
                  <div className="pl-3">부가세</div>
                  <div className="pl-3">총액(입력)</div>
                  <div />
                </div>

                <div className="mt-2 space-y-2">
                  {lines.map((l, i) => {
                    const r = calcLineAmounts(l.qty, l.unit, l.total_incl_vat);

                    return (
                      <div key={i} className={`grid ${lineGridCols} gap-2`}>
                        <input className={input} list="food-types-list" value={l.food_type} onChange={(e) => updateLine(i, { food_type: e.target.value })} />
                        <input
                          className={input}
                          list="master-product-list"
                          value={l.name}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateLine(i, { name: v });

                            const hit = masterByName.get(v);
                            if (hit) {
                              updateLine(i, {
                                food_type: hit.food_type ?? "",
                                weight_g: Number(hit.weight_g ?? 0),
                              });
                            }
                          }}
                        />
                        <input
                          className={inputRight}
                          inputMode="decimal"
                          value={typeof l.weight_g === "string" ? l.weight_g : formatWeight(l.weight_g)}
                          onChange={(e) => updateLine(i, { weight_g: sanitizeDecimalInput(e.target.value) })}
                          onBlur={() => updateLine(i, { weight_g: toNum(l.weight_g) })}
                        />
                        <div className="flex items-center gap-1">
                          <input
                            className={inputRight}
                            inputMode="numeric"
                            value={l.qty ? formatMoney(l.qty) : ""}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d,]/g, "");
                              updateLine(i, { qty: raw === "" ? 0 : toInt(raw) });
                            }}
                          />
                          {(() => {
                            const pack = inferPackEaFromName(l.name);
                            const isBox = pack > 1;
                            return <span className={qtyBadge}>{isBox ? `BOX` : `EA`}</span>;
                          })()}
                        </div>

                        <input
                          className={inputRight}
                          inputMode="text"
                          value={typeof l.unit === "string" ? l.unit : l.unit !== 0 ? formatMoney(l.unit) : ""}
                          onChange={(e) => {
                            const raw = sanitizeSignedIntInput(e.target.value);
                            updateLine(i, { unit: raw, ...(toIntSigned(raw) !== 0 ? { total_incl_vat: "" } : {}) });
                          }}
                        />

                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{formatMoney(r.supply)}</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{formatMoney(r.vat)}</div>

                        <input
                          className={inputRight}
                          inputMode="text"
                          placeholder="총액"
                          disabled={toIntSigned(l.unit) !== 0}
                          value={
                            toIntSigned(l.unit) !== 0
                              ? formatMoney(r.total)
                              : typeof l.total_incl_vat === "string"
                                ? l.total_incl_vat
                                : l.total_incl_vat !== 0
                                  ? formatMoney(l.total_incl_vat)
                                  : ""
                          }
                          onChange={(e) => updateLine(i, { total_incl_vat: sanitizeSignedIntInput(e.target.value) })}
                        />

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

                <datalist id="master-product-list">
                  {masterProducts.map((p) => (
                    <option key={p.product_name} value={p.product_name} />
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
                {/* ✅ 수정: 조회대상 pill을 제목 바로 옆으로 이동 */}
                <div className="mb-3 flex items-center gap-3">
                  <div className="text-lg font-semibold">금전출납 입력</div>
                  <span className={pill}>조회대상: {targetLabel}</span>
                </div>

                <div className="mb-2 flex items-center justify-end">
                  <div className="text-sm text-slate-600">
                    방향: <span className="font-semibold">{categoryToDirection(category) === "IN" ? "입금(+)" : "출금(-)"}</span>
                    <span className="ml-2 text-xs text-slate-500">(카테고리로 자동)</span>
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
                      <option value="BANK">입금</option>
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

                  <div>
                    <div className="mb-1 text-xs text-slate-600">업체명(매입처/상대방)</div>
                    <input
                      className={input}
                      value={manualCounterpartyName}
                      onChange={(e) => setManualCounterpartyName(e.target.value)}
                      placeholder="예: 쿠팡 / 이마트 / 네이버페이 / ㅇㅇ상사"
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-slate-600">사업자등록번호</div>
                    <input
                      className={input}
                      value={manualBusinessNo}
                      onChange={(e) => setManualBusinessNo(e.target.value)}
                      placeholder="예: 123-45-67890"
                    />
                  </div>

                  <div className="md:col-span-3">
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

            {/* 거래내역 (이하 원본 그대로) */}
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
                  <button className={includeOpening ? btnOn : btn} onClick={() => setIncludeOpening((v) => !v)} title="기간 시작 전 기초잔액을 러닝잔액에 포함">
                    기초잔액 포함 러닝잔액
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <input
                  className={input}
                  value={tradeSearch}
                  onChange={(e) => setTradeSearch(e.target.value)}
                  placeholder="검색: 매입처/사업자번호/메모(제품명)/품목명/카테고리/방법"
                />
              </div>

              <div className="rounded-2xl border border-slate-200">
                <div
                  ref={tradeTopScrollRef}
                  className="overflow-x-auto"
                  onScroll={(e) => {
                    const top = e.currentTarget;
                    const bottom = tradeBottomScrollRef.current;
                    if (!bottom) return;
                    if (tradeSyncingRef.current === "BOTTOM") return;
                    tradeSyncingRef.current = "TOP";
                    bottom.scrollLeft = top.scrollLeft;
                    tradeSyncingRef.current = null;
                  }}
                >
                  <div style={{ width: tradeTableMinWidthPx, height: 1 }} />
                </div>

                <div
                  ref={tradeBottomScrollRef}
                  className="max-h-[520px] overflow-x-auto overflow-y-auto"
                  onScroll={(e) => {
                    const bottom = e.currentTarget;
                    const top = tradeTopScrollRef.current;
                    if (!top) return;
                    if (tradeSyncingRef.current === "TOP") return;
                    tradeSyncingRef.current = "BOTTOM";
                    top.scrollLeft = bottom.scrollLeft;
                    tradeSyncingRef.current = null;
                  }}
                >
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: "110px" }} />
                      <col style={{ width: "180px" }} />
                      <col style={{ width: "140px" }} />
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
                        <th className="px-3 py-2 text-left">카테고리</th>
                        <th className="px-3 py-2 text-left">방법</th>

                        {/* ✅ 우측 고정: 입금/출금/잔액/작업 */}
                        <th className="sticky right-[460px] z-20 bg-slate-50 px-3 py-2 text-right">입금</th>
                        <th className="sticky right-[350px] z-20 bg-slate-50 px-3 py-2 text-right">출금</th>
                        <th className="sticky right-[220px] z-20 bg-slate-50 px-3 py-2 text-right">잔액</th>
                        <th className="sticky right-0 z-30 bg-slate-50 px-3 py-2 text-center" title="복사/메모/수정/삭제">
                          작업
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {unifiedRows
                        .filter((x) => {
                          if (mode === "ORDERS") return x.kind === "ORDER";
                          if (mode === "LEDGER") return x.kind === "LEDGER";
                          return true;
                        })
                        .filter((x) => {
                          const q = tradeSearch.trim().toLowerCase();
                          if (!q) return true;

                          const orderLineText =
                            x.kind === "ORDER" ? (x.order_lines ?? []).map((l) => `${l.name ?? ""} ${l.food_type ?? ""}`).join(" ") : "";

                          const hay = [
                            x.partnerName,
                            x.businessNo ?? "",
                            x.ordererName,
                            x.category,
                            x.method,
                            x.order_title ?? "",
                            x.ledger_memo ?? "",
                            orderLineText,
                          ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();

                          return hay.includes(q);
                        })
                        .map((x) => (
                          <tr key={`${x.kind}-${x.rawId}`} className="border-t border-slate-200 bg-white">
                            <td className="px-3 py-2 font-semibold tabular-nums">{x.date}</td>
                            <td className="px-3 py-2 font-semibold">{x.partnerName}</td>
                            <td className="px-3 py-2 font-semibold">{x.ordererName}</td>
                            <td className="px-3 py-2 font-semibold">{x.category}</td>
                            <td className="px-3 py-2 font-semibold">{x.kind === "LEDGER" ? methodLabel(x.method) : x.method}</td>

                            <td className="sticky right-[460px] z-10 bg-white px-3 py-2 text-right tabular-nums font-semibold text-blue-700">
                              {x.inAmt ? formatMoney(x.inAmt) : ""}
                            </td>
                            <td className="sticky right-[350px] z-10 bg-white px-3 py-2 text-right tabular-nums font-semibold text-red-600">
                              {x.outAmt ? formatMoney(x.outAmt) : ""}
                            </td>

                            <td className="sticky right-[220px] z-10 bg-white px-3 py-2 text-right tabular-nums font-semibold">
                              {formatMoney(x.balance)}
                            </td>

                            <td className="sticky right-0 z-20 bg-white px-2 py-2">
                              <div className="grid grid-cols-2 gap-1">
                                <button className={miniBtn} onClick={() => onCopyClick(x)}>
                                  복사
                                </button>
                                <button className={miniBtn} onClick={() => onMemoClick(x)}>
                                  메모
                                </button>
                                <button className={miniBtn} onClick={() => openEdit(x)}>
                                  수정
                                </button>
                                <button className={miniBtn} onClick={() => deleteTradeRow(x)}>
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}

                      {unifiedRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="bg-white px-4 py-4 text-sm text-slate-500">
                            거래내역이 없습니다. (기간/거래처/모드 필터를 확인하세요)
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-2 text-xs text-slate-500">※ 주문/출고는 출금으로 표시됩니다. (입금/출금은 모두 양수 입력, 계산에서만 차감 처리)</div>
            </div>
          </div>
        </div>

        {/* ✅ TOP 버튼 */}
        {showTopBtn ? (
          <button
            type="button"
            className="fixed bottom-6 right-6 z-50 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold shadow-lg hover:bg-slate-50 active:bg-slate-100"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="맨 위로"
          >
            TOP
          </button>
        ) : null}
      </div>
    </div>
  );
}