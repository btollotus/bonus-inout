"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCcpState, SlotStatusPanel, WoCcpCard } from "./production-client-ccp";
import { usePinSession, PinModal } from "@/app/contexts/PinSessionContext";
import { WoPrintModal, isSpecialItem } from "@/app/components/wo-print";

// ─────────────────────── Types ───────────────────────
type WoSubItem = { name: string; qty: number };

type WoItemRow = {
  id: string;
  work_order_id: string;
  delivery_date: string;
  sub_items: WoSubItem[];
  order_qty: number;
  barcode_no: string | null;
  actual_qty: number | null;
  defect_qty: number | null;
  unit_weight: number | null;
  total_weight: number | null;
  expiry_date: string | null;
  order_id: string | null;
  note: string | null;
  images: string[] | null;
  transfer_lot_id: string | null;
  transfer_qty: number | null;
};

type WorkOrderRow = {
  id: string;
  work_order_no: string;
  barcode_no: string;
  client_id: string | null;
  client_name: string;
  sub_name: string | null;
  order_date: string;
  food_type: string | null;
  product_name: string;
  logo_spec: string | null;
  thickness: string | null;
  delivery_method: string | null;
  packaging_type: string | null;
  tray_slot: string | null;
  package_unit: string | null;
  mold_per_sheet: number | null;
  note: string | null;
  reference_note: string | null;
  status: string;
  status_transfer: boolean;
  status_print_check: boolean;
  status_production: boolean;
  status_input: boolean;
  is_reorder: boolean;
  original_work_order_id: string | null;
  variant_id: string | null;
  images: string[];
  linked_order_id: string | null;
  created_at: string;
  assignee_transfer?: string | null;
  assignee_print_check?: string | null;
  assignee_production?: string | null;
  assignee_input?: string | null;
  transfer_done_at?: string | null;
  print_check_done_at?: string | null;
  input_done_at?: string | null;
  linked_order?: { memo: string | null } | { memo: string | null }[] | null;
  work_order_items?: WoItemRow[];
  order_type: string;
  ccp_slot_id?: string | null;
  skip_production_check?: boolean | null;
  neo_color_spray_lots?: { lot_id: string; qty: string }[] | null;
};

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

type NewWoNotification = {
  id: string; client_name: string; product_name: string;
  work_order_no: string; order_date: string; created_at: string;
};

type WoReadInfo = { read_at: string };

type KiseongVariant = {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  food_type: string | null;
  weight_g: number | null;
  barcode: string;
  category: string | null;
};

const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"].map(ch => ch.normalize("NFC"));

function getChosung(str: string): string {
  return [...str].map(ch => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code >= 0 && code <= 11171) return CHOSUNG[Math.floor(code / 588)];
    return "";
  }).join("");
}

const JAMO_TO_CHOSUNG: Record<string, string> = {
  "\u3130": "\u3131", "\u3131": "\u3131", "\u3132": "\u3132",
  "\u3133": "\u3131", "\u3134": "\u3134", "\u3135": "\u3134",
  "\u3136": "\u3134", "\u3137": "\u3137", "\u3138": "\u3138",
  "\u3139": "\u3139", "\u313a": "\u3139", "\u313b": "\u3139",
  "\u313c": "\u3139", "\u313d": "\u3139", "\u313e": "\u3139",
  "\u313f": "\u3139", "\u3140": "\u3139",
  "\u3141": "\u3141", "\u3142": "\u3142", "\u3143": "\u3142",
  "\u3144": "\u3142", "\u3145": "\u3145", "\u3146": "\u3146",
  "\u3147": "\u3147", "\u3148": "\u3148", "\u3149": "\u3149",
  "\u314a": "\u314a", "\u314b": "\u314b", "\u314c": "\u314c",
  "\u314d": "\u314d", "\u314e": "\u314e",
};

function extractKeywordChosung(keyword: string): string {
  return [...keyword].map(ch => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code >= 0 && code <= 11171) return CHOSUNG[Math.floor(code / 588)];
    return JAMO_TO_CHOSUNG[ch] ?? ch;
  }).join("");
}

function matchesSearch(target: string, keyword: string): boolean {
  const t = target.toLowerCase();
  const k = keyword.normalize("NFC");
  if (t.includes(k.toLowerCase())) return true;
  const kChosung = extractKeywordChosung(k);
  const isAllChosung = kChosung.length > 0 && [...kChosung].every(ch => CHOSUNG.includes(ch));
  if (isAllChosung) return getChosung(target).includes(kChosung);
  return false;
}

// ─────────────────────── Helpers ───────────────────────
const supabase = createClient();

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [
      { freq: 523.25, start: 0.0, dur: 0.15 },
      { freq: 659.25, start: 0.18, dur: 0.15 },
      { freq: 783.99, start: 0.36, dur: 0.25 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur + 0.05);
    });
  } catch (e) { console.warn("알림음 재생 실패:", e); }
}

async function resolveSignedImageUrls(rawImages: string[], supabaseClient: ReturnType<typeof createClient>): Promise<string[]> {
  if (!rawImages || rawImages.length === 0) return [];
  const results: string[] = [];
  for (const raw of rawImages) {
    let storagePath = raw;
    if (raw.startsWith("http")) {
      const m = raw.match(/work-order-images\/(.+?)(\?|$)/);
      storagePath = m ? decodeURIComponent(m[1]) : raw;
    }
    try {
      const { data, error } = await supabaseClient.storage.from("work-order-images").createSignedUrl(storagePath, 60 * 60);
      if (!error && data?.signedUrl) results.push(data.signedUrl);
    } catch (e) { console.warn("[이미지 signed URL 오류]", storagePath, e); }
  }
  return results;
}

function fmt(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("ko-KR");
}
function utcToKSTDateTime(utcStr: string | null | undefined): string {
  if (!utcStr) return "";
  const d = new Date(new Date(utcStr).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}
function kstTimeOnly(isoStr: string): string {
  const d = new Date(new Date(isoStr).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
function toInt(v: unknown): number {
  const n = parseInt(String(v ?? "").replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────── Styles (컴팩트 버전) ───────────────────────
const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-lg border border-blue-500 bg-blue-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800";
const btnSm = "rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium hover:bg-slate-50";
const pill = "rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600";
const statusColors: Record<string, string> = {
  "생산중": "bg-orange-100 text-orange-700 border-orange-200",
  "완료":   "bg-green-100 text-green-700 border-green-200",
};

const PROGRESS_STEPS = [
  { label: "전사인쇄", statusKey: "status_transfer" as const, assigneeKey: "assignee_transfer" as const, doneAtKey: "transfer_done_at" as const, icon: "🖨️", cardDone: "border-blue-300 bg-blue-50", cardSkip: "border-amber-300 bg-amber-50", cardEmpty: "border-slate-200 bg-white", badgeDone: "bg-blue-100 text-blue-700 border-blue-200", badgeSkip: "bg-amber-100 text-amber-700 border-amber-200" },
  { label: "인쇄검수", statusKey: "status_print_check" as const, assigneeKey: "assignee_print_check" as const, doneAtKey: "print_check_done_at" as const, icon: "🔍", cardDone: "border-violet-300 bg-violet-50", cardSkip: "border-amber-300 bg-amber-50", cardEmpty: "border-slate-200 bg-white", badgeDone: "bg-violet-100 text-violet-700 border-violet-200", badgeSkip: "bg-amber-100 text-amber-700 border-amber-200" },
  { label: "금속검출", statusKey: "status_input" as const, assigneeKey: "assignee_input" as const, doneAtKey: "input_done_at" as const, icon: "🧲", cardDone: "border-green-300 bg-green-50", cardSkip: "border-amber-300 bg-amber-50", cardEmpty: "border-slate-200 bg-white", badgeDone: "bg-green-100 text-green-700 border-green-200", badgeSkip: "bg-amber-100 text-amber-700 border-amber-200" },
] as const;

const DARK_FOOD_TYPES = ["다크화이트","다크옐로우","데코초콜릿","롤리팝다크화이트","다크핑크","다크연두","롤리팝다크핑크"];

function getFoodCategory(foodType: string | null | undefined): "다크" | "화이트" | "중간재" | null {
  const ft = (foodType ?? "").trim();
  if (!ft) return null;
  if (ft.includes("초콜릿중간재") || ft.includes("중간재")) return "중간재";
  if (DARK_FOOD_TYPES.some((d) => ft.includes(d))) return "다크";
  return "화이트";
}

// ─── 전사인쇄 CCP-1B(8번 슬롯) 대상 식품유형 ───
const TRANSFER_CCP_FOOD_TYPES = [
  "네오뉴리얼화이트데코","네오뉴화이트데코","네오리얼화이트다크","네오리얼화이트레드",
  "네오리얼화이트밀크","네오리얼화이트블루","네오리얼화이트옐로우","네오리얼화이트핑크",
  "네오모어화이트그린","네오화이트다크","네오화이트레드","네오화이트밀크","네오화이트블루",
  "네오화이트핑크(TR)","다크연두","다크옐로우","다크핑크","다크화이트","롤리팝다크핑크",
  "롤리팝다크화이트","리얼화이트다크블루","미니붕어빵-화이트다크(벌크)","핑크화이트","화이트초록",
];

function needsTransferCcp(foodType: string | null | undefined): boolean {
  const ft = (foodType ?? "").trim();
  if (!ft) return false;
  return TRANSFER_CCP_FOOD_TYPES.includes(ft);
}

// ─── 분사/코팅 판별 ───
function getWoSubType(productName: string | null | undefined): "분사" | "코팅" | null {
  const name = (productName ?? "").trim();
  if (name.includes("분사-레이즈")) return "분사";
  if (name.includes("코팅-레이즈")) return "코팅";
  return null;
}

// ─── 분사/코팅 배합 상수 ───
const SPRAY_RECIPE: Record<number, {
  구아검: number; 유화제: number; 감자전분: number;
  구아검_배합액물: number; 구아검_배합액구아검: number;
}> = {
  1: { 구아검: 6,  유화제: 60,  감자전분: 60,  구아검_배합액물: 1500, 구아검_배합액구아검: 6  },
  2: { 구아검: 12, 유화제: 120, 감자전분: 120, 구아검_배합액물: 3000, 구아검_배합액구아검: 12 },
  3: { 구아검: 18, 유화제: 180, 감자전분: 180, 구아검_배합액물: 4500, 구아검_배합액구아검: 18 },
  4: { 구아검: 24, 유화제: 240, 감자전분: 240, 구아검_배합액물: 6000, 구아검_배합액구아검: 24 },
  5: { 구아검: 30, 유화제: 300, 감자전분: 300, 구아검_배합액물: 7500, 구아검_배합액구아검: 30 },
};
const COATING_BASE = { 팜유: 280, 유청분말: 300 };

type WoChecks = {
  status_transfer: boolean; status_print_check: boolean; status_production: boolean; status_input: boolean;
  assignee_transfer: string; assignee_print_check: string; assignee_production: string; assignee_input: string;
  transfer_done_at: string | null; print_check_done_at: string | null; input_done_at: string | null;
};

type TransferCcpEvent = {
  id: string;
  work_order_no: string;
  slot_id: string;
  event_type: "start" | "mid_check" | "end";
  measured_at: string;
  temperature: number | null;
  is_ok: boolean | null;
  action_note: string | null;
};

// ─────────────────────── Component ───────────────────────
export default function ProductionClient() {
  const [role, setRole] = useState<UserRole>(null);
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).limit(1).maybeSingle();
      setRole((data?.role as UserRole) ?? "USER");
    })();
  }, []);

  const [woList, setWoList] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  const router = useRouter();
  const [isEditMode, setIsEditMode] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeModalWoId, setCompleteModalWoId] = useState<string | null>(null);
  const completeCcpEndedAtRef = useRef<string | null>(null);
  const [productionCount, setProductionCount] = useState(0);
  const [sortBy, setSortBy] = useState<"created_at" | "delivery_date">("created_at");
  const [filterStatus, setFilterStatus] = useState<"전체" | "생산중" | "완료">("생산중");
  const [woOffset, setWoOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filterFoodCategory, setFilterFoodCategory] = useState<"전체" | "다크" | "화이트" | "전사지">("전체");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedWo, setSelectedWo] = useState<WorkOrderRow | null>(null);

 // 분사/코팅 배합 횟수
 const [blendCount, setBlendCount] = useState(1);
 // 분사 수량
 const [sprayProdQty, setSprayProdQty] = useState<string>("");
 // 압축공기 작업 기록
 const [compWorkHours, setCompWorkHours] = useState<string>("");
 const [compDamageOk, setCompDamageOk] = useState(true);
 const [compNote, setCompNote] = useState<string>("");
 const [compSaved, setCompSaved] = useState(false);
 const [compSaving, setCompSaving] = useState(false);
 const [compLogId, setCompLogId] = useState<string | null>(null);
// 네오컬러 분사-레이즈 사용 lot
 const [neoColorSprayLots, setNeoColorSprayLots] = useState<{ lot_id: string; qty: string }[]>([]);
  const [neoColorSprayLotOptions, setNeoColorSprayLotOptions] = useState<{ lot_id: string; expiry_date: string; remaining_qty: number; variant_name: string }[]>([]);
  const neoColorSprayLotOptionsRef = useRef<{ lot_id: string; expiry_date: string; remaining_qty: number; variant_name: string }[]>([]);
  const [neoColorSprayLotLoading, setNeoColorSprayLotLoading] = useState(false);
  const [neoColorSpraySaved, setNeoColorSpraySaved] = useState(false);
  const [neoColorSprayEditMode, setNeoColorSprayEditMode] = useState(false);
  const [neoColorSpraySaving, setNeoColorSpraySaving] = useState(false);

  const [eSubName, setESubName] = useState("");
  const [eProductName, setEProductName] = useState("");
  const [eFoodType, setEFoodType] = useState("");
  const [eLogoSpec, setELogoSpec] = useState("");
  const [eThickness, setEThickness] = useState("2mm");
  const [eDeliveryMethod, setEDeliveryMethod] = useState("택배");
  const [ePackagingType, setEPackagingType] = useState("트레이");
  const [eTraySlot, setETraySlot] = useState("정사각20구");
  const [ePackageUnit, setEPackageUnit] = useState("100ea");
  const [ePackageUnitCustom, setEPackageUnitCustom] = useState("");
  const [eMoldPerSheet, setEMoldPerSheet] = useState("");
  const [eMoldCols, setEMoldCols] = useState("");
  const [eMoldRows, setEMoldRows] = useState("");
  const [eMoldCount, setEMoldCount] = useState("");
  const [eNote, setENote] = useState("");
  const [eReferenceNote, setEReferenceNote] = useState("");

  useEffect(() => {
    const cols = parseInt(eMoldCols || "0", 10);
    const rows = parseInt(eMoldRows || "0", 10);
    const qty = (selectedWo?.work_order_items ?? [])
      .filter((item) => { const n = (item.sub_items ?? [])[0]?.name ?? ""; return !n.startsWith("성형틀") && !n.startsWith("인쇄제판"); })
      .reduce((s, i) => s + (i.order_qty ?? 0), 0);
    if (!qty || !cols || !rows) return;
    if (getFoodCategory(eFoodType) === "중간재") return;
    const mold = cols * rows;
    const fullSheets = Math.floor(qty / mold);
    const remainder = qty % mold;
    let extraRows = remainder > 0 ? Math.ceil(remainder / cols) : 0;
    let total = fullSheets * mold + extraRows * cols;
    if (total - qty < 16) { extraRows += 1; total += cols; }
    const auto = extraRows > 0
      ? `전사지: ${fullSheets}장 ${extraRows}줄 참고: ${total.toLocaleString("ko-KR")}개 #${cols}개=가로1줄`
      : `전사지: ${fullSheets}장 참고: ${total.toLocaleString("ko-KR")}개 #${cols}개=가로1줄`;
    if (!eNote) setENote(auto);
  }, [eMoldCols, eMoldRows]); // eslint-disable-line

  const [woChecks, setWoChecks] = useState<WoChecks | null>(null);
  const [signedImageUrls, setSignedImageUrls] = useState<string[]>([]);
  const [prodInputs, setProdInputs] = useState<Record<string, { actual_qty: string; gift_qty: string; defect_qty?: string; unit_weight: string; expiry_date: string; transfer_lot_id: string; transfer_qty: string; transfer_lots: { lot_id: string; qty: string }[]; skip?: boolean }>>({});
  const titaniumDioxideG = useMemo(() => {
    if (!selectedWo || !(selectedWo.food_type ?? "").includes("리얼")) return "";
    const items = (selectedWo.work_order_items ?? []).filter((item) => {
      const name = (item.sub_items ?? [])[0]?.name ?? "";
      return !name.startsWith("성형틀") && !name.startsWith("인쇄제판")
        && !name.startsWith("아이스박스") && !name.startsWith("택배비");
    });
    const totalWeight = items.reduce((sum, item) => {
      const pi = prodInputs[item.id];
      const aqty = toInt(pi?.actual_qty) + toInt(pi?.defect_qty);
      const uw = toNum(pi?.unit_weight);
      return sum + (aqty > 0 && uw > 0 ? aqty * uw : 0);
    }, 0);
    if (totalWeight <= 0) return "";
    return String(Math.round(totalWeight / 11));
  }, [selectedWo, prodInputs]);
  const [printOpen, setPrintOpen] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string | null; pin: string | null }[]>([]);

  const [warmerSlots, setWarmerSlots] = useState<{ id: string; slot_name: string; purpose: string }[]>([]);
  const [eCcpSlotId, setECcpSlotId] = useState<string>("");

  // ─── 전사인쇄 CCP-1B(8번 슬롯 전용) ───
  const [transferCcpEvents, setTransferCcpEvents] = useState<TransferCcpEvent[]>([]);
  const [transferCcpEventType, setTransferCcpEventType] = useState<"start" | "mid_check" | "end">("start");
  const [transferCcpTime, setTransferCcpTime] = useState("");
  const [transferCcpTemp, setTransferCcpTemp] = useState("");
  const [transferCcpIsOk, setTransferCcpIsOk] = useState(true);
  const [transferCcpActionNote, setTransferCcpActionNote] = useState("");
  const [transferCcpSaving, setTransferCcpSaving] = useState(false);
  const [transferCcpEditingId, setTransferCcpEditingId] = useState<string | null>(null);
  const [transferCcpEditTime, setTransferCcpEditTime] = useState("");
  const [transferCcpEditTemp, setTransferCcpEditTemp] = useState("");
  const [transferCcpEditIsOk, setTransferCcpEditIsOk] = useState(true);
  const [transferCcpEditActionNote, setTransferCcpEditActionNote] = useState("");
  const [transferCcpEditSaving, setTransferCcpEditSaving] = useState(false);
  const transferCcpSlotId = useMemo(() => warmerSlots.find((s) => s.slot_name === "8")?.id ?? null, [warmerSlots]);
  const transferCcpEnded = useMemo(() => {
    if (transferCcpEvents.length === 0) return false;
    const sorted = [...transferCcpEvents].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    return sorted[sorted.length - 1].event_type === "end";
  }, [transferCcpEvents]);

  type TransferLot = { lot_id: string; expiry_date: string; remaining_qty: number; variant_name: string; barcode: string };
  const [transferLotSearch, setTransferLotSearch] = useState<Record<string, string>>({});
  const [transferLotOptions, setTransferLotOptions] = useState<Record<string, TransferLot[]>>({});
  const [transferLotSearching, setTransferLotSearching] = useState<Record<string, boolean>>({});

  const currentUserIdRef = useRef<string | null>(null);

  const { session: pinSession, isValid: isPinValid, login: pinLogin } = usePinSession();
  const [showPinModalForProgress, setShowPinModalForProgress] = useState(false);
  const [pinProgressPending, setPinProgressPending] = useState<((name: string) => void) | null>(null);
  const [showDeletePinModal, setShowDeletePinModal] = useState(false);
  const [deletePinTargetId, setDeletePinTargetId] = useState<string | null>(null);

  const ccp = useCcpState(warmerSlots, currentUserIdRef, showToast);
  const slotStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [stockAlerts, setStockAlerts] = useState<{ id: string; item_name: string; status: string; expiry_date: string | null; action: string | null; log_date: string }[]>([]);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [stepSaving, setStepSaving] = useState<string | null>(null);
  const [readMap, setReadMap] = useState<Record<string, WoReadInfo>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { currentUserIdRef.current = user?.id ?? null; });
  }, []);

  // 기성생산 State
  const [isKiseongForm, setIsKiseongForm] = useState(false);
  const [kiseongCategory, setKiseongCategory] = useState<string | null>(null);
  const [kiseongVariants, setKiseongVariants] = useState<KiseongVariant[]>([]);
  const [kiseongSearch, setKiseongSearch] = useState("");
  const [kiseongSelected, setKiseongSelected] = useState<KiseongVariant | null>(null);
  const [kiseongSaving, setKiseongSaving] = useState(false);
  const [kSubName, setKSubName] = useState("");
  const [kFoodType, setKFoodType] = useState("");
  const [kLogoSpec, setKLogoSpec] = useState("");
  const [kThickness, setKThickness] = useState("3mm");
  const [kPackagingType, setKPackagingType] = useState("트레이-정사각20구");
  const [kPackageUnit, setKPackageUnit] = useState("100ea");
  const [kPackageUnitCustom, setKPackageUnitCustom] = useState("");
  const [kMoldCols, setKMoldCols] = useState("");
  const [kMoldRows, setKMoldRows] = useState("");
  const [kUnitWeight, setKUnitWeight] = useState("");
  const [kNote, setKNote] = useState("");
  const [kReferenceNote, setKReferenceNote] = useState("");
  const [kActualQty, setKActualQty] = useState("");

  function calcKiseongNote(foodType: string, qty: number, cols: number, rows: number): string {
    const mold = cols * rows;
    if (!mold || mold <= 0 || !qty || qty <= 0) return "";
    if (foodType.includes("초콜릿중간재")) return "";
    const fullSheets = Math.floor(qty / mold);
    const remainder = qty % mold;
    let extraRows = remainder > 0 ? Math.ceil(remainder / cols) : 0;
    let total = fullSheets * mold + extraRows * cols;
    if (total - qty < 16) { extraRows += 1; total += cols; }
    if (extraRows > 0) {
      return `전사지: ${fullSheets}장 ${extraRows}줄 참고: ${total.toLocaleString("ko-KR")}개 #${cols}개=가로1줄`;
    }
    return `전사지: ${fullSheets}장 참고: ${total.toLocaleString("ko-KR")}개 #${cols}개=가로1줄`;
  }

  useEffect(() => {
    const cols = parseInt(kMoldCols || "0", 10);
    const rows = parseInt(kMoldRows || "0", 10);
    const qty = parseInt(kActualQty || "0", 10);
    if (!qty) return;
    const auto = calcKiseongNote(kFoodType, qty, cols, rows);
    if (auto) setKNote(auto);
  }, [kMoldCols, kMoldRows, kActualQty, kFoodType]); // eslint-disable-line

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("product_variants").select("id, variant_name, weight_g, barcode, product_id, products(name, food_type, category)").order("variant_name");
      if (error || !data) return;
      setKiseongVariants((data as any[]).map((r) => ({ variant_id: r.id, product_id: r.product_id, product_name: r.products?.name ?? r.variant_name, variant_name: r.variant_name ?? "", food_type: r.products?.food_type ?? null, weight_g: r.weight_g ?? null, barcode: r.barcode ?? "", category: r.products?.category ?? null })));
    })();
  }, []);

  const handleKiseongVariantSelect = async (variant: KiseongVariant) => {
    setKiseongSelected(variant);
    setKFoodType(variant.food_type ?? "");
    const { data, error } = await supabase.from("work_orders").select("sub_name, food_type, logo_spec, thickness, packaging_type, tray_slot, package_unit, mold_per_sheet, mold_cols, mold_rows, note, reference_note, work_order_items(unit_weight)").eq("variant_id", variant.variant_id).eq("order_type", "재고").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!error && data) {
      setKSubName(data.sub_name ?? ""); setKFoodType(data.food_type ?? variant.food_type ?? ""); setKLogoSpec(data.logo_spec ?? ""); setKThickness(data.thickness ?? "3mm"); setKPackagingType(data.packaging_type ?? "트레이-정사각20구");
      const _kpu = data.package_unit ?? "100ea";
      if (_kpu === "100ea" || _kpu === "200ea") { setKPackageUnit(_kpu); setKPackageUnitCustom(""); }
      else { setKPackageUnit("기타"); setKPackageUnitCustom(_kpu.replace(/ea$/i, "")); } setKMoldCols(data.mold_cols ? String(data.mold_cols) : ""); setKMoldRows(data.mold_rows ? String(data.mold_rows) : ""); const prevUnitWeight = (data as any).work_order_items?.[0]?.unit_weight;
      setKUnitWeight(prevUnitWeight ? String(prevUnitWeight) : ""); setKNote(""); setKReferenceNote(data.reference_note ?? "");
    } else { setKSubName(""); setKLogoSpec(""); setKThickness("3mm"); setKPackagingType("트레이-정사각20구"); setKPackageUnit("100ea"); setKMoldCols(""); setKMoldRows(""); setKUnitWeight(""); setKNote(""); setKReferenceNote(""); }
    setKActualQty("");
  };

  const resetKiseongForm = () => {
    setIsKiseongForm(false); setKiseongCategory(null); setKiseongSearch(""); setKiseongSelected(null);
    setKSubName(""); setKFoodType(""); setKLogoSpec(""); setKThickness("3mm"); setKPackagingType("트레이-정사각20구"); setKPackageUnit("100ea"); setKMoldCols(""); setKMoldRows(""); setKNote(""); setKReferenceNote(""); setKActualQty(""); setKUnitWeight("");
  };

  const saveKiseongOrder = async () => {
    if (!kiseongSelected) return setMsg("제품을 선택하세요.");
    if (!kActualQty || toInt(kActualQty) < 1) return setMsg("생산수량을 입력하세요.");
    if (!kFoodType.trim()) return setMsg("식품유형을 입력하세요.");
    const foodCatK = getFoodCategory(kFoodType);
    if (foodCatK !== "중간재") {
      if (!kLogoSpec.trim()) return setMsg("규격(로고스펙)을 입력하세요.");
      if (!kMoldCols || !kMoldRows || toInt(kMoldCols) < 1 || toInt(kMoldRows) < 1)
        return setMsg("성형틀 가로/세로 열수를 입력하세요.");
    }
    const kMoldColsNum = toInt(kMoldCols);
    const kMoldRowsNum = toInt(kMoldRows);
    const kMoldPerSheetNum = kMoldColsNum * kMoldRowsNum;
    setKiseongSaving(true); setMsg(null);
    try {
      const todayKSTStr = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
      const today = todayKSTStr;
      const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}`;
      const { data: newWoNo3, error: woNoErr3 } = await supabase.rpc("generate_work_order_no", { date_str: dateStr });
      if (woNoErr3 || !newWoNo3) throw new Error("작업지시서 번호 생성 실패: " + (woNoErr3?.message ?? ""));
      const workOrderNo = newWoNo3;
      const { data: wo, error: woErr } = await supabase.from("work_orders").insert({ work_order_no: workOrderNo, barcode_no: kiseongSelected.barcode, client_id: null, client_name: "재고생산", sub_name: kSubName.trim() || null, order_date: `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`, food_type: kFoodType.trim() || null, product_name: kiseongSelected.product_name, logo_spec: kLogoSpec.trim() || null, thickness: kThickness || null, delivery_method: null, packaging_type: kPackagingType || null, tray_slot: null, package_unit: kPackageUnit === "기타" ? (kPackageUnitCustom.trim() ? kPackageUnitCustom.trim() + "ea" : null) : kPackageUnit || null, mold_per_sheet: kMoldPerSheetNum > 0 ? kMoldPerSheetNum : null, mold_cols: kMoldColsNum > 0 ? kMoldColsNum : null, mold_rows: kMoldRowsNum > 0 ? kMoldRowsNum : null, note: kNote.trim() || null, reference_note: kReferenceNote.trim() || null, status: "생산중", variant_id: kiseongSelected.variant_id, order_type: "재고" }).select("id").single();
      if (woErr) throw woErr;
      const { error: itemErr } = await supabase.from("work_order_items").insert({ work_order_id: wo.id, delivery_date: `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`, sub_items: [{ name: kiseongSelected.product_name, qty: toInt(kActualQty) }], order_qty: toInt(kActualQty), barcode_no: kiseongSelected.barcode, actual_qty: toInt(kActualQty), unit_weight: kUnitWeight ? toNum(kUnitWeight) : (kiseongSelected.weight_g ?? null), expiry_date: null });
      if (itemErr) {
        console.error("[saveKiseongOrder] work_order_items insert 실패:", itemErr.message, itemErr);
        // WO 롤백
        await supabase.from("work_orders").delete().eq("id", wo.id);
        throw new Error("생산항목 저장 실패 (WO 롤백됨): " + itemErr.message);
      }
      showToast("재고 작업지시서가 등록되었습니다!"); resetKiseongForm(); await loadWoList();
    } catch (e: any) { setMsg("저장 오류: " + (e?.message ?? e)); } finally { setKiseongSaving(false); }
  };

  const kiseongFilteredVariants = useMemo(() => {
    const q = kiseongSearch.trim().toLowerCase();
    const base = kiseongVariants.filter((v) => {
      if (v.variant_name.includes("성형틀") || v.variant_name.includes("인쇄제판")) return false;
      if (kiseongCategory) return (v.category ?? "") === kiseongCategory;
      return true;
    });
    if (!q) return base;
    return base.filter((v) => v.product_name.toLowerCase().includes(q) || v.variant_name.toLowerCase().includes(q) || v.barcode.toLowerCase().includes(q));
  }, [kiseongVariants, kiseongSearch, kiseongCategory]);

  const loadReadMap = useCallback(async (woIds: string[]) => {
    if (woIds.length === 0) return;
    const { data } = await supabase.from("work_order_reads").select("work_order_id, read_at").in("work_order_id", woIds);
    if (!data) return;
    const map: Record<string, WoReadInfo> = {};
    for (const row of data) { if (!map[row.work_order_id] || row.read_at < map[row.work_order_id].read_at) map[row.work_order_id] = { read_at: row.read_at }; }
    setReadMap(map);
  }, []);

  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const [newWoNotifications, setNewWoNotifications] = useState<NewWoNotification[]>([]);
  const [showNewWoModal, setShowNewWoModal] = useState(false);
  const insertChannelRef = useRef<RealtimeChannel | null>(null);
  const pageLoadTimeRef = useRef<string>(new Date().toISOString());

  const ccpLoadSlotStatusRef = useRef(ccp.loadSlotStatus);
  useEffect(() => { ccpLoadSlotStatusRef.current = ccp.loadSlotStatus; }, [ccp.loadSlotStatus]);

  const selectedWoCcpSlotIdRef = useRef<string | null>(null);
  useEffect(() => { selectedWoCcpSlotIdRef.current = selectedWo?.ccp_slot_id ?? null; }, [selectedWo?.ccp_slot_id]);

  const transferCcpSlotIdRef = useRef<string | null>(null);
  useEffect(() => { transferCcpSlotIdRef.current = transferCcpSlotId; }, [transferCcpSlotId]);

  useEffect(() => {
    if (realtimeChannelRef.current) { supabase.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; setRealtimeConnected(false); }
    if (!selectedWo?.id) return;
    const channel = supabase.channel(`wo_progress:${selectedWo.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "work_orders", filter: `id=eq.${selectedWo.id}` }, (payload) => {
        const d = payload.new as Record<string, unknown>;
        setWoChecks((prev) => {
          if (!prev) return prev;
          return { ...prev, status_transfer: typeof d.status_transfer === "boolean" ? d.status_transfer : prev.status_transfer, status_print_check: typeof d.status_print_check === "boolean" ? d.status_print_check : prev.status_print_check, status_production: typeof d.status_production === "boolean" ? d.status_production : prev.status_production, status_input: typeof d.status_input === "boolean" ? d.status_input : prev.status_input, assignee_transfer: d.assignee_transfer !== undefined ? (d.assignee_transfer as string ?? "") : prev.assignee_transfer, assignee_print_check: d.assignee_print_check !== undefined ? (d.assignee_print_check as string ?? "") : prev.assignee_print_check, assignee_production: d.assignee_production !== undefined ? (d.assignee_production as string ?? "") : prev.assignee_production, assignee_input: d.assignee_input !== undefined ? (d.assignee_input as string ?? "") : prev.assignee_input, transfer_done_at: d.transfer_done_at !== undefined ? (d.transfer_done_at as string ?? null) : prev.transfer_done_at, print_check_done_at: d.print_check_done_at !== undefined ? (d.print_check_done_at as string ?? null) : prev.print_check_done_at, input_done_at: d.input_done_at !== undefined ? (d.input_done_at as string ?? null) : prev.input_done_at };
        });
        if (d.ccp_slot_id !== undefined) {
          setECcpSlotId((d.ccp_slot_id as string) ?? "");
          setSelectedWo((prev) => prev ? { ...prev, ccp_slot_id: (d.ccp_slot_id as string) ?? null } : prev);
        }
        const now = new Date();
        setLastUpdatedAt(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`);
        const changed = PROGRESS_STEPS.find((s) => d[s.assigneeKey] !== undefined || d[s.statusKey] !== undefined);
        if (changed) { setFlashKey(changed.assigneeKey); setTimeout(() => setFlashKey(null), 1500); }
      }).subscribe((status) => { setRealtimeConnected(status === "SUBSCRIBED"); });
    realtimeChannelRef.current = channel;

    const ccpEventsChannel = supabase.channel(`ccp_wo_events:${selectedWo.id}_${Math.random().toString(36).slice(2, 9)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "ccp_wo_events" }, (payload) => {
      const d = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
      if (String(d.work_order_no ?? "") !== selectedWo.work_order_no) return;
      const evSlotId = String(d.slot_id ?? "");
      const currentCcpSlotId = selectedWoCcpSlotIdRef.current;
      const currentExcludeSlotId = needsTransferCcp(selectedWo.food_type) ? transferCcpSlotIdRef.current : null;
      if (evSlotId && currentCcpSlotId && evSlotId !== currentCcpSlotId) return;
      ccp.loadWoEvents(selectedWo.work_order_no, currentCcpSlotId, selectedWo.status, currentExcludeSlotId);
    }).subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(ccpEventsChannel);
      realtimeChannelRef.current = null;
      setRealtimeConnected(false);
    };
  }, [selectedWo?.id]);

  async function handleAssigneeChange(assigneeKey: keyof WoChecks, statusKey: keyof WoChecks, value: string) {
    if (!woChecks || !selectedWo) return;
    const doSave = async (actionBy: string) => {
      const saveValue = actionBy;
      const isDone = saveValue !== "";
      const doneAtMap: Record<string, string> = {
        assignee_transfer:    "transfer_done_at",
        assignee_print_check: "print_check_done_at",
        assignee_input:       "input_done_at",
      };
      const doneAtKey = doneAtMap[assigneeKey as string] as keyof WoChecks | undefined;
      const now = new Date().toISOString();
      const prevDoneAtVal = doneAtKey ? woChecks[doneAtKey] : undefined;
      setWoChecks((prev) => prev ? { ...prev, [assigneeKey]: saveValue, [statusKey]: isDone, ...(doneAtKey ? { [doneAtKey]: isDone ? now : null } : {}) } : prev);
      setStepSaving(assigneeKey);
      const { error } = await supabase.from("work_orders").update({
        [assigneeKey]: saveValue || null,
        [statusKey]: isDone,
        ...(doneAtKey ? { [doneAtKey]: isDone ? now : null } : {}),
        updated_at: now,
      }).eq("id", selectedWo.id);
      setStepSaving(null);
      if (error) {
        setWoChecks((prev) => prev ? { ...prev, [assigneeKey]: woChecks[assigneeKey], [statusKey]: woChecks[statusKey], ...(doneAtKey ? { [doneAtKey]: prevDoneAtVal } : {}) } : prev);
        setMsg("진행상태 저장 실패: " + error.message);
      }
    };
    if (value === "" || value === "담당자없음") { await doSave(value); return; }
    if (isPinValid() && pinSession) {
      await doSave(pinSession.employeeName);
    } else {
      setPinProgressPending(() => (name: string) => doSave(name));
      setShowPinModalForProgress(true);
    }
  }

  async function searchTransferLots(itemId: string, keyword: string, skipProductionCheck = false, coatingOnly = false) {
    setTransferLotSearch((prev) => ({ ...prev, [itemId]: keyword }));
    setTransferLotSearching((prev) => ({ ...prev, [itemId]: true }));
    const { data: variants } = await supabase.from("product_variants").select("id, variant_name, barcode, products(food_type)").ilike("variant_name", keyword.trim() ? `%${keyword}%` : "%").limit(100);
    const filtered = coatingOnly
      ? (variants ?? []).filter((v: any) => v.variant_name === "코팅-레이즈")
      : skipProductionCheck
      ? (variants ?? []).filter((v: any) => v.variant_name === "도눔(은박)")
      : (variants ?? []).filter((v: any) => (v.products?.food_type ?? "").includes("초콜릿중간재"));
    if (filtered.length === 0) { setTransferLotOptions((prev) => ({ ...prev, [itemId]: [] })); setTransferLotSearching((prev) => ({ ...prev, [itemId]: false })); return; }
    const variantIds = filtered.map((v: any) => v.id);
    const { data: lots } = await supabase.from("lots").select("id, variant_id, expiry_date").in("variant_id", variantIds).order("expiry_date", { ascending: true });
    const lotIds = (lots ?? []).map((l: any) => l.id);
    let remainingMap: Record<string, number> = {};
    if (lotIds.length > 0) {
      const { data: movements } = await supabase.from("movements").select("lot_id, type, qty").in("lot_id", lotIds);
      for (const m of movements ?? []) { if (!remainingMap[m.lot_id]) remainingMap[m.lot_id] = 0; if (m.type === "IN") remainingMap[m.lot_id] += m.qty; else remainingMap[m.lot_id] -= m.qty; }
    }
    const variantMap: Record<string, any> = {};
    for (const v of filtered) variantMap[(v as any).id] = v;
    const result: TransferLot[] = (lots ?? []).filter((l: any) => (remainingMap[l.id] ?? 0) > 0).map((l: any) => ({ lot_id: l.id, expiry_date: l.expiry_date, remaining_qty: remainingMap[l.id] ?? 0, variant_name: variantMap[l.variant_id]?.variant_name ?? "", barcode: variantMap[l.variant_id]?.barcode ?? "" }));
    setTransferLotOptions((prev) => ({ ...prev, [itemId]: result }));
    setTransferLotSearching((prev) => ({ ...prev, [itemId]: false }));
  }

  async function searchTransferLotsMulti(itemId: string, keywords: string[], skipProductionCheck = false) {
    const uniqueKeywords = [...new Set(keywords.filter(Boolean))];
    for (const keyword of uniqueKeywords) {
      setTransferLotSearch((prev) => ({ ...prev, [itemId]: keyword }));
      setTransferLotSearching((prev) => ({ ...prev, [itemId]: true }));
      const { data: variants } = await supabase.from("product_variants").select("id, variant_name, barcode, products(food_type)").ilike("variant_name", keyword.trim() ? `%${keyword}%` : "%").limit(100);
      const filtered = skipProductionCheck
        ? (variants ?? []).filter((v: any) => v.variant_name === "도눔(은박)")
        : (variants ?? []).filter((v: any) =>
            (v.products?.food_type ?? "").includes("초콜릿중간재") ||
            (v.products?.food_type ?? "") === "생산용전사지"
          );
      if (filtered.length === 0) continue;
      const variantIds = filtered.map((v: any) => v.id);
      const { data: lots } = await supabase.from("lots").select("id, variant_id, expiry_date").in("variant_id", variantIds).order("expiry_date", { ascending: true });
      const lotIds = (lots ?? []).map((l: any) => l.id);
      let remainingMap: Record<string, number> = {};
      if (lotIds.length > 0) {
        const { data: movements } = await supabase.from("movements").select("lot_id, type, qty").in("lot_id", lotIds);
        for (const m of movements ?? []) { if (!remainingMap[m.lot_id]) remainingMap[m.lot_id] = 0; if (m.type === "IN") remainingMap[m.lot_id] += m.qty; else remainingMap[m.lot_id] -= m.qty; }
      }
      const variantMap: Record<string, any> = {};
      for (const v of filtered) variantMap[(v as any).id] = v;
      const result: TransferLot[] = (lots ?? []).filter((l: any) => (remainingMap[l.id] ?? 0) > 0).map((l: any) => ({ lot_id: l.id, expiry_date: l.expiry_date, remaining_qty: remainingMap[l.id] ?? 0, variant_name: variantMap[l.variant_id]?.variant_name ?? "", barcode: variantMap[l.variant_id]?.barcode ?? "" }));
      setTransferLotOptions((prev) => ({ ...prev, [itemId]: result }));
      setTransferLotSearching((prev) => ({ ...prev, [itemId]: false }));
      return;
    }
    setTransferLotOptions((prev) => ({ ...prev, [itemId]: [] }));
    setTransferLotSearching((prev) => ({ ...prev, [itemId]: false }));
  }

  function blockedByTransferCcp(assigneeKey: keyof WoChecks): boolean {
    if (assigneeKey !== "assignee_transfer") return false;
    if (!selectedWo || !needsTransferCcp(selectedWo.food_type)) return false;
    const hasTransferLotSelected = (selectedWo.work_order_items ?? []).some((item) => {
      const pi = prodInputs[item.id];
      return (pi?.transfer_lots ?? []).some((l) => l.lot_id && toInt(l.qty) > 0);
    });
    if (hasTransferLotSelected) return false;
    return !transferCcpEnded;
  }

  async function loadTransferCcpEvents(workOrderNo: string, slotIdOverride?: string | null) {
    const slotId = slotIdOverride !== undefined ? slotIdOverride : transferCcpSlotId;
    if (!slotId) { setTransferCcpEvents([]); return; }
    const { data } = await supabase
      .from("ccp_wo_events")
      .select("id, work_order_no, slot_id, event_type, measured_at, temperature, is_ok, action_note")
      .eq("slot_id", slotId)
      .eq("work_order_no", workOrderNo)
      .order("measured_at", { ascending: true });
    const seen = new Set<string>();
    const deduped = (data ?? []).filter((e: any) => {
      const key = `${e.measured_at}_${e.event_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setTransferCcpEvents(deduped as TransferCcpEvent[]);
    const lastEvent = deduped[deduped.length - 1];
    if (!lastEvent || lastEvent.event_type === "end") setTransferCcpEventType("start");
    else if (lastEvent.event_type === "start" || lastEvent.event_type === "mid_check") setTransferCcpEventType("mid_check");
    setTransferCcpTime("");
  }

  async function saveTransferCcpEvent(wo: WorkOrderRow) {
    const slotId = transferCcpSlotId;
    if (!slotId) return showToast("전사 슬롯(8번)을 찾을 수 없습니다.", "error");
    if (!transferCcpTime || transferCcpTime.length < 4) return showToast("측정시각을 입력하세요. (예: 1430)", "error");
    if (!transferCcpTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(transferCcpTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50°C 범위여야 합니다.", "error");

    const sorted = [...transferCcpEvents].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const lastEv = sorted[sorted.length - 1];
    const today = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })).toISOString().slice(0, 10);
    const newTimeStr = `${transferCcpTime.slice(0,2)}:${transferCcpTime.slice(2,4)}`;

    if (lastEv) {
      const lastTimeStr = kstTimeOnly(lastEv.measured_at);
      if (newTimeStr <= lastTimeStr) return showToast(`⚠ 측정시각은 마지막 기록(${lastTimeStr})보다 늦어야 합니다.`, "error");
    }
    if (transferCcpEventType === "start" && lastEv && lastEv.event_type !== "end") {
      return showToast("⚠ 시작은 종료 후에만 다시 기록할 수 있습니다.", "error");
    }
    if (transferCcpEventType === "mid_check" && (!lastEv || lastEv.event_type === "end")) {
      return showToast("⚠ 중간점검은 시작 후에만 기록할 수 있습니다.", "error");
    }
    if (transferCcpEventType === "end") {
      if (!lastEv || (lastEv.event_type !== "start" && lastEv.event_type !== "mid_check")) {
        return showToast("⚠ 종료는 시작 또는 중간점검 후에만 가능합니다.", "error");
      }
      const startEv = [...sorted].reverse().find((e) => e.event_type === "start");
      const hasMidCheck = sorted.some((e) => e.event_type === "mid_check");
      if (startEv && !hasMidCheck) {
        const startTime = new Date(startEv.measured_at);
        const endTimeKst = new Date(`${today}T${transferCcpTime.slice(0,2)}:${transferCcpTime.slice(2,4)}:00+09:00`);
        if ((endTimeKst.getTime() - startTime.getTime()) / 60000 >= 120) {
          return showToast("⚠ 시작~종료 2시간 이상 — 중간점검을 먼저 추가해주세요.", "error");
        }
      }
    }

    setTransferCcpSaving(true);
    const measuredAt = `${today}T${transferCcpTime.slice(0,2)}:${transferCcpTime.slice(2,4)}:00+09:00`;

    const { error } = await supabase.from("ccp_wo_events").insert({
      work_order_no: wo.work_order_no,
      slot_id: slotId,
      event_type: transferCcpEventType,
      measured_at: measuredAt,
      temperature: temp,
      is_ok: transferCcpIsOk,
      action_note: transferCcpActionNote.trim() || null,
      created_by: currentUserIdRef.current,
    });
    if (error) { setTransferCcpSaving(false); showToast("저장 실패: " + error.message, "error"); return; }

    await supabase.from("ccp_slot_events").insert({
      slot_id: slotId,
      event_date: today,
      event_type: transferCcpEventType,
      measured_at: measuredAt,
      work_order_no: wo.work_order_no,
      temperature: temp,
      is_ok: transferCcpIsOk,
      action_note: transferCcpEventType === "end" ? `${wo.client_name} · ${wo.product_name}` : transferCcpActionNote.trim() || null,
      created_by: currentUserIdRef.current,
    });

    setTransferCcpSaving(false);
    showToast("✅ 전사지인쇄 CCP-1B 온도 기록 완료!");
    setTransferCcpTemp(""); setTransferCcpActionNote(""); setTransferCcpIsOk(true); setTransferCcpTime("");
    await loadTransferCcpEvents(wo.work_order_no);
  }

  function startTransferCcpEdit(ev: TransferCcpEvent) {
    setTransferCcpEditingId(ev.id);
    const kstTime = kstTimeOnly(ev.measured_at);
    setTransferCcpEditTime(kstTime.replace(":", ""));
    setTransferCcpEditTemp(ev.temperature != null ? String(ev.temperature) : "");
    setTransferCcpEditIsOk(ev.is_ok ?? true);
    setTransferCcpEditActionNote(ev.action_note ?? "");
  }

  async function saveTransferCcpEdit(ev: TransferCcpEvent, workOrderNo: string) {
    if (!transferCcpEditTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(transferCcpEditTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50°C 범위여야 합니다.", "error");
    setTransferCcpEditSaving(true);
    const dateStr = ev.measured_at.slice(0, 10);
    const { error } = await supabase.from("ccp_wo_events").update({
      measured_at: `${dateStr}T${transferCcpEditTime.slice(0,2)}:${transferCcpEditTime.slice(2,4)}:00+09:00`,
      temperature: temp,
      is_ok: transferCcpEditIsOk,
      action_note: transferCcpEditActionNote.trim() || null,
    }).eq("id", ev.id);
    setTransferCcpEditSaving(false);
    if (error) return showToast("수정 실패: " + error.message, "error");
    showToast("✅ 수정 완료!");
    setTransferCcpEditingId(null);
    await loadTransferCcpEvents(workOrderNo);
  }

  async function deleteTransferCcpEvent(eventId: string, workOrderNo: string) {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    const { data: evData } = await supabase
      .from("ccp_wo_events")
      .select("slot_id, event_type, measured_at")
      .eq("id", eventId)
      .maybeSingle();
    const { error } = await supabase.from("ccp_wo_events").delete().eq("id", eventId);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    if (evData?.slot_id && evData?.measured_at) {
      await supabase.from("ccp_slot_events")
        .delete()
        .eq("slot_id", evData.slot_id)
        .eq("measured_at", evData.measured_at)
        .eq("event_type", evData.event_type);
    }
    showToast("🗑️ 삭제 완료!");
    await loadTransferCcpEvents(workOrderNo);
  }

  const loadWoList = useCallback(async (offset = 0) => {
    setLoading(true); setMsg(null);
    try {
      const LIMIT = filterStatus === "완료" ? 20 : 200;
      let q = supabase.from("work_orders").select(`id,work_order_no,barcode_no,client_id,client_name,sub_name,order_date,food_type,product_name,logo_spec,thickness,delivery_method,packaging_type,tray_slot,package_unit,mold_per_sheet,mold_cols,mold_rows,mold_count,note,reference_note,status,status_transfer,status_print_check,status_production,status_input,is_reorder,original_work_order_id,variant_id,images,linked_order_id,created_at,assignee_transfer,assignee_print_check,assignee_production,assignee_input,transfer_done_at,print_check_done_at,input_done_at,order_type,ccp_slot_id,skip_production_check,neo_color_spray_lots,work_order_items(id,delivery_date,sub_items,order_qty,barcode_no,actual_qty,gift_qty,defect_qty,unit_weight,expiry_date,transfer_lot_id,transfer_qty,transfer_lots,images),linked_order:orders!linked_order_id(memo)`).order("created_at", { ascending: false }).range(offset, offset + LIMIT - 1);
      if (filterStatus !== "전체") q = q.eq("status", filterStatus);
      if (filterDateFrom) q = q.gte("order_date", filterDateFrom);
      if (filterDateTo) q = q.lte("order_date", filterDateTo);
      const { data, error } = await q;
      if (error) return setMsg(error.message);
      const list = (data ?? []) as unknown as WorkOrderRow[];
      if (offset === 0) { setWoList(list); } else { setWoList((prev) => [...prev, ...list]); }
      setHasMore(list.length === LIMIT);
      if (filterStatus !== "생산중") {
        supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("status", "생산중").then(({ count }) => setProductionCount(count ?? 0));
      } else { setProductionCount(list.filter((w) => w.status === "생산중").length); }
      const ids = list.map((w) => w.id);
      await loadReadMap(ids);
      if (selectedWo) { const refreshed = list.find((w) => w.id === selectedWo.id); if (refreshed) await applySelection(refreshed, false); }
    } finally { setLoading(false); }
  }, [filterStatus, filterDateFrom, filterDateTo, loadReadMap]); // eslint-disable-line

  useEffect(() => { loadWoList(); }, [loadWoList]);

  // ─── URL 쿼리(?wo=<id>)로 전달된 작업지시서 자동 선택 — 생산일지/원료수불부 바로가기 링크용 ───
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const woIdFromUrl = params.get("wo");
    if (!woIdFromUrl) return;
    (async () => {
      const { data } = await supabase
        .from("work_orders")
        .select(`id,work_order_no,barcode_no,client_id,client_name,sub_name,order_date,food_type,product_name,logo_spec,thickness,delivery_method,packaging_type,tray_slot,package_unit,mold_per_sheet,mold_cols,mold_rows,mold_count,note,reference_note,status,status_transfer,status_print_check,status_production,status_input,is_reorder,original_work_order_id,variant_id,images,linked_order_id,created_at,assignee_transfer,assignee_print_check,assignee_production,assignee_input,transfer_done_at,print_check_done_at,input_done_at,order_type,ccp_slot_id,skip_production_check,neo_color_spray_lots,work_order_items(id,delivery_date,sub_items,order_qty,barcode_no,actual_qty,gift_qty,defect_qty,unit_weight,expiry_date,transfer_lot_id,transfer_qty,transfer_lots,images),linked_order:orders!linked_order_id(memo)`)
        .eq("id", woIdFromUrl)
        .maybeSingle();
      if (data) await applySelection(data as unknown as WorkOrderRow);
    })();
  }, []); // eslint-disable-line

  useEffect(() => {
    const channelId = `ccp_slot_events_realtime_${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(channelId)
      .on("postgres_changes", { event: "*", schema: "public", table: "ccp_slot_events" }, () => {
        if (slotStatusTimerRef.current) clearTimeout(slotStatusTimerRef.current);
        slotStatusTimerRef.current = setTimeout(() => ccpLoadSlotStatusRef.current(), 400);
      }).subscribe();
    return () => { supabase.removeChannel(channel); if (slotStatusTimerRef.current) clearTimeout(slotStatusTimerRef.current); };
  }, []); // eslint-disable-line

  useEffect(() => {
    const channelId = `wo_delete_realtime_${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(channelId)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "work_orders" }, (payload) => {
        const deletedId = String((payload.old as Record<string, unknown>)?.id ?? "");
        if (!deletedId) return;
        setWoList((prev) => prev.filter((w) => w.id !== deletedId));
        setSelectedWo((prev) => prev?.id === deletedId ? null : prev);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line

  useEffect(() => {
    const channelId = `movements_realtime_${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(channelId)
      .on("postgres_changes", { event: "*", schema: "public", table: "movements" }, (payload) => {
        const currentOptions = neoColorSprayLotOptionsRef.current;
        if (currentOptions.length === 0) return;
        // DELETE 이벤트는 payload.old에 id만 오므로 전체 lot 잔량 재조회
        // INSERT/UPDATE 이벤트는 lot_id로 필터링
        const d = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
        const lotId = String(d.lot_id ?? "");
        const isRelevant = lotId
          ? currentOptions.some((l) => l.lot_id === lotId)
          : payload.eventType === "DELETE"; // DELETE + lot_id 없으면 전체 재조회
        if (!isRelevant) return;
        const lotIdsToRefresh = lotId ? [lotId] : currentOptions.map((l) => l.lot_id);
        (async () => {
          const { data: movData } = await supabase.from("movements").select("lot_id, type, qty").in("lot_id", lotIdsToRefresh);
          const remainingMap: Record<string, number> = {};
          for (const m of movData ?? []) {
            if (!remainingMap[m.lot_id]) remainingMap[m.lot_id] = 0;
            if (m.type === "IN") remainingMap[m.lot_id] += m.qty;
            else remainingMap[m.lot_id] -= m.qty;
          }
          setNeoColorSprayLotOptions((prev) => {
            const next = prev.map((l) => lotIdsToRefresh.includes(l.lot_id)
              ? { ...l, remaining_qty: remainingMap[l.lot_id] ?? l.remaining_qty }
              : l
            );
            neoColorSprayLotOptionsRef.current = next;
            return next;
          });
        })();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line

  useEffect(() => { supabase.from("employees").select("id,name,pin,resign_date").is("resign_date", null).order("name").limit(500).then(({ data }) => { if (data) setEmployees(data); }); }, []);
  useEffect(() => { supabase.from("warmer_slots").select("id,slot_name,purpose").eq("is_active", true).order("slot_no").then(({ data }) => { if (data) setWarmerSlots(data); }); }, []);
  useEffect(() => {
    const today = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })).toISOString().slice(0, 10);
    supabase.from("expiry_mgmt_logs").select("id,item_name,status,expiry_date,action,log_date").eq("log_date", today).in("status", ["D-30 경보", "만료", "안전재고 미달"]).order("status").then(({ data }) => { if (data) setStockAlerts(data); });
  }, []);

  const filteredList = useMemo(() => {
    const q = filterSearch.trim();
    let list = q ? woList.filter((wo) => matchesSearch([wo.client_name, wo.sub_name, wo.product_name, wo.barcode_no, wo.work_order_no, wo.food_type].filter(Boolean).join(" "), q)) : [...woList];
    if (filterFoodCategory === "전사지") list = list.filter((wo) => getFoodCategory(wo.food_type) === "중간재");
    else if (filterFoodCategory !== "전체") list = list.filter((wo) => getFoodCategory(wo.food_type) === filterFoodCategory);
    if (sortBy === "delivery_date") {
      list.sort((a, b) => {
        const aDate = (a.work_order_items ?? []).map((i) => i.delivery_date).filter(Boolean).sort()[0] ?? "";
        const bDate = (b.work_order_items ?? []).map((i) => i.delivery_date).filter(Boolean).sort()[0] ?? "";
        return aDate.localeCompare(bDate);
      });
    }
    return list;
  }, [woList, filterSearch, sortBy, filterFoodCategory]);

  async function applySelection(wo: WorkOrderRow, resetEdit = true) {
    setIsKiseongForm(false); setIsEditMode(false);
    setBlendCount(1); // 배합 횟수 초기화
    setSprayProdQty(""); // 분사 수량 초기화
    setCompWorkHours(""); setCompDamageOk(true); setCompNote(""); setCompSaved(false); setCompSaving(false); setCompLogId(null);
    setNeoColorSprayLots([]); // 네오컬러 분사-레이즈 lot 초기화
    setNeoColorSprayLotOptions([]); // 네오컬러 분사-레이즈 lot 옵션 초기화
    neoColorSprayLotOptionsRef.current = []; // ref도 초기화
    setNeoColorSpraySaved(false);
    setNeoColorSprayEditMode(false);
    // 전사지인쇄 CCP-1B(8번 슬롯) 초기화 + 로드
    setTransferCcpTemp(""); setTransferCcpActionNote(""); setTransferCcpIsOk(true); setTransferCcpEditingId(null);
    let resolvedTransferSlotId: string | null = transferCcpSlotId;
    if (needsTransferCcp(wo.food_type)) {
      if (!resolvedTransferSlotId) {
        const { data: slotData } = await supabase.from("warmer_slots").select("id").eq("slot_name", "8").eq("is_active", true).maybeSingle();
        resolvedTransferSlotId = slotData?.id ?? null;
      }
      loadTransferCcpEvents(wo.work_order_no, resolvedTransferSlotId);
    } else { setTransferCcpEvents([]); }
    // 네오컬러화이트/리얼화이트: 저장된 값 불러오기 + lot 자동 검색
    const isNeoColorWo = ["네오컬러화이트", "네오컬러리얼화이트", "롤리팝컬러리얼화이트", "롤리팝컬러화이트"].some((k) => (wo.food_type ?? "").includes(k));
    if (isNeoColorWo && wo.neo_color_spray_lots && wo.neo_color_spray_lots.length > 0) {
      setNeoColorSprayLots(wo.neo_color_spray_lots);
      setNeoColorSpraySaved(true);
    }
    if (isNeoColorWo) {
      setNeoColorSprayLotLoading(true);
      const { data: sprayVariants } = await supabase.from("product_variants").select("id, variant_name").eq("variant_name", "분사-레이즈");
      const sprayVariantIds = (sprayVariants ?? []).map((v: any) => v.id);
      if (sprayVariantIds.length > 0) {
        const { data: sprayLots } = await supabase.from("lots").select("id, variant_id, expiry_date").in("variant_id", sprayVariantIds).order("expiry_date", { ascending: true });
        const sprayLotIds = (sprayLots ?? []).map((l: any) => l.id);
        const sprayRemainingMap: Record<string, number> = {};
        if (sprayLotIds.length > 0) {
          const { data: sprayMovements } = await supabase.from("movements").select("lot_id, type, qty").in("lot_id", sprayLotIds);
          for (const m of sprayMovements ?? []) {
            if (!sprayRemainingMap[m.lot_id]) sprayRemainingMap[m.lot_id] = 0;
            if (m.type === "IN") sprayRemainingMap[m.lot_id] += m.qty;
            else sprayRemainingMap[m.lot_id] -= m.qty;
          }
        }
        const sprayVariantMap: Record<string, any> = {};
        for (const v of sprayVariants ?? []) sprayVariantMap[(v as any).id] = v;
        const sprayResult = (sprayLots ?? [])
          .filter((l: any) => (sprayRemainingMap[l.id] ?? 0) > 0)
          .map((l: any) => ({
            lot_id: l.id,
            expiry_date: l.expiry_date,
            remaining_qty: sprayRemainingMap[l.id] ?? 0,
            variant_name: sprayVariantMap[l.variant_id]?.variant_name ?? "",
          }));
        setNeoColorSprayLotOptions(sprayResult);
        neoColorSprayLotOptionsRef.current = sprayResult;
      }
      setNeoColorSprayLotLoading(false);
    }
    if (!wo.work_order_items || wo.work_order_items.every((i) => i.sub_items == null)) {
      const { data: items } = await supabase.from("work_order_items").select("id,work_order_id,delivery_date,sub_items,order_qty,barcode_no,actual_qty,defect_qty,unit_weight,total_weight,expiry_date,order_id,note,images").eq("work_order_id", wo.id).order("delivery_date", { ascending: true });
      wo = { ...wo, work_order_items: (items ?? []) as WoItemRow[] };
    }
    setSelectedWo(wo);
    setESubName(wo.sub_name ?? "");
    const woSubNameVal = wo.sub_name ?? "";
    if (woSubNameVal) { setEProductName(woSubNameVal); } else {
      const visibleItems = (wo.work_order_items ?? []).filter((item) => { const n = (item.sub_items ?? [])[0]?.name ?? ""; return !n.startsWith("성형틀") && !n.startsWith("인쇄제판"); });
      const firstName = visibleItems[0]?.sub_items?.[0]?.name ?? wo.product_name ?? "";
      const count = visibleItems.length;
      setEProductName(count > 1 ? `${firstName} 외 ${count - 1}건` : firstName);
    }
    setEFoodType(wo.food_type ?? ""); setELogoSpec(wo.logo_spec ?? ""); setEThickness(wo.thickness ?? "2mm"); setEDeliveryMethod(wo.delivery_method ?? "택배"); setEPackagingType(wo.packaging_type ?? ""); setETraySlot(wo.tray_slot ?? "정사각20구");
    const _apu = wo.package_unit ?? "100ea";
    if (_apu === "100ea" || _apu === "200ea") { setEPackageUnit(_apu); setEPackageUnitCustom(""); }
    else { setEPackageUnit("기타"); setEPackageUnitCustom(_apu.replace(/ea$/i, "")); } setEMoldPerSheet(wo.mold_per_sheet ? String(wo.mold_per_sheet) : "");
    setEMoldCols((wo as any).mold_cols ? String((wo as any).mold_cols) : "");
    setEMoldRows((wo as any).mold_rows ? String((wo as any).mold_rows) : "");
    setEMoldCount((wo as any).mold_count ? String((wo as any).mold_count) : "");
    setENote(wo.note ?? ""); setEReferenceNote(wo.reference_note ?? ""); setECcpSlotId(wo.ccp_slot_id ?? "");
    setWoChecks({ status_transfer: wo.status_transfer, status_print_check: wo.status_print_check, status_production: wo.status_production, status_input: wo.status_input, assignee_transfer: (wo as any).assignee_transfer ?? "", assignee_print_check: (wo as any).assignee_print_check ?? "", assignee_production: (wo as any).assignee_production ?? "", assignee_input: (wo as any).assignee_input ?? "", transfer_done_at: (wo as any).transfer_done_at ?? null, print_check_done_at: (wo as any).print_check_done_at ?? null, input_done_at: (wo as any).input_done_at ?? null });
    setLastUpdatedAt(null); setFlashKey(null); setSignedImageUrls([]);
    const userId = currentUserIdRef.current;
    if (userId && !readMap[wo.id]) {
      const now = new Date().toISOString();
      supabase.from("work_order_reads").upsert({ work_order_id: wo.id, user_id: userId, read_at: now }, { onConflict: "work_order_id,user_id" }).then(() => { setReadMap((prev) => ({ ...prev, [wo.id]: { read_at: now } })); });
    }
    (async () => {
      const rawPaths = wo.images ?? [];
      if (rawPaths.length === 0) return;
      const paths = rawPaths.map((v) => { if (v.startsWith("http")) { const m = v.match(/work-order-images\/(.+?)(\?|$)/); return m ? m[1] : null; } return v; }).filter(Boolean) as string[];
      if (paths.length === 0) { setSignedImageUrls(rawPaths); return; }
      const { data, error } = await supabase.storage.from("work-order-images").createSignedUrls(paths, 60 * 60);
      if (!error && data) setSignedImageUrls(data.map((d) => d.signedUrl)); else setSignedImageUrls(rawPaths);
    })();
    const inputs: Record<string, { actual_qty: string; gift_qty: string; defect_qty?: string; unit_weight: string; expiry_date: string; transfer_lot_id: string; transfer_qty: string; transfer_lots: { lot_id: string; qty: string }[]; skip?: boolean }> = {};
    for (const item of wo.work_order_items ?? []) {
      const savedLots = (item as any).transfer_lots as { lot_id: string; qty: number }[] | null;
      const extraQtyCalc = (item.actual_qty != null && item.actual_qty > item.order_qty)
        ? String(item.actual_qty - item.order_qty)
        : "";
        inputs[item.id] = {
          actual_qty: item.actual_qty != null ? String(item.actual_qty) : "",
          gift_qty: (item as any).gift_qty != null ? String((item as any).gift_qty) : extraQtyCalc,
          defect_qty: item.defect_qty != null ? String(item.defect_qty) : "",
          unit_weight: item.unit_weight != null ? String(item.unit_weight) : "",
          expiry_date: item.expiry_date ?? "",
          transfer_lot_id: item.transfer_lot_id ?? "",
          transfer_qty: item.transfer_qty != null ? String(item.transfer_qty) : "",
          transfer_lots: savedLots ? savedLots.map((l) => ({ lot_id: l.lot_id, qty: String(l.qty) })) : [],
          skip: false,
        };
    }
    setProdInputs(inputs);
    (async () => {
      const items = wo.work_order_items ?? [];
      const missingWeight = items.filter((item) => item.unit_weight == null && item.barcode_no);
      if (missingWeight.length === 0 && wo.variant_id == null) return;
      const barcodes = missingWeight.map((i) => i.barcode_no).filter(Boolean) as string[];
      let weightMap: Record<string, string> = {};
      if (barcodes.length > 0) {
        const { data: pbData } = await supabase.from("product_barcodes").select("barcode, variant_id, product_variants(weight_g)").in("barcode", barcodes);
        for (const pb of pbData ?? []) { const wg = (pb as any).product_variants?.weight_g; if (wg != null && wg > 0) weightMap[(pb as any).barcode] = String(wg); }
      }
      let fallbackWeight = "";
      if (wo.variant_id) { const { data: vData } = await supabase.from("product_variants").select("weight_g").eq("id", wo.variant_id).maybeSingle(); if ((vData as any)?.weight_g != null && (vData as any).weight_g > 0) fallbackWeight = String((vData as any).weight_g); }
      setProdInputs((prev) => {
        const next = { ...prev };
        for (const item of items) { if (item.unit_weight != null) continue; const wByBarcode = item.barcode_no ? weightMap[item.barcode_no] : undefined; const autoWeight = wByBarcode ?? fallbackWeight; if (autoWeight) next[item.id] = { ...next[item.id], unit_weight: autoWeight }; }
        return next;
      });
    })();
    ccp.loadWoEvents(wo.work_order_no, wo.ccp_slot_id, wo.status, needsTransferCcp(wo.food_type) ? resolvedTransferSlotId : null);
    // 압축공기 기존 기록 로드 (분사/코팅 작업지시서)
    if (getWoSubType(wo.product_name)) {
      (async () => {
        const { data: compData } = await supabase
          .from("compressor_logs")
          .select("id, work_hours, is_damaged, note")
          .eq("work_order_id", wo.id)
          .maybeSingle();
        if (compData) {
          setCompWorkHours(String(compData.work_hours ?? ""));
          setCompDamageOk(!compData.is_damaged);
          setCompNote(compData.note ?? "");
          setCompSaved(true);
          setCompLogId(compData.id);
        }
      })();
    }
    // 분사/코팅 완료된 WO: blend_logs에서 저장된 배합 횟수 로드
    if (getWoSubType(wo.product_name) && wo.status === "완료") {
      (async () => {
        const recipeName = getWoSubType(wo.product_name) === "분사" ? "레이즈 분사" : "레이즈 코팅";
        const { data: blendLogData } = await supabase
          .from("blend_logs")
          .select("multiplier")
          .eq("note", `${wo.work_order_no} 생산완료`)
          .eq("recipe_name", recipeName)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (blendLogData?.multiplier) setBlendCount(blendLogData.multiplier);
      })();
    }

    // 분사 작업지시서: 코팅-레이즈 lot 자동 검색
    if (getWoSubType(wo.product_name) === "분사") {
      for (const item of (wo.work_order_items ?? [])) {
        const name = (item.sub_items ?? [])[0]?.name ?? "";
        if (name.startsWith("성형틀") || name.startsWith("인쇄제판")) continue;
        const savedLots = ((item as any).transfer_lots ?? []) as { lot_id: string; qty: number }[];
        if (savedLots.length > 0 || item.transfer_lot_id) {
          // 이미 저장된 코팅-레이즈 lot 정보를 조회해 transferLotOptions에 세팅
          const savedLotIds = savedLots.map((l) => l.lot_id).filter(Boolean);
          if (savedLotIds.length > 0) {
            (async () => {
              const { data: lotsData } = await supabase.from("lots").select("id, variant_id, expiry_date").in("id", savedLotIds);
              const variantIds = (lotsData ?? []).map((l: any) => l.variant_id).filter(Boolean);
              const { data: variantsData } = await supabase.from("product_variants").select("id, variant_name").in("id", variantIds);
              const variantMap: Record<string, string> = {};
              for (const v of variantsData ?? []) variantMap[(v as any).id] = (v as any).variant_name ?? "";
              const { data: movData } = await supabase.from("movements").select("lot_id, type, qty").in("lot_id", savedLotIds);
              const remainingMap: Record<string, number> = {};
              for (const m of movData ?? []) {
                if (!remainingMap[m.lot_id]) remainingMap[m.lot_id] = 0;
                if (m.type === "IN") remainingMap[m.lot_id] += m.qty;
                else remainingMap[m.lot_id] -= m.qty;
              }
              const result = (lotsData ?? []).map((l: any) => ({
                lot_id: l.id,
                expiry_date: l.expiry_date ?? "",
                remaining_qty: remainingMap[l.id] ?? 0,
                variant_name: variantMap[l.variant_id] ?? "",
                barcode: "",
              }));
              setTransferLotOptions((prev) => ({ ...prev, [item.id]: result }));
            })();
          }
          continue;
        }
        searchTransferLots(item.id, "코팅-레이즈", false, true);
      }
    }

    if (getFoodCategory(wo.food_type) !== "중간재") {
      const woItems = wo.work_order_items ?? [];
      const extractKeyword = (raw: string) => raw.replace(/^(주식회사|유한회사|합자회사|협동조합|\(주\)|\(유\))\s*/g, "").replace(/\(.*?\)/g, "").trim().split(/[\s\-_]/)[0] ?? raw.trim();
      const clientRaw = wo.order_type === "재고" ? (wo.product_name ?? "") : (wo.client_name ?? "");
      const clientKeyword = wo.skip_production_check ? "도눔" : extractKeyword(clientRaw);
      for (const item of woItems) {
        const name = (item.sub_items ?? [])[0]?.name ?? "";
        if (name.startsWith("성형틀") || name.startsWith("인쇄제판")) continue;
        if ((item as any).transfer_lots?.length > 0 || item.transfer_lot_id) {
          // 이미 저장된 transfer_lots의 lot 정보를 직접 조회해 옵션에 세팅
          const savedLots = ((item as any).transfer_lots ?? []) as { lot_id: string; qty: number }[];
          const savedLotIds = savedLots.map((l) => l.lot_id).filter(Boolean);
          if (savedLotIds.length > 0) {
            (async () => {
              const { data: lotsData } = await supabase.from("lots").select("id, variant_id, expiry_date").in("id", savedLotIds);
              const variantIds = (lotsData ?? []).map((l: any) => l.variant_id).filter(Boolean);
              const { data: variantsData } = await supabase.from("product_variants").select("id, variant_name").in("id", variantIds);
              const variantMap: Record<string, string> = {};
              for (const v of variantsData ?? []) variantMap[(v as any).id] = (v as any).variant_name ?? "";
              const { data: movData } = await supabase.from("movements").select("lot_id, type, qty").in("lot_id", savedLotIds);
              const remainingMap: Record<string, number> = {};
              for (const m of movData ?? []) {
                if (!remainingMap[m.lot_id]) remainingMap[m.lot_id] = 0;
                if (m.type === "IN") remainingMap[m.lot_id] += m.qty;
                else remainingMap[m.lot_id] -= m.qty;
              }
              const result = (lotsData ?? []).map((l: any) => ({
                lot_id: l.id,
                expiry_date: l.expiry_date ?? "",
                remaining_qty: remainingMap[l.id] ?? 0,
                variant_name: variantMap[l.variant_id] ?? "",
                barcode: "",
              }));
              setTransferLotOptions((prev) => ({ ...prev, [item.id]: result }));
            })();
          }
          continue;
        }
        const itemKeyword = extractKeyword(name);
        const MARKETPLACE_CLIENTS = ["네이버-판매", "카카오플러스-판매", "쿠팡-판매"];
        const isMarketplace = MARKETPLACE_CLIENTS.includes(wo.client_name ?? "");
        const keywords = (clientKeyword && !isMarketplace)
          ? [clientKeyword]
          : itemKeyword ? [itemKeyword] : [];
searchTransferLotsMulti(item.id, keywords, !!wo.skip_production_check);
      }
    }
  }

  function handleDeleteClick(woId: string) {
    if (!isAdminOrSubadmin) return;
    setDeletePinTargetId(woId);
    setShowDeletePinModal(true);
  }

  async function deleteWo(woId: string, pinName: string) {
    try {
      const { data: woData, error: woFetchErr } = await supabase.from("work_orders").select("*").eq("id", woId).single();
      if (woFetchErr || !woData) { showToast("작업지시서 조회 실패", "error"); return; }
      const { data: itemsData } = await supabase.from("work_order_items").select("*").eq("work_order_id", woId);
      const { error: backupErr } = await supabase.from("deleted_work_orders").insert({ original_id: woId, work_order_no: woData.work_order_no, snapshot: woData, items_snapshot: itemsData ?? [], deleted_by: currentUserIdRef.current, deleted_by_name: pinName });
      if (backupErr) { showToast("백업 저장 실패: " + backupErr.message, "error"); return; }
      await supabase.from("work_order_items").update({ order_id: null }).eq("work_order_id", woId);
      if (woData.linked_order_id) { await supabase.from("orders").update({ work_order_item_id: null }).eq("id", woData.linked_order_id); }
      await supabase.from("work_order_items").delete().eq("work_order_id", woId);
      if (woData.work_order_no) {
        await supabase.from("ccp_wo_events").delete().eq("work_order_no", woData.work_order_no);
        await supabase.from("deleted_work_order_nos").insert({ work_order_no: woData.work_order_no });
        // 원료수불부 차감 기록 삭제 (컴파운드, 이산화티타늄, 전사지)
        await supabase.from("material_usage_logs").delete().eq("note", `작업지시서 생산완료 - ${woData.work_order_no}`);
        await supabase.from("material_usage_logs").delete().eq("note", `이산화티타늄 차감 - ${woData.work_order_no}`);
        await supabase.from("material_usage_logs").delete().like("note", `전사지 차감 - ${woData.work_order_no}%`);
       // movements 복구 (transfer_lots 차감, 도눔 포장완료)
        const { data: movToDelete } = await supabase.from("movements").select("id").like("note", `전사지 차감 - ${woData.work_order_no}%`);
        if (movToDelete && movToDelete.length > 0) {
          await supabase.from("movements").delete().in("id", movToDelete.map((m) => m.id));
        }
        const { data: movToDelete2 } = await supabase.from("movements").select("id").eq("note", `도눔 포장완료 - ${woData.work_order_no}`);
        if (movToDelete2 && movToDelete2.length > 0) {
          await supabase.from("movements").delete().in("id", movToDelete2.map((m) => m.id));
        }
        // movements + pet_stock_logs 복구 (네오컬러 분사-레이즈 인쇄투입)
        const neoNote = `네오컬러 인쇄투입 - ${woData.work_order_no}`;
        const { data: movToDelete3 } = await supabase.from("movements").select("id").eq("note", neoNote);
        if (movToDelete3 && movToDelete3.length > 0) {
          await supabase.from("movements").delete().in("id", movToDelete3.map((m) => m.id));
        }
        const { data: petToDelete } = await supabase.from("pet_stock_logs").select("id").eq("note", neoNote);
        if (petToDelete && petToDelete.length > 0) {
          await supabase.from("pet_stock_logs").delete().in("id", petToDelete.map((p) => p.id));
        }
      }
      const { error: deleteErr } = await supabase.from("work_orders").delete().eq("id", woId);
      if (deleteErr) { showToast("삭제 실패: " + deleteErr.message, "error"); return; }
      if (selectedWo?.id === woId) setSelectedWo(null);
      showToast("삭제 완료 (복원 가능)");
      await loadWoList();
    } catch (e: any) { showToast("삭제 오류: " + (e?.message ?? e), "error"); }
  }

  async function triggerPdfUpload(wo: WorkOrderRow, productName: string, foodType: string, logoSpec: string) {
    try {
      const woDateMatch = wo.work_order_no?.match(/WO-(\d{8})-/);
      const dateStr = woDateMatch ? woDateMatch[1] : new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const sanitize = (str: string) => str.replace(/[*×]/g, "x").replace(/[\\/:?"<>|]/g, "").replace(/\s+/g, "_");
      const clientName = wo.client_name ?? "업체미상";
      const cleanProductName = productName.startsWith(clientName) ? productName.slice(clientName.length).replace(/^[-_\s]+/, "") : productName;
      const fileName = [dateStr, sanitize(clientName), sanitize(cleanProductName || "품목미상"), sanitize(foodType ?? ""), sanitize(logoSpec ?? ""), "작업지시서"].filter(Boolean).join("-");
      const triggerRes = await fetch("/api/trigger-work-order-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workOrderId: wo.id, fileName }) });
      if (triggerRes.ok) console.log("PDF 드라이브 업로드 트리거 성공:", fileName); else console.error("PDF 드라이브 업로드 트리거 실패");
    } catch (pdfErr) { console.error("PDF 업로드 트리거 오류:", pdfErr); }
  }

   // ─── 포장완료 처리 (skip_production_check = true, 도눔 포장 출고용) ───
   async function doCompletePackaging(productionAssignee: string) {
    if (!selectedWo) return;
    setIsCompleting(true);
    setMsg("저장 중...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      const items = (selectedWo.work_order_items ?? []).filter((item) => {
        const name = (item.sub_items ?? [])[0]?.name ?? "";
        return !name.startsWith("성형틀") && !name.startsWith("인쇄제판") && !name.startsWith("아이스박스") && !name.startsWith("택배비");
      });
      // work_order_items 저장
      for (const item of items) {
        const pi = prodInputs[item.id];
        if (!pi || (!pi.actual_qty && !pi.unit_weight && !pi.expiry_date)) continue;
        await supabase.from("work_order_items").update({
          actual_qty: pi.actual_qty ? toInt(pi.actual_qty) : null,
          unit_weight: pi.unit_weight ? toNum(pi.unit_weight) : null,
          expiry_date: pi.expiry_date || null,
        }).eq("id", item.id);
      }
     // 도눔(은박) 재고 차감
     const stockErrors: string[] = [];
     for (const item of items) {
       const pi = prodInputs[item.id];
       const transferLots = pi?.transfer_lots ?? [];
       if (transferLots.length === 0) continue;
       const today = `${new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })).toISOString().slice(0, 10)}T00:00:00+09:00`;
       for (const tl of transferLots) {
         const transferQty = toInt(tl.qty);
         if (!tl.lot_id || transferQty <= 0) continue;
         const { data: movData } = await supabase.from("movements").select("type, qty").eq("lot_id", tl.lot_id);
         const remaining = (movData ?? []).reduce((sum, m) => m.type === "IN" ? sum + m.qty : sum - m.qty, 0);
         if (transferQty > remaining) {
           setMsg(`도눔(은박) 차감 실패: 차감 수량(${transferQty})이 잔량(${remaining})을 초과합니다.`);
           setIsCompleting(false);
           return;
         }
         const { error: transferErr } = await supabase.from("movements").insert({
           lot_id: tl.lot_id, type: "OUT", qty: transferQty,
           happened_at: today,
           note: `도눔 포장완료 - ${selectedWo.work_order_no}`,
           created_by: userId,
         });
         if (transferErr) stockErrors.push("차감 실패: " + transferErr.message);
       }
       const lotsForDb = transferLots.map((l) => ({ lot_id: l.lot_id, qty: toInt(l.qty) }));
       const totalQty = lotsForDb.reduce((s, l) => s + l.qty, 0);
       await supabase.from("work_order_items").update({
         transfer_lot_id: lotsForDb[0]?.lot_id ?? null,
         transfer_qty: totalQty > 0 ? totalQty : null,
         transfer_lots: lotsForDb,
       }).eq("id", item.id);
     }
      // 상태 완료
      const { error: statusErr } = await supabase.from("work_orders").update({
        status: "완료",
        status_production: true,
        ccp_slot_id: null,
        assignee_production: productionAssignee,
        production_done_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", selectedWo.id);
      if (statusErr) { setMsg("상태 변경 실패: " + statusErr.message); setIsCompleting(false); return; }
      if (stockErrors.length > 0) showToast("포장완료됐으나 차감 오류: " + stockErrors.join(" / "), "error");
      else showToast("포장완료 처리 완료!");
      setIsEditMode(false);
      await loadWoList();
    } catch (e: any) {
      setMsg("오류: " + (e?.message ?? e));
    } finally {
      setIsCompleting(false);
    }
  }

 // ─── 압축공기 기록 저장/수정 ───
 async function saveCompressorLog(workerName: string) {
  if (!selectedWo) return;
  if (!compWorkHours || isNaN(Number(compWorkHours))) {
    return showToast("작업시간을 입력하세요.", "error");
  }
  setCompSaving(true);
  const today = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })).toISOString().slice(0, 10);
  const subType = getWoSubType(selectedWo.product_name) ?? "분사";
  const { data: { user } } = await supabase.auth.getUser();
  const createdBy = user?.id ?? null;
  if (compLogId) {
    // 수정 — 누계는 변경하지 않음
    const { error } = await supabase.from("compressor_logs").update({
      work_hours: Number(compWorkHours),
      is_damaged: !compDamageOk,
      note: compNote.trim() || null,
      worker_name: workerName,
      updated_at: new Date().toISOString(),
    }).eq("id", compLogId);
    setCompSaving(false);
    if (error) return showToast("압축공기 수정 실패: " + error.message, "error");
  } else {
    // 신규 — 누계 계산
    const { data: lastLog } = await supabase
      .from("compressor_logs")
      .select("cumulative_hours")
      .order("worked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastCum = Number(lastLog?.cumulative_hours ?? 0);
    const newCum = Math.round((lastCum + Number(compWorkHours)) * 10) / 10;
    const { data: newLog, error } = await supabase.from("compressor_logs").insert({
      log_date: today,
      worked_at: `${today}T00:00:00+09:00`,
      work_type: subType,
      work_hours: Number(compWorkHours),
      cumulative_hours: newCum,
      is_damaged: !compDamageOk,
      worker_name: workerName,
      note: compNote.trim() || null,
      work_order_id: selectedWo.id,
      created_by: createdBy,
    }).select("id").single();
    setCompSaving(false);
    if (error) return showToast("압축공기 저장 실패: " + error.message, "error");
    setCompLogId(newLog.id);
  }
  setCompSaved(true);
  showToast("✅ 압축공기 기록 저장!");
}

// ─── 분사/코팅 생산완료 처리 ───
async function doCompleteSprayCoating(productionAssignee: string, subType: "분사" | "코팅") {
  if (!selectedWo) return;
  setIsCompleting(true);
  setMsg("저장 중...");
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    const today = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })).toISOString().slice(0, 10);

// ── 중복 실행 방어: 이미 blend_logs가 존재하면 중단 ──
const dupRecipeName = subType === "분사" ? "레이즈 분사" : "레이즈 코팅";
const dupNote = `${selectedWo.work_order_no} 생산완료`;
const { data: dupCheck } = await supabase.from("blend_logs")
  .select("id").eq("note", dupNote).eq("recipe_name", dupRecipeName).limit(1);
if (dupCheck && dupCheck.length > 0) {
  showToast("이미 생산완료 처리된 작업지시서입니다.", "error");
  setIsCompleting(false);
  return;
}

    // 1. work_order_items 저장
      const items = (selectedWo.work_order_items ?? []).filter((item) => {
        const name = (item.sub_items ?? [])[0]?.name ?? "";
        return !name.startsWith("성형틀") && !name.startsWith("인쇄제판") && !name.startsWith("아이스박스") && !name.startsWith("택배비");
      });
      for (const item of items) {
        const pi = prodInputs[item.id];
        if (!pi || (!pi.actual_qty && !pi.unit_weight && !pi.expiry_date)) continue;
        await supabase.from("work_order_items").update({
          actual_qty:  pi.actual_qty  ? toInt(pi.actual_qty)  : null,
          unit_weight: pi.unit_weight ? toNum(pi.unit_weight) : null,
          expiry_date: pi.expiry_date || null,
        }).eq("id", item.id);
      }

      // 2. blend_logs + blend_log_items + material_usage_logs
      const isSpray = subType === "분사";
      const recipeName = isSpray ? "레이즈 분사" : "레이즈 코팅";
      const { data: recipeData } = await supabase.from("blend_recipes").select("id").eq("name", recipeName).maybeSingle();
      const recipeId = recipeData?.id ?? null;

      if (recipeId) {
        const { data: blendLog, error: blendErr } = await supabase.from("blend_logs").insert({
          happened_at:   `${today}T00:00:00+09:00`,
          log_date:      today,
          employee_name: productionAssignee,
          recipe_id:     recipeId,
          recipe_name:   recipeName,
          multiplier:    blendCount,
          note:          `${selectedWo.work_order_no} 생산완료`,
          created_by:    userId,
        }).select("id").single();

        if (!blendErr && blendLog) {
          let logItems: { blend_log_id: string; material_name: string; quantity_g: number }[] = [];
          if (isSpray) {
            const d = SPRAY_RECIPE[blendCount];
            logItems = [
              { blend_log_id: blendLog.id, material_name: "유화제",   quantity_g: d.유화제 },
              { blend_log_id: blendLog.id, material_name: "감자전분", quantity_g: d.감자전분 },
            ];
          } else {
            logItems = [
              { blend_log_id: blendLog.id, material_name: "팜유",    quantity_g: COATING_BASE.팜유    * blendCount },
              { blend_log_id: blendLog.id, material_name: "유청분말", quantity_g: COATING_BASE.유청분말 * blendCount },
            ];
          }
          await supabase.from("blend_log_items").insert(logItems);

          const matNames = logItems.map((i) => i.material_name);
          const { data: matsData } = await supabase.from("materials").select("id,name").in("name", matNames);
          const matMap: Record<string, string> = {};
          (matsData ?? []).forEach((m: any) => { matMap[m.name] = m.id; });
          const usageLogs = logItems.filter((i) => matMap[i.material_name]).map((i) => ({
            material_id: matMap[i.material_name],
            used_date:   today,
            quantity:    i.quantity_g,
            unit:        "g",
            work_type:   "blend",
            note:        `${recipeName} ${blendCount}배합 — ${selectedWo.work_order_no}`,
            created_by:  userId,
          }));
          if (usageLogs.length > 0) await supabase.from("material_usage_logs").insert(usageLogs);
        }
      }

      // 3. pet_stock_logs 기록
      if (isSpray) {
        // 분사: 코팅-레이즈 lot 차감
        for (const item of items) {
          const pi = prodInputs[item.id];
          const transferLots = pi?.transfer_lots ?? [];
          for (const tl of transferLots) {
            const transferQty = toInt(tl.qty);
            if (!tl.lot_id || transferQty <= 0) continue;
            const { data: movData } = await supabase.from("movements").select("type, qty").eq("lot_id", tl.lot_id);
            const remaining = (movData ?? []).reduce((sum, m) => m.type === "IN" ? sum + m.qty : sum - m.qty, 0);
            if (transferQty > remaining) {
              setMsg(`코팅-레이즈 차감 실패: 차감 수량(${transferQty})이 잔량(${remaining})을 초과합니다.`);
              setIsCompleting(false);
              return;
            }
            const { error: transferErr } = await supabase.from("movements").insert({
              lot_id: tl.lot_id, type: "OUT", qty: transferQty,
              happened_at: `${today}T00:00:00+09:00`,
              note: `분사-레이즈 생산완료 - ${selectedWo.work_order_no}`,
              created_by: userId,
            });
            if (transferErr) {
              setMsg("코팅-레이즈 차감 실패: " + transferErr.message);
              setIsCompleting(false);
              return;
            }
          }
          // work_order_items에 transfer_lots 저장
          if (transferLots.length > 0) {
            const lotsForDb = transferLots.map((l) => ({ lot_id: l.lot_id, qty: toInt(l.qty) }));
            const totalQty = lotsForDb.reduce((s, l) => s + l.qty, 0);
            await supabase.from("work_order_items").update({
              transfer_lot_id: lotsForDb[0]?.lot_id ?? null,
              transfer_qty: totalQty > 0 ? totalQty : null,
              transfer_lots: lotsForDb,
            }).eq("id", item.id);
          }
        }
        // 분사: pet_stock_logs — 단일 insert
        const sprayProdQtyNum = toInt(sprayProdQty);
        if (sprayProdQtyNum > 0) {
          const { error: petProdErr } = await supabase.from("pet_stock_logs").insert({
            log_date: today, log_type: "spray_done_prod",
            quantity: sprayProdQtyNum, defect_qty: 0,
            note: `분사-레이즈 생산완료 - ${selectedWo.work_order_no}`,
            created_by: userId,
          });
          if (petProdErr) { setMsg("PET 수불 기록 실패: " + petProdErr.message); setIsCompleting(false); return; }
        }
      } else {
        // 코팅: pet_stock_logs — coating_done insert
        const totalCoatingQty = items.reduce((sum, item) => {
          const pi = prodInputs[item.id];
          return sum + (pi?.actual_qty ? toInt(pi.actual_qty) : 0);
        }, 0);
        if (totalCoatingQty > 0) {
          const { error: petCoatingErr } = await supabase.from("pet_stock_logs").insert({
            log_date: today, log_type: "coating_done",
            quantity: totalCoatingQty, defect_qty: 0,
            note: `코팅-레이즈 생산완료 - ${selectedWo.work_order_no}`,
            created_by: userId,
          });
          if (petCoatingErr) { setMsg("PET 수불 기록 실패(코팅): " + petCoatingErr.message); setIsCompleting(false); return; }
          // 원료수불부 PET 차감
          const { error: petUsageErr } = await supabase.from("material_usage_logs").insert({
            material_id: "00000000-0007-0000-0000-000000000001",
            used_date: today,
            quantity: totalCoatingQty,
            unit: "ea",
            work_type: "coating",
            note: `코팅-레이즈 생산완료 - ${selectedWo.work_order_no}`,
            created_by: userId,
          });
          if (petUsageErr) { setMsg("원료수불부 PET 차감 실패: " + petUsageErr.message); setIsCompleting(false); return; }
        }
      }

      // 4. 중간재 재고 입고
      for (const item of items) {
        const pi = prodInputs[item.id];
        if (!pi || !pi.actual_qty || !pi.expiry_date) continue;
        const actual_qty = toInt(pi.actual_qty);
        if (actual_qty <= 0) continue;
        let variantId: string | null = null;
        if (item.barcode_no) { const { data: pbData } = await supabase.from("product_barcodes").select("variant_id").eq("barcode", item.barcode_no).maybeSingle(); variantId = pbData?.variant_id ?? null; }
        if (!variantId) variantId = selectedWo.variant_id;
        if (!variantId) continue;
        let lotId: string | null = null;
        const { data: existingLot } = await supabase.from("lots").select("id").eq("variant_id", variantId).eq("expiry_date", pi.expiry_date).maybeSingle();
        if (existingLot) { lotId = existingLot.id; } else {
          const { data: newLot, error: lotErr } = await supabase.from("lots").insert({ variant_id: variantId, expiry_date: pi.expiry_date }).select("id").single();
          if (lotErr) continue;
          lotId = newLot.id;
        }
        await supabase.from("movements").insert({ lot_id: lotId, type: "IN", qty: actual_qty, happened_at: `${today}T00:00:00+09:00`, note: "작업지시서 생산완료 - " + selectedWo.work_order_no, created_by: userId });
      }

      // 4. 작업지시서 상태 → 완료
      const { error: statusErr } = await supabase.from("work_orders").update({
        status:              "완료",
        status_production:   true,
        ccp_slot_id:         null,
        assignee_production: productionAssignee,
        production_done_at:  new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      }).eq("id", selectedWo.id);

      if (statusErr) { setMsg("상태 변경 실패: " + statusErr.message); setIsCompleting(false); return; }

      showToast(`${subType} 생산완료! 원료 차감됨`);
      setIsEditMode(false);
      await loadWoList();
    } catch (e: any) {
      setMsg("오류: " + (e?.message ?? e));
    } finally {
      setIsCompleting(false);
    }
  }

  async function markProductionComplete() {
    if (isCompleting) return;
    if (!selectedWo) return;
    setIsCompleting(true);

     // ── 포장완료(도눔 포장 출고) 처리 ──
     if (selectedWo.skip_production_check) {
      setPinProgressPending(() => async (name: string) => {
        await doCompletePackaging(name);
      });
      setShowPinModalForProgress(true);
      setIsCompleting(false);
      return;
    }

    // ── 분사/코팅 별도 처리 ──
    const subType = getWoSubType(selectedWo.product_name);
    if (subType) {
      if (!compSaved) {
        alert("압축공기 작업 기록을 저장 후 생산완료 처리해주세요.");
        setIsCompleting(false);
        return;
      }
      if (subType === "분사" && (!sprayProdQty || toInt(sprayProdQty) <= 0)) {
        alert("분사완료 수량을 입력 후 생산완료 처리해주세요.");
        setIsCompleting(false);
        return;
      }
      setPinProgressPending(() => async (name: string) => {
        await doCompleteSprayCoating(name, subType);
      });
      setShowPinModalForProgress(true);
      setIsCompleting(false);
      return;
    }

    const foodCat = getFoodCategory(selectedWo.food_type);
    const isChuganJae = foodCat === "중간재";

    // 이산화티타늄 사용량 필수 입력 검사 (식품유형에 "리얼" 포함 시)
    if ((selectedWo.food_type ?? "").includes("리얼")) {
      if (!titaniumDioxideG || Number(titaniumDioxideG) <= 0) {
        alert("이산화티타늄 사용량(g)을 입력하세요.");
        setIsCompleting(false);
        return;
      }
    }
    // 분사-레이즈 사용량 필수 입력 검사 (네오컬러화이트/리얼화이트)
    if (["네오컬러화이트", "네오컬러리얼화이트", "롤리팝컬러리얼화이트", "롤리팝컬러화이트"].some((k) => (selectedWo.food_type ?? "").includes(k))) {
      if (!neoColorSpraySaved || neoColorSprayLots.length === 0 || neoColorSprayLots.every((l) => !l.qty || toInt(l.qty) <= 0)) {
        alert("분사-레이즈 사용량을 저장 후 생산완료 처리해주세요.");
        setIsCompleting(false);
        return;
      }
    }

   const hasTransferLotSelectedForComplete = (selectedWo.work_order_items ?? []).some((item) => {
      const pi = prodInputs[item.id];
      return (pi?.transfer_lots ?? []).some((l) => l.lot_id && toInt(l.qty) > 0);
    });
    if (!selectedWo.skip_production_check && needsTransferCcp(selectedWo.food_type) && !hasTransferLotSelectedForComplete) {
      if (transferCcpEvents.length === 0) { alert("CCP-1B(전사지인쇄) 온도 기록이 없습니다.\n시작 → 중간점검 → 종료 순으로 기록 후 생산완료 처리해주세요."); setIsCompleting(false); return; }
      if (!transferCcpEnded) { const sorted = [...transferCcpEvents].sort((a, b) => a.measured_at.localeCompare(b.measured_at)); const lastEv = sorted[sorted.length - 1]; const stateLabel = lastEv.event_type === "start" ? "시작" : "중간점검"; alert(`CCP-1B(전사지인쇄) 온도 기록이 종료되지 않았습니다.\n현재 상태: [${stateLabel}]\n\n종료 기록 후 생산완료 처리해주세요.`); setIsCompleting(false); return; }
    }

    let ccpEndedAt: string | null = null;
    if (woChecks && !selectedWo.skip_production_check) {
      const missing = [!woChecks.assignee_transfer && "전사인쇄", !woChecks.assignee_print_check && "인쇄검수"].filter(Boolean) as string[];
      if (missing.length > 0) { alert(`다음 단계의 담당자를 선택해주세요:\n\n• ${missing.join("\n• ")}`); setIsCompleting(false); return; }
    }
    if (!selectedWo.skip_production_check && (foodCat === "다크" || foodCat === "화이트")) {
      if (selectedWo.ccp_slot_id) {
        const { data: ccpEvs } = await supabase.from("ccp_wo_events").select("event_type, measured_at").eq("work_order_no", selectedWo.work_order_no).eq("slot_id", selectedWo.ccp_slot_id).order("measured_at", { ascending: false });
        const lastEv = (ccpEvs ?? [])[0];
        ccpEndedAt = lastEv?.measured_at ?? null;
        if (!lastEv) { alert("CCP-1B 온도 기록이 없습니다.\n시작 → 중간점검 → 종료 순으로 기록 후 생산완료 처리해주세요."); setIsCompleting(false); return; }
        if (lastEv.event_type !== "end") { const stateLabel = lastEv.event_type === "start" ? "시작" : "중간점검"; alert(`CCP-1B 온도 기록이 종료되지 않았습니다.\n현재 상태: [${stateLabel}]\n\n종료 기록 후 생산완료 처리해주세요.`); setIsCompleting(false); return; }
      } else { alert("CCP-1B 슬롯이 지정되지 않았습니다.\n슬롯 지정 및 온도 기록(시작→중간점검→종료) 후 생산완료 처리해주세요."); setIsCompleting(false); return; }
    } else if (!selectedWo.skip_production_check && foodCat === "중간재" && !selectedWo.product_name.includes("분사-레이즈")) {
      if (selectedWo.ccp_slot_id) {
        const todayKst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
        const { data: ccpEvs } = await supabase.from("ccp_wo_events").select("event_type").eq("work_order_no", selectedWo.work_order_no).eq("slot_id", selectedWo.ccp_slot_id).gte("measured_at", `${todayKst}T00:00:00+09:00`).lte("measured_at", `${todayKst}T23:59:59+09:00`).order("measured_at", { ascending: false });
        const lastEv = (ccpEvs ?? [])[0];
        if (!lastEv) { alert("가열공정 온도 기록이 없습니다.\n시작 → 중간점검 → 종료 순으로 기록 후 생산완료 처리해주세요."); setIsCompleting(false); return; }
        if (lastEv.event_type !== "end") { const stateLabel = lastEv.event_type === "start" ? "시작" : "중간점검"; alert(`가열공정 온도 기록이 종료되지 않았습니다.\n현재 상태: [${stateLabel}]\n\n종료 기록 후 생산완료 처리해주세요.`); setIsCompleting(false); return; }
      } else { alert("가열공정 슬롯이 지정되지 않았습니다.\n7-1, 7-2, 7-3, 8번 슬롯 중 하나를 지정하고\n온도 기록(시작→중간점검→종료) 후 생산완료 처리해주세요."); setIsCompleting(false); return; }
    }

    const items = (selectedWo.work_order_items ?? []).filter((item) => { const name = (item.sub_items ?? [])[0]?.name ?? ""; return !name.startsWith("성형틀") && !name.startsWith("인쇄제판") && !name.startsWith("아이스박스") && !name.startsWith("택배비"); });
    const missingQtyOrExpiry = items.filter((item) => { const pi = prodInputs[item.id]; if (pi?.skip) return false; return !pi || !pi.actual_qty || !pi.unit_weight || !pi.expiry_date; });
    if (missingQtyOrExpiry.length > 0) { alert("출고수량, 개당중량, 소비기한은 필수 입력 항목입니다.\n\n입력 후 다시 시도해주세요."); setIsCompleting(false); return; }
    if (isChuganJae) {
      if (!confirm("생산완료 처리하시겠습니까?")) { setIsCompleting(false); return; }
    } else {
      setCompleteModalWoId(selectedWo.id);
      completeCcpEndedAtRef.current = ccpEndedAt;
      setShowCompleteModal(true);
      setIsCompleting(false);
      return;
    }
    await doComplete(false);
  }

  async function doComplete(navigate: boolean, ccpEndedAt?: string | null, productionAssignee?: string) {
    if (!selectedWo) return;
    const foodCat = getFoodCategory(selectedWo.food_type);
    const isChuganJae = foodCat === "중간재";
    const items = (selectedWo.work_order_items ?? []).filter((item) => {
      const name = (item.sub_items ?? [])[0]?.name ?? "";
      return !name.startsWith("성형틀") && !name.startsWith("인쇄제판") && !name.startsWith("아이스박스") && !name.startsWith("택배비");
    });
    setMsg("저장 중...");
    try {
      if (isAdminOrSubadmin) {
        const { error: basicErr } = await supabase.from("work_orders").update({ sub_name: eSubName.trim() || null, product_name: eProductName.trim(), food_type: eFoodType.trim() || null, logo_spec: eLogoSpec.trim() || null, thickness: eThickness || null, delivery_method: eDeliveryMethod || null, packaging_type: ePackagingType === "트레이" ? `트레이-${eTraySlot}` : ePackagingType || null, tray_slot: null, package_unit: ePackageUnit === "기타" ? (ePackageUnitCustom.trim() ? ePackageUnitCustom.trim() + "ea" : null) : ePackageUnit || null, mold_per_sheet: (toInt(eMoldCols) * toInt(eMoldRows)) > 0 ? toInt(eMoldCols) * toInt(eMoldRows) : null, mold_cols: toInt(eMoldCols) > 0 ? toInt(eMoldCols) : null, mold_rows: toInt(eMoldRows) > 0 ? toInt(eMoldRows) : null, mold_count: toInt(eMoldCount) > 0 ? toInt(eMoldCount) : null, note: eNote.trim() || null, reference_note: eReferenceNote.trim() || null, updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
        if (basicErr) { setMsg("기본정보 저장 실패: " + basicErr.message); setIsCompleting(false); return; }
      }
      if (woChecks) {
        const { error: checksErr } = await supabase.from("work_orders").update({ assignee_transfer: woChecks.assignee_transfer || null, assignee_print_check: woChecks.assignee_print_check || null, assignee_production: productionAssignee || woChecks.assignee_production || null, assignee_input: woChecks.assignee_input || null, updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
        if (checksErr) { setMsg("담당자 저장 실패: " + checksErr.message); setIsCompleting(false); return; }
      }
      for (const item of items) {
        const pi = prodInputs[item.id];
        if (pi?.skip) {
          await supabase.from("work_order_items").update({ actual_qty: null, defect_qty: null, unit_weight: null, expiry_date: null }).eq("id", item.id);
          continue;
        }
        if (!pi || (!pi.actual_qty && !pi.unit_weight && !pi.expiry_date)) continue;
        const { error: itemErr } = await supabase.from("work_order_items").update({ actual_qty: pi.actual_qty ? toInt(pi.actual_qty) : null, gift_qty: pi.gift_qty ? toInt(pi.gift_qty) : 0, defect_qty: pi.defect_qty ? toInt(pi.defect_qty) : null, unit_weight: pi.unit_weight ? toNum(pi.unit_weight) : null, expiry_date: pi.expiry_date || null }).eq("id", item.id);
        if (itemErr) { setMsg("생산입력 저장 실패: " + itemErr.message); setIsCompleting(false); return; }
      }
      const allItems = selectedWo.work_order_items ?? [];
      const firstUw = toNum(prodInputs[allItems[0]?.id]?.unit_weight);
      if (selectedWo.variant_id && firstUw > 0) await supabase.from("product_variants").update({ weight_g: firstUw }).eq("id", selectedWo.variant_id);
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      if (isChuganJae) {
        const stockErrors: string[] = [];
        for (const item of items) {
          const pi = prodInputs[item.id];
          if (pi?.skip) continue;
          if (!pi || !pi.actual_qty || !pi.expiry_date) continue;
          const actual_qty = toInt(pi.actual_qty);
          if (actual_qty <= 0) continue;
          let variantId: string | null = null;
          if (item.barcode_no) { const { data: pbData } = await supabase.from("product_barcodes").select("variant_id").eq("barcode", item.barcode_no).maybeSingle(); variantId = pbData?.variant_id ?? null; }
          if (!variantId) variantId = selectedWo.variant_id;
          if (!variantId) { stockErrors.push(`variant 없음 (${(item.sub_items ?? [])[0]?.name ?? item.id})`); continue; }
          let lotId: string | null = null;
          const { data: existingLot } = await supabase.from("lots").select("id").eq("variant_id", variantId).eq("expiry_date", pi.expiry_date).maybeSingle();
          if (existingLot) { lotId = existingLot.id; } else {
            const { data: newLot, error: lotErr } = await supabase.from("lots").insert({ variant_id: variantId, expiry_date: pi.expiry_date }).select("id").single();
            if (lotErr) { stockErrors.push("LOT 생성 실패: " + lotErr.message); continue; }
            lotId = newLot.id;
          }
          const todayKSTDate = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })).toISOString().slice(0, 10);
          const { error: movErr } = await supabase.from("movements").insert({ lot_id: lotId, type: "IN", qty: actual_qty, happened_at: `${todayKSTDate}T00:00:00+09:00`, note: "작업지시서 생산완료 - " + selectedWo.work_order_no, created_by: userId });
          if (movErr) stockErrors.push("입고 기록 실패: " + movErr.message);
        }
        // ── 전사지 자동 차감 (중간재, 네오컬러 제외) ──
        {
          const ft = selectedWo.food_type ?? "";
          const isNeoColorWo = ft.startsWith("네오컬러") || ft.startsWith("롤리팝컬러");
          if (!isNeoColorWo) {
            const noteStr = selectedWo.note ?? "";
            const match = noteStr.match(/전사지[：:]\s*(\d+)장(?:\s*(\d+)줄)?/);
            if (match) {
              const sheets = parseInt(match[1], 10);
              const hasRows = !!match[2];
              const totalSheets = hasRows ? sheets + 1 : sheets;
              if (totalSheets > 0) {
                const jeonsakNote = `전사지 차감 - ${selectedWo.work_order_no}`;
                const { data: jsDupCheck } = await supabase.from("material_usage_logs")
                  .select("id").eq("note", jeonsakNote).limit(1);
                if (!jsDupCheck || jsDupCheck.length === 0) {
                  const jeonsakName30 = "전사지 30*40";
                  const { data: jsMatData } = await supabase.from("materials")
                    .select("id").eq("name", jeonsakName30).maybeSingle();
                  if (jsMatData?.id) {
                    const todayKSTDate = new Date(
                      new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
                    ).toISOString().slice(0, 10);
                    const { error: jsErr } = await supabase.from("material_usage_logs").insert({
                      material_id: jsMatData.id,
                      used_date: todayKSTDate,
                      quantity: totalSheets,
                      unit: "ea",
                      work_type: "product",
                      note: jeonsakNote,
                      created_by: userId,
                    });
                    if (jsErr) stockErrors.push(`전사지 차감 실패: ${jsErr.message}`);
                  } else {
                    stockErrors.push(`원료 '${jeonsakName30}'을 찾을 수 없습니다.`);
                  }
                }
              }
            }
          }
        }

        const { error: statusErr } = await supabase.from("work_orders").update({ status: "완료", status_production: true, ccp_slot_id: null, production_done_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
        if (statusErr) { setMsg("상태 변경 실패: " + statusErr.message); setIsCompleting(false); return; }
        if (stockErrors.length > 0) showToast("저장됐으나 재고 연동 오류: " + stockErrors.join(" / "), "error");
        else showToast("생산완료 처리 완료!");
        await triggerPdfUpload(selectedWo, eProductName ?? "품목미상", eFoodType ?? "", eLogoSpec ?? "");
      } else {
        const stockErrors: string[] = [];
        for (const item of items) {
          const pi = prodInputs[item.id];
          const transferLots = pi?.transfer_lots ?? [];
          if (transferLots.length === 0) continue;
          for (const tl of transferLots) {
            const transferQty = toInt(tl.qty);
            if (!tl.lot_id || transferQty <= 0) continue;
            const { data: movData } = await supabase.from("movements").select("type, qty").eq("lot_id", tl.lot_id);
            const remaining = (movData ?? []).reduce((sum, m) => m.type === "IN" ? sum + m.qty : sum - m.qty, 0);
            if (transferQty > remaining) { setMsg(`전사지 차감 실패: 차감 수량(${transferQty})이 잔량(${remaining})을 초과합니다. (납기일: ${item.delivery_date})`); setIsCompleting(false); return; }
            const { error: transferErr } = await supabase.from("movements").insert({ lot_id: tl.lot_id, type: "OUT", qty: transferQty, happened_at: new Date().toISOString(), note: `전사지 차감 - ${selectedWo.work_order_no} - ${item.delivery_date}`, created_by: userId });
            if (transferErr) stockErrors.push("전사지 차감 실패: " + transferErr.message);
          }
          const lotsForDb = transferLots.map((l) => ({ lot_id: l.lot_id, qty: toInt(l.qty) }));
          const totalQty = lotsForDb.reduce((s, l) => s + l.qty, 0);
          await supabase.from("work_order_items").update({
            transfer_lot_id: lotsForDb[0]?.lot_id ?? null,
            transfer_qty: totalQty > 0 ? totalQty : null,
            transfer_lots: lotsForDb,
          }).eq("id", item.id);
        }
       // 네오컬러 분사-레이즈 차감은 "분사-레이즈 사용량 저장" 버튼에서 즉시 처리됨

        // ── 컴파운드 자동 차감 (다크/화이트/딸기, 생산용전사지 제외) ──
        if ((selectedWo.food_type ?? "") !== "생산용전사지") {
          const ft = selectedWo.food_type ?? "";
          const compoundName = ft.includes("딸기") || ft === "핑크데코" || ft === "핑크화이트" ? "딸기컴파운드"
          : getFoodCategory(ft) === "다크" ? "다크컴파운드"
          : "화이트컴파운드";

            let totalCompoundG = 0;
            for (const item of items) {
              const pi = prodInputs[item.id];
              const aqty = toInt(pi?.actual_qty) + toInt(pi?.defect_qty);
              const uw   = toNum(pi?.unit_weight);
              if (aqty > 0 && uw > 0) totalCompoundG += aqty * uw;
            }

            if (totalCompoundG > 0) {
              const dupNote = `작업지시서 생산완료 - ${selectedWo.work_order_no}`;
              const { data: dupCheck } = await supabase.from("material_usage_logs")
                .select("id").eq("note", dupNote).eq("work_type", "product").limit(1);
  
              const { data: matData } = await supabase.from("materials")
                .select("id").eq("name", compoundName).maybeSingle();
  
              const todayKSTDate = new Date(
                new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
              ).toISOString().slice(0, 10);
              const ft = eFoodType || selectedWo.food_type || "";
              const isReal = ft.includes("리얼");
  
              // 리얼 식품유형: 화이트컴파운드(10/11) + 이산화티타늄(1/11) 별도 차감
              // 그 외: 컴파운드 전체 차감
              const compoundQty = isReal
                ? Math.round(totalCompoundG * 10 / 11)
                : totalCompoundG;
  
              if (matData?.id) {
                if (dupCheck && dupCheck.length > 0) {
                  // 이미 기록 존재 — 불량 등 입력값 변경분을 반영해 갱신
                  const { error: compoundUpdErr } = await supabase.from("material_usage_logs")
                    .update({ quantity: compoundQty, material_id: matData.id })
                    .eq("id", dupCheck[0].id);
                  if (compoundUpdErr) stockErrors.push(`${compoundName} 차감 갱신 실패: ${compoundUpdErr.message}`);
                } else {
                  const { error: compoundErr } = await supabase.from("material_usage_logs").insert({
                    material_id: matData.id,
                    used_date:   todayKSTDate,
                    quantity:    compoundQty,
                    unit:        "g",
                    work_type:   "product",
                    note:        dupNote,
                    created_by:  userId,
                  });
                  if (compoundErr) stockErrors.push(`${compoundName} 차감 실패: ${compoundErr.message}`);
                }
              } else {
                stockErrors.push(`원료 '${compoundName}'을 찾을 수 없습니다.`);
              }
  
              // 리얼 식품유형: 이산화티타늄 차감 (totalCompoundG × 1/11)
              if (isReal) {
                const tiQty = Math.round(totalCompoundG * 1 / 11);
                const tiNote = `이산화티타늄 차감 - ${selectedWo.work_order_no}`;
                const { data: tiDupCheck } = await supabase.from("material_usage_logs")
                  .select("id").eq("note", tiNote).limit(1);
                const { data: tiMatData } = await supabase.from("materials")
                  .select("id").eq("name", "이산화티타늄").maybeSingle();
                if (tiMatData?.id) {
                  if (tiDupCheck && tiDupCheck.length > 0) {
                    const { error: tiUpdErr } = await supabase.from("material_usage_logs")
                      .update({ quantity: tiQty, material_id: tiMatData.id })
                      .eq("id", tiDupCheck[0].id);
                    if (tiUpdErr) stockErrors.push(`이산화티타늄 차감 갱신 실패: ${tiUpdErr.message}`);
                  } else {
                    const { error: tiErr } = await supabase.from("material_usage_logs").insert({
                      material_id: tiMatData.id,
                      used_date:   todayKSTDate,
                      quantity:    tiQty,
                      unit:        "g",
                      work_type:   "product",
                      note:        tiNote,
                      created_by:  userId,
                    });
                    if (tiErr) stockErrors.push(`이산화티타늄 차감 실패: ${tiErr.message}`);
                  }
                } else {
                  stockErrors.push("원료 '이산화티타늄'을 찾을 수 없습니다.");
                }
              }
            }
        }

        

               // ── 전사지 자동 차감 (네오컬러 제외) ──
               {
                const ft = selectedWo.food_type ?? "";
                const isNeoColorWo = ft.startsWith("네오컬러") || ft.startsWith("롤리팝컬러");
                if (!isNeoColorWo) {
              const noteStr = selectedWo.note ?? "";
              // "전사지: N장" 또는 "전사지: N장 M줄" 파싱
              const match = noteStr.match(/전사지[：:]\s*(\d+)장(?:\s*(\d+)줄)?/);
              if (match) {
                const sheets = parseInt(match[1], 10);
                const hasRows = !!match[2];
                const totalSheets = hasRows ? sheets + 1 : sheets;
                if (totalSheets > 0) {
                  const jeonsakNote = `전사지 차감 - ${selectedWo.work_order_no}`;
                  const { data: jsDupCheck } = await supabase.from("material_usage_logs")
                    .select("id").eq("note", jeonsakNote).limit(1);
                  if (!jsDupCheck || jsDupCheck.length === 0) {
                    const jeonsakName32 = "전사지 32*45";
                    const { data: jsMatData } = await supabase.from("materials")
                      .select("id").eq("name", jeonsakName32).maybeSingle();
                    if (jsMatData?.id) {
                      const todayKSTDate = new Date(
                        new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
                      ).toISOString().slice(0, 10);
                      const { error: jsErr } = await supabase.from("material_usage_logs").insert({
                        material_id: jsMatData.id,
                        used_date: todayKSTDate,
                        quantity: totalSheets,
                        unit: "ea",
                        work_type: "product",
                        note: jeonsakNote,
                        created_by: userId,
                      });
                      if (jsErr) stockErrors.push(`전사지 차감 실패: ${jsErr.message}`);
                    } else {
                      stockErrors.push(`원료 '${jeonsakName32}'을 찾을 수 없습니다.`);
                    }
                  }
                }
              }
            }
          }
  
          // ── order_lines.gift_qty 업데이트 (linked_order_id 경로) ──
          if (selectedWo.linked_order_id) {
            for (const item of items) {
              const pi = prodInputs[item.id];
              const giftQty = pi?.gift_qty ? toInt(pi.gift_qty) : 0;
              if (giftQty <= 0) continue;
              const itemName = (item.sub_items ?? [])[0]?.name ?? "";
              if (!itemName) continue;
              await supabase.from("order_lines")
                .update({ gift_qty: giftQty })
                .eq("order_id", selectedWo.linked_order_id)
                .eq("name", itemName);
            }
          }

          const { error: statusErr } = await supabase.from("work_orders").update({ status_production: true, ccp_slot_id: null, production_done_at: new Date().toISOString(), updated_at: ccpEndedAt ?? new Date().toISOString() }).eq("id", selectedWo.id);
          if (statusErr) { setMsg("상태 변경 실패: " + statusErr.message); setIsCompleting(false); return; }
          if (stockErrors.length > 0) showToast("저장됐으나 전사지 차감 오류: " + stockErrors.join(" / "), "error");
          else showToast("생산완료 처리 완료!");
      }
      setIsEditMode(false);
      await loadWoList();
      if (navigate) { router.push(`/production-log?tab=ccp1p&wo=${selectedWo.id}`); }
    } catch (e: any) { setMsg("오류: " + (e?.message ?? e)); } finally { setIsCompleting(false); }
  }

  const unreadCount = useMemo(() => filteredList.filter((wo) => wo.status === "생산중" && !readMap[wo.id]).length, [filteredList, readMap]);
  const doneCount = woChecks ? PROGRESS_STEPS.filter((s) => (woChecks[s.assigneeKey] ?? "") !== "").length : 0;

  if (role === null) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-50"><div className="text-sm text-slate-400">로딩 중...</div></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3">
      <div className="mx-auto max-w-[1400px] space-y-3">

        {/* 새 작업지시서 알림 모달 */}
        {showNewWoModal && newWoNotifications.length > 0 && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-[480px] rounded-xl border border-orange-200 bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 bg-orange-500 px-4 py-3">
                <div className="flex items-center gap-2"><span className="text-xl animate-bounce">🔔</span><div><div className="text-sm font-bold text-white">새 작업지시서 도착!</div><div className="text-xs text-orange-100">새 주문이 등록됐습니다</div></div></div>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white">{newWoNotifications.length}건</span>
              </div>
              <div className="max-h-[280px] overflow-y-auto divide-y divide-slate-100">
                {newWoNotifications.map((n, idx) => (
                  <div key={n.id} className="px-4 py-2.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><div className="font-semibold text-sm text-slate-800 truncate">{n.client_name}</div><div className="text-xs text-slate-600 truncate mt-0.5">{n.product_name}</div><div className="mt-1 flex flex-wrap gap-1"><span className="text-[11px] text-slate-400 font-mono">{n.work_order_no}</span><span className="text-[11px] text-slate-400">· 주문일 {n.order_date}</span></div></div>{idx === 0 && <span className="shrink-0 rounded-full bg-orange-100 border border-orange-200 px-2 py-0.5 text-[10px] font-semibold text-orange-700">NEW</span>}</div></div>
                ))}
              </div>
              <div className="border-t border-slate-100 px-4 py-2.5 flex gap-2">
                <button className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-bold text-white hover:bg-orange-600" onClick={() => { setShowNewWoModal(false); setNewWoNotifications([]); }}>확인 ({newWoNotifications.length}건)</button>
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setShowNewWoModal(false)}>나중에</button>
              </div>
            </div>
          </div>
        )}

        {/* 생산완료 확인 모달 */}
        {showCompleteModal && completeModalWoId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-[400px] rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
              <div className="px-5 py-4">
                <div className="text-sm font-bold text-slate-800 mb-2">생산완료 처리하시겠습니까?</div>
                <div className="text-xs text-slate-500 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  완료 후 CCP-1P(금속검출) 기록까지 진행해야 최종 완료됩니다.
                </div>
              </div>
              <div className="flex gap-2 px-5 pb-4">
                <button className="flex-1 rounded-lg border border-blue-500 bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700"
                  onClick={() => { setShowCompleteModal(false); setPinProgressPending(() => async (name: string) => { setIsCompleting(true); await doComplete(true, completeCcpEndedAtRef.current, name); }); setShowPinModalForProgress(true); }}>
                  생산완료 + CCP-1P 이동
                </button>
                <button className="flex-1 rounded-lg border border-green-500 bg-green-600 py-2 text-xs font-bold text-white hover:bg-green-700"
                  onClick={() => { setShowCompleteModal(false); setPinProgressPending(() => async (name: string) => { setIsCompleting(true); await doComplete(false, completeCcpEndedAtRef.current, name); }); setShowPinModalForProgress(true); }}>
                  생산완료
                </button>
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  onClick={() => { setShowCompleteModal(false); setCompleteModalWoId(null); }}>닫기</button>
              </div>
            </div>
          </div>
        )}

        {showPinModalForProgress && (
          <PinModal
            employees={employees.filter((e): e is { id: string; name: string; pin: string | null } => e.name !== null)}
            title="본인 확인"
            onSuccess={(empId, empName) => { pinLogin(empId, empName); setShowPinModalForProgress(false); if (pinProgressPending) { pinProgressPending(empName); setPinProgressPending(null); } }}
            onCancel={() => { setShowPinModalForProgress(false); setPinProgressPending(null); }}
          />
        )}

        {showDeletePinModal && (
          <PinModal
            employees={employees.filter((e): e is { id: string; name: string; pin: string | null } => e.name !== null)}
            title="삭제 — 본인 확인"
            onSuccess={(empId, empName) => { setShowDeletePinModal(false); if (deletePinTargetId) { deleteWo(deletePinTargetId, empName); setDeletePinTargetId(null); } }}
            onCancel={() => { setShowDeletePinModal(false); setDeletePinTargetId(null); }}
          />
        )}

        {/* 온장고 슬롯 현황 */}
        <SlotStatusPanel
          warmerSlots={warmerSlots}
          slotStatus={ccp.slotStatus}
          activeSlotId={ccp.activeSlotId}
          setActiveSlotId={ccp.setActiveSlotId}
          slotMoveTargetId={ccp.slotMoveTargetId}
          setSlotMoveTargetId={ccp.setSlotMoveTargetId}
          slotActionDate={ccp.slotActionDate}
          setSlotActionDate={ccp.setSlotActionDate}
          slotActionTime={ccp.slotActionTime}
          setSlotActionTime={ccp.setSlotActionTime}
          slotActionSaving={ccp.slotActionSaving}
          loadSlotStatus={ccp.loadSlotStatus}
          saveSlotMaterialIn={ccp.saveSlotMaterialIn}
          saveSlotMaterialOut={ccp.saveSlotMaterialOut}
          saveSlotMove={ccp.saveSlotMove}
        />

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800">작업지시서 관리</h1>
            <div className="mt-0.5 text-xs text-slate-500">
              {role === "ADMIN" ? "ADMIN" : role === "SUBADMIN" ? "SUBADMIN" : role === "USER" ? "USER" : "로딩 중..."}
            </div>
          </div>
          <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-emerald-700 opacity-70">재고생산 ▶</span>
            {(["기성","업체","코팅/분사","생산용전사지"] as const).map((cat) => (
              <button key={cat}
                className={kiseongCategory === cat ? "rounded-lg border border-emerald-500 bg-emerald-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-emerald-700" : "rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"}
                onClick={() => {
                  if (kiseongCategory === cat) { resetKiseongForm(); }
                  else { setKiseongCategory(cat); setIsKiseongForm(true); setSelectedWo(null); setKiseongSearch(""); setKiseongSelected(null); }
                }}>{cat}</button>
            ))}
            {isAdminOrSubadmin && (
              <a href="/production/deleted" className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-sm font-semibold text-red-600 hover:bg-red-100">삭제내역</a>
            )}
            <button className={btn} onClick={() => { setWoOffset(0); loadWoList(0); }}>새로고침</button>
          </div>
        </div>

        {stockAlerts.length > 0 && (
          <div>
            <button className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${stockAlerts.some((a) => a.status === "만료") ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100" : stockAlerts.some((a) => a.status === "안전재고 미달") ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"}`} onClick={() => setShowAlertPanel((v) => !v)}>
              <span>{stockAlerts.some((a) => a.status === "만료") ? "⚠" : "⚠"}</span>
              <span>{stockAlerts.filter((a) => a.status === "만료").length > 0 && `소비기한 만료 ${stockAlerts.filter((a) => a.status === "만료").length}건 `}{stockAlerts.filter((a) => a.status === "D-30 경보").length > 0 && `D-30 경보 ${stockAlerts.filter((a) => a.status === "D-30 경보").length}건 `}{stockAlerts.filter((a) => a.status === "안전재고 미달").length > 0 && `안전재고 미달 ${stockAlerts.filter((a) => a.status === "안전재고 미달").length}건`}</span>
              <span className="ml-auto text-xs opacity-60">{showAlertPanel ? "▲" : "▼"}</span>
            </button>
            {showAlertPanel && (
              <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">오늘 기준 알림</div>
                <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {stockAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0"><div className="text-xs font-medium text-slate-800 truncate">{alert.item_name}</div>{alert.expiry_date && <div className="text-[11px] text-slate-500">소비기한: {alert.expiry_date}</div>}</div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${alert.status === "만료" ? "bg-red-100 border-red-200 text-red-700" : alert.status === "D-30 경보" ? "bg-orange-100 border-orange-200 text-orange-700" : "bg-amber-100 border-amber-200 text-amber-700"}`}>{alert.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {msg && <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${msg.startsWith("저장") && msg.includes("완료") ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>{msg}<button className="ml-2 text-xs opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>✕</button></div>}
        {toast && <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] rounded-xl border px-4 py-2.5 text-xs font-semibold shadow-xl ${toast.type === "success" ? "border-green-300 bg-green-600 text-white" : "border-red-300 bg-red-600 text-white"}`}>{toast.msg}</div>}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[400px_minmax(0,1fr)]">

          {/* LEFT: 목록 */}
          <div className={`${card} flex flex-col p-3`} style={{ maxHeight: "calc(100vh - 130px)", overflowY: "auto" }}>
            <div className={`mb-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${unreadCount > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${unreadCount > 0 ? "bg-red-500 animate-pulse" : "bg-slate-300"}`} />
              <span className={`text-xs font-semibold ${unreadCount > 0 ? "text-red-700" : "text-slate-400"}`}>미확인 {unreadCount}건</span>
            </div>
            <div className="mb-2 text-sm font-semibold">작업지시서 목록</div>
            <div className="mb-2 space-y-2">
              {/* 검색창 + X 버튼 */}
              <div className="relative">
                <input
                  className={inp}
                  placeholder="거래처명 / 제품명 / 바코드 검색"
                  value={filterSearch}
                  onChange={(e) => {
                    const decomposed = [...e.target.value].map(ch => {
                      const DECOMP: Record<string, string> = { '\u3133': '\u3131\u3145', '\u3135': '\u3134\u3148', '\u3136': '\u3134\u314e', '\u313a': '\u3139\u3131', '\u313b': '\u3139\u3141', '\u313c': '\u3139\u3142', '\u313d': '\u3139\u3145', '\u313e': '\u3139\u314c', '\u313f': '\u3139\u314d', '\u3140': '\u3139\u314e', '\u3143': '\u3142\u3145', '\u3144': '\u3142\u3145' };
                      return DECOMP[ch] ?? ch;
                    }).join('');
                    setFilterSearch(decomposed);
                  }}
                />
                {filterSearch && (
                  <button
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold leading-none"
                    onClick={() => setFilterSearch("")}
                  >✕</button>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap gap-1">
                  {(["전체", "생산중", "완료"] as const).map((s) => (
                    <button key={s} className={filterStatus === s ? btnOn : btn} onClick={() => {
                      setWoOffset(0); setHasMore(false);
                      if (s === "완료" && filterStatus !== "완료") {
                        const today = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
                        const from = new Date(today); from.setDate(today.getDate() - 7);
                        setFilterDateFrom(`${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,"0")}-${String(from.getDate()).padStart(2,"0")}`);
                        setFilterDateTo(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`);
                      } else if (s !== "완료") { setFilterDateFrom(""); setFilterDateTo(""); }
                      setFilterStatus(s);
                    }}>
                      {s === "생산중" ? "생산" : s}
                      {s === "생산중" && <span className={`ml-1 tabular-nums text-xs ${filterStatus === s ? "opacity-80" : "text-slate-400"}`}>{productionCount}</span>}
                      {s === "완료" && <span className={`ml-1 tabular-nums text-xs ${filterStatus === s ? "opacity-80" : "text-slate-400"}`}>{woList.filter(w => w.status === "완료").length}</span>}
                    </button>
                  ))}
                  <div className="w-px bg-slate-200 mx-0.5" />
                  <button className={sortBy === "created_at" ? btnOn : btn} onClick={() => setSortBy("created_at")}>주문일</button>
                  <button className={sortBy === "delivery_date" ? btnOn : btn} onClick={() => setSortBy("delivery_date")}>납기일</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(["전체", "다크", "화이트", "전사지"] as const).map((c) => (
                    <button key={c} className={filterFoodCategory === c ? btnOn : btn} onClick={() => setFilterFoodCategory(c)}>{c}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><div className="mb-1 text-xs text-slate-500">주문일 From</div><input type="date" className={inp} value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} /></div>
                <div><div className="mb-1 text-xs text-slate-500">주문일 To</div><input type="date" className={inp} value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} /></div>
              </div>
            </div>

            {loading ? <div className="py-6 text-center text-xs text-slate-400">불러오는 중...</div>
              : filteredList.length === 0 ? <div className="py-6 text-center text-xs text-slate-400">조건에 맞는 작업지시서가 없습니다.</div>
              : (
                <div className="space-y-1.5">
                  {filteredList.map((wo) => {
                    const isSelected = selectedWo?.id === wo.id;
                    const statusCls = statusColors[wo.status] ?? "bg-slate-100 text-slate-600 border-slate-200";
                    const items = wo.work_order_items ?? [];
const totalOrder = items
  .filter((item) => {
    const n = (item.sub_items ?? [])[0]?.name ?? "";
    return !n.startsWith("성형틀") && !n.startsWith("인쇄제판")
      && !n.startsWith("아이스박스") && !n.startsWith("택배비");
  })
  .reduce((s, i) => s + (i.order_qty ?? 0), 0);
                    const allItemsDone = items.length > 0 && items.every((i) => i.actual_qty && i.unit_weight && i.expiry_date);
                    return (
                      <div key={wo.id} className="relative group">
                        <button className={`w-full rounded-xl border p-2.5 text-left transition-all overflow-hidden ${isSelected ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`} onClick={() => applySelection(wo)}>
                          <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${wo.status === "생산중" && !readMap[wo.id] ? "bg-red-400" : "bg-green-300"}`} />
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="font-semibold text-sm truncate">{(() => { const name = wo.client_name ?? ""; const isMarketplace = ["네이버-판매", "카카오플러스-판매", "쿠팡-판매"].includes(name); if (!isMarketplace) return name; let ordererName = ""; try { const lo = wo.linked_order; const memoRaw = Array.isArray(lo) ? lo[0]?.memo : (lo as any)?.memo; if (memoRaw) { const parsed = typeof memoRaw === "string" ? JSON.parse(memoRaw) : memoRaw; ordererName = parsed?.orderer_name ?? ""; } } catch {} return ordererName ? `${name} · ${ordererName}` : name; })()}</span>
                                {wo.sub_name ? <span className="text-xs text-slate-500">· {wo.sub_name}</span> : null}
                                {wo.order_type === "재고" && <span className="rounded-full bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">기성</span>}
                                {wo.status === "생산중" && !readMap[wo.id] && <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 border border-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-600"><span className="w-1 h-1 rounded-full bg-red-500 inline-block" />NEW</span>}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-600 font-medium truncate">{wo.product_name}</div>
                              <div className="mt-0.5 flex flex-wrap gap-1"><span className="text-[10px] text-slate-400 tabular-nums font-mono">{wo.barcode_no}</span>{wo.thickness ? <span className={`${pill} text-[10px]`}>{wo.thickness}</span> : null}</div>
                              <div className="mt-0.5 text-[11px] text-slate-400">주문일 {wo.order_date}{totalOrder > 0 ? ` · ${fmt(totalOrder)}개` : ""}{allItemsDone ? " · ✅완료" : ""}{(() => { const dates = (wo.work_order_items ?? []).map((i) => i.delivery_date).filter(Boolean).sort(); if (dates.length === 0) return null; return <span className="ml-1 font-semibold text-orange-500">· 납기 {dates[0]}</span>; })()}</div>
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1 pr-6"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}>{wo.status}</span></div>
                          </div>
                        </button>
                        {isAdminOrSubadmin ? <button className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold z-20 opacity-40 hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); handleDeleteClick(wo.id); }} title="삭제">✕</button> : null}
                      </div>
                    );
                  })}
                  {hasMore && filterStatus === "완료" && (
                    <button className={`w-full ${btn} py-2`} disabled={loading} onClick={() => { const next = woOffset + 20; setWoOffset(next); loadWoList(next); }}>
                      {loading ? "불러오는 중..." : "20건 더 보기"}
                    </button>
                  )}
                </div>
              )}
          </div>

          {/* RIGHT */}
          {isKiseongForm ? (
            <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 130px)" }}>
              <div className={`${card} p-3`}>
                <div className="flex items-center justify-between mb-3">
                <div><h2 className="text-base font-bold text-emerald-700">재고생산 등록 — {kiseongCategory}</h2><p className="text-xs text-slate-500 mt-0.5">거래처 없이 등록됩니다.</p></div>
                  <button className={btn} onClick={resetKiseongForm}>✕ 닫기</button>
                </div>
                <div className="mb-3">
                  <div className="mb-1 text-xs font-semibold text-slate-700">제품 선택 *</div>
                  {kiseongCategory === "코팅/분사" ? (
                    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                      {kiseongFilteredVariants.map((v) => (
                        <button key={v.variant_id}
                          className={`w-full text-left px-3 py-2.5 text-xs border-b border-slate-100 last:border-0 transition-colors ${kiseongSelected?.variant_id === v.variant_id ? "bg-emerald-100 font-semibold border-emerald-200" : "hover:bg-emerald-50"}`}
                          onClick={() => { handleKiseongVariantSelect(v); }}>
                          <span className="font-semibold text-slate-800">{v.variant_name}</span>
                          {v.barcode && <span className="ml-2 font-mono text-slate-400">{v.barcode}</span>}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <input className={inp} placeholder="제품명 또는 바코드로 검색" value={kiseongSearch} onChange={(e) => setKiseongSearch(e.target.value)} />
                        {kiseongSearch && (
                          <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                            onClick={() => { setKiseongSearch(""); setKiseongSelected(null); }}>✕</button>
                        )}
                      </div>
                      {kiseongSearch.trim() && kiseongFilteredVariants.length > 0 && (
                        <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden max-h-40 overflow-y-auto">
                          {kiseongFilteredVariants.map((v) => (
                            <button key={v.variant_id} className={`w-full text-left px-2.5 py-2 text-xs border-b border-slate-100 last:border-0 ${kiseongSelected?.variant_id === v.variant_id ? "bg-emerald-50 font-semibold" : "hover:bg-emerald-50"}`} onClick={() => { setKiseongSearch(v.product_name); handleKiseongVariantSelect(v); }}>
                              <span className="font-medium text-slate-800">{v.product_name}</span>{v.food_type && <span className="ml-2 text-slate-500">{v.food_type}</span>}{v.barcode && <span className="ml-2 font-mono text-slate-400">{v.barcode}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {kiseongSelected && (
                    <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
                      <span className="text-emerald-700 font-semibold text-xs">{kiseongSelected.product_name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{kiseongSelected.barcode}</span>
                      <button className="ml-auto text-xs text-slate-400 hover:text-red-500" onClick={() => { setKiseongSelected(null); setKiseongSearch(""); }}>초기화</button>
                    </div>
                  )}
                </div>
                {kiseongSelected && (
                  <>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3 mb-3">
                      <div><div className="mb-1 text-xs text-slate-500">서브네임</div><input className={inp} value={kSubName} onChange={(e) => setKSubName(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-500">식품유형 *</div><input className={inp} value={kFoodType} onChange={(e) => setKFoodType(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-500">규격</div><input className={inp} value={kLogoSpec} onChange={(e) => setKLogoSpec(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-500">두께</div><select className={inp} value={kThickness} onChange={(e) => setKThickness(e.target.value)}>{["2mm","3mm","5mm","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                      <div><div className="mb-1 text-xs text-slate-500">포장방법</div><select className={inp} value={kPackagingType} onChange={(e) => { setKPackagingType(e.target.value); if (e.target.value === "벌크") setKPackageUnit("기타"); }}>{["트레이-정사각20구","트레이-직사각20구","트레이-35구","벌크"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                      <div>
                        <div className="mb-1 text-xs text-slate-500">포장단위</div>
                        <select className={inp} value={kPackageUnit} onChange={(e) => setKPackageUnit(e.target.value)}>{["100ea","200ea","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select>
                        {kPackageUnit === "기타" && (
                          <div className="flex items-center gap-1 mt-1">
                            <input className={inpR} inputMode="numeric" placeholder="수량 입력" value={kPackageUnitCustom} onChange={(e) => setKPackageUnitCustom(e.target.value.replace(/[^\d]/g, ""))} />
                            <span className="shrink-0 text-xs text-slate-500">ea</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-slate-500">성형틀 열수 (가로 × 세로){kMoldCols && kMoldRows && toInt(kMoldCols) > 0 && toInt(kMoldRows) > 0 && <span className="ml-1 font-semibold text-blue-600">= {toInt(kMoldCols) * toInt(kMoldRows)}개</span>}</div>
                        <div className="flex items-center gap-1"><input className={inpR} inputMode="numeric" placeholder="가로" value={kMoldCols} onChange={(e) => setKMoldCols(e.target.value.replace(/[^\d]/g, ""))} /><span className="shrink-0 font-bold text-slate-400">×</span><input className={inpR} inputMode="numeric" placeholder="세로" value={kMoldRows} onChange={(e) => setKMoldRows(e.target.value.replace(/[^\d]/g, ""))} /></div>
                      </div>
                      <div><div className="mb-1 text-xs text-slate-500">개당 중량 (g)</div><input className={inpR} inputMode="decimal" value={kUnitWeight} onChange={(e) => setKUnitWeight(e.target.value.replace(/[^\d.]/g, ""))} /></div>
                      <div><div className="mb-1 text-xs text-slate-500">비고</div><textarea className={`${inp} resize-none`} rows={2} value={kNote} onChange={(e) => setKNote(e.target.value)} /></div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 mb-3">
                      <div className="mb-2 text-xs font-semibold text-emerald-700">생산 정보</div>
                      <div><div className="mb-1 text-xs text-slate-600">생산수량 *</div><input className={inpR} inputMode="numeric" placeholder="예: 3000" value={kActualQty} onChange={(e) => setKActualQty(e.target.value.replace(/[^\d]/g, ""))} /></div>
                    </div>
                    <button className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={kiseongSaving} onClick={saveKiseongOrder}>{kiseongSaving ? "저장 중..." : "재고 작업지시서 등록"}</button>
                  </>
                )}
              </div>
            </div>
          ) : selectedWo ? (
            <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 130px)" }}>

              {/* 헤더 카드 */}
              <div className={`${card} p-3`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-base font-bold">{selectedWo.client_name}</span>
                      {selectedWo.sub_name ? <span className="text-slate-500 text-sm">· {selectedWo.sub_name}</span> : null}
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusColors[selectedWo.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{selectedWo.status}</span>
                      {selectedWo.order_type === "재고" && <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">재고</span>}
                      {selectedWo.is_reorder && <span className="rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">재주문</span>}
                      {selectedWo.skip_production_check && <span className="rounded-full bg-violet-100 border border-violet-200 px-2 py-0.5 text-[11px] font-semibold text-violet-700">생략</span>}
                    </div>
                    <div className="mt-0.5 font-semibold text-sm text-slate-700">{selectedWo.product_name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500"><span>{selectedWo.work_order_no}</span><span>·</span><span>{selectedWo.order_date}</span></div>
                  </div>
                  <div className="flex gap-1.5">
                    <button className={btnSm} onClick={() => setPrintOpen(true)}>인쇄</button>
                    <button className={btnSm} onClick={() => applySelection(selectedWo)}>초기화</button>
                  </div>
                </div>
              </div>

              {/* 기본정보 카드 — 분사/코팅 숨김 */}
              {!getWoSubType(selectedWo.product_name) && (
                <div className={`${card} p-3`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-semibold text-sm">기본정보</div>
                    <div className="text-xs text-slate-400">{isEditMode ? "수정 모드" : "수정 버튼으로 편집"}</div>
                  </div>
                  {isAdminOrSubadmin ? (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <div><div className="mb-1 text-xs text-slate-500">제품명 *</div><input className={inp} value={eProductName} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEProductName(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-500">서브네임</div><input className={inp} value={eSubName} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setESubName(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-500">식품유형</div><input className={inp} value={eFoodType} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEFoodType(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-500">규격</div><input className={inp} value={eLogoSpec} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setELogoSpec(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-500">두께</div><select className={inp} value={eThickness} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEThickness(e.target.value)}>{["2mm","3mm","5mm","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                      <div><div className="mb-1 text-xs text-slate-500">납품방법</div><select className={inp} value={eDeliveryMethod} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEDeliveryMethod(e.target.value)}>{["택배","퀵-신용","퀵-착불","방문","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                      <div><div className="mb-1 text-xs text-slate-500">포장방법</div><select className={inp} value={ePackagingType} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => { setEPackagingType(e.target.value); if (e.target.value === "벌크") setEPackageUnit("기타"); }}>{["","트레이-정사각20구","트레이-직사각20구","트레이-35구","벌크"].map((v) => <option key={v} value={v}>{v === "" ? "선택안함" : v}</option>)}</select></div>
                      <div>
                        <div className="mb-1 text-xs text-slate-500">포장단위</div>
                        <select className={inp} value={ePackageUnit} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEPackageUnit(e.target.value)}>{["100ea","200ea","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select>
                        {ePackageUnit === "기타" && (
                          <div className="flex items-center gap-1 mt-1">
                            <input className={inpR} inputMode="numeric" placeholder="수량 입력" disabled={selectedWo?.status === "완료" && !isEditMode} value={ePackageUnitCustom} onChange={(e) => setEPackageUnitCustom(e.target.value.replace(/[^\d]/g, ""))} />
                            <span className="shrink-0 text-xs text-slate-500">ea</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-slate-500">성형틀 (가로×세로){eMoldCols && eMoldRows && toInt(eMoldCols) > 0 && toInt(eMoldRows) > 0 && <span className="ml-1 font-semibold text-blue-600">= {toInt(eMoldCols) * toInt(eMoldRows)}개</span>}</div>
                        <div className="flex items-center gap-1"><input className={inpR} inputMode="numeric" placeholder="가로" value={eMoldCols} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEMoldCols(e.target.value.replace(/[^\d]/g, ""))} /><span className="shrink-0 font-bold text-slate-400">×</span><input className={inpR} inputMode="numeric" placeholder="세로" value={eMoldRows} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEMoldRows(e.target.value.replace(/[^\d]/g, ""))} /></div>
                      </div>
                      <div><div className="mb-1 text-xs text-slate-500">성형틀 장수</div><input className={inpR} inputMode="numeric" value={eMoldCount} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEMoldCount(e.target.value.replace(/[^\d]/g, ""))} /></div>
                      <div><div className="mb-1 text-xs text-slate-500">비고</div><textarea className={`${inp} resize-none`} rows={2} value={eNote} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setENote(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-500">참고사항</div><input className={inp} value={eReferenceNote} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEReferenceNote(e.target.value)} /></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                      {([["식품유형", selectedWo.food_type], ["규격", selectedWo.logo_spec], ["두께", selectedWo.thickness], ["납품방법", selectedWo.delivery_method], ["포장방법", selectedWo.packaging_type], ["포장단위", selectedWo.package_unit], ["성형틀/장", selectedWo.mold_per_sheet ? `${selectedWo.mold_per_sheet}개` : null], ["비고", selectedWo.note], ["참고사항", selectedWo.reference_note]] as [string, string | null][]).map(([label, value]) => value ? <div key={label}><div className="text-slate-400">{label}</div><div className="font-medium text-slate-800">{value}</div></div> : null)}
                    </div>
                  )}
                  {(() => {
                    const allItemImages = (selectedWo.work_order_items ?? [])
                      .filter(item => { const n = (item.sub_items ?? [])[0]?.name ?? ""; return !n.startsWith("성형틀") && !n.startsWith("인쇄제판"); })
                      .flatMap(item => (item as any).images ?? []) as string[];
                    if (allItemImages.length === 0) return null;
                    return <ItemImageThumbnails images={allItemImages} logoSpec={selectedWo.logo_spec} />;
                  })()}
                </div>
              )}

             {/* 전사지인쇄 CCP-1B(8번 슬롯) — 대상 식품유형만 노출 */}
             {!getWoSubType(selectedWo.product_name) && !selectedWo.skip_production_check && needsTransferCcp(selectedWo.food_type) && (
                <div className={`${card} p-3`}>
                  <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
                    <div className="font-semibold text-sm">🌡️ CCP-1B 온장고 슬롯(전사지인쇄) <span className="text-xs text-slate-400 font-normal">— 8번 슬롯 자동지정</span></div>
                    {transferCcpEnded && <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">종료됨</span>}
                  </div>
                  {!transferCcpSlotId ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">전사 슬롯(8번)을 찾을 수 없습니다. warmer_slots 설정을 확인해주세요.</div>
                  ) : (
                    <>
                      <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-3">
                        <div>
                          <div className="mb-1 text-xs text-slate-500">유형</div>
                          <div className="flex flex-wrap gap-1">
                            {([
                              { value: "start", label: "시작", cls: "bg-blue-100 border-blue-400 text-blue-800" },
                              { value: "mid_check", label: "중간점검", cls: "bg-slate-100 border-slate-400 text-slate-700" },
                              { value: "end", label: "종료", cls: "bg-purple-100 border-purple-400 text-purple-800" },
                            ] as { value: string; label: string; cls: string }[]).map((t) => (
                              <button key={t.value} type="button"
                                disabled={selectedWo?.status === "완료" && !isEditMode}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40 ${
                                  transferCcpEventType === t.value ? t.cls + " shadow-sm scale-105" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                                }`}
                                onClick={() => setTransferCcpEventType(t.value as any)}
                              >{t.label}</button>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                          <div>
                            <div className="mb-1 text-xs text-slate-500">측정시각 (HHmm)</div>
                            <input className={inp} inputMode="numeric" placeholder="예: 1430" maxLength={4}
                              disabled={selectedWo?.status === "완료" && !isEditMode}
                              value={transferCcpTime}
                              onChange={(e) => setTransferCcpTime(e.target.value.replace(/[^\d]/g,"").slice(0,4))} />
                            {transferCcpTime.length === 4 && (
                              <div className="mt-0.5 text-xs text-slate-400 text-right">{transferCcpTime.slice(0,2)}:{transferCcpTime.slice(2,4)}</div>
                            )}
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-slate-500">온도 (40~50°C)</div>
                            <input className={inpR} inputMode="numeric" placeholder="예: 45.0"
                              disabled={selectedWo?.status === "완료" && !isEditMode}
                              value={transferCcpTemp}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g,"");
                                if (!raw) { setTransferCcpTemp(""); return; }
                                const v = raw.length >= 3 ? `${raw.slice(0,-1)}.${raw.slice(-1)}` : raw;
                                setTransferCcpTemp(v);
                                if (raw.length >= 3) setTransferCcpIsOk(Number(v) >= 40 && Number(v) <= 50);
                              }} />
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-slate-500">판정</div>
                            <select className={`${inp} ${transferCcpIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
                              disabled={selectedWo?.status === "완료" && !isEditMode}
                              value={transferCcpIsOk ? "ok" : "ng"} onChange={(e) => setTransferCcpIsOk(e.target.value === "ok")}>
                              <option value="ok">✅ 적합</option>
                              <option value="ng">❌ 부적합</option>
                            </select>
                          </div>
                        </div>
                        {!transferCcpIsOk && (
                          <div>
                            <div className="mb-1 text-xs text-red-600 font-semibold">⚠ 한계기준 이탈 — 조치사항 *</div>
                            <input className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm focus:outline-none"
                              disabled={selectedWo?.status === "완료" && !isEditMode}
                              value={transferCcpActionNote} onChange={(e) => setTransferCcpActionNote(e.target.value)} placeholder="온도 이탈 조치 내용" />
                          </div>
                        )}
                        <button className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                          disabled={transferCcpSaving || (selectedWo?.status === "완료" && !isEditMode)}
                          onClick={() => saveTransferCcpEvent(selectedWo)}>
                          {transferCcpSaving ? "저장 중..." : "💾 기록"}
                        </button>
                      </div>

                      {transferCcpEvents.length === 0 ? (
                        <div className="py-4 text-center text-sm text-slate-400">기록된 온도가 없습니다.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="border-b-2 border-slate-200 bg-slate-50">
                                <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">시각</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">유형</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">온도</th>
                                <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">판정</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">조치</th>
                                <th className="py-2 px-2 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">관리</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...transferCcpEvents].sort((a,b) => a.measured_at.localeCompare(b.measured_at)).map((ev, idx) => {
                                const isNG = ev.is_ok === false;
                                const isEditing = transferCcpEditingId === ev.id;
                                return (
                                  <tr key={ev.id} className={`border-b border-slate-100 ${isEditing ? "bg-blue-50" : isNG ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                    <td className="py-2 px-3 font-mono text-sm text-slate-700 whitespace-nowrap">
                                      {isEditing
                                        ? <input className="w-24 rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none"
                                            inputMode="numeric" placeholder="HHmm" maxLength={4}
                                            value={transferCcpEditTime} onChange={(e) => setTransferCcpEditTime(e.target.value.replace(/[^\d]/g,"").slice(0,4))} />
                                        : utcToKSTDateTime(ev.measured_at)}
                                    </td>
                                    <td className="py-2 px-3 whitespace-nowrap">
                                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                        ev.event_type === "start" ? "bg-blue-100 border-blue-200 text-blue-700"
                                        : ev.event_type === "end" ? "bg-purple-100 border-purple-200 text-purple-700"
                                        : "bg-slate-100 border-slate-200 text-slate-600"
                                      }`}>
                                        {ev.event_type === "start" ? "시작" : ev.event_type === "end" ? "종료" : "중간점검"}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-right whitespace-nowrap">
                                      {isEditing
                                        ? <input className="w-20 rounded-lg border border-blue-300 px-2 py-1 text-xs text-right tabular-nums focus:outline-none"
                                            inputMode="decimal" value={transferCcpEditTemp}
                                            onChange={(e) => {
                                              const raw = e.target.value.replace(/[^\d]/g,"");
                                              if (!raw) { setTransferCcpEditTemp(""); return; }
                                              const v = raw.length >= 3 ? `${raw.slice(0,-1)}.${raw.slice(-1)}` : raw;
                                              setTransferCcpEditTemp(v);
                                              if (raw.length >= 3) setTransferCcpEditIsOk(Number(v) >= 40 && Number(v) <= 50);
                                            }} />
                                        : ev.temperature != null
                                          ? <span className={`text-sm font-bold tabular-nums ${isNG ? "text-red-600" : "text-blue-700"}`}>{ev.temperature}°C</span>
                                          : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="py-2 px-3 text-center whitespace-nowrap">
                                      {isEditing
                                        ? <select className={`rounded-lg border px-1.5 py-1 text-xs focus:outline-none ${transferCcpEditIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
                                            value={transferCcpEditIsOk ? "ok" : "ng"} onChange={(e) => setTransferCcpEditIsOk(e.target.value === "ok")}>
                                            <option value="ok">O 적합</option>
                                            <option value="ng">X 부적합</option>
                                          </select>
                                        : ev.is_ok != null
                                          ? <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ev.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>{ev.is_ok ? "O" : "X"}</span>
                                          : <span className="text-slate-300 text-xs">—</span>}
                                    </td>
                                    <td className="py-2 px-3 text-xs">
                                      {isEditing
                                        ? <input className="w-full rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none"
                                            value={transferCcpEditActionNote} onChange={(e) => setTransferCcpEditActionNote(e.target.value)} placeholder="조치사항" />
                                        : <span className={isNG ? "text-red-600" : ""}>{ev.action_note ?? ""}</span>}
                                    </td>
                                    <td className="py-2 px-2 text-center whitespace-nowrap">
                                      {isEditing
                                        ? <div className="flex gap-1">
                                            <button className="rounded-lg border border-blue-400 bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                              disabled={transferCcpEditSaving} onClick={() => saveTransferCcpEdit(ev, selectedWo.work_order_no)}>
                                              {transferCcpEditSaving ? "..." : "저장"}
                                            </button>
                                            <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50"
                                              onClick={() => setTransferCcpEditingId(null)}>취소</button>
                                          </div>
                                        : <div className="flex gap-1">
                                            <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
                                              onClick={() => startTransferCcpEdit(ev)}>수정</button>
                                            <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500"
                                              onClick={() => deleteTransferCcpEvent(ev.id, selectedWo.work_order_no)}>삭제</button>
                                          </div>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

             {/* 진행상태 카드 — 분사/코팅 및 포장완료(skip) 숨김 */}
             {!getWoSubType(selectedWo.product_name) && !selectedWo.skip_production_check && (
                <div className={`${card} p-3`}>
                  <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-sm">진행상태</div>
                      <div className="flex items-center gap-1"><span className={`inline-block w-1.5 h-1.5 rounded-full ${realtimeConnected ? "bg-green-400 animate-pulse" : "bg-slate-300"}`} /><span className="text-[10px] text-slate-400">{realtimeConnected ? "실시간" : "연결 중"}</span></div>
                      {lastUpdatedAt && <span className="text-[10px] text-blue-400 font-mono">{lastUpdatedAt}</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-green-400 transition-all duration-500" style={{ width: `${Math.round((doneCount / PROGRESS_STEPS.length) * 100)}%` }} /></div>
                      <span className="text-[10px] text-slate-500">{doneCount}/{PROGRESS_STEPS.length}</span>
                    </div>
                  </div>
                  {woChecks ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {PROGRESS_STEPS.filter((step) => {
                        if (getFoodCategory(selectedWo.food_type) === "중간재" && step.statusKey === "status_input") return false;
                        return true;
                      }).map((step) => {
                        const assigneeVal = woChecks[step.assigneeKey] ?? "";
                        const isDone = assigneeVal !== "";
                        const othersDone = PROGRESS_STEPS.some((s) => s.assigneeKey !== step.assigneeKey && (woChecks[s.assigneeKey] ?? "") !== "");
                        const isSkipped = !isDone && othersDone;
                        const isSaving = stepSaving === step.assigneeKey;
                        const isFlashing = flashKey === step.assigneeKey;
                        const cardCls = isDone ? step.cardDone : isSkipped ? step.cardSkip : step.cardEmpty;
                        return (
                          <div key={step.assigneeKey} className={`rounded-lg border px-2.5 py-2 transition-all duration-300 ${cardCls} ${isFlashing ? "ring-2 ring-blue-400 ring-offset-1 scale-[1.02]" : ""}`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="text-xs font-semibold text-slate-700">{step.label}</div>
                              <div>{isSaving ? <span className="text-[10px] text-slate-400 animate-pulse">저장 중</span> : isDone ? <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${step.badgeDone}`}>완료</span> : isSkipped ? <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${step.badgeSkip}`}>미입력</span> : <span className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">대기</span>}</div>
                            </div>
                            {step.statusKey === "status_input" ? (
                              <div className="text-center">{isDone ? <div className="space-y-0.5"><div className="text-[11px] font-semibold text-slate-600 truncate">{assigneeVal}</div>{woChecks[step.doneAtKey] && <div className="text-[10px] text-slate-400 tabular-nums">{utcToKSTDateTime(woChecks[step.doneAtKey])}</div>}</div> : <div className="text-[10px] text-slate-400">CCP-1P 후 자동완료</div>}</div>
                            ) : isDone ? (
                              <div className="space-y-1">
                                <div className="text-[11px] font-semibold text-center text-slate-600 truncate">{assigneeVal === "담당자없음" ? "담당자없음" : assigneeVal}</div>
                                {woChecks[step.doneAtKey] && <div className="text-[10px] text-center text-slate-400 tabular-nums">{utcToKSTDateTime(woChecks[step.doneAtKey])}</div>}
                                {!(selectedWo?.status === "완료" && !isEditMode) && (
                                  <button type="button" disabled={isSaving} className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500 disabled:opacity-60" onClick={() => handleAssigneeChange(step.assigneeKey, step.statusKey, "")}>취소</button>
                                )}
                              </div>
                           ) : (
                            <div className="flex flex-col gap-1">
                              {step.assigneeKey === "assignee_transfer" && selectedWo && needsTransferCcp(selectedWo.food_type) && !transferCcpEnded && (
                                <div className="mb-0.5 text-[10px] text-amber-600 text-center">CCP-1B(전사지인쇄) 종료 후 완료 가능</div>
                              )}
                              <button type="button" disabled={isSaving || (selectedWo?.status === "완료" && !isEditMode)} className="w-full rounded-md border border-blue-300 bg-blue-50 px-1.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60" onClick={() => { if (blockedByTransferCcp(step.assigneeKey)) { showToast("CCP-1B(전사지인쇄) 온도기록을 먼저 종료해주세요.", "error"); return; } handleAssigneeChange(step.assigneeKey, step.statusKey, "__pin__"); }}>PIN 확인</button>
                              <button type="button" disabled={isSaving || (selectedWo?.status === "완료" && !isEditMode)} className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-500 hover:bg-slate-50 disabled:opacity-60" onClick={() => { if (blockedByTransferCcp(step.assigneeKey)) { showToast("CCP-1B(전사지인쇄) 온도기록을 먼저 종료해주세요.", "error"); return; } handleAssigneeChange(step.assigneeKey, step.statusKey, "담당자없음"); }}>담당자없음</button>
                            </div>
                          )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}

             {/* 분사-레이즈 사용량 — 네오컬러화이트/리얼화이트 전용 / 진행상태 카드 바로 아래 */}
             {(["네오컬러화이트", "네오컬러리얼화이트", "롤리팝컬러리얼화이트", "롤리팝컬러화이트"].some((k) => (selectedWo.food_type ?? "").includes(k))) && (() => {
                const transferDone = !!(woChecks?.assignee_transfer && woChecks.assignee_transfer !== "");
                return (
                  <div className={`${card} p-3 border-violet-300 bg-violet-50`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-semibold text-violet-800">🎞️ 분사-레이즈 사용량</span>
                      <span className="text-xs text-red-500 font-semibold">필수</span>
                    </div>
                    {!transferDone ? (
                      <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs text-slate-400">
                        전사인쇄 담당자 지정 후 입력 가능합니다.
                      </div>
                    ) : (
                      <>
                        {/* 선택된 lot 목록 — 생산용/판매용 섹션 분리 */}
                        {neoColorSprayLots.length > 0 && (
                          <div className="space-y-1.5 mb-2">
                            {neoColorSprayLots.map((tl, tlIdx) => {
                              const lotInfo = neoColorSprayLotOptions.find((l) => l.lot_id === tl.lot_id);
                              const usedByOthers = neoColorSprayLots.filter((_, i) => i !== tlIdx).reduce((s, l) => l.lot_id === tl.lot_id ? s + toInt(l.qty) : s, 0);
                              const effectiveRemaining = (lotInfo?.remaining_qty ?? 0) - usedByOthers;
                              return (
                                <div key={tlIdx} className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-semibold text-violet-700 truncate">{lotInfo?.variant_name ?? tl.lot_id}</div>
                                      <div className="text-[11px] text-slate-500">소비기한: {lotInfo?.expiry_date ?? "—"}{lotInfo && <span className="ml-2">잔량: <b className="text-violet-700">{effectiveRemaining.toLocaleString()} EA</b></span>}</div>
                                    </div>
                                    {!(selectedWo?.status === "완료" && !isEditMode) && (
                                      <button type="button" className="text-xs text-slate-400 hover:text-red-500 shrink-0"
                                        onClick={() => setNeoColorSprayLots((prev) => prev.filter((_, i) => i !== tlIdx))}>✕</button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <input className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-right tabular-nums focus:border-violet-400 focus:outline-none"
                                      inputMode="numeric" placeholder="사용 수량"
                                      value={tl.qty}
                                      disabled={selectedWo?.status === "완료" && !isEditMode}
                                      onChange={(e) => setNeoColorSprayLots((prev) => {
                                        const next = [...prev];
                                        next[tlIdx] = { ...next[tlIdx], qty: e.target.value.replace(/[^\d]/g, "") };
                                        return next;
                                      })} />
                                    {lotInfo && tl.qty && (
                                      <div className="text-[11px] text-slate-500 shrink-0">차감 후: <b className={effectiveRemaining - toInt(tl.qty) < 0 ? "text-red-600" : "text-violet-700"}>{(effectiveRemaining - toInt(tl.qty)).toLocaleString()} EA</b></div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* 저장/수정 버튼 */}
                        {!neoColorSpraySaved ? (
                          <>
                            {neoColorSprayLotLoading ? (
                              <div className="text-xs text-slate-400 py-1">불러오는 중...</div>
                            ) : (() => {
                              if (neoColorSprayLotOptions.length === 0) return <div className="text-xs text-slate-400">관련 재고 없음</div>;
                              const selectedLotIds = new Set(neoColorSprayLots.map((l) => l.lot_id));
                              const availableLots = neoColorSprayLotOptions.filter((l) => !selectedLotIds.has(l.lot_id));
                              if (availableLots.length === 0 && neoColorSprayLots.length === 0) return <div className="text-xs text-slate-400">추가할 재고 없음</div>;
                              return availableLots.length > 0 ? (
                                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden max-h-36 overflow-y-auto">
                                  {availableLots.map((lot) => (
                                    <button key={lot.lot_id} type="button"
                                      className="w-full text-left px-2.5 py-2 text-xs border-b border-slate-100 last:border-0 hover:bg-violet-50"
                                      onClick={() => setNeoColorSprayLots((prev) => [...prev, { lot_id: lot.lot_id, qty: "" }])}>
                                      <div className="font-medium text-slate-800">+ {lot.variant_name}</div>
                                      <div className="flex gap-2 mt-0.5 text-[11px] text-slate-500">
                                        <span>소비기한: {lot.expiry_date}</span><span>·</span>
                                        <span>잔량: <b className="text-violet-700">{lot.remaining_qty.toLocaleString()} EA</b></span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                            {neoColorSprayLots.length > 0 && neoColorSprayLots.every((l) => l.lot_id && toInt(l.qty) > 0) && (
                              <button type="button"
                                disabled={neoColorSpraySaving}
                                className="mt-2 w-full rounded-lg border border-violet-500 bg-violet-600 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60"
                                onClick={async () => {
                                  if (!selectedWo) return;
                                  setNeoColorSpraySaving(true);
                                  const lotsForDb = neoColorSprayLots.map((l) => ({ lot_id: l.lot_id, qty: l.qty }));
                                  // 1. work_orders 저장
                                  const { error } = await supabase.from("work_orders").update({
                                    neo_color_spray_lots: lotsForDb,
                                    updated_at: new Date().toISOString(),
                                  }).eq("id", selectedWo.id);
                                  if (error) { setNeoColorSpraySaving(false); showToast("저장 실패: " + error.message, "error"); return; }
                                  // 2. movements OUT + pet_stock_logs 즉시 기록
                                  const { data: { user } } = await supabase.auth.getUser();
                                  const userId = user?.id ?? null;
                                  const todayKSTDate = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })).toISOString().slice(0, 10);
                                  let totalSprayQty = 0;
                                  for (const tl of neoColorSprayLots) {
                                    const sprayQty = toInt(tl.qty);
                                    if (!tl.lot_id || sprayQty <= 0) continue;
                                    // 저장 직전 DB 잔량 재확인
                                    const { data: latestMovs } = await supabase.from("movements").select("type, qty").eq("lot_id", tl.lot_id);
                                    const latestRemaining = (latestMovs ?? []).reduce((s, m) => m.type === "IN" ? s + m.qty : s - m.qty, 0);
                                    if (sprayQty > latestRemaining) {
                                      setNeoColorSpraySaving(false);
                                      showToast(`재고 부족: 차감 수량(${sprayQty})이 현재 잔량(${latestRemaining})을 초과합니다. 잔량을 확인하세요.`, "error");
                                      return;
                                    }
                                    totalSprayQty += sprayQty;
                                    const { error: movErr } = await supabase.from("movements").insert({
                                      lot_id: tl.lot_id, type: "OUT", qty: sprayQty,
                                      happened_at: `${todayKSTDate}T00:00:00+09:00`,
                                      note: `네오컬러 인쇄투입 - ${selectedWo.work_order_no}`,
                                      created_by: userId,
                                    });
                                    if (movErr) { setNeoColorSpraySaving(false); showToast("재고 차감 실패: " + movErr.message, "error"); return; }
                                  }
                                  if (totalSprayQty > 0) {
                                    const petNote = `네오컬러 인쇄투입 - ${selectedWo.work_order_no}`;
                                    const { error: petErr } = await supabase.from("pet_stock_logs").insert({
                                      log_date: todayKSTDate, log_type: "print_used_prod",
                                      quantity: totalSprayQty, defect_qty: 0,
                                      note: petNote, created_by: userId,
                                    });
                                    if (petErr) { setNeoColorSpraySaving(false); showToast("PET 수불부 기록 실패: " + petErr.message, "error"); return; }
                                  }
                                  setNeoColorSpraySaving(false);
                                  setNeoColorSpraySaved(true);
                                  setNeoColorSprayEditMode(false);
                                  // 저장 후 잔량 즉시 갱신
                                  const updatedLotIds = neoColorSprayLots.map((l) => l.lot_id).filter(Boolean);
                                  if (updatedLotIds.length > 0) {
                                    const { data: refreshMovs } = await supabase.from("movements").select("lot_id, type, qty").in("lot_id", updatedLotIds);
                                    const refreshMap: Record<string, number> = {};
                                    for (const m of refreshMovs ?? []) {
                                      if (!refreshMap[m.lot_id]) refreshMap[m.lot_id] = 0;
                                      if (m.type === "IN") refreshMap[m.lot_id] += m.qty;
                                      else refreshMap[m.lot_id] -= m.qty;
                                    }
                                    setNeoColorSprayLotOptions((prev) => {
                                      const next = prev.map((l) => updatedLotIds.includes(l.lot_id) ? { ...l, remaining_qty: refreshMap[l.lot_id] ?? l.remaining_qty } : l);
                                      neoColorSprayLotOptionsRef.current = next;
                                      return next;
                                    });
                                  }
                                  showToast("분사-레이즈 사용량 저장 완료!");
                                }}>
                                {neoColorSpraySaving ? "저장 중..." : "저장"}
                              </button>
                            )}
                          </>
                        ) : neoColorSprayEditMode ? (
                          <>
                            {neoColorSprayLotLoading ? (
                              <div className="text-xs text-slate-400 py-1">불러오는 중...</div>
                            ) : (() => {
                              const selectedLotIds = new Set(neoColorSprayLots.map((l) => l.lot_id));
                              const availableLots = neoColorSprayLotOptions.filter((l) => !selectedLotIds.has(l.lot_id));
                              return availableLots.length > 0 ? (
                                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden max-h-36 overflow-y-auto">
                                  {availableLots.map((lot) => (
                                    <button key={lot.lot_id} type="button"
                                      className="w-full text-left px-2.5 py-2 text-xs border-b border-slate-100 last:border-0 hover:bg-violet-50"
                                      onClick={() => setNeoColorSprayLots((prev) => [...prev, { lot_id: lot.lot_id, qty: "" }])}>
                                      <div className="font-medium text-slate-800">+ {lot.variant_name}</div>
                                      <div className="flex gap-2 mt-0.5 text-[11px] text-slate-500">
                                        <span>소비기한: {lot.expiry_date}</span><span>·</span>
                                        <span>잔량: <b className="text-violet-700">{lot.remaining_qty.toLocaleString()} EA</b></span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                            <div className="mt-2 flex gap-2">
                              <button type="button"
                                disabled={neoColorSpraySaving || neoColorSprayLots.length === 0 || !neoColorSprayLots.every((l) => l.lot_id && toInt(l.qty) > 0)}
                                className="flex-1 rounded-lg border border-violet-500 bg-violet-600 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60"
                                onClick={async () => {
                                  if (!selectedWo) return;
                                  setNeoColorSpraySaving(true);
                                  const lotsForDb = neoColorSprayLots.map((l) => ({ lot_id: l.lot_id, qty: l.qty }));
                                  // 1. work_orders 저장
                                  const { error } = await supabase.from("work_orders").update({
                                    neo_color_spray_lots: lotsForDb,
                                    updated_at: new Date().toISOString(),
                                  }).eq("id", selectedWo.id);
                                  if (error) { setNeoColorSpraySaving(false); showToast("저장 실패: " + error.message, "error"); return; }
                                 // 2. 기존 movements/pet_stock_logs 삭제 후 재삽입
                                 const neoNote = `네오컬러 인쇄투입 - ${selectedWo.work_order_no}`;
                                 // 기존 movements 삭제 — ID 목록 조회 후 in()으로 삭제
                                 const { data: oldMovs, error: oldMovsErr } = await supabase.from("movements").select("id").eq("note", neoNote);
                                 if (oldMovsErr) { setNeoColorSpraySaving(false); showToast("기존 기록 조회 실패: " + oldMovsErr.message, "error"); return; }
                                 if (oldMovs && oldMovs.length > 0) {
                                   const oldMovIds = oldMovs.map((m) => m.id);
                                   const { error: delMovErr } = await supabase.from("movements").delete().in("id", oldMovIds);
                                   if (delMovErr) { setNeoColorSpraySaving(false); showToast("기존 재고 기록 삭제 실패: " + delMovErr.message, "error"); return; }
                                 }
                                 // 기존 pet_stock_logs 삭제 — ID 목록 조회 후 in()으로 삭제
                                 const { data: oldPets, error: oldPetsErr } = await supabase.from("pet_stock_logs").select("id").eq("note", neoNote);
                                 if (oldPetsErr) { setNeoColorSpraySaving(false); showToast("기존 PET 기록 조회 실패: " + oldPetsErr.message, "error"); return; }
                                 if (oldPets && oldPets.length > 0) {
                                   const oldPetIds = oldPets.map((p) => p.id);
                                   const { error: delPetErr } = await supabase.from("pet_stock_logs").delete().in("id", oldPetIds);
                                   if (delPetErr) { setNeoColorSpraySaving(false); showToast("기존 PET 기록 삭제 실패: " + delPetErr.message, "error"); return; }
                                 }
                                  // 재삽입
                                  const { data: { user } } = await supabase.auth.getUser();
                                  const userId = user?.id ?? null;
                                  const todayKSTDate = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })).toISOString().slice(0, 10);
                                  let totalSprayQty = 0;
                                  for (const tl of neoColorSprayLots) {
                                    const sprayQty = toInt(tl.qty);
                                    if (!tl.lot_id || sprayQty <= 0) continue;
                                    // 기존 삭제 후 재삽입 직전 DB 잔량 재확인
                                    const { data: latestMovs2 } = await supabase.from("movements").select("type, qty").eq("lot_id", tl.lot_id);
                                    const latestRemaining2 = (latestMovs2 ?? []).reduce((s, m) => m.type === "IN" ? s + m.qty : s - m.qty, 0);
                                    if (sprayQty > latestRemaining2) {
                                      setNeoColorSpraySaving(false);
                                      showToast(`재고 부족: 차감 수량(${sprayQty})이 현재 잔량(${latestRemaining2})을 초과합니다. 잔량을 확인하세요.`, "error");
                                      return;
                                    }
                                    totalSprayQty += sprayQty;
                                    const { error: movErr } = await supabase.from("movements").insert({
                                      lot_id: tl.lot_id, type: "OUT", qty: sprayQty,
                                      happened_at: `${todayKSTDate}T00:00:00+09:00`,
                                      note: neoNote,
                                      created_by: userId,
                                    });
                                    if (movErr) { setNeoColorSpraySaving(false); showToast("재고 차감 실패: " + movErr.message, "error"); return; }
                                  }
                                  if (totalSprayQty > 0) {
                                    const { error: petErr } = await supabase.from("pet_stock_logs").insert({
                                      log_date: todayKSTDate, log_type: "print_used_prod",
                                      quantity: totalSprayQty, defect_qty: 0,
                                      note: neoNote, created_by: userId,
                                    });
                                    if (petErr) { setNeoColorSpraySaving(false); showToast("PET 수불부 기록 실패: " + petErr.message, "error"); return; }
                                  }
                                  setNeoColorSpraySaving(false);
                                  setNeoColorSpraySaved(true);
                                  setNeoColorSprayEditMode(false);
                                  // 수정 저장 후 잔량 즉시 갱신
                                  const updatedLotIds2 = neoColorSprayLots.map((l) => l.lot_id).filter(Boolean);
                                  if (updatedLotIds2.length > 0) {
                                    const { data: refreshMovs2 } = await supabase.from("movements").select("lot_id, type, qty").in("lot_id", updatedLotIds2);
                                    const refreshMap2: Record<string, number> = {};
                                    for (const m of refreshMovs2 ?? []) {
                                      if (!refreshMap2[m.lot_id]) refreshMap2[m.lot_id] = 0;
                                      if (m.type === "IN") refreshMap2[m.lot_id] += m.qty;
                                      else refreshMap2[m.lot_id] -= m.qty;
                                    }
                                    setNeoColorSprayLotOptions((prev) => {
                                      const next = prev.map((l) => updatedLotIds2.includes(l.lot_id) ? { ...l, remaining_qty: refreshMap2[l.lot_id] ?? l.remaining_qty } : l);
                                      neoColorSprayLotOptionsRef.current = next;
                                      return next;
                                    });
                                  }
                                  showToast("분사-레이즈 사용량 수정 완료!");
                                }}>
                                {neoColorSpraySaving ? "저장 중..." : "수정 저장"}
                              </button>
                              <button type="button"
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                onClick={() => {
                                  setNeoColorSprayEditMode(false);
                                  if (selectedWo?.neo_color_spray_lots) {
                                    setNeoColorSprayLots(selectedWo.neo_color_spray_lots);
                                  }
                                }}>취소</button>
            </div>
                          </>
                        ) : (
                          <button type="button"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={() => {
                              setPinProgressPending(() => (_name: string) => {
                                setNeoColorSprayEditMode(true);
                              });
                              setShowPinModalForProgress(true);
                            }}>
                            수정
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* 분사/코팅 배합 횟수 카드 */}
              {(() => {
                const subType = getWoSubType(selectedWo.product_name);
                if (!subType) return null;
                const isSpray = subType === "분사";
                const sprayData = SPRAY_RECIPE[Math.min(Math.max(blendCount, 1), 5)];
                const coatingPalmOil = COATING_BASE.팜유 * blendCount;
                const coatingWheyPowder = COATING_BASE.유청분말 * blendCount;
                return (
                  <div className={`${card} p-3`}>
                    <div className="mb-2 font-semibold text-sm">{isSpray ? "분사 배합 횟수" : "코팅 배합 횟수"}</div>
                    <div className="flex items-center gap-2 mb-3">
                      <button type="button" className="w-9 h-9 rounded-lg border-2 border-slate-200 bg-white text-lg font-bold text-slate-600 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40" disabled={blendCount <= 1} onClick={() => setBlendCount((n) => Math.max(1, n - 1))}>−</button>
                      <div className="w-16 rounded-lg border-2 border-blue-300 bg-blue-50 py-1.5 text-center text-lg font-bold text-blue-700">{blendCount}</div>
                      <button type="button" className="w-9 h-9 rounded-lg border-2 border-slate-200 bg-white text-lg font-bold text-slate-600 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40" disabled={isSpray && blendCount >= 5} onClick={() => setBlendCount((n) => isSpray ? Math.min(5, n + 1) : n + 1)}>＋</button>
                      {isSpray && <span className="text-xs text-slate-400">최대 5번</span>}
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1">
                      {isSpray ? (
                        <>
                          <div className="text-xs font-semibold text-slate-500 mb-1.5">분사액 ({blendCount}배합)</div>
                          {[{ name: "구아검", g: sprayData.구아검 }, { name: "유화제", g: sprayData.유화제 }, { name: "감자전분", g: sprayData.감자전분 }].map((item) => (
                            <div key={item.name} className="flex justify-between text-xs"><span className="text-slate-600">{item.name}{item.name === "구아검" ? <span className="ml-1 text-[10px] text-slate-400">(참고용. 배합액 사용으로 2중 차감 없음)</span> : null}</span><span className="tabular-nums font-semibold">{item.g.toLocaleString()}g</span></div>
                          ))}
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <div className="text-[11px] font-semibold text-slate-400 mb-1">구아검 배합액 (별도)</div>
                            {[{ name: "물", g: sprayData.구아검_배합액물 }, { name: "구아검", g: sprayData.구아검_배합액구아검 }].map((item) => (
                              <div key={item.name} className="flex justify-between text-[11px] text-slate-400"><span>{item.name}</span><span className="tabular-nums">{item.g.toLocaleString()}g</span></div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs font-semibold text-slate-500 mb-1.5">코팅 원료 ({blendCount}배합)</div>
                          {[{ name: "팜유", g: coatingPalmOil }, { name: "유청분말", g: coatingWheyPowder }].map((item) => (
                            <div key={item.name} className="flex justify-between text-xs"><span className="text-slate-600">{item.name}{item.name === "구아검" ? <span className="ml-1 text-[10px] text-slate-400">(참고용. 배합액 사용으로 2중 차감 없음)</span> : null}</span><span className="tabular-nums font-semibold">{item.g.toLocaleString()}g</span></div>
                          ))}
                          <div className="text-[11px] text-slate-400 mt-1">1배합: 팜유 280g / 유청분말 300g</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

           {/* 압축공기 작업 기록 — 분사/코팅 전용 */}
           {getWoSubType(selectedWo.product_name) && (
              <div className={`${card} p-3`} style={{ borderColor: "#bae6fd", background: "#f0f9ff" }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: "#0369a1" }}>💨 압축공기 작업 기록</span>
                  {compSaved && (
                    <span className="rounded-full border border-green-200 bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">✅ 저장됨</span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3 mb-3">
                  <div>
                    <div className="mb-1 text-xs text-slate-500">작업시간 (h) *</div>
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none"
                      inputMode="decimal"
                      placeholder="예: 6"
                      value={compWorkHours}
                      disabled={selectedWo.status === "완료" && !isEditMode}
                      onChange={(e) => setCompWorkHours(e.target.value.replace(/[^\d.]/g, ""))}
                    />
                  </div>
                  <div>
                  <div className="mb-1 text-xs text-slate-500">여과필터파손여부</div>
                    <div className="flex gap-2">
                      <button type="button"
                        className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-all ${compDamageOk ? "border-green-400 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                        disabled={selectedWo.status === "완료" && !isEditMode}
                        onClick={() => setCompDamageOk(true)}>○ 이상없음</button>
                      <button type="button"
                        className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-all ${!compDamageOk ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                        disabled={selectedWo.status === "완료" && !isEditMode}
                        onClick={() => setCompDamageOk(false)}>× 파손</button>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-500">특이사항</div>
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                      value={compNote}
                      disabled={selectedWo.status === "완료" && !isEditMode}
                      onChange={(e) => setCompNote(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full rounded-lg border py-2 text-xs font-bold text-white disabled:opacity-60"
                  style={{ borderColor: "#0284c7", background: compSaving ? "#94a3b8" : "#0284c7" }}
                  disabled={compSaving || !compWorkHours || (selectedWo.status === "완료" && !isEditMode)}
                  onClick={() => {
                    if (isPinValid() && pinSession) {
                      saveCompressorLog(pinSession.employeeName);
                    } else {
                      setPinProgressPending(() => (name: string) => saveCompressorLog(name));
                      setShowPinModalForProgress(true);
                    }
                  }}
                >
                  {compSaving ? "저장 중..." : compSaved ? "💾 수정 저장" : "💾 압축공기 기록 저장"}
                </button>
              </div>
            )}

            {/* CCP-1B 슬롯 지정 + 온도 기록 */}
            {!selectedWo.skip_production_check && (getFoodCategory(selectedWo.food_type) === "다크" || getFoodCategory(selectedWo.food_type) === "화이트" || (getFoodCategory(selectedWo.food_type) === "중간재" && !selectedWo.product_name.includes("분사-레이즈"))) && (
                <WoCcpCard
                  selectedWo={selectedWo}
                  eCcpSlotId={eCcpSlotId}
                  setECcpSlotId={setECcpSlotId}
                  warmerSlots={warmerSlots}
                  woEvents={ccp.woEvents}
                  ccpWoEventType={ccp.ccpWoEventType}
                  setCcpWoEventType={ccp.setCcpWoEventType}
                  ccpWoTime={ccp.ccpWoTime}
                  setCcpWoTime={ccp.setCcpWoTime}
                  ccpWoTemp={ccp.ccpWoTemp}
                  setCcpWoTemp={ccp.setCcpWoTemp}
                  ccpWoIsOk={ccp.ccpWoIsOk}
                  setCcpWoIsOk={ccp.setCcpWoIsOk}
                  ccpWoActionNote={ccp.ccpWoActionNote}
                  setCcpWoActionNote={ccp.setCcpWoActionNote}
                  ccpWoSaving={ccp.ccpWoSaving}
                  ccpWoEditingId={ccp.ccpWoEditingId}
                  setCcpWoEditingId={ccp.setCcpWoEditingId}
                  ccpWoEditTime={ccp.ccpWoEditTime}
                  setCcpWoEditTime={ccp.setCcpWoEditTime}
                  ccpWoEditTemp={ccp.ccpWoEditTemp}
                  setCcpWoEditTemp={ccp.setCcpWoEditTemp}
                  ccpWoEditIsOk={ccp.ccpWoEditIsOk}
                  setCcpWoEditIsOk={ccp.setCcpWoEditIsOk}
                  ccpWoEditActionNote={ccp.ccpWoEditActionNote}
                  setCcpWoEditActionNote={ccp.setCcpWoEditActionNote}
                  ccpWoEditSaving={ccp.ccpWoEditSaving}
                  isEditMode={isEditMode}
                  saveWoEvent={ccp.saveWoEvent}
                  startWoEventEdit={ccp.startWoEventEdit}
                  saveWoEventEdit={ccp.saveWoEventEdit}
                  deleteWoEvent={ccp.deleteWoEvent}
                  supabaseClient={supabase}
                  currentUserIdRef={currentUserIdRef}
                  foodCategory={getFoodCategory(selectedWo.food_type)}
                  isCoating={selectedWo.product_name.includes("코팅-레이즈")}
                  onSlotSaved={(slotId: string | null) => {
                    setSelectedWo((prev) => prev ? { ...prev, ccp_slot_id: slotId } : prev);
                    setWoList((prev) => prev.map((w) => w.id === selectedWo?.id ? { ...w, ccp_slot_id: slotId } : w));
                    if (slotId && selectedWo) { ccp.loadWoEvents(selectedWo.work_order_no, slotId, selectedWo.status); }
                  }}
                />
              )}

           

              {/* 이산화티타늄 사용량 입력 — 식품유형에 "리얼" 포함 시 */}
              {(selectedWo.food_type ?? "").includes("리얼") && (
                <div className={`${card} p-3 border-amber-300 bg-amber-50`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-semibold text-amber-800">⚠️ 이산화티타늄 사용량</span>
                    <span className="text-xs text-amber-600">총중량 ÷ 11 자동계산</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {titaniumDioxideG && Number(titaniumDioxideG) > 0 ? (
                      <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-700">
                        이산화티타늄 <span className="font-bold">{Number(titaniumDioxideG).toLocaleString()}g</span> 자동계산
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-slate-400">
                        출고수량 · 개당중량 입력 후 자동계산됩니다
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 납기일별 생산 입력 */}
              <div className={`${card} p-3`}>
                <div className="mb-2 flex items-center justify-between"><div className="font-semibold text-sm">납기일별 생산 입력</div><div className="text-xs text-slate-400">{isEditMode ? "수정 모드" : ""}</div></div>
                {(selectedWo.work_order_items ?? []).length === 0 ? <div className="py-3 text-center text-xs text-slate-400">납기일별 항목이 없습니다.</div> : (
                  <div className="space-y-2.5">
                    {(selectedWo.work_order_items ?? []).slice().sort((a, b) => a.delivery_date.localeCompare(b.delivery_date)).filter((item) => { const name = (item.sub_items ?? [])[0]?.name ?? ""; return !name.startsWith("성형틀") && !name.startsWith("인쇄제판") && !name.startsWith("아이스박스") && !name.startsWith("택배비"); }).map((item) => {
                      const pi = prodInputs[item.id] ?? { actual_qty: "", extra_qty: "", unit_weight: "", expiry_date: "" };
                      const actualQty = toInt(pi.actual_qty); const defectQty = toInt(pi.defect_qty); const unitWeight = toNum(pi.unit_weight);
                      const totalWeight = (actualQty + defectQty) > 0 && unitWeight > 0 ? (actualQty + defectQty) * unitWeight : null;
                      const isDone = !!(pi.actual_qty && pi.unit_weight && pi.expiry_date);
                      return (
                        <div key={item.id} className={`rounded-lg border p-2.5 ${isDone ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                          <div><div className="font-semibold text-xs">납기: <span className="tabular-nums">{item.delivery_date}</span></div>{(item.sub_items ?? [])[0]?.name ? <div className="mt-0.5 text-xs font-medium text-slate-700">{item.sub_items[0].name}{item.barcode_no ? <span className="inline-flex items-center gap-1 ml-2"><span className="font-mono text-xs font-normal text-slate-400">{item.barcode_no}</span><button type="button" className="text-slate-300 hover:text-slate-500 active:text-green-500 transition-colors" title="바코드 복사" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.barcode_no!); }}><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></span> : null}</div> : null}</div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className={pill}>주문 {fmt(item.order_qty)}개</span>
                            {isDone && !pi.skip && <span className="rounded-full bg-green-100 border border-green-200 px-2 py-0.5 text-[10px] font-semibold text-green-700">완료</span>}
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!pi.skip}
                                onChange={(e) => setProdInputs((prev) => ({ ...prev, [item.id]: { ...prev[item.id], skip: e.target.checked } }))}
                              />
                              <span className={`text-[11px] font-semibold ${pi.skip ? "text-red-500" : "text-slate-400"}`}>생략</span>
                            </label>
                          </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                            <div>
                              <div className="mb-1 text-xs text-slate-500">출고수량</div>
                              <input className={inpR} inputMode="numeric" value={pi.actual_qty} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setProdInputs((prev) => ({ ...prev, [item.id]: { ...pi, actual_qty: e.target.value.replace(/[^\d]/g, "") } }))} />
                              <div className="mt-0.5 text-[11px] text-slate-400">주문 {fmt(item.order_qty)}개</div>
                            </div>
                            <div>
                              <div className="mb-1 text-xs text-slate-500">+추가생산(증정)</div>
                              <input className={inpR} inputMode="numeric" placeholder="0"
                                value={pi.gift_qty}
                                disabled={selectedWo?.status === "완료" && !isEditMode}
                                onChange={(e) => {
                                  const gift = e.target.value.replace(/[^\d]/g, "");
                                  const newActual = String(toInt(item.order_qty) + toInt(gift));
                                  setProdInputs((prev) => ({ ...prev, [item.id]: { ...prev[item.id], gift_qty: gift, actual_qty: newActual } }));
                                }} />
                              <div className="mt-0.5 text-[11px] text-slate-400">합계 {fmt(toInt(pi.actual_qty))}개</div>
                            </div>
                            <div>
                              <div className="mb-1 text-xs text-slate-500">불량</div>
                              <input className={inpR} inputMode="numeric" placeholder="0"
                                value={pi.defect_qty ?? ""}
                                disabled={selectedWo?.status === "완료" && !isEditMode}
                                onChange={(e) => {
                                  const defect = e.target.value.replace(/[^\d]/g, "");
                                  setProdInputs((prev) => ({ ...prev, [item.id]: { ...prev[item.id], defect_qty: defect } }));
                                }} />
                            </div>
                            <div><div className="mb-1 text-xs text-slate-500">개당 중량 (g)</div><input className={inpR} inputMode="decimal" value={pi.unit_weight} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setProdInputs((prev) => ({ ...prev, [item.id]: { ...pi, unit_weight: e.target.value.replace(/[^\d.]/g, "") } }))} /></div>
                            <div><div className="mb-1 text-xs text-slate-500">총 중량 (자동)</div><div className={`rounded-lg border px-2.5 py-1.5 text-xs text-right tabular-nums font-semibold ${totalWeight ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-100 text-slate-400"}`}>{totalWeight ? fmt(Math.round(totalWeight)) + "g" : "—"}</div></div>
                            <div>
                              <div className="mb-1 flex items-center justify-between"><span className="text-xs text-slate-500">소비기한</span><button type="button" disabled={selectedWo?.status === "완료" && !isEditMode} className="rounded-md border border-slate-300 bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40" onClick={() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1); const ymd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; setProdInputs((prev) => ({ ...prev, [item.id]: { ...pi, expiry_date: ymd } })); }}>+1년-1일</button></div>
                              <input type="date" className={inp} value={pi.expiry_date} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setProdInputs((prev) => ({ ...prev, [item.id]: { ...pi, expiry_date: e.target.value } }))} />
                            </div>
                          </div>
                          {(item.images ?? []).length > 0 ? <ItemImages images={item.images ?? []} logoSpec={selectedWo.logo_spec} /> : null}

{/* 분사 작업지시서 전용 — 코팅-레이즈 차감 + 생산용/판매용 수량 */}
{getWoSubType(selectedWo.product_name) === "분사" && (
   <div className="mt-2 space-y-2">
     {/* 생산용/판매용 수량 입력 */}
     <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2.5">
       <div className="mb-1.5 text-xs font-semibold text-emerald-700">분사완료 수량 입력</div>
       <div>
         <div className="mb-1 text-xs text-slate-500">분사완료 (ea)</div>
         <input className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-right tabular-nums focus:border-emerald-400 focus:outline-none"
           inputMode="numeric" placeholder="0"
           value={sprayProdQty}
           disabled={selectedWo?.status === "완료" && !isEditMode}
           onChange={(e) => setSprayProdQty(e.target.value.replace(/[^\d]/g, ""))} />
       </div>
     </div>
     {/* 코팅-레이즈 lot 차감 */}
     <div className="rounded-lg border border-blue-100 bg-blue-50 p-2.5">
       <div className="mb-1.5 flex items-center justify-between">
         <span className="text-xs font-semibold text-blue-700">코팅-레이즈 차감</span>
         {(prodInputs[item.id]?.transfer_lots ?? []).length > 0 && (
           <span className="text-[11px] text-blue-500">총 차감: <b>{(prodInputs[item.id]?.transfer_lots ?? []).reduce((s, l) => s + toInt(l.qty), 0).toLocaleString()} EA</b></span>
         )}
       </div>
       {/* 선택된 lot 목록 */}
       {(prodInputs[item.id]?.transfer_lots ?? []).length > 0 && (
         <div className="space-y-1.5 mb-2">
           {prodInputs[item.id].transfer_lots.map((tl, tlIdx) => {
             const lotInfo = (transferLotOptions[item.id] ?? []).find((l) => l.lot_id === tl.lot_id);
             const usedByOthers = prodInputs[item.id].transfer_lots.filter((_, i) => i !== tlIdx).reduce((s, l) => l.lot_id === tl.lot_id ? s + toInt(l.qty) : s, 0);
             const effectiveRemaining = (lotInfo?.remaining_qty ?? 0) - usedByOthers;
             return (
               <div key={tlIdx} className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5">
                 <div className="flex items-center gap-2">
                   <div className="flex-1 min-w-0">
                     <div className="text-xs font-semibold text-blue-700 truncate">{lotInfo?.variant_name ?? tl.lot_id}</div>
                     <div className="text-[11px] text-slate-500">소비기한: {lotInfo?.expiry_date ?? "—"}{lotInfo && <span className="ml-2">잔량: <b className="text-blue-700">{effectiveRemaining.toLocaleString()} EA</b></span>}</div>
                   </div>
                   {!(selectedWo?.status === "완료" && !isEditMode) && (
                     <button type="button" className="text-xs text-slate-400 hover:text-red-500 shrink-0"
                       onClick={() => setProdInputs((prev) => ({ ...prev, [item.id]: { ...prev[item.id], transfer_lots: prev[item.id].transfer_lots.filter((_, i) => i !== tlIdx) } }))}>✕</button>
                   )}
                 </div>
                 <div className="flex items-center gap-2 mt-1">
                   <input className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-right tabular-nums focus:border-blue-400 focus:outline-none"
                     inputMode="numeric" placeholder="차감 수량"
                     value={tl.qty}
                     disabled={selectedWo?.status === "완료" && !isEditMode}
                     onChange={(e) => setProdInputs((prev) => {
                       const newLots = [...prev[item.id].transfer_lots];
                       newLots[tlIdx] = { ...newLots[tlIdx], qty: e.target.value.replace(/[^\d]/g, "") };
                       return { ...prev, [item.id]: { ...prev[item.id], transfer_lots: newLots } };
                     })} />
                   {lotInfo && tl.qty && selectedWo?.status !== "완료" && (
                                      <div className="text-[11px] text-slate-500 shrink-0">차감 후: <b className={effectiveRemaining - toInt(tl.qty) < 0 ? "text-red-600" : "text-blue-700"}>{(effectiveRemaining - toInt(tl.qty)).toLocaleString()} EA</b></div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* lot 추가 목록 */}
                        {!(selectedWo?.status === "완료" && !isEditMode) && (
                          <div>
                            {transferLotSearching[item.id] ? (
                              <div className="text-xs text-slate-400 py-1">불러오는 중...</div>
                            ) : (() => {
                              const selectedLotIds = new Set((prodInputs[item.id]?.transfer_lots ?? []).map((l) => l.lot_id));
                              const availableLots = (transferLotOptions[item.id] ?? []).filter((l) => !selectedLotIds.has(l.lot_id));
                              if (availableLots.length === 0) return <div className="text-xs text-slate-400">{selectedLotIds.size > 0 ? "추가할 재고 없음" : "관련 재고 없음"}</div>;
             return (
               <div className="rounded-lg border border-slate-200 bg-white overflow-hidden max-h-44 overflow-y-auto">
                 {availableLots.map((lot) => (
                   <button key={lot.lot_id} type="button" className="w-full text-left px-2.5 py-2 text-xs border-b border-slate-100 last:border-0 hover:bg-blue-50"
                     onClick={() => setProdInputs((prev) => ({
                       ...prev,
                       [item.id]: { ...prev[item.id], transfer_lots: [...(prev[item.id]?.transfer_lots ?? []), { lot_id: lot.lot_id, qty: "" }] }
                     }))}>
                     <div className="font-medium text-slate-800">+ {lot.variant_name}</div>
                     <div className="flex gap-2 mt-0.5 text-[11px] text-slate-500"><span>소비기한: {lot.expiry_date}</span><span>·</span><span>잔량: <b className="text-blue-700">{lot.remaining_qty.toLocaleString()} EA</b></span></div>
                   </button>
                 ))}
               </div>
             );
           })()}
         </div>
       )}
     </div>
   </div>
 )}

{/* 재고 차감 — 중간재 제외 */}
{getFoodCategory(selectedWo.food_type) !== "중간재" && (selectedWo.food_type ?? "") !== "생산용전사지" && (
                            <div className="mt-2 rounded-lg border border-violet-100 bg-violet-50 p-2.5">
                              <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-xs font-semibold text-violet-700">재고 차감 선택</span>
                                {(prodInputs[item.id]?.transfer_lots ?? []).length > 0 && !(selectedWo?.status === "완료" && !isEditMode) && (
                                  <span className="text-[11px] text-violet-500">총 차감: <b>{(prodInputs[item.id]?.transfer_lots ?? []).reduce((s, l) => s + toInt(l.qty), 0).toLocaleString()} EA</b></span>
                                )}
                              </div>

                              {/* 선택된 로트 목록 */}
                              {(prodInputs[item.id]?.transfer_lots ?? []).length > 0 && (
                                <div className="space-y-1.5 mb-2">
                                  {(prodInputs[item.id].transfer_lots).map((tl, tlIdx) => {
                                    const allLots = Object.values(transferLotOptions).flat();
                                    const lotInfo = allLots.find((l) => l.lot_id === tl.lot_id) ?? (transferLotOptions[item.id] ?? []).find((l) => l.lot_id === tl.lot_id);
                                    const usedQtyByOthers = (prodInputs[item.id].transfer_lots).filter((_, i) => i !== tlIdx).reduce((s, l) => l.lot_id === tl.lot_id ? s + toInt(l.qty) : s, 0);
                                    const effectiveRemaining = (lotInfo?.remaining_qty ?? 0) - usedQtyByOthers;
                                    return (
                                      <div key={tlIdx} className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5">
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold text-violet-700 truncate">{lotInfo?.variant_name ?? tl.lot_id}</div>
                                            <div className="text-[11px] text-slate-500">소비기한: {lotInfo?.expiry_date ?? "—"}{lotInfo && <span className="ml-2">잔량: <b className="text-violet-700">{effectiveRemaining.toLocaleString()} EA</b></span>}</div>
                                          </div>
                                          {!(selectedWo?.status === "완료" && !isEditMode) && (
                                            <button type="button" className="text-xs text-slate-400 hover:text-red-500 shrink-0"
                                              onClick={() => setProdInputs((prev) => ({ ...prev, [item.id]: { ...prev[item.id], transfer_lots: prev[item.id].transfer_lots.filter((_, i) => i !== tlIdx) } }))}>✕</button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                          <div className="flex-1">
                                            <input className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-right tabular-nums focus:border-violet-400 focus:outline-none" inputMode="numeric" placeholder="차감 수량"
                                              value={tl.qty} disabled={selectedWo?.status === "완료" && !isEditMode}
                                              onChange={(e) => setProdInputs((prev) => {
                                                const newLots = [...prev[item.id].transfer_lots];
                                                newLots[tlIdx] = { ...newLots[tlIdx], qty: e.target.value.replace(/[^\d]/g, "") };
                                                return { ...prev, [item.id]: { ...prev[item.id], transfer_lots: newLots } };
                                              })} />
                                          </div>
                                          {lotInfo && tl.qty && (
                                            <div className="text-[11px] text-slate-500 shrink-0">차감 후: <b className={effectiveRemaining - toInt(tl.qty) < 0 ? "text-red-600" : "text-violet-700"}>{(effectiveRemaining - toInt(tl.qty)).toLocaleString()} EA</b></div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* 로트 추가 목록 */}
                              {!(selectedWo?.status === "완료" && !isEditMode) && (
                                <div>
                                  {transferLotSearching[item.id] ? (
                                    <div className="text-xs text-slate-400 py-1">불러오는 중...</div>
                                  ) : (() => {
                                    const selectedLotIds = new Set((prodInputs[item.id]?.transfer_lots ?? []).map((l) => l.lot_id));
                                    const availableLots = (transferLotOptions[item.id] ?? []).filter((l) => !selectedLotIds.has(l.lot_id));
                                    if (availableLots.length === 0) return <div className="text-xs text-slate-400">{selectedLotIds.size > 0 ? "추가할 재고 없음" : "관련 재고 없음"}</div>;
                                    return (
                                      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden max-h-44 overflow-y-auto">
                                        {availableLots.map((lot) => (
                                          <button key={lot.lot_id} type="button" className="w-full text-left px-2.5 py-2 text-xs border-b border-slate-100 last:border-0 hover:bg-violet-50"
                                            onClick={() => setProdInputs((prev) => ({
                                              ...prev,
                                              [item.id]: {
                                                ...prev[item.id],
                                                transfer_lots: [...(prev[item.id]?.transfer_lots ?? []), { lot_id: lot.lot_id, qty: "" }],
                                              }
                                            }))}>
                                            <div className="font-medium text-slate-800">+ {lot.variant_name}</div>
                                            <div className="flex gap-2 mt-0.5 text-[11px] text-slate-500"><span>소비기한: {lot.expiry_date}</span><span>·</span><span>잔량: <b className="text-violet-700">{lot.remaining_qty.toLocaleString()} EA</b></span></div>
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 하단 버튼 */}
              <div className={`${card} p-3 flex gap-2`}>
                {selectedWo.status !== "완료" && !isEditMode ? (
                  <button
                    className={`flex-1 rounded-lg border py-2 text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed ${
                      woChecks?.status_production && !woChecks?.status_input
                        ? "border-amber-500 bg-amber-500 hover:bg-amber-600 active:bg-amber-700"
                        : "border-green-500 bg-green-600 hover:bg-green-700 active:bg-green-800"
                    }`}
                    onClick={markProductionComplete}
                    disabled={isCompleting}
                  >
                    {isCompleting ? "처리 중..." : selectedWo.skip_production_check ? "포장완료 처리" : woChecks?.status_production && !woChecks?.status_input ? "✅ 생산완료 · CCP-1P 대기 중" : "생산완료 처리"}
                  </button>
                ) : selectedWo.status === "완료" && !isEditMode ? (
                  <button className="rounded-lg border border-blue-400 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100" onClick={() => {
                    setPinProgressPending(() => (_name: string) => {
                      setIsEditMode(true);
                    });
                    setShowPinModalForProgress(true);
                  }}>수정</button>
                ) : (
                  <>
                    <button className="flex-1 rounded-lg border border-blue-500 bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700"
                      onClick={async () => {
                        if (!selectedWo) return;
                        try {
                          if (isAdminOrSubadmin) {
                            const { error } = await supabase.from("work_orders").update({ sub_name: eSubName.trim() || null, product_name: eProductName.trim(), food_type: eFoodType.trim() || null, logo_spec: eLogoSpec.trim() || null, thickness: eThickness || null, delivery_method: eDeliveryMethod || null, packaging_type: ePackagingType === "트레이" ? `트레이-${eTraySlot}` : ePackagingType || null, tray_slot: null, package_unit: ePackageUnit === "기타" ? (ePackageUnitCustom.trim() ? ePackageUnitCustom.trim() + "ea" : null) : ePackageUnit || null, mold_per_sheet: (toInt(eMoldCols) * toInt(eMoldRows)) > 0 ? toInt(eMoldCols) * toInt(eMoldRows) : null, mold_cols: toInt(eMoldCols) > 0 ? toInt(eMoldCols) : null, mold_rows: toInt(eMoldRows) > 0 ? toInt(eMoldRows) : null, mold_count: toInt(eMoldCount) > 0 ? toInt(eMoldCount) : null, note: eNote.trim() || null, reference_note: eReferenceNote.trim() || null, updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
                            if (error) { showToast("수정 실패: " + error.message, "error"); return; }
                          }
                          if (woChecks) {
                            const { error } = await supabase.from("work_orders").update({ assignee_transfer: woChecks.assignee_transfer || null, assignee_print_check: woChecks.assignee_print_check || null, assignee_production: woChecks.assignee_production || null, assignee_input: woChecks.assignee_input || null, updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
                            if (error) { showToast("수정 실패: " + error.message, "error"); return; }
                          }
                          const items = (selectedWo.work_order_items ?? []).filter((item) => { const name = (item.sub_items ?? [])[0]?.name ?? ""; return !name.startsWith("성형틀") && !name.startsWith("인쇄제판") && !name.startsWith("아이스박스") && !name.startsWith("택배비"); });
                          const isGeneralCompletedWo = selectedWo.status === "완료" && getFoodCategory(eFoodType || selectedWo.food_type) !== "중간재" && !getWoSubType(selectedWo.product_name) && !selectedWo.skip_production_check;
                          for (const item of items) {
                            const pi = prodInputs[item.id];
                            if (!pi || (!pi.actual_qty && !pi.unit_weight && !pi.expiry_date)) continue;
                            const oldDefectQty = item.defect_qty ?? 0;
                            const newDefectQty = pi.defect_qty ? toInt(pi.defect_qty) : 0;
                            const { error } = await supabase.from("work_order_items").update({ actual_qty: pi.actual_qty ? toInt(pi.actual_qty) : null, gift_qty: pi.gift_qty ? toInt(pi.gift_qty) : 0, defect_qty: pi.defect_qty ? toInt(pi.defect_qty) : null, unit_weight: pi.unit_weight ? toNum(pi.unit_weight) : null, expiry_date: pi.expiry_date || null, transfer_lot_id: pi.transfer_lot_id || null, transfer_qty: pi.transfer_qty ? toInt(pi.transfer_qty) : null }).eq("id", item.id);
                            if (error) { showToast("수정 실패: " + error.message, "error"); return; }

                            // ── 불량(defect_qty) 변경 시 — 기존 LOT의 IN/DISCARD movements 동기화 ──
                            if (isGeneralCompletedWo && newDefectQty !== oldDefectQty && item.expiry_date) {
                              let syncVariantId: string | null = null;
                              if (item.barcode_no) {
                                const { data: pbData } = await supabase.from("product_barcodes").select("variant_id").eq("barcode", item.barcode_no).maybeSingle();
                                syncVariantId = pbData?.variant_id ?? null;
                              }
                              if (!syncVariantId) syncVariantId = selectedWo.variant_id;
                              if (syncVariantId) {
                                const { data: lotData } = await supabase.from("lots").select("id").eq("variant_id", syncVariantId).eq("expiry_date", item.expiry_date).maybeSingle();
                                const lotId = lotData?.id ?? null;
                                if (lotId) {
                                  const newActualQty = pi.actual_qty ? toInt(pi.actual_qty) : 0;
                                  const inNote = `작업지시서 생산완료 - ${selectedWo.work_order_no}`;
                                  const discardNote = `작업지시서 생산완료(불량) - ${selectedWo.work_order_no}`;
                                  const { data: inMovs } = await supabase.from("movements").select("id").eq("lot_id", lotId).eq("note", inNote).eq("type", "IN");
                                  if (inMovs && inMovs.length === 1) {
                                    await supabase.from("movements").update({ qty: newActualQty + newDefectQty }).eq("id", inMovs[0].id);
                                  } else if (inMovs && inMovs.length > 1) {
                                    showToast("불량 동기화 보류: IN 기록이 여러 건이라 자동 동기화할 수 없습니다. 재고대장을 직접 확인해주세요.", "error");
                                  }
                                  const { data: discardMovs } = await supabase.from("movements").select("id").eq("lot_id", lotId).eq("note", discardNote).eq("type", "DISCARD");
                                  if (discardMovs && discardMovs.length === 1) {
                                    if (newDefectQty > 0) {
                                      await supabase.from("movements").update({ qty: newDefectQty }).eq("id", discardMovs[0].id);
                                    } else {
                                      await supabase.from("movements").delete().eq("id", discardMovs[0].id);
                                    }
                                  } else if (discardMovs && discardMovs.length === 0 && newDefectQty > 0) {
                                    const todayKSTDate = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })).toISOString().slice(0, 10);
                                    await supabase.from("movements").insert({
                                      lot_id: lotId, type: "DISCARD", qty: newDefectQty,
                                      happened_at: `${todayKSTDate}T00:00:00+09:00`,
                                      note: discardNote, created_by: currentUserIdRef.current,
                                    });
                                  } else if (discardMovs && discardMovs.length > 1) {
                                    showToast("불량 동기화 보류: 폐기 기록이 여러 건이라 자동 동기화할 수 없습니다. 재고대장을 직접 확인해주세요.", "error");
                                  }
                                }
                              }
                            }

                            if (pi.transfer_lot_id && pi.transfer_qty && toInt(pi.transfer_qty) > 0) {
                              const existingTransfer = selectedWo.work_order_items?.find((i) => i.id === item.id);
                              if (!existingTransfer?.transfer_lot_id) {
                                const transferQty = toInt(pi.transfer_qty);
                                const { data: movData } = await supabase.from("movements").select("type, qty").eq("lot_id", pi.transfer_lot_id);
                                const remaining = (movData ?? []).reduce((sum, m) => m.type === "IN" ? sum + m.qty : sum - m.qty, 0);
                                if (transferQty > remaining) { showToast(`전사지 차감 실패: 차감(${transferQty}) > 잔량(${remaining})`, "error"); return; }
                                const { data: { user } } = await supabase.auth.getUser();
                                const { error: transferErr } = await supabase.from("movements").insert({ lot_id: pi.transfer_lot_id, type: "OUT", qty: transferQty, happened_at: new Date().toISOString(), note: `전사지 차감 - ${selectedWo.work_order_no} - ${item.delivery_date}`, created_by: user?.id ?? null });
                                if (transferErr) { showToast("전사지 차감 실패: " + transferErr.message, "error"); return; }
                              }
                            }
                          }
                          // ── 불량(defect_qty) 즉시 동기화를 위해 selectedWo 로컬 상태 갱신 ──
                          setSelectedWo((prev) => prev ? {
                            ...prev,
                            work_order_items: (prev.work_order_items ?? []).map((it) => {
                              const pi2 = prodInputs[it.id];
                              if (!pi2) return it;
                              return { ...it, defect_qty: pi2.defect_qty ? toInt(pi2.defect_qty) : null };
                            }),
                          } : prev);
                         // ── 분사/코팅 배합 횟수 변경 시 blend_logs + material_usage_logs 업데이트 ──
                         if (selectedWo.status === "완료" && getWoSubType(selectedWo.product_name)) {
                          const subTypeEdit = getWoSubType(selectedWo.product_name)!;
                          const recipeNameEdit = subTypeEdit === "분사" ? "레이즈 분사" : "레이즈 코팅";
                          const { data: existingBlendLog } = await supabase
                            .from("blend_logs")
                            .select("id, multiplier")
                            .eq("note", `${selectedWo.work_order_no} 생산완료`)
                            .eq("recipe_name", recipeNameEdit)
                            .order("created_at", { ascending: false })
                            .limit(1)
                            .maybeSingle();
                          if (existingBlendLog && existingBlendLog.multiplier !== blendCount) {
                            await supabase.from("blend_logs")
                              .update({ multiplier: blendCount })
                              .eq("id", existingBlendLog.id);
                            await supabase.from("blend_log_items").delete().eq("blend_log_id", existingBlendLog.id);
                            const isSprayEdit = subTypeEdit === "분사";
                            const newLogItems = isSprayEdit ? [
                              { blend_log_id: existingBlendLog.id, material_name: "유화제",   quantity_g: SPRAY_RECIPE[Math.min(blendCount, 5)].유화제 },
                              { blend_log_id: existingBlendLog.id, material_name: "감자전분", quantity_g: SPRAY_RECIPE[Math.min(blendCount, 5)].감자전분 },
                            ] : [
                              { blend_log_id: existingBlendLog.id, material_name: "팜유",    quantity_g: COATING_BASE.팜유    * blendCount },
                              { blend_log_id: existingBlendLog.id, material_name: "유청분말", quantity_g: COATING_BASE.유청분말 * blendCount },
                            ];
                            await supabase.from("blend_log_items").insert(newLogItems);
                            const matNamesEdit = newLogItems.map((i) => i.material_name);
                            const { data: matsEdit } = await supabase.from("materials").select("id,name").in("name", matNamesEdit);
                            const matMapEdit: Record<string, string> = {};
                            (matsEdit ?? []).forEach((m: any) => { matMapEdit[m.name] = m.id; });
                            const oldNote = `${recipeNameEdit} ${existingBlendLog.multiplier}배합 — ${selectedWo.work_order_no}`;
                            const newNote = `${recipeNameEdit} ${blendCount}배합 — ${selectedWo.work_order_no}`;
                            for (const logItem of newLogItems) {
                              if (!matMapEdit[logItem.material_name]) continue;
                              await supabase.from("material_usage_logs")
                                .update({ quantity: logItem.quantity_g, note: newNote })
                                .eq("note", oldNote)
                                .eq("material_id", matMapEdit[logItem.material_name]);
                            }
                          }
                        }

                        // ── 컴파운드 사용량 재계산 (완료 후 수정 시) ──
                        if (selectedWo.status === "완료") {
                            const foodCatEdit = getFoodCategory(eFoodType || selectedWo.food_type);
                            if (foodCatEdit === "다크" || foodCatEdit === "화이트") {
                              const ft = eFoodType || selectedWo.food_type || "";
                              const compoundNameEdit = ft.includes("딸기") || ft === "핑크데코" || ft === "핑크화이트" ? "딸기컴파운드"
                              : getFoodCategory(ft) === "다크" ? "다크컴파운드"
                              : "화이트컴파운드";
                              const editItems = items;
                              let totalCompoundGEdit = 0;
                              for (const item of editItems) {
                                const pi = prodInputs[item.id];
                                const aqty = toInt(pi?.actual_qty) + toInt(pi?.defect_qty);
                                const uw   = toNum(pi?.unit_weight);
                                if (aqty > 0 && uw > 0) totalCompoundGEdit += aqty * uw;
                              }
                              if (totalCompoundGEdit > 0) {
                                const dupNote = `작업지시서 생산완료 - ${selectedWo.work_order_no}`;
                                const { data: existingLog } = await supabase
                                  .from("material_usage_logs")
                                  .select("id")
                                  .eq("note", dupNote)
                                  .eq("work_type", "product")
                                  .limit(1);
                                if (existingLog && existingLog.length > 0) {
                                  const { data: matDataEdit } = await supabase.from("materials")
                                    .select("id").eq("name", compoundNameEdit).maybeSingle();
                                  await supabase.from("material_usage_logs")
                                    .update({
                                      quantity: totalCompoundGEdit,
                                      ...(matDataEdit?.id ? { material_id: matDataEdit.id } : {}),
                                    })
                                    .eq("id", existingLog[0].id);
                                }
                              }
                            }
                          }
                          // ── 이산화티타늄 사용량 재계산 (완료 후 수정 시) ──
          if (selectedWo.status === "완료" && (eFoodType || selectedWo.food_type || "").includes("리얼")) {
            const ft = eFoodType || selectedWo.food_type || "";
            const compoundNameEdit2 = ft.includes("딸기") ? "딸기컴파운드"
              : ft.includes("다크") ? "다크컴파운드"
              : "화이트컴파운드";
            // 총중량 재계산
            const editItems2 = (selectedWo.work_order_items ?? []).filter((item) => {
              const n = (item.sub_items ?? [])[0]?.name ?? "";
              return !n.startsWith("성형틀") && !n.startsWith("인쇄제판")
                && !n.startsWith("아이스박스") && !n.startsWith("택배비");
            });
            let totalCompoundGEdit2 = 0;
            for (const item of editItems2) {
              const pi = prodInputs[item.id];
              const aqty = toInt(pi?.actual_qty) + toInt(pi?.defect_qty);
              const uw   = toNum(pi?.unit_weight);
              if (aqty > 0 && uw > 0) totalCompoundGEdit2 += aqty * uw;
            }
            if (totalCompoundGEdit2 > 0) {
              // 컴파운드 재계산 (10/11)
              const dupNoteEdit2 = `작업지시서 생산완료 - ${selectedWo.work_order_no}`;
              const { data: compExisting2 } = await supabase.from("material_usage_logs")
                .select("id").eq("note", dupNoteEdit2).eq("work_type", "product").limit(1);
              if (compExisting2 && compExisting2.length > 0) {
                await supabase.from("material_usage_logs")
                  .update({ quantity: Math.round(totalCompoundGEdit2 * 10 / 11) })
                  .eq("id", compExisting2[0].id);
              }
              // 이산화티타늄 재계산 (1/11)
              const tiNote = `이산화티타늄 차감 - ${selectedWo.work_order_no}`;
              const { data: tiExisting } = await supabase.from("material_usage_logs")
                .select("id").eq("note", tiNote).limit(1);
              if (tiExisting && tiExisting.length > 0) {
                await supabase.from("material_usage_logs")
                  .update({ quantity: Math.round(totalCompoundGEdit2 * 1 / 11) })
                  .eq("id", tiExisting[0].id);
              }
            }
          }
                          // 수정 기록 저장
                          if (isPinValid() && pinSession) {
                            await supabase.from("work_order_edit_logs").insert({
                              work_order_id: selectedWo.id,
                              work_order_no: selectedWo.work_order_no,
                              edited_by_name: pinSession.employeeName,
                              edit_note: `수정 저장 — ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
                            });
                          }
                          showToast("수정 완료!"); setIsEditMode(false);
                          if (selectedWo.status === "완료") await triggerPdfUpload(selectedWo, eProductName ?? "품목미상", eFoodType ?? "", eLogoSpec ?? "");
                          await loadWoList();
                        } catch (e: any) { showToast("수정 오류: " + (e?.message ?? e), "error"); }
                      }}>수정 저장</button>
                    <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50" onClick={() => { setIsEditMode(false); applySelection(selectedWo); }}>취소</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className={`${card} flex items-center justify-center p-10`}>
              <div className="text-center text-slate-400">
                <div className="text-3xl mb-2">📋</div>
                <div className="text-xs">작업지시서를 선택하거나<br/>재고생산 버튼으로 등록하세요</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {printOpen && selectedWo ? <WoPrintModal wo={selectedWo} onClose={() => setPrintOpen(false)} /> : null}
    </div>
  );
}

// ─────────────────────── ItemImageThumbnails ───────────────────────
function ItemImageThumbnails({ images, logoSpec }: { images: string[]; logoSpec: string | null }) {
  const [signedUrls, setSignedUrls] = useState<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (images.length === 0) return;
    (async () => {
      const paths = images.map(v => {
        if (v.startsWith("http")) { const m = v.match(/work-order-images\/(.+?)(\?|$)/); return m ? m[1] : null; }
        return v;
      }).filter(Boolean) as string[];
      if (paths.length === 0) { setSignedUrls(images); return; }
      const { data, error } = await supabase.storage.from("work-order-images").createSignedUrls(paths, 60 * 60);
      if (!error && data) setSignedUrls(data.map(d => d.signedUrl));
      else setSignedUrls(images);
    })();
  }, [images.join(",")]); // eslint-disable-line

  if (signedUrls.length === 0) return null;

  return (
    <>
      {lightboxUrl && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4" onClick={() => setLightboxUrl(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={lightboxUrl} alt="디자인 이미지" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
            <button className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-100 text-sm font-bold" onClick={() => setLightboxUrl(null)}>✕</button>
            {logoSpec && <div className="mt-2 text-center text-xs text-white/80">{logoSpec}</div>}
          </div>
        </div>
      )}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="mb-1.5 text-xs font-semibold text-slate-500">인쇄 디자인 이미지</div>
        <div className="flex flex-wrap gap-2">
          {signedUrls.map((url, i) => (
            <button key={i} type="button" className="group relative rounded-lg border border-slate-200 bg-white p-1 hover:border-blue-300 hover:shadow-md transition-all" onClick={() => setLightboxUrl(url)} title="클릭하면 크게 보기">
              <img src={url} alt={`디자인 ${i + 1}`} className="h-16 w-16 rounded-md object-cover" />
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 group-hover:bg-black/10 transition-all">
                <span className="text-white text-lg opacity-0 group-hover:opacity-100 drop-shadow">🔍</span>
              </div>
              {logoSpec && <div className="mt-0.5 text-center text-[10px] text-slate-400 truncate max-w-[64px]">{logoSpec}</div>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────── ItemImages ───────────────────────
function ItemImages({ images, logoSpec }: { images: string[]; logoSpec: string | null }) {
  const [signedUrls, setSignedUrls] = useState<string[]>([]);
  useEffect(() => {
    if (images.length === 0) return;
    (async () => {
      const paths = images.map((v) => { if (v.startsWith("http")) { const m = v.match(/work-order-images\/(.+?)(\?|$)/); return m ? m[1] : null; } return v; }).filter(Boolean) as string[];
      if (paths.length === 0) { setSignedUrls(images); return; }
      const { data, error } = await supabase.storage.from("work-order-images").createSignedUrls(paths, 60 * 60);
      if (!error && data) setSignedUrls(data.map((d) => d.signedUrl)); else setSignedUrls(images);
    })();
  }, [images.join(",")]);
  const parseSize = (spec: string | null) => { if (!spec) return null; const m = spec.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i); if (!m) return null; const unit = (m[3] ?? "mm").toLowerCase(); const w = parseFloat(m[1]) * (unit === "cm" ? 37.8 : 3.78); const h = parseFloat(m[2]) * (unit === "cm" ? 37.8 : 3.78); return { w: Math.round(w), h: Math.round(h) }; };
  const size = parseSize(logoSpec);
  if (signedUrls.length === 0) return <div className="mt-1.5 text-xs text-slate-400">이미지 로딩 중...</div>;
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {signedUrls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-slate-200 bg-white p-1 hover:border-blue-300">
          <img src={url} alt={`디자인 ${i + 1}`} style={size ? { width: size.w, height: size.h, objectFit: "contain" } : { width: 72, height: 72, objectFit: "cover" }} className="rounded-md" />
          {logoSpec && <div className="mt-0.5 text-center text-[10px] text-slate-400">{logoSpec}</div>}
        </a>
      ))}
    </div>
  );
}
