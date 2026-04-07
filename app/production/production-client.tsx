"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  unit_weight: number | null;
  total_weight: number | null;
  expiry_date: string | null;
  order_id: string | null;
  note: string | null;
  images: string[] | null;
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
  linked_order?: { memo: string | null } | { memo: string | null }[] | null;
  work_order_items?: WoItemRow[];
  order_type: string;
  ccp_slot_id?: string | null;
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
  food_type: string | null;
  weight_g: number | null;
  barcode: string;
};

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
function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
function toInt(v: unknown): number {
  const n = parseInt(String(v ?? "").replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────── Styles ───────────────────────
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50";
const pill = "rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600";
const statusColors: Record<string, string> = {
  "생산중": "bg-orange-100 text-orange-700 border-orange-200",
  "완료":   "bg-green-100 text-green-700 border-green-200",
};

const PROGRESS_STEPS = [
  { label: "전사인쇄", statusKey: "status_transfer" as const, assigneeKey: "assignee_transfer" as const, icon: "🖨️", cardDone: "border-blue-300 bg-blue-50", cardSkip: "border-amber-300 bg-amber-50", cardEmpty: "border-slate-200 bg-white", badgeDone: "bg-blue-100 text-blue-700 border-blue-200", badgeSkip: "bg-amber-100 text-amber-700 border-amber-200" },
  { label: "인쇄검수", statusKey: "status_print_check" as const, assigneeKey: "assignee_print_check" as const, icon: "🔍", cardDone: "border-violet-300 bg-violet-50", cardSkip: "border-amber-300 bg-amber-50", cardEmpty: "border-slate-200 bg-white", badgeDone: "bg-violet-100 text-violet-700 border-violet-200", badgeSkip: "bg-amber-100 text-amber-700 border-amber-200" },
  { label: "생산완료", statusKey: "status_production" as const, assigneeKey: "assignee_production" as const, icon: "✅", cardDone: "border-green-300 bg-green-50", cardSkip: "border-amber-300 bg-amber-50", cardEmpty: "border-slate-200 bg-white", badgeDone: "bg-green-100 text-green-700 border-green-200", badgeSkip: "bg-amber-100 text-amber-700 border-amber-200" },
  { label: "입력완료", statusKey: "status_input" as const, assigneeKey: "assignee_input" as const, icon: "📥", cardDone: "border-teal-300 bg-teal-50", cardSkip: "border-amber-300 bg-amber-50", cardEmpty: "border-slate-200 bg-white", badgeDone: "bg-teal-100 text-teal-700 border-teal-200", badgeSkip: "bg-amber-100 text-amber-700 border-amber-200" },
] as const;

const DARK_FOOD_TYPES = ["다크화이트","다크옐로우","데코초콜릿","롤리팝다크화이트","다크핑크","다크연두","롤리팝다크핑크"];

function getFoodCategory(foodType: string | null | undefined): "다크" | "화이트" | "전사지" | null {
  const ft = (foodType ?? "").trim();
  if (!ft) return null;
  if (ft.includes("초콜릿중간재")) return "전사지";
  if (DARK_FOOD_TYPES.some((d) => ft.includes(d))) return "다크";
  return "화이트";
}

type WoChecks = {
  status_transfer: boolean; status_print_check: boolean; status_production: boolean; status_input: boolean;
  assignee_transfer: string; assignee_print_check: string; assignee_production: string; assignee_input: string;
};

const CCP_EVENT_LABELS: Record<string, string> = {
  start: "시작", mid_check: "중간점검", end: "종료",
  material_in: "원료투입", material_out: "원료소진", move: "슬롯이동",
};

function ccpEventBadgeCls(type: string) {
  if (type === "start") return "bg-blue-100 border-blue-200 text-blue-700";
  if (type === "end") return "bg-purple-100 border-purple-200 text-purple-700";
  if (type === "material_in") return "bg-green-100 border-green-200 text-green-700";
  if (type === "material_out") return "bg-orange-100 border-orange-200 text-orange-700";
  if (type === "move") return "bg-teal-100 border-teal-200 text-teal-700";
  return "bg-slate-100 border-slate-200 text-slate-600";
}

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

  const [isEditMode, setIsEditMode] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [productionCount, setProductionCount] = useState(0);
  const [sortBy, setSortBy] = useState<"created_at" | "delivery_date">("created_at");
  const [filterStatus, setFilterStatus] = useState<"전체" | "생산중" | "완료">("생산중");
  const [filterFoodCategory, setFilterFoodCategory] = useState<"전체" | "다크" | "화이트" | "전사지">("전체");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedWo, setSelectedWo] = useState<WorkOrderRow | null>(null);

  const [eSubName, setESubName] = useState("");
  const [eProductName, setEProductName] = useState("");
  const [eFoodType, setEFoodType] = useState("");
  const [eLogoSpec, setELogoSpec] = useState("");
  const [eThickness, setEThickness] = useState("2mm");
  const [eDeliveryMethod, setEDeliveryMethod] = useState("택배");
  const [ePackagingType, setEPackagingType] = useState("트레이");
  const [eTraySlot, setETraySlot] = useState("정사각20구");
  const [ePackageUnit, setEPackageUnit] = useState("100ea");
  const [eMoldPerSheet, setEMoldPerSheet] = useState("");
  const [eNote, setENote] = useState("");
  const [eReferenceNote, setEReferenceNote] = useState("");
  const [woChecks, setWoChecks] = useState<WoChecks | null>(null);
  const [signedImageUrls, setSignedImageUrls] = useState<string[]>([]);
  const [prodInputs, setProdInputs] = useState<Record<string, { actual_qty: string; unit_weight: string; expiry_date: string }>>({});
  const [printOpen, setPrintOpen] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string | null }[]>([]);

  const [warmerSlots, setWarmerSlots] = useState<{ id: string; slot_name: string; purpose: string }[]>([]);
  const [eCcpSlotId, setECcpSlotId] = useState<string>("");

  // ── CCP-1B 온도 기록 ──
  const [ccpSessionId, setCcpSessionId] = useState<string | null>(null);
  const [ccpSessionSlotId, setCcpSessionSlotId] = useState<string | null>(null); // 현재 세션의 실제 slot_id
  const [ccpIsOriginalWo, setCcpIsOriginalWo] = useState(true); // 세션의 첫 번째 연결 작업지시서 여부
  const [ccpEvents, setCcpEvents] = useState<{
    id: string; event_type: string; measured_at: string;
    temperature: number | null; is_ok: boolean | null; action_note: string | null;
  }[]>([]);
  const [showCcpForm, setShowCcpForm] = useState(false);
  const [ccpEventType, setCcpEventType] = useState("start");
  const [ccpTime, setCcpTime] = useState("");
  const [ccpTemp, setCcpTemp] = useState("");
  const [ccpIsOk, setCcpIsOk] = useState(true);
  const [ccpActionNote, setCcpActionNote] = useState("");
  const [ccpSaving, setCcpSaving] = useState(false);
  const [ccpMoveTargetSlotId, setCcpMoveTargetSlotId] = useState(""); // 슬롯이동 대상

  // ── 사전 원료투입 state ──
const [preSlotId, setPreSlotId] = useState("");
const [preTime, setPreTime] = useState("");
const [preSaving, setPreSaving] = useState(false);

// ── 슬롯 현황 state ──
const [slotStatus, setSlotStatus] = useState<Record<string, { date: string; daysAgo: number } | null>>({});

  const [stockAlerts, setStockAlerts] = useState<{ id: string; item_name: string; status: string; expiry_date: string | null; action: string | null; log_date: string }[]>([]);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [stepSaving, setStepSaving] = useState<string | null>(null);
  const [readMap, setReadMap] = useState<Record<string, WoReadInfo>>({});
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { currentUserIdRef.current = user?.id ?? null; });
  }, []);

  // ── 기성생산 State ──
  const [isKiseongForm, setIsKiseongForm] = useState(false);
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
  const [kMoldPerSheet, setKMoldPerSheet] = useState("");
  const [kNote, setKNote] = useState("");
  const [kReferenceNote, setKReferenceNote] = useState("");
  const [kActualQty, setKActualQty] = useState("");

  function calcKiseongNote(foodType: string, qty: number, mold: number): string {
    if (!mold || mold <= 0 || !qty || qty <= 0) return "";
    if (foodType.includes("초콜릿중간재")) return "";
    const isNeoColor = foodType.includes("네오컬러");
    if (isNeoColor) {
      const perRow = mold === 108 ? 9 : mold === 88 ? 8 : mold === 66 ? 6 : mold === 63 ? 7 : Math.round(Math.sqrt(mold));
      const buffer = mold === 63 || mold === 66 ? 20 : 30;
      const totalNeeded = qty + buffer;
      const sheets = totalNeeded / mold;
      const fullSheets = Math.floor(sheets);
      const remainder = sheets - fullSheets;
      const extraRows = remainder > 0 ? Math.ceil(remainder * mold / perRow) : 0;
      const totalProduced = (fullSheets * mold) + (extraRows * perRow);
      return extraRows > 0 ? `전사지: ${fullSheets}장 ${extraRows}줄  참고: ${totalProduced.toLocaleString("ko-KR")}개` : `전사지: ${fullSheets}장  참고: ${(fullSheets * mold).toLocaleString("ko-KR")}개`;
    } else {
      const sheets2 = Math.ceil(qty / mold);
      return `전사지: ${sheets2}장  참고: ${(sheets2 * mold).toLocaleString("ko-KR")}개`;
    }
  }

  useEffect(() => {
    const mold = parseInt(kMoldPerSheet || "0", 10);
    const qty = parseInt(kActualQty || "0", 10);
    const auto = calcKiseongNote(kFoodType, qty, mold);
    if (auto) setKNote(auto);
  }, [kMoldPerSheet, kActualQty, kFoodType]); // eslint-disable-line

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("product_variants").select("id, variant_name, weight_g, barcode, product_id, products(name, food_type, category)").order("variant_name");
      if (error || !data) return;
      setKiseongVariants((data as any[]).map((r) => ({ variant_id: r.id, product_id: r.product_id, product_name: r.products?.name ?? r.variant_name, food_type: r.products?.food_type ?? null, weight_g: r.weight_g ?? null, barcode: r.barcode ?? "" })));
    })();
  }, []);

  const handleKiseongVariantSelect = async (variant: KiseongVariant) => {
    setKiseongSelected(variant);
    setKFoodType(variant.food_type ?? "");
    const { data, error } = await supabase.from("work_orders").select("sub_name, food_type, logo_spec, thickness, packaging_type, tray_slot, package_unit, mold_per_sheet, note, reference_note").eq("variant_id", variant.variant_id).eq("order_type", "재고").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!error && data) {
      setKSubName(data.sub_name ?? ""); setKFoodType(data.food_type ?? variant.food_type ?? ""); setKLogoSpec(data.logo_spec ?? ""); setKThickness(data.thickness ?? "3mm"); setKPackagingType(data.packaging_type ?? "트레이-정사각20구"); setKPackageUnit(data.package_unit ?? "100ea"); setKMoldPerSheet(data.mold_per_sheet ? String(data.mold_per_sheet) : ""); setKNote(data.note ?? ""); setKReferenceNote(data.reference_note ?? "");
    } else { setKSubName(""); setKLogoSpec(""); setKThickness("3mm"); setKPackagingType("트레이-정사각20구"); setKPackageUnit("100ea"); setKMoldPerSheet(""); setKNote(""); setKReferenceNote(""); }
    setKActualQty("");
  };

  const resetKiseongForm = () => {
    setIsKiseongForm(false); setKiseongSearch(""); setKiseongSelected(null);
    setKSubName(""); setKFoodType(""); setKLogoSpec(""); setKThickness("3mm"); setKPackagingType("트레이-정사각20구"); setKPackageUnit("100ea"); setKMoldPerSheet(""); setKNote(""); setKReferenceNote(""); setKActualQty("");
  };

  const saveKiseongOrder = async () => {
    if (!kiseongSelected) return setMsg("제품을 선택하세요.");
    if (!kActualQty || toInt(kActualQty) < 1) return setMsg("생산수량을 입력하세요.");
    if (!kFoodType.trim()) return setMsg("식품유형을 입력하세요.");
    setKiseongSaving(true); setMsg(null);
    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}`;
      const { count } = await supabase.from("work_orders").select("id", { count: "exact", head: true }).like("work_order_no", `WO-${dateStr}-%`);
      const workOrderNo = `WO-${dateStr}-${String((count ?? 0) + 1).padStart(4, "0")}`;
      const { data: wo, error: woErr } = await supabase.from("work_orders").insert({ work_order_no: workOrderNo, barcode_no: kiseongSelected.barcode, client_id: null, client_name: "재고생산", sub_name: kSubName.trim() || null, order_date: today.toISOString().slice(0, 10), food_type: kFoodType.trim() || null, product_name: kiseongSelected.product_name, logo_spec: kLogoSpec.trim() || null, thickness: kThickness || null, delivery_method: null, packaging_type: kPackagingType || null, tray_slot: null, package_unit: kPackageUnit || null, mold_per_sheet: kMoldPerSheet ? Number(kMoldPerSheet) : null, note: kNote.trim() || null, reference_note: kReferenceNote.trim() || null, status: "생산중", variant_id: kiseongSelected.variant_id, order_type: "재고" }).select("id").single();
      if (woErr) throw woErr;
      const { error: itemErr } = await supabase.from("work_order_items").insert({ work_order_id: wo.id, delivery_date: today.toISOString().slice(0, 10), sub_items: [{ name: kiseongSelected.product_name, qty: toInt(kActualQty) }], order_qty: toInt(kActualQty), barcode_no: kiseongSelected.barcode, actual_qty: toInt(kActualQty), unit_weight: kiseongSelected.weight_g ?? null, expiry_date: null });
      if (itemErr) throw itemErr;
      showToast("✅ 재고 작업지시서가 등록되었습니다!"); resetKiseongForm(); await loadWoList();
    } catch (e: any) { setMsg("저장 오류: " + (e?.message ?? e)); } finally { setKiseongSaving(false); }
  };

  const kiseongFilteredVariants = useMemo(() => {
    const q = kiseongSearch.trim().toLowerCase();
    if (!q) return kiseongVariants;
    return kiseongVariants.filter((v) => v.product_name.toLowerCase().includes(q) || v.barcode.toLowerCase().includes(q));
  }, [kiseongVariants, kiseongSearch]);

  const loadReadMap = useCallback(async (woIds: string[]) => {
    if (woIds.length === 0) return;
    const { data } = await supabase.from("work_order_reads").select("work_order_id, read_at").in("work_order_id", woIds);
    if (!data) return;
    const map: Record<string, WoReadInfo> = {};
    for (const row of data) { if (!map[row.work_order_id] || row.read_at < map[row.work_order_id].read_at) map[row.work_order_id] = { read_at: row.read_at }; }
    setReadMap(map);
  }, []);

  // ── CCP 세션 로드 ──
  const loadCcpSession = useCallback(async (wo: WorkOrderRow) => {
    setCcpEvents([]);
    setCcpSessionId(null);

    const today = new Date().toISOString().slice(0, 10);

    // 1) work_order_no로 연결된 세션 찾기
    const { data: linkData } = await supabase
      .from("ccp_heating_session_orders")
      .select("session_id")
      .eq("work_order_ref", wo.work_order_no)
      .maybeSingle();

    let sessionId: string | null = linkData?.session_id ?? null;
    let isOriginalWo = !!linkData?.session_id; // 1단계에서 찾으면 기존 연결 작업지시서

   // 2) 연결 세션 없고 슬롯 있으면 오늘 active 세션 찾기 (연결 추가는 하지 않음)
if (!sessionId && wo.ccp_slot_id) {
  const { data: sessData } = await supabase
    .from("ccp_heating_sessions")
    .select("id")
    .eq("session_date", today)
    .eq("slot_id", wo.ccp_slot_id)
    .eq("status", "active")
    .maybeSingle();
  sessionId = sessData?.id ?? null;
  if (sessionId) isOriginalWo = false;
  // ※ 자동 연결 추가 제거 — 슬롯 버튼 클릭 시에만 연결
}

// 3) 세션 없고 슬롯 있으면 새로 생성하지 않음 (슬롯 버튼 클릭 또는 첫 기록 시에만 생성)

    setCcpSessionId(sessionId);
    setCcpIsOriginalWo(isOriginalWo);

    // 현재 세션의 실제 slot_id 조회
    if (sessionId) {
      const { data: sessDetail } = await supabase
        .from("ccp_heating_sessions")
        .select("slot_id")
        .eq("id", sessionId)
        .maybeSingle();
      setCcpSessionSlotId(sessDetail?.slot_id ?? null);
    } else {
      setCcpSessionSlotId(null);
    }

    if (sessionId) {
      const { data: evData } = await supabase
        .from("ccp_heating_events")
        .select("id, event_type, measured_at, temperature, is_ok, action_note")
        .eq("session_id", sessionId)
        .order("measured_at", { ascending: true });
      const events = (evData ?? []) as any[];
      setCcpEvents(events);
      const hasStart = events.some((e) => e.event_type === "start");
      setCcpEventType(hasStart ? "mid_check" : "start");
    }
    setCcpTime("");
  }, []);

  // ── CCP 이벤트 저장 ──
  async function saveCcpEvent() {
    if (!ccpSessionId) {
      if (!eCcpSlotId && !selectedWo?.ccp_slot_id) 
        return showToast("슬롯을 먼저 지정해주세요.", "error");
      const slotId = eCcpSlotId || selectedWo?.ccp_slot_id;
      const today = new Date().toISOString().slice(0, 10);
      const { data: newSess } = await supabase
        .from("ccp_heating_sessions")
        .insert({ session_date: today, slot_id: slotId, status: "active", created_by: currentUserIdRef.current })
        .select("id").single();
      if (!newSess?.id) return showToast("세션 생성 실패", "error");
      setCcpSessionId(newSess.id);
      setCcpSessionSlotId(slotId ?? null);
      if (selectedWo) {
        await supabase.from("ccp_heating_session_orders").insert({
          session_id: newSess.id, work_order_ref: selectedWo.work_order_no,
          client_name: selectedWo.client_name, product_name: selectedWo.product_name,
        });
      }
      // 이후 저장 로직이 ccpSessionId를 참조하므로 직접 변수 사용
      // saveCcpEvent를 재귀 호출하면 state 반영 전이라 다시 실행
      // 대신 아래처럼 sessionId를 변수로 넘기도록 리팩터링이 필요하므로
      // 간단하게: 세션 생성 후 토스트로 안내하고 다시 기록하도록 유도
      showToast("✅ 세션이 생성됐습니다. 다시 기록 버튼을 눌러주세요.");
      return;
    }
    const needsTemp = !["move", "material_in", "material_out"].includes(ccpEventType);
    if (!ccpTime || ccpTime.length < 4) return showToast("측정시각을 입력하세요. (예: 1430)", "error");
    // ── 시각 순서 검증: 항상 마지막 기록보다 늦어야 함 ──
    if (ccpEvents.length > 0) {
      const lastEvent = [...ccpEvents].sort((a, b) => a.measured_at.localeCompare(b.measured_at)).slice(-1)[0];
      const lastTimeStr = lastEvent.measured_at.slice(11, 16); // "HH:MM"
      const newTimeStr = `${ccpTime.slice(0,2)}:${ccpTime.slice(2,4)}`;
      if (newTimeStr <= lastTimeStr) {
        return showToast(`⚠ 측정시각은 마지막 기록(${lastTimeStr})보다 늦어야 합니다.`, "error");
      }
    }
    if (needsTemp && !ccpTemp) return showToast("온도를 입력하세요.", "error");
    const temp = needsTemp ? Number(ccpTemp) : null;
    if (needsTemp && temp !== null && (temp < 40 || temp > 50)) return showToast("온도는 40~50°C 범위여야 합니다.", "error");
   
    if (ccpEventType === "move" && !ccpMoveTargetSlotId) return showToast("이동할 슬롯을 선택하세요.", "error");

    const sortedForValidation = [...ccpEvents].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const lastEv = sortedForValidation[sortedForValidation.length - 1];

    // ── 원료투입 검증 ──
    // 가능 조건: 빈 슬롯(기록 없음) | 마지막 이벤트가 원료소진 | 마지막 이벤트가 슬롯이동
    if (ccpEventType === "material_in") {
      if (lastEv && !["material_out", "move"].includes(lastEv.event_type)) {
        return showToast("⚠ 원료투입은 빈 슬롯이거나, 원료소진 또는 슬롯이동 후에만 가능합니다.", "error");
      }
    }

    // ── 시작 검증 ──
    // 가능 조건: 마지막 이벤트가 원료투입 | 마지막 이벤트가 슬롯이동(원료투입 간주)
    if (ccpEventType === "start") {
      if (!lastEv || !["material_in", "move"].includes(lastEv.event_type)) {
        return showToast("⚠ 시작은 원료투입 또는 슬롯이동 후에만 가능합니다.", "error");
      }
    }

// ── 슬롯이동 검증 ──
// 가능 조건: 원료투입 후(보관 중 이동) | 종료 후 | 원료소진 후
if (ccpEventType === "move") {
  if (!lastEv || !["material_in", "end", "material_out"].includes(lastEv.event_type)) {
    return showToast("⚠ 슬롯이동은 원료투입, 종료, 원료소진 후에만 가능합니다.", "error");
  }
}

    // ── 원료소진 검증 ──
    // 가능 조건: 마지막 이벤트가 종료
    if (ccpEventType === "material_out") {
      if (!lastEv || lastEv.event_type !== "end") {
        return showToast("⚠ 원료소진은 종료 후에만 기록할 수 있습니다.", "error");
      }
    }

    // ── 종료 기록 시: 시작~종료 2시간 이상 & 중간점검 없으면 차단 ──
    if (ccpEventType === "end") {
      if (!lastEv || lastEv.event_type !== "start" && lastEv.event_type !== "mid_check") {
        return showToast("⚠ 종료는 시작 또는 중간점검 후에만 가능합니다.", "error");
      }
      const startEv = [...sortedForValidation].reverse().find((e) => e.event_type === "start");
      const hasMidCheck = sortedForValidation.some((e) => e.event_type === "mid_check");
      if (startEv && !hasMidCheck) {
        const nowLocal2 = new Date();
        const localDate2 = `${nowLocal2.getFullYear()}-${String(nowLocal2.getMonth()+1).padStart(2,"0")}-${String(nowLocal2.getDate()).padStart(2,"0")}`;
        const startTime = new Date(`${localDate2}T${startEv.measured_at.slice(11, 16)}:00`);
        const endTime = new Date(`${localDate2}T${ccpTime.slice(0,2)}:${ccpTime.slice(2,4)}:00`);
        const diffMin = (endTime.getTime() - startTime.getTime()) / 1000 / 60;
        if (diffMin >= 120) {
          return showToast("⚠ 시작~종료 시간이 2시간 이상입니다. 중간점검 기록을 먼저 추가해주세요.", "error");
        }
      }
    }

    setCcpSaving(true);
    // KST 로컬 날짜 사용 (UTC toISOString 날짜와 혼용 방지)
    const nowLocal = new Date();
    const localDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth()+1).padStart(2,"0")}-${String(nowLocal.getDate()).padStart(2,"0")}`;
    // 슬롯이동 시 출발→도착 슬롯명을 action_note에 자동 기록
    const moveToSlotName = ccpEventType === "move" && ccpMoveTargetSlotId
      ? (warmerSlots.find((s) => s.id === ccpMoveTargetSlotId)?.slot_name ?? ccpMoveTargetSlotId)
      : null;
    const moveFromSlotName = ccpEventType === "move"
      ? (warmerSlots.find((s) => s.id === (ccpSessionSlotId ?? eCcpSlotId ?? selectedWo?.ccp_slot_id))?.slot_name ?? "")
      : null;
    const finalActionNote = moveToSlotName
      ? (moveFromSlotName ? `${moveFromSlotName} → ${moveToSlotName}` : `→ ${moveToSlotName}`)
      : (ccpActionNote.trim() || null);
    const { error } = await supabase.from("ccp_heating_events").insert({
      session_id: ccpSessionId, event_type: ccpEventType,
      measured_at: `${localDate}T${ccpTime.slice(0,2)}:${ccpTime.slice(2,4)}:00`,
      temperature: temp, is_ok: needsTemp ? ccpIsOk : null,
      action_note: finalActionNote, created_by: currentUserIdRef.current,
    });
    setCcpSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");

    // ── 슬롯이동 시: 세션의 slot_id를 이동한 슬롯으로 업데이트 ──
// ── 슬롯이동 시: 기존 세션 유지 + 새 세션 생성 ──
if (ccpEventType === "move" && ccpMoveTargetSlotId && ccpSessionId) {
  const today = new Date().toISOString().slice(0, 10);

  // 1) 기존 세션 slot_id는 그대로 유지 (수정하지 않음)
  // 2) 이동 대상 슬롯에 새 세션 생성
  const { data: newSess } = await supabase
    .from("ccp_heating_sessions")
    .insert({
      session_date: today,
      slot_id: ccpMoveTargetSlotId,
      status: "active",
      created_by: currentUserIdRef.current,
    })
    .select("id").single();

    if (newSess?.id && selectedWo) {
      // 3) 기존 세션에서 이 작업지시서 연결 삭제
      await supabase.from("ccp_heating_session_orders")
        .delete()
        .eq("session_id", ccpSessionId)
        .eq("work_order_ref", selectedWo.work_order_no);
    
      // 4) 새 세션에 작업지시서 연결
      await supabase.from("ccp_heating_session_orders").insert({
        session_id: newSess.id,
        work_order_ref: selectedWo.work_order_no,
        client_name: selectedWo.client_name,
        product_name: selectedWo.product_name,
      });

 // 5) 새 세션에 슬롯이동 이벤트 복사
    await supabase.from("ccp_heating_events").insert({
      session_id: newSess.id,
      event_type: "move",
      measured_at: `${today}T${ccpTime.slice(0,2)}:${ccpTime.slice(2,4)}:00`,
      temperature: null,
      is_ok: null,
      action_note: finalActionNote,
      created_by: currentUserIdRef.current,
    });

  // 6) 작업지시서의 ccp_slot_id를 새 슬롯으로 업데이트
    await supabase.from("work_orders")
      .update({ ccp_slot_id: ccpMoveTargetSlotId, updated_at: new Date().toISOString() })
      .eq("id", selectedWo.id);

   // 7) ccpSessionId를 새 세션으로 전환
    setCcpSessionId(newSess.id);
    setCcpSessionSlotId(ccpMoveTargetSlotId);
    setECcpSlotId(ccpMoveTargetSlotId);
  }
}

    showToast("✅ CCP 온도 기록 완료!");
    setCcpTemp(""); setCcpActionNote(""); setCcpIsOk(true); setCcpMoveTargetSlotId(""); setCcpTime("");
    if (selectedWo) loadCcpSession(selectedWo);
  }

  // ── 슬롯 현황 로드 ──
const loadSlotStatus = useCallback(async () => {
  if (warmerSlots.length === 0) return;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const { data: sessions } = await supabase
    .from("ccp_heating_sessions")
    .select(`id, slot_id, session_date, status,
      events:ccp_heating_events(event_type, measured_at)`)
    .eq("status", "active");

  const map: Record<string, { date: string; daysAgo: number } | null> = {};

  for (const slot of warmerSlots) {
    // 해당 슬롯의 모든 active 세션 중 material_in 이벤트 찾기
    const slotSessions = (sessions ?? []).filter((s) => s.slot_id === slot.id);
    let latestMaterialIn: string | null = null;

    for (const sess of slotSessions) {
      const events = (sess.events ?? []) as any[];
      const materialIns = events
        .filter((e) => e.event_type === "material_in")
        .map((e) => e.measured_at)
        .sort()
        .reverse();
      if (materialIns.length > 0) {
        if (!latestMaterialIn || materialIns[0] > latestMaterialIn) {
          latestMaterialIn = materialIns[0];
        }
      }
    }

    if (!latestMaterialIn) {
      map[slot.id] = null; // 비어있음
    } else {
      const materialDate = latestMaterialIn.slice(0, 10);
      const diffMs = new Date(todayStr).getTime() - new Date(materialDate).getTime();
      const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      map[slot.id] = { date: materialDate, daysAgo };
    }
  }
  setSlotStatus(map);
}, [warmerSlots]);

useEffect(() => { loadSlotStatus(); }, [loadSlotStatus]);

// ── 사전 원료투입 저장 ──
async function savePreMaterialIn() {
  if (!preSlotId) return showToast("슬롯을 선택하세요.", "error");
  if (!preTime || preTime.length < 4) return showToast("시각을 입력하세요. (예: 1430)", "error");
  const timeStr = `${preTime.slice(0,2)}:${preTime.slice(2,4)}`;
  if (parseInt(preTime.slice(0,2)) > 23 || parseInt(preTime.slice(2,4)) > 59)
    return showToast("올바른 시각을 입력하세요.", "error");

  setPreSaving(true);
  try {
    const nowLocal = new Date();
    const localDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth()+1).padStart(2,"0")}-${String(nowLocal.getDate()).padStart(2,"0")}`;

    // 해당 슬롯의 오늘 active 세션 조회
    const { data: existSess } = await supabase
      .from("ccp_heating_sessions")
      .select("id")
      .eq("session_date", localDate)
      .eq("slot_id", preSlotId)
      .eq("status", "active")
      .maybeSingle();

    let sessionId: string;
    if (existSess?.id) {
      sessionId = existSess.id;
    } else {
      // 세션 없으면 새로 생성
      const { data: newSess, error: sessErr } = await supabase
        .from("ccp_heating_sessions")
        .insert({ session_date: localDate, slot_id: preSlotId, status: "active", created_by: currentUserIdRef.current })
        .select("id").single();
      if (sessErr || !newSess?.id) return showToast("세션 생성 실패: " + sessErr?.message, "error");
      sessionId = newSess.id;
    }

    // 원료투입 이벤트 기록
    const { error: evErr } = await supabase.from("ccp_heating_events").insert({
      session_id: sessionId,
      event_type: "material_in",
      measured_at: `${localDate}T${preTime.slice(0,2)}:${preTime.slice(2,4)}:00`,
      temperature: null,
      is_ok: null,
      action_note: null,
      created_by: currentUserIdRef.current,
    });
    if (evErr) return showToast("원료투입 기록 실패: " + evErr.message, "error");

    showToast("✅ 원료투입이 기록됐습니다!");
    setPreSlotId("");
    setPreTime("");
  } catch (e: any) {
    showToast("오류: " + (e?.message ?? e), "error");
  } finally {
    setPreSaving(false);
  }
}

  // ── CCP 이벤트 수정/삭제 ──
  const [ccpEditingId, setCcpEditingId] = useState<string | null>(null);
  const [ccpEditTime, setCcpEditTime] = useState("");
  const [ccpEditTemp, setCcpEditTemp] = useState("");
  const [ccpEditIsOk, setCcpEditIsOk] = useState(true);
  const [ccpEditActionNote, setCcpEditActionNote] = useState("");
  const [ccpEditSaving, setCcpEditSaving] = useState(false);

  function startCcpEdit(ev: { id: string; event_type: string; measured_at: string; temperature: number | null; is_ok: boolean | null; action_note: string | null }) {
    setCcpEditingId(ev.id);
    setCcpEditTime(ev.measured_at.slice(11, 13) + ev.measured_at.slice(14, 16));
    setCcpEditTemp(ev.temperature != null ? String(ev.temperature) : "");
    setCcpEditIsOk(ev.is_ok ?? true);
    setCcpEditActionNote(ev.action_note ?? "");
  }

  async function saveCcpEdit(ev: { id: string; event_type: string; measured_at: string }) {
    const needsTemp = !["move", "material_in", "material_out"].includes(ev.event_type); 
    if (needsTemp && !ccpEditTemp) return showToast("온도를 입력하세요.", "error");
    const temp = needsTemp ? Number(ccpEditTemp) : null;
    if (needsTemp && temp !== null && (temp < 40 || temp > 50)) return showToast("온도는 40~50°C 범위여야 합니다.", "error");
    setCcpEditSaving(true);
    const dateStr = ev.measured_at.slice(0, 10);
    const { error } = await supabase.from("ccp_heating_events").update({
      measured_at: `${dateStr}T${ccpEditTime.slice(0,2)}:${ccpEditTime.slice(2,4)}:00`,
      temperature: temp,
      is_ok: needsTemp ? ccpEditIsOk : null,
      action_note: ccpEditActionNote.trim() || null,
    }).eq("id", ev.id);
    setCcpEditSaving(false);
    if (error) return showToast("수정 실패: " + error.message, "error");
    showToast("✅ 수정 완료!");
    setCcpEditingId(null);
    if (selectedWo) loadCcpSession(selectedWo);
  }

  async function deleteCcpEvent(eventId: string) {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("ccp_heating_events").delete().eq("id", eventId);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료!");
    if (selectedWo) loadCcpSession(selectedWo);
  }

  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const [newWoNotifications, setNewWoNotifications] = useState<NewWoNotification[]>([]);
  const [showNewWoModal, setShowNewWoModal] = useState(false);
  const insertChannelRef = useRef<RealtimeChannel | null>(null);
  const pageLoadTimeRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    const channel = supabase.channel("wo_production_insert_notify")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "work_orders" }, (payload) => {
        const d = payload.new as Record<string, unknown>;
        const createdAt = String(d.created_at ?? "");
        if (createdAt && createdAt < pageLoadTimeRef.current) return;
        setNewWoNotifications((prev) => [{ id: String(d.id ?? ""), client_name: String(d.client_name ?? ""), product_name: String(d.product_name ?? ""), work_order_no: String(d.work_order_no ?? ""), order_date: String(d.order_date ?? ""), created_at: createdAt }, ...prev]);
        setShowNewWoModal(true); playNotificationSound();
      }).subscribe((status, err) => { console.log("🔔 [production INSERT채널]", status, err ?? ""); });
    insertChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); insertChannelRef.current = null; };
  }, []); // eslint-disable-line

  useEffect(() => {
    if (realtimeChannelRef.current) { supabase.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; setRealtimeConnected(false); }
    if (!selectedWo?.id) return;
    const channel = supabase.channel(`wo_progress:${selectedWo.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "work_orders", filter: `id=eq.${selectedWo.id}` }, (payload) => {
        const d = payload.new as Record<string, unknown>;
        setWoChecks((prev) => {
          if (!prev) return prev;
          return { ...prev, status_transfer: typeof d.status_transfer === "boolean" ? d.status_transfer : prev.status_transfer, status_print_check: typeof d.status_print_check === "boolean" ? d.status_print_check : prev.status_print_check, status_production: typeof d.status_production === "boolean" ? d.status_production : prev.status_production, status_input: typeof d.status_input === "boolean" ? d.status_input : prev.status_input, assignee_transfer: d.assignee_transfer !== undefined ? (d.assignee_transfer as string ?? "") : prev.assignee_transfer, assignee_print_check: d.assignee_print_check !== undefined ? (d.assignee_print_check as string ?? "") : prev.assignee_print_check, assignee_production: d.assignee_production !== undefined ? (d.assignee_production as string ?? "") : prev.assignee_production, assignee_input: d.assignee_input !== undefined ? (d.assignee_input as string ?? "") : prev.assignee_input };
        });
        const now = new Date();
        setLastUpdatedAt(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`);
        const changed = PROGRESS_STEPS.find((s) => d[s.assigneeKey] !== undefined || d[s.statusKey] !== undefined);
        if (changed) { setFlashKey(changed.assigneeKey); setTimeout(() => setFlashKey(null), 1500); }
      }).subscribe((status) => { setRealtimeConnected(status === "SUBSCRIBED"); });
    realtimeChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); realtimeChannelRef.current = null; setRealtimeConnected(false); };
  }, [selectedWo?.id]);

  async function handleAssigneeChange(assigneeKey: keyof WoChecks, statusKey: keyof WoChecks, value: string) {
    if (!woChecks || !selectedWo) return;
    if (value !== "") {
      const stepLabel = PROGRESS_STEPS.find((s) => s.assigneeKey === assigneeKey)?.label ?? assigneeKey;
      const confirmed = confirm(`[${stepLabel}] 담당자를 "${value}"로 저장합니다.\n본인이 맞습니까?`);
      if (!confirmed) return;
    }
    const isDone = value !== "";
    setWoChecks((prev) => prev ? { ...prev, [assigneeKey]: value, [statusKey]: isDone } : prev);
    setStepSaving(assigneeKey);
    const { error } = await supabase.from("work_orders").update({ [assigneeKey]: value || null, [statusKey]: isDone, updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
    setStepSaving(null);
    if (error) { setWoChecks((prev) => prev ? { ...prev, [assigneeKey]: woChecks[assigneeKey], [statusKey]: woChecks[statusKey] } : prev); setMsg("진행상태 저장 실패: " + error.message); }
  }

  const loadWoList = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      let q = supabase.from("work_orders").select(`id,work_order_no,barcode_no,client_id,client_name,sub_name,order_date,food_type,product_name,logo_spec,thickness,delivery_method,packaging_type,tray_slot,package_unit,mold_per_sheet,note,reference_note,status,status_transfer,status_print_check,status_production,status_input,is_reorder,original_work_order_id,variant_id,images,linked_order_id,created_at,assignee_transfer,assignee_print_check,assignee_production,assignee_input,order_type,ccp_slot_id,work_order_items(id,work_order_id,delivery_date,sub_items,order_qty,barcode_no,actual_qty,unit_weight,total_weight,expiry_date,order_id,note,images),linked_order:orders!linked_order_id(memo)`).order("created_at", { ascending: false }).limit(200);
      if (filterStatus !== "전체") q = q.eq("status", filterStatus);
      if (filterDateFrom) q = q.gte("order_date", filterDateFrom);
      if (filterDateTo) q = q.lte("order_date", filterDateTo);
      const { data, error } = await q;
      if (error) return setMsg(error.message);
      const list = (data ?? []) as WorkOrderRow[];
      setWoList(list);
      if (filterStatus !== "생산중") {
        supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("status", "생산중").then(({ count }) => setProductionCount(count ?? 0));
      } else { setProductionCount(list.filter((w) => w.status === "생산중").length); }
      const ids = list.map((w) => w.id);
      await loadReadMap(ids);
      if (selectedWo) { const refreshed = list.find((w) => w.id === selectedWo.id); if (refreshed) applySelection(refreshed, false); }
    } finally { setLoading(false); }
  }, [filterStatus, filterDateFrom, filterDateTo, loadReadMap]); // eslint-disable-line

  useEffect(() => { loadWoList(); }, [loadWoList]);
  useEffect(() => { supabase.from("employees").select("id,name,resign_date").is("resign_date", null).order("name").limit(500).then(({ data }) => { if (data) setEmployees(data); }); }, []);
  useEffect(() => { supabase.from("warmer_slots").select("id,slot_name,purpose").eq("is_active", true).order("slot_no").then(({ data }) => { if (data) setWarmerSlots(data); }); }, []);
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    supabase.from("expiry_mgmt_logs").select("id,item_name,status,expiry_date,action,log_date").eq("log_date", today).in("status", ["D-30 경보", "만료", "안전재고 미달"]).order("status").then(({ data }) => { if (data) setStockAlerts(data); });
  }, []);

  const filteredList = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    let list = q ? woList.filter((wo) => [wo.client_name, wo.sub_name, wo.product_name, wo.barcode_no, wo.work_order_no, wo.food_type].filter(Boolean).join(" ").toLowerCase().includes(q)) : [...woList];
    if (filterFoodCategory !== "전체") list = list.filter((wo) => getFoodCategory(wo.food_type) === filterFoodCategory);
    if (sortBy === "delivery_date") {
      list.sort((a, b) => {
        const aDate = (a.work_order_items ?? []).map((i) => i.delivery_date).filter(Boolean).sort()[0] ?? "";
        const bDate = (b.work_order_items ?? []).map((i) => i.delivery_date).filter(Boolean).sort()[0] ?? "";
        return aDate.localeCompare(bDate);
      });
    }
    return list;
  }, [woList, filterSearch, sortBy, filterFoodCategory]);

  function applySelection(wo: WorkOrderRow, resetEdit = true) {
    setIsKiseongForm(false); setIsEditMode(false); setSelectedWo(wo);
    setESubName(wo.sub_name ?? "");
    const woSubNameVal = wo.sub_name ?? "";
    if (woSubNameVal) { setEProductName(woSubNameVal); } else {
      const visibleItems = (wo.work_order_items ?? []).filter((item) => { const n = (item.sub_items ?? [])[0]?.name ?? ""; return !n.startsWith("성형틀") && !n.startsWith("인쇄제판"); });
      const firstName = visibleItems[0]?.sub_items?.[0]?.name ?? wo.product_name ?? "";
      const count = visibleItems.length;
      setEProductName(count > 1 ? `${firstName} 외 ${count - 1}건` : firstName);
    }
    setEFoodType(wo.food_type ?? ""); setELogoSpec(wo.logo_spec ?? ""); setEThickness(wo.thickness ?? "2mm"); setEDeliveryMethod(wo.delivery_method ?? "택배"); setEPackagingType(wo.packaging_type ?? "트레이"); setETraySlot(wo.tray_slot ?? "정사각20구"); setEPackageUnit(wo.package_unit ?? "100ea"); setEMoldPerSheet(wo.mold_per_sheet ? String(wo.mold_per_sheet) : ""); setENote(wo.note ?? ""); setEReferenceNote(wo.reference_note ?? ""); setECcpSlotId(wo.ccp_slot_id ?? "");
    setWoChecks({ status_transfer: wo.status_transfer, status_print_check: wo.status_print_check, status_production: wo.status_production, status_input: wo.status_input, assignee_transfer: (wo as any).assignee_transfer ?? "", assignee_print_check: (wo as any).assignee_print_check ?? "", assignee_production: (wo as any).assignee_production ?? "", assignee_input: (wo as any).assignee_input ?? "" });
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
    const inputs: Record<string, { actual_qty: string; unit_weight: string; expiry_date: string }> = {};
    for (const item of wo.work_order_items ?? []) { inputs[item.id] = { actual_qty: item.actual_qty != null ? String(item.actual_qty) : "", unit_weight: item.unit_weight != null ? String(item.unit_weight) : "", expiry_date: item.expiry_date ?? "" }; }
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
    // ── CCP 세션 로드 ──
    loadCcpSession(wo);
    setCcpTemp("");
    setCcpActionNote("");
    setCcpIsOk(true);
  }

  async function deleteWo(woId: string) {
    if (!isAdmin) return;
    if (!confirm("작업지시서를 삭제하시겠습니까?\n(연결된 주문의 work_order_item_id도 초기화됩니다)")) return;
    try {
      await supabase.from("work_order_items").update({ order_id: null }).eq("work_order_id", woId);
      const wo = woList.find((w) => w.id === woId);
      if (wo?.linked_order_id) await supabase.from("orders").update({ work_order_item_id: null }).eq("id", wo.linked_order_id);
      await supabase.from("work_order_items").delete().eq("work_order_id", woId);
      const { error } = await supabase.from("work_orders").delete().eq("id", woId);
      if (error) return setMsg("삭제 실패: " + error.message);
      if (selectedWo?.id === woId) setSelectedWo(null);
      setMsg("🗑️ 작업지시서가 삭제되었습니다.");
      await loadWoList();
    } catch (e: any) { setMsg("삭제 오류: " + (e?.message ?? e)); }
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
      if (triggerRes.ok) console.log("✅ PDF 드라이브 업로드 트리거 성공:", fileName); else console.error("❌ PDF 드라이브 업로드 트리거 실패");
    } catch (pdfErr) { console.error("PDF 업로드 트리거 오류 (무시):", pdfErr); }
  }

  async function markProductionComplete() {
    if (isCompleting) return;
    if (!selectedWo) return;
    setIsCompleting(true);
    if (!isAdmin && woChecks) {
      const missing = [!woChecks.assignee_transfer && "전사인쇄", !woChecks.assignee_print_check && "인쇄검수", !woChecks.assignee_production && "생산완료", !woChecks.assignee_input && "입력완료"].filter(Boolean) as string[];
      if (missing.length > 0) { setMsg(`담당자를 모두 선택해주세요: ${missing.join(", ")}`); setIsCompleting(false); return; }
    }
    const items = (selectedWo.work_order_items ?? []).filter((item) => { const name = (item.sub_items ?? [])[0]?.name ?? ""; return !name.startsWith("성형틀") && !name.startsWith("인쇄제판"); });
    const missingItems = items.filter((item) => { const pi = prodInputs[item.id]; return !pi || !pi.actual_qty || !pi.unit_weight || !pi.expiry_date; });
    if (missingItems.length > 0) { const ok = confirm("⚠️ 일부 항목에 생산정보(출고수량/개당중량/소비기한)가 입력되지 않았습니다.\n재고대장 연동이 불완전할 수 있습니다.\n\n그래도 완료 처리하시겠습니까?"); if (!ok) { setIsCompleting(false); return; } } else { if (!confirm("생산완료 처리하시겠습니까?\n기본정보·담당자·생산입력이 모두 저장되고 재고대장에 입고가 반영됩니다.")) { setIsCompleting(false); return; } }
    setMsg(`⏳ 시작 - role:${role}, isAdminOrSubadmin:${isAdminOrSubadmin}`);
    try {
      if (isAdminOrSubadmin) {
        const { error: basicErr } = await supabase.from("work_orders").update({ sub_name: eSubName.trim() || null, product_name: eProductName.trim(), food_type: eFoodType.trim() || null, logo_spec: eLogoSpec.trim() || null, thickness: eThickness || null, delivery_method: eDeliveryMethod || null, packaging_type: ePackagingType || null, tray_slot: ePackagingType === "트레이" ? eTraySlot : null, package_unit: ePackageUnit || null, mold_per_sheet: eMoldPerSheet ? Number(eMoldPerSheet) : null, note: eNote.trim() || null, reference_note: eReferenceNote.trim() || null, updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
        if (basicErr) { setMsg("기본정보 저장 실패: " + basicErr.message); setIsCompleting(false); return; }
      }
      if (woChecks) {
        const { error: checksErr } = await supabase.from("work_orders").update({ assignee_transfer: woChecks.assignee_transfer || null, assignee_print_check: woChecks.assignee_print_check || null, assignee_production: woChecks.assignee_production || null, assignee_input: woChecks.assignee_input || null, updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
        if (checksErr) { setMsg("담당자 저장 실패: " + checksErr.message); setIsCompleting(false); return; }
      }
      for (const item of items) {
        const pi = prodInputs[item.id];
        if (!pi || (!pi.actual_qty && !pi.unit_weight && !pi.expiry_date)) continue;
        const { error: itemErr } = await supabase.from("work_order_items").update({ actual_qty: pi.actual_qty ? toInt(pi.actual_qty) : null, unit_weight: pi.unit_weight ? toNum(pi.unit_weight) : null, expiry_date: pi.expiry_date || null }).eq("id", item.id);
        if (itemErr) { setMsg("생산입력 저장 실패: " + itemErr.message); setIsCompleting(false); return; }
      }
      const allItems = selectedWo.work_order_items ?? [];
      const firstUw = toNum(prodInputs[allItems[0]?.id]?.unit_weight);
      if (selectedWo.variant_id && firstUw > 0) await supabase.from("product_variants").update({ weight_g: firstUw }).eq("id", selectedWo.variant_id);
      setMsg("⏳ 4단계: 재고대장 연동 중...");
      const now = new Date().toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      const stockErrors: string[] = [];
      for (const item of items) {
        const pi = prodInputs[item.id];
        if (!pi || !pi.actual_qty || !pi.expiry_date) continue;
        const actual_qty = toInt(pi.actual_qty);
        if (actual_qty <= 0) continue;
        const expiry_date = pi.expiry_date;
        let variantId: string | null = null;
        if (item.barcode_no) { const { data: pbData } = await supabase.from("product_barcodes").select("variant_id").eq("barcode", item.barcode_no).maybeSingle(); variantId = pbData?.variant_id ?? null; }
        if (!variantId) variantId = selectedWo.variant_id;
        if (!variantId) { stockErrors.push(`variant 없음 (${(item.sub_items ?? [])[0]?.name ?? item.id})`); continue; }
        let lotId: string | null = null;
        const { data: existingLot } = await supabase.from("lots").select("id").eq("variant_id", variantId).eq("expiry_date", expiry_date).maybeSingle();
        if (existingLot) { lotId = existingLot.id; } else {
          const { data: newLot, error: lotErr } = await supabase.from("lots").insert({ variant_id: variantId, expiry_date }).select("id").single();
          if (lotErr) { stockErrors.push("LOT 생성 실패 (" + expiry_date + "): " + lotErr.message); continue; }
          lotId = newLot.id;
        }
        const { error: movErr } = await supabase.from("movements").insert({ lot_id: lotId, type: "IN", qty: actual_qty, happened_at: now, note: "작업지시서 생산완료 - " + selectedWo.work_order_no, created_by: userId });
        if (movErr) stockErrors.push("입고 기록 실패 (" + expiry_date + "): " + movErr.message);
      }
      const ccpCategory = getFoodCategory(selectedWo.food_type);
      const ccpSlotId = eCcpSlotId || selectedWo.ccp_slot_id;
      if ((ccpCategory === "다크" || ccpCategory === "화이트") && ccpSlotId) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: existSession } = await supabase.from("ccp_heating_sessions").select("id").eq("session_date", today).eq("slot_id", ccpSlotId).eq("status", "active").maybeSingle();
        let sessionId = existSession?.id ?? null;
        if (!sessionId) { const { data: newSession } = await supabase.from("ccp_heating_sessions").insert({ session_date: today, slot_id: ccpSlotId, status: "active", created_by: userId }).select("id").single(); sessionId = newSession?.id ?? null; }
        if (sessionId) {
          const { data: existLink } = await supabase.from("ccp_heating_session_orders").select("id").eq("session_id", sessionId).eq("work_order_ref", selectedWo.work_order_no).maybeSingle();
          if (!existLink) await supabase.from("ccp_heating_session_orders").insert({ session_id: sessionId, work_order_ref: selectedWo.work_order_no, client_name: selectedWo.client_name, product_name: selectedWo.product_name });
        }
      }
      const { error: statusErr } = await supabase.from("work_orders").update({ status: "완료", status_production: true, updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
      if (statusErr) { setMsg("상태 변경 실패: " + statusErr.message); setIsCompleting(false); return; }
      if (stockErrors.length > 0) showToast("⚠️ 저장됐으나 재고 연동 오류: " + stockErrors.join(" / "), "error"); else showToast("✅ 생산입력 완료!");
      setIsEditMode(false);
      await triggerPdfUpload(selectedWo, eProductName ?? "품목미상", eFoodType ?? "", eLogoSpec ?? "");
      await loadWoList();
    } catch (e: any) { setMsg("오류: " + (e?.message ?? e)); } finally { setIsCompleting(false); }
  }

  const unreadCount = useMemo(() => filteredList.filter((wo) => wo.status === "생산중" && !readMap[wo.id]).length, [filteredList, readMap]);
  const doneCount = woChecks ? PROGRESS_STEPS.filter((s) => (woChecks[s.assigneeKey] ?? "") !== "").length : 0;

  // ── 렌더 ──
  // USER도 접근 가능 (SUBADMIN 공유 계정 사용)
  if (role === null) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-50"><div className="text-sm text-slate-400">로딩 중...</div></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-[1400px] space-y-4">

        {showNewWoModal && newWoNotifications.length > 0 && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-[480px] rounded-2xl border border-orange-200 bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 bg-orange-500 px-5 py-4">
                <div className="flex items-center gap-2"><span className="text-2xl animate-bounce">🔔</span><div><div className="text-base font-bold text-white">새 작업지시서 도착!</div><div className="text-xs text-orange-100">새 주문이 등록됐습니다</div></div></div>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-bold text-white">{newWoNotifications.length}건</span>
              </div>
              <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100">
                {newWoNotifications.map((n, idx) => (
                  <div key={n.id} className="px-5 py-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><div className="font-semibold text-slate-800 truncate">{n.client_name}</div><div className="text-sm text-slate-600 truncate mt-0.5">{n.product_name}</div><div className="mt-1 flex flex-wrap gap-1.5"><span className="text-[11px] text-slate-400 font-mono">{n.work_order_no}</span><span className="text-[11px] text-slate-400">· 주문일 {n.order_date}</span></div></div>{idx === 0 && <span className="shrink-0 rounded-full bg-orange-100 border border-orange-200 px-2 py-0.5 text-[11px] font-semibold text-orange-700">NEW</span>}</div></div>
                ))}
              </div>
              <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
                <button className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600" onClick={() => { setShowNewWoModal(false); setNewWoNotifications([]); }}>확인 ({newWoNotifications.length}건)</button>
                <button className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setShowNewWoModal(false)}>나중에</button>
              </div>
            </div>
          </div>
        )}

{/* ── 온장고 슬롯 현황 + 사전 원료투입 ── */}
<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

  {/* 온장고 슬롯 현황 */}
  <div className={`${card} p-4`}>
    <div className="flex items-center justify-between mb-3">
      <div className="font-semibold text-sm">🌡️ 온장고 슬롯 현황</div>
      <button className={btnSm} onClick={loadSlotStatus}>🔄 갱신</button>
    </div>

 {(() => {
  // 7, 8, 9-xx 슬롯을 한 그룹으로 묶기
  const MERGE_PURPOSES = ["코팅용도", "전사용도", "유동"];
  const mainGroups = Array.from(new Set(
    warmerSlots
      .filter((s) => !MERGE_PURPOSES.includes(s.purpose))
      .map((s) => s.purpose)
  ));
  const mergedSlots = warmerSlots.filter((s) => MERGE_PURPOSES.includes(s.purpose));

  const renderSlot = (s: { id: string; slot_name: string; purpose: string }) => {
    const st = slotStatus[s.id];
    const isEmpty = st === null || st === undefined;
    const daysAgo = st?.daysAgo ?? 0;
    const dateStr = st?.date ? st.date.slice(5) : null; // MM-DD
    const isOverdue = !isEmpty && daysAgo >= 15;
    const statusCls = isEmpty
      ? "border-slate-200 bg-slate-50 text-slate-400"
      : isOverdue
      ? "border-red-300 bg-red-50 text-red-600"
      : "border-blue-200 bg-blue-50 text-blue-700";
    return (
      <div key={s.id} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${statusCls}`}>
        <div className={`font-semibold ${isOverdue ? "text-red-600 font-bold" : ""}`}>{s.slot_name}</div>
        <div className={`mt-0.5 text-[10px] text-center ${isOverdue ? "text-red-600 font-bold" : "font-normal"}`}>
          {isEmpty ? "비어있음" : dateStr}
        </div>
      </div>
    ); 
    
  };

  return (
    <div className="space-y-3">
      {mainGroups.map((purpose) => (
        <div key={purpose}>
          <div className="mb-1.5 text-xs font-semibold text-slate-500">{purpose}</div>
          <div className="flex flex-wrap gap-2">
            {warmerSlots.filter((s) => s.purpose === purpose).map(renderSlot)}
          </div>
        </div>
      ))}
      {mergedSlots.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-slate-500">기타 (코팅·전사·유동)</div>
          <div className="flex flex-wrap gap-2">
            {mergedSlots.map(renderSlot)}
          </div>
        </div>
      )}
    </div>
  );
})()}
          
 </div>

  {/* 사전 원료투입 */}
  <div className={`${card} p-4`}>
    <div className="flex items-center gap-2 mb-3">
      <div className="font-semibold text-sm">🧪 사전 원료투입</div>
      <span className="text-xs text-slate-400">작업지시서 없이 원료를 미리 투입할 때</span>
    </div>
    {(() => {
      const MERGE_PURPOSES = ["코팅용도", "전사용도", "유동"];
      const mainGroups = Array.from(new Set(
        warmerSlots
          .filter((s) => !MERGE_PURPOSES.includes(s.purpose))
          .map((s) => s.purpose)
      ));
      const mergedSlots = warmerSlots.filter((s) => MERGE_PURPOSES.includes(s.purpose));
      const renderPreSlot = (s: { id: string; slot_name: string; purpose: string }) => (
        <button
          key={s.id}
          type="button"
          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${
            preSlotId === s.id
              ? "border-green-500 bg-green-600 text-white shadow-sm scale-105"
              : "border-slate-200 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50"
          }`}
          onClick={() => setPreSlotId(preSlotId === s.id ? "" : s.id)}
        >
          {s.slot_name}
        </button>
      );
      return (
        <div className="space-y-3 mb-4">
          {mainGroups.map((purpose) => (
            <div key={purpose}>
              <div className="mb-1.5 text-xs font-semibold text-slate-500">{purpose}</div>
              <div className="flex flex-wrap gap-2">
                {warmerSlots.filter((s) => s.purpose === purpose).map(renderPreSlot)}
              </div>
            </div>
          ))}
          {mergedSlots.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-500">기타 (코팅·전사·유동)</div>
              <div className="flex flex-wrap gap-2">
                {mergedSlots.map(renderPreSlot)}
              </div>
            </div>
          )}
        </div>
      );
    })()}
    <div className="flex gap-3 items-end border-t border-slate-100 pt-3">
      <div>
        <div className="mb-1 text-xs text-slate-500">투입시각 (HHmm)</div>
        <input
          className={inp}
          style={{ width: 140 }}
          inputMode="numeric"
          placeholder="예: 1430"
          maxLength={4}
          value={preTime}
          onChange={(e) => setPreTime(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        />
        {preTime.length === 4 && (
          <div className="mt-0.5 text-xs text-slate-400 text-right">
            {preTime.slice(0, 2)}:{preTime.slice(2, 4)}
          </div>
        )}
      </div>
      <button
        className="rounded-xl border border-green-500 bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
        disabled={preSaving || !preSlotId || preTime.length < 4}
        onClick={savePreMaterialIn}
      >
        {preSaving ? "저장 중..." : "🧪 원료투입 기록"}
      </button>
    </div>
  </div>

</div>

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">📋 작업지시서 관리</h1>
            <div className="mt-0.5 text-xs text-slate-500">
              {role === "ADMIN" ? "ADMIN — 목록조회 · 기본정보수정 · 생산입력" : role === "SUBADMIN" ? "SUBADMIN — 목록조회 · 기본정보수정 · 생산입력" : role === "USER" ? "목록조회 · 온도기록 · 담당자선택" : "로딩 중..."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className={isKiseongForm ? "rounded-xl border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700" : "rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"}
              onClick={() => { if (isKiseongForm) resetKiseongForm(); else { setIsKiseongForm(true); setSelectedWo(null); } }}>📦 재고생산</button>
            <button className={btn} onClick={loadWoList}>🔄 새로고침</button>
          </div>
        </div>

        {stockAlerts.length > 0 && (
          <div>
            <button className={`w-full flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${stockAlerts.some((a) => a.status === "만료") ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100" : stockAlerts.some((a) => a.status === "안전재고 미달") ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"}`} onClick={() => setShowAlertPanel((v) => !v)}>
              <span className="text-base animate-pulse">{stockAlerts.some((a) => a.status === "만료") ? "🚨" : "⚠️"}</span>
              <span>{stockAlerts.filter((a) => a.status === "만료").length > 0 && `소비기한 만료 ${stockAlerts.filter((a) => a.status === "만료").length}건 `}{stockAlerts.filter((a) => a.status === "D-30 경보").length > 0 && `D-30 경보 ${stockAlerts.filter((a) => a.status === "D-30 경보").length}건 `}{stockAlerts.filter((a) => a.status === "안전재고 미달").length > 0 && `안전재고 미달 ${stockAlerts.filter((a) => a.status === "안전재고 미달").length}건`}</span>
              <span className="ml-auto text-xs opacity-60">{showAlertPanel ? "▲ 닫기" : "▼ 상세보기"}</span>
            </button>
            {showAlertPanel && (
              <div className="mt-1 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">오늘({new Date().toISOString().slice(0, 10)}) 기준 알림</div>
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {stockAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-sm">{alert.status === "만료" ? "🚨" : alert.status === "D-30 경보" ? "⏰" : "📉"}</span>
                      <div className="flex-1 min-w-0"><div className="text-sm font-medium text-slate-800 truncate">{alert.item_name}</div>{alert.expiry_date && <div className="text-xs text-slate-500">소비기한: {alert.expiry_date}</div>}{alert.action && <div className="text-xs text-slate-500">{alert.action}</div>}</div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${alert.status === "만료" ? "bg-red-100 border-red-200 text-red-700" : alert.status === "D-30 경보" ? "bg-orange-100 border-orange-200 text-orange-700" : "bg-amber-100 border-amber-200 text-amber-700"}`}>{alert.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {msg ? (<div className={`rounded-xl border px-4 py-3 text-sm font-medium ${msg.startsWith("✅") ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>{msg}<button className="ml-3 text-xs opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>✕</button></div>) : null}
        {toast ? (<div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] rounded-2xl border px-5 py-3 text-sm font-semibold shadow-xl ${toast.type === "success" ? "border-green-300 bg-green-600 text-white" : "border-red-300 bg-red-600 text-white"}`}>{toast.msg}</div>) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">

          {/* ── LEFT: 목록 ── */}
          <div className={`${card} flex flex-col p-4`} style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
            <div className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 ${unreadCount > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${unreadCount > 0 ? "bg-red-500 animate-pulse" : "bg-slate-300"}`} />
              <span className={`text-xs font-semibold ${unreadCount > 0 ? "text-red-700" : "text-slate-400"}`}>미확인 작업지시서 {unreadCount}건</span>
            </div>
            <div className="mb-3 text-base font-semibold">작업지시서 목록</div>
            <div className="mb-3 space-y-2">
              <input className={inp} placeholder="거래처명 / 제품명 / 바코드 검색" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
              <div className="flex gap-1">
                {(["전체", "생산중", "완료"] as const).map((s) => (
                  <button key={s} className={filterStatus === s ? btnOn : btn} onClick={() => setFilterStatus(s)}>{s}{s === "생산중" && <span className={`ml-1 tabular-nums ${filterStatus === s ? "opacity-80" : "text-slate-400"}`}>{productionCount}</span>}</button>
                ))}
              </div>
              {filterStatus === "생산중" && (
                <div className="flex gap-1">
                  <button className={sortBy === "created_at" ? btnOn : btn} onClick={() => setSortBy("created_at")}>주문일순</button>
                  <button className={sortBy === "delivery_date" ? btnOn : btn} onClick={() => setSortBy("delivery_date")}>납기일순</button>
                </div>
              )}
              <div className="mb-3 flex gap-1 flex-wrap">
                {(["전체", "다크", "화이트", "전사지"] as const).map((c) => (
                  <button key={c} className={filterFoodCategory === c ? btnOn : btn} onClick={() => setFilterFoodCategory(c)}>{c === "다크" ? "🍫 다크" : c === "화이트" ? "🤍 화이트" : c === "전사지" ? "🖨️ 전사지" : "전체"}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><div className="mb-1 text-xs text-slate-500">주문일 From</div><input type="date" className={inp} value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} /></div>
                <div><div className="mb-1 text-xs text-slate-500">주문일 To</div><input type="date" className={inp} value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} /></div>
              </div>
            </div>
            {loading ? <div className="py-8 text-center text-sm text-slate-400">불러오는 중...</div>
              : filteredList.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">조건에 맞는 작업지시서가 없습니다.</div>
              : (
                <div className="space-y-2">
                  {filteredList.map((wo) => {
                    const isSelected = selectedWo?.id === wo.id;
                    const statusCls = statusColors[wo.status] ?? "bg-slate-100 text-slate-600 border-slate-200";
                    const items = wo.work_order_items ?? [];
                    const totalOrder = items.reduce((s, i) => s + (i.order_qty ?? 0), 0);
                    const allItemsDone = items.length > 0 && items.every((i) => i.actual_qty && i.unit_weight && i.expiry_date);
                    return (
                      <div key={wo.id} className="relative group">
                        <button className={`w-full rounded-2xl border p-3 text-left transition-all overflow-hidden ${isSelected ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`} onClick={() => applySelection(wo)}>
                          <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${wo.status === "생산중" && !readMap[wo.id] ? "bg-red-400" : "bg-green-300"}`} />
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-sm truncate">{(() => { const name = wo.client_name ?? ""; const isMarketplace = ["네이버-판매", "카카오플러스-판매", "쿠팡-판매"].includes(name); if (!isMarketplace) return name; let ordererName = ""; try { const lo = wo.linked_order; const memoRaw = Array.isArray(lo) ? lo[0]?.memo : (lo as any)?.memo; if (memoRaw) { const parsed = typeof memoRaw === "string" ? JSON.parse(memoRaw) : memoRaw; ordererName = parsed?.orderer_name ?? ""; } } catch {} return ordererName ? `${name} · ${ordererName}` : name; })()}</span>
                                {wo.sub_name ? <span className="text-xs text-slate-500">· {wo.sub_name}</span> : null}
                                {wo.order_type === "재고" && <span className="rounded-full bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">기성</span>}
                                {wo.status === "생산중" && !readMap[wo.id] && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />NEW</span>}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-600 font-medium truncate">{wo.product_name}</div>
                              <div className="mt-1 flex flex-wrap gap-1"><span className="text-[10px] text-slate-400 tabular-nums font-mono">{wo.barcode_no}</span>{wo.thickness ? <span className={`${pill} text-[10px]`}>{wo.thickness}</span> : null}{wo.packaging_type ? <span className={`${pill} text-[10px]`}>{wo.packaging_type}</span> : null}</div>
                              <div className="mt-1 text-[11px] text-slate-400">주문일 {wo.order_date}{totalOrder > 0 ? ` · ${fmt(totalOrder)}개` : ""}{allItemsDone ? " · ✅생산완료" : ""}{(() => { const dates = (wo.work_order_items ?? []).map((i) => i.delivery_date).filter(Boolean).sort(); if (dates.length === 0) return null; return <span className="ml-1 font-semibold text-orange-500">· 납기 {dates[0]}</span>; })()}{readMap[wo.id] && <span className="ml-1 text-green-500">· 확인 {new Date(readMap[wo.id].read_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}</div>
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1.5"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusCls}`}>{wo.status}</span></div>
                          </div>
                        </button>
                        {isAdmin ? <button className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-500 hover:text-white text-xs font-bold transition-colors z-10" onClick={(e) => { e.stopPropagation(); deleteWo(wo.id); }} title="작업지시서 삭제">✕</button> : null}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>

          {/* ── RIGHT ── */}
          {isKiseongForm ? (
            <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>
              <div className={`${card} p-4`}>
                <div className="flex items-center justify-between mb-4">
                  <div><h2 className="text-lg font-bold text-emerald-700">📦 재고생산 등록</h2><p className="text-xs text-slate-500 mt-0.5">재고 생산용 작업지시서입니다. 거래처 없이 등록됩니다.</p></div>
                  <button className={btn} onClick={resetKiseongForm}>✕ 닫기</button>
                </div>
                <div className="mb-4">
                  <div className="mb-1 text-sm font-semibold text-slate-700">제품 선택 *</div>
                  <input className={inp} placeholder="제품명 또는 바코드로 검색" value={kiseongSearch} onChange={(e) => setKiseongSearch(e.target.value)} />
                  {kiseongSearch.trim() && kiseongFilteredVariants.length > 0 && (
                    <div className="mt-1 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden max-h-48 overflow-y-auto">
                      {kiseongFilteredVariants.map((v) => (
                        <button key={v.variant_id} className={`w-full text-left px-3 py-2.5 text-sm border-b border-slate-100 last:border-0 ${kiseongSelected?.variant_id === v.variant_id ? "bg-emerald-50 font-semibold" : "hover:bg-emerald-50"}`} onClick={() => { setKiseongSearch(v.product_name); handleKiseongVariantSelect(v); }}>
                          <span className="font-medium text-slate-800">{v.product_name}</span>{v.food_type && <span className="ml-2 text-xs text-slate-500">{v.food_type}</span>}{v.barcode && <span className="ml-2 text-xs font-mono text-slate-400">{v.barcode}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {kiseongSelected && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <span className="text-emerald-700 font-semibold text-sm">✅ {kiseongSelected.product_name}</span>
                      <span className="text-xs text-slate-500 font-mono">{kiseongSelected.barcode}</span>
                      <button className="ml-auto text-xs text-slate-400 hover:text-red-500" onClick={() => { setKiseongSelected(null); setKiseongSearch(""); }}>초기화</button>
                    </div>
                  )}
                </div>
                {kiseongSelected && (
                  <>
                    <div className="mb-3 flex items-center gap-2"><div className="text-sm font-semibold text-slate-700">기본정보</div><span className="text-xs text-slate-400">이전 작업지시서에서 자동 불러옴</span></div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
                      <div><div className="mb-1 text-xs text-slate-500">서브네임</div><input className={inp} value={kSubName} onChange={(e) => setKSubName(e.target.value)} placeholder="예: COS, 크로버" /></div>
                      <div><div className="mb-1 text-xs text-slate-500">식품유형 *</div><input className={inp} value={kFoodType} onChange={(e) => setKFoodType(e.target.value)} placeholder="예: 화이트초콜릿" /></div>
                      <div><div className="mb-1 text-xs text-slate-500">규격(로고스펙)</div><input className={inp} value={kLogoSpec} onChange={(e) => setKLogoSpec(e.target.value)} placeholder="예: 40x40mm" /></div>
                      <div><div className="mb-1 text-xs text-slate-500">두께</div><select className={inp} value={kThickness} onChange={(e) => setKThickness(e.target.value)}>{["2mm","3mm","5mm","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                      <div><div className="mb-1 text-xs text-slate-500">포장방법</div><select className={inp} value={kPackagingType} onChange={(e) => setKPackagingType(e.target.value)}>{["트레이-정사각20구","트레이-직사각20구","트레이-35구","벌크"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                      <div><div className="mb-1 text-xs text-slate-500">포장단위</div><select className={inp} value={kPackageUnit} onChange={(e) => setKPackageUnit(e.target.value)}>{["100ea","200ea","300ea","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                      <div><div className="mb-1 text-xs text-slate-500">성형틀 장당 생산수</div><input className={inpR} inputMode="numeric" value={kMoldPerSheet} onChange={(e) => setKMoldPerSheet(e.target.value.replace(/[^\d]/g, ""))} /></div>
                      <div><div className="mb-1 text-xs text-slate-500 flex items-center justify-between"><span>비고</span>{kMoldPerSheet && kActualQty && <span className="text-emerald-600 text-[10px] font-medium">✅ 전사지 장수 자동계산</span>}</div><input className={inp} value={kNote} onChange={(e) => setKNote(e.target.value)} placeholder="성형틀+수량 입력 시 자동계산" /></div>
                      <div><div className="mb-1 text-xs text-slate-500">참고사항</div><input className={inp} value={kReferenceNote} onChange={(e) => setKReferenceNote(e.target.value)} /></div>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
                      <div className="mb-3 text-sm font-semibold text-emerald-700">🏭 생산 정보 (매번 입력)</div>
                      <div><div className="mb-1 text-xs text-slate-600">생산수량 *</div><input className={inpR} inputMode="numeric" placeholder="예: 3000" value={kActualQty} onChange={(e) => setKActualQty(e.target.value.replace(/[^\d]/g, ""))} /><div className="mt-2 text-xs text-slate-400">※ 소비기한은 생산완료 처리 시 입력합니다.</div></div>
                    </div>
                    <button className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={kiseongSaving} onClick={saveKiseongOrder}>{kiseongSaving ? "저장 중..." : "📦 재고 작업지시서 등록"}</button>
                  </>
                )}
              </div>
            </div>
          ) : selectedWo ? (
            <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>

              {/* 헤더 카드 */}
              <div className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold">{selectedWo.client_name}</span>
                      {selectedWo.sub_name ? <span className="text-slate-500">· {selectedWo.sub_name}</span> : null}
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColors[selectedWo.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{selectedWo.status}</span>
                      {selectedWo.order_type === "재고" && <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">재고</span>}
                      {selectedWo.is_reorder ? <span className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-700">재주문</span> : null}
                    </div>
                    <div className="mt-1 font-semibold text-slate-700">{selectedWo.product_name}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500"><span className="tabular-nums font-mono">{selectedWo.barcode_no}</span><span>·</span><span>{selectedWo.work_order_no}</span><span>·</span><span>주문일 {selectedWo.order_date}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <button className={`${btnSm} border-slate-300`} onClick={() => setPrintOpen(true)}>🖨️ 인쇄</button>
                    <button className={btnSm} onClick={() => applySelection(selectedWo)}>↺ 초기화</button>
                  </div>
                </div>
              </div>

              {/* 기본정보 카드 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-semibold text-sm">📝 기본정보</div>
                  <div className="text-xs text-slate-400">{isEditMode ? "✏️ 수정 모드 — 하단 수정저장 버튼으로 저장" : "수정 버튼을 눌러 편집하세요"}</div>
                </div>
                {isAdminOrSubadmin ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div><div className="mb-1 text-xs text-slate-500">제품명 *</div><input className={inp} value={eProductName} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEProductName(e.target.value)} /></div>
                    <div><div className="mb-1 text-xs text-slate-500">서브네임</div><input className={inp} placeholder="예: COS, 크로버" value={eSubName} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setESubName(e.target.value)} /></div>
                    <div><div className="mb-1 text-xs text-slate-500">식품유형</div><input className={inp} placeholder="예: 화이트초콜릿" value={eFoodType} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEFoodType(e.target.value)} /></div>
                    <div><div className="mb-1 text-xs text-slate-500">규격(로고스펙)</div><input className={inp} placeholder="예: 40x40mm" value={eLogoSpec} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setELogoSpec(e.target.value)} /></div>
                    <div><div className="mb-1 text-xs text-slate-500">두께</div><select className={inp} value={eThickness} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEThickness(e.target.value)}>{["2mm","3mm","5mm","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                    <div><div className="mb-1 text-xs text-slate-500">납품방법</div><select className={inp} value={eDeliveryMethod} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEDeliveryMethod(e.target.value)}>{["택배","퀵-신용","퀵-착불","방문","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                    <div><div className="mb-1 text-xs text-slate-500">포장방법</div><select className={inp} value={ePackagingType} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEPackagingType(e.target.value)}>{["트레이-정사각20구","트레이-직사각20구","트레이-35구","벌크"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                    {ePackagingType === "트레이" ? <div><div className="mb-1 text-xs text-slate-500">트레이 구수</div><select className={inp} value={eTraySlot} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setETraySlot(e.target.value)}>{["정사각20구","직사각20구","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div> : null}
                    <div><div className="mb-1 text-xs text-slate-500">포장단위</div><select className={inp} value={ePackageUnit} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEPackageUnit(e.target.value)}>{["100ea","200ea","300ea","기타"].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                    <div><div className="mb-1 text-xs text-slate-500">성형틀 장당 생산수</div><input className={inpR} inputMode="numeric" value={eMoldPerSheet} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEMoldPerSheet(e.target.value.replace(/[^\d]/g, ""))} /></div>
                    <div><div className="mb-1 text-xs text-slate-500">비고</div><input className={inp} value={eNote} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setENote(e.target.value)} /></div>
                    <div><div className="mb-1 text-xs text-slate-500">참고사항</div><input className={inp} value={eReferenceNote} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setEReferenceNote(e.target.value)} /></div>

                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-3 md:grid-cols-4">
                    {([["식품유형", selectedWo.food_type], ["규격", selectedWo.logo_spec], ["두께", selectedWo.thickness], ["납품방법", selectedWo.delivery_method], ["포장방법", selectedWo.packaging_type], ...(selectedWo.packaging_type === "트레이" ? [["트레이 구수", selectedWo.tray_slot] as [string, string | null]] : []), ["포장단위", selectedWo.package_unit], ["성형틀/장", selectedWo.mold_per_sheet ? `${selectedWo.mold_per_sheet}개` : null], ["비고", selectedWo.note], ["참고사항", selectedWo.reference_note]] as [string, string | null][]).map(([label, value]) => value ? <div key={label}><div className="text-xs text-slate-400">{label}</div><div className="font-medium text-slate-800">{value}</div></div> : null)}
                  </div>
                )}
              </div>

              {/* 진행상태 카드 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-sm">✅ 진행상태</div>
                    <div className="flex items-center gap-1"><span className={`inline-block w-2 h-2 rounded-full transition-colors ${realtimeConnected ? "bg-green-400 animate-pulse" : "bg-slate-300"}`} /><span className="text-[10px] text-slate-400">{realtimeConnected ? "실시간 연결됨" : "연결 중..."}</span></div>
                    {lastUpdatedAt && <span className="text-[10px] text-blue-400 font-mono">↻ {lastUpdatedAt} 업데이트</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5"><div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-green-400 transition-all duration-500" style={{ width: `${Math.round((doneCount / PROGRESS_STEPS.length) * 100)}%` }} /></div><span className="text-[10px] text-slate-500 tabular-nums">{doneCount}/{PROGRESS_STEPS.length}</span></div>
                    <div className="text-xs text-slate-400">담당자 선택 시 자동 저장</div>
                  </div>
                </div>
                {woChecks ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {PROGRESS_STEPS.map((step) => {
                      const assigneeVal = woChecks[step.assigneeKey] ?? "";
                      const isDone = assigneeVal !== "";
                      const othersDone = PROGRESS_STEPS.some((s) => s.assigneeKey !== step.assigneeKey && (woChecks[s.assigneeKey] ?? "") !== "");
                      const isSkipped = !isDone && othersDone;
                      const isSaving = stepSaving === step.assigneeKey;
                      const isFlashing = flashKey === step.assigneeKey;
                      const cardCls = isDone ? step.cardDone : isSkipped ? step.cardSkip : step.cardEmpty;
                      return (
                        <div key={step.assigneeKey} className={`rounded-xl border px-3 py-2.5 transition-all duration-300 ${cardCls} ${isFlashing ? "ring-2 ring-blue-400 ring-offset-1 scale-[1.02]" : ""}`}>
                          <div className="flex items-center justify-between mb-2"><div className="text-xs font-semibold text-slate-700 flex items-center gap-1"><span>{step.icon}</span>{step.label}</div><div>{isSaving ? <span className="text-[10px] text-slate-400 animate-pulse">저장 중...</span> : isDone ? <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${step.badgeDone}`}>완료</span> : isSkipped ? <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${step.badgeSkip}`}>⚠ 미입력</span> : <span className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">대기</span>}</div></div>
                          <select className={`w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors ${isDone ? "border-current bg-white/70 text-slate-700 font-medium" : "border-slate-200 bg-white text-slate-500"} ${isSaving ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`} value={assigneeVal} disabled={isSaving || (selectedWo?.status === "완료" && !isEditMode)} onChange={(e) => handleAssigneeChange(step.assigneeKey, step.statusKey, e.target.value)}>
                            <option value="">— 담당자 선택 —</option>
                            {employees.map((e) => e.name ? <option key={e.id} value={e.name}>{e.name}</option> : null)}
                          </select>
                          {isDone && <div className="mt-1.5 text-[11px] font-semibold text-center text-slate-600 truncate">👤 {assigneeVal}</div>}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {woChecks && PROGRESS_STEPS.some((s) => { const av = woChecks[s.assigneeKey] ?? ""; const othersDone = PROGRESS_STEPS.some((os) => os.assigneeKey !== s.assigneeKey && (woChecks[os.assigneeKey] ?? "") !== ""); return av === "" && othersDone; }) && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600"><span className="inline-block w-3 h-3 rounded-sm border border-amber-300 bg-amber-100" />⚠ 미입력 단계는 담당자 미선택 상태입니다. 스킵이 맞다면 그대로 진행해도 됩니다.</div>
                )}
              </div>

              {/* ── CCP-1B 온장고 슬롯 지정 카드 ── */}
              {(getFoodCategory(selectedWo.food_type) === "다크" || getFoodCategory(selectedWo.food_type) === "화이트") && (
                <div className={`${card} p-4`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="font-semibold text-sm">🌡️ CCP-1B 온장고 슬롯 지정</div>
                    <span className="text-xs text-slate-400">(당류가공품·준초콜릿)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {warmerSlots
                      .filter((s) => getFoodCategory(selectedWo.food_type) === "다크" ? s.purpose === "다크컴파운드" : s.purpose === "화이트컴파운드" || s.purpose === "유동")
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={selectedWo?.status === "완료" && !isEditMode}
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            eCcpSlotId === s.id
                              ? "border-blue-500 bg-blue-600 text-white shadow-sm scale-105"
                              : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                          }`}
                          onClick={async () => {
                            const slotId = eCcpSlotId === s.id ? "" : s.id;
   // ── 이전 슬롯 처리: 기록 있으면 이동, 없으면 연결 삭제 ──
if (eCcpSlotId && eCcpSlotId !== s.id && ccpSessionId) {
  if (ccpEvents.length > 0) {
    const prevSlotName = warmerSlots.find((w) => w.id === eCcpSlotId)?.slot_name ?? eCcpSlotId;
    const newSlotName = s.slot_name;
    const ok = confirm(
      `⚠ 현재 슬롯(${prevSlotName})에 이미 온도 기록이 있습니다.\n확인 시 모든 기록이 ${newSlotName} 슬롯으로 이동됩니다.\n정말 변경하시겠습니까?`
    );
    if (!ok) return;

    // 이동 대상 슬롯에 active 세션 있는지 확인
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: existSess } = await supabase
      .from("ccp_heating_sessions")
      .select("id")
      .eq("session_date", todayStr)
      .eq("slot_id", slotId)
      .eq("status", "active")
      .maybeSingle();

    let targetSessionId: string;
    if (existSess?.id) {
      targetSessionId = existSess.id;
    } else {
      const { data: newSess } = await supabase
        .from("ccp_heating_sessions")
        .insert({ session_date: todayStr, slot_id: slotId, status: "active", created_by: currentUserIdRef.current })
        .select("id").single();
      if (!newSess?.id) { showToast("세션 생성 실패", "error"); return; }
      targetSessionId = newSess.id;
    }

    // 이벤트 이동
    await supabase.from("ccp_heating_events")
      .update({ session_id: targetSessionId })
      .eq("session_id", ccpSessionId);

    // 연결 작업지시서 이동
    await supabase.from("ccp_heating_session_orders")
      .update({ session_id: targetSessionId })
      .eq("session_id", ccpSessionId);

    // 기존 세션 삭제
    await supabase.from("ccp_heating_sessions")
      .delete()
      .eq("id", ccpSessionId);

    // state를 새 세션으로 전환
    setCcpSessionId(targetSessionId);
    setCcpSessionSlotId(slotId);

  } else {
    // 기록 없으면 이전 세션 연결만 삭제
    await supabase.from("ccp_heating_session_orders")
      .delete()
      .eq("session_id", ccpSessionId)
      .eq("work_order_ref", selectedWo!.work_order_no);
  
    // 이전 세션에 다른 연결이 없으면 세션도 삭제
    const { data: remainLinks } = await supabase
      .from("ccp_heating_session_orders")
      .select("id")
      .eq("session_id", ccpSessionId);
    if (!remainLinks || remainLinks.length === 0) {
      await supabase.from("ccp_heating_sessions")
        .delete()
        .eq("id", ccpSessionId);
    }
  }
}                       

                          
                            setECcpSlotId(slotId);
                            await supabase.from("work_orders")
                              .update({ ccp_slot_id: slotId || null, updated_at: new Date().toISOString() })
                              .eq("id", selectedWo!.id);
                          
                            // 슬롯 해제 시 CCP 상태 초기화
                            if (!slotId) {
                              setCcpSessionId(null);
                              setCcpSessionSlotId(null);
                              setCcpEvents([]);
                              return;
                            }
                          
                            // 세션 자동생성 없이 조회만
                            const today = new Date().toISOString().slice(0, 10);
                            const { data: sessData } = await supabase
                              .from("ccp_heating_sessions")
                              .select("id, slot_id")
                              .eq("session_date", today)
                              .eq("slot_id", slotId)
                              .eq("status", "active")
                              .maybeSingle();
                          
                              if (sessData?.id) {
                                setCcpSessionId(sessData.id);
                                setCcpSessionSlotId(sessData.slot_id ?? null);
                                const { data: evData } = await supabase
                                  .from("ccp_heating_events")
                                  .select("id, event_type, measured_at, temperature, is_ok, action_note")
                                  .eq("session_id", sessData.id)
                                  .order("measured_at", { ascending: true });
                                setCcpEvents((evData ?? []) as any[]);
                                const hasStart = (evData ?? []).some((e: any) => e.event_type === "start");
                                setCcpEventType(hasStart ? "mid_check" : "start");
                              
                                // 새 슬롯 세션에 이 작업지시서 연결 추가 (없는 경우에만)
                                if (selectedWo) {
                                  const { data: existLink } = await supabase
                                    .from("ccp_heating_session_orders")
                                    .select("id")
                                    .eq("session_id", sessData.id)
                                    .eq("work_order_ref", selectedWo.work_order_no)
                                    .maybeSingle();
                                  if (!existLink) {
                                    await supabase.from("ccp_heating_session_orders").insert({
                                      session_id: sessData.id,
                                      work_order_ref: selectedWo.work_order_no,
                                      client_name: selectedWo.client_name,
                                      product_name: selectedWo.product_name,
                                    });
                                  }
                                }
                              } else {
                                setCcpSessionId(null);
                                setCcpSessionSlotId(null);
                                setCcpEvents([]);
                                setCcpEventType("start");
                              }  
                          }}
       



                        >
                          {s.slot_name}
                          <span className="ml-1 text-[10px] opacity-70">({s.purpose})</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}


              {/* ── CCP-1B 온도 기록 카드 ── */}
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-semibold text-sm">🌡️ CCP-1B 온도 기록</div>
                    {ccpSessionId ? (
                      <div className="mt-0.5 text-xs text-slate-400">
                        슬롯: {warmerSlots.find((s) => s.id === (selectedWo.ccp_slot_id ?? eCcpSlotId))?.slot_name ?? "—"}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-xs text-amber-500">
                        ⚠ {selectedWo.ccp_slot_id ? "세션 로딩 중..." : "위의 슬롯 지정에서 온장고를 선택하면 기록할 수 있습니다"}
                      </div>
                    )}
                  </div>

                </div>

                {/* 입력 폼 - 항상 표시 */}
                {(ccpSessionId || eCcpSlotId) && (
                  <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-3">
                    {/* 유형 탭 */}
                    <div>
                      <div className="mb-1 text-xs text-slate-500">유형</div>
                      <div className="flex flex-wrap gap-1">
                      {([
  { value: "material_in",  label: "원료투입", cls: "bg-green-100 border-green-400 text-green-800" },
  { value: "start",        label: "시작",     cls: "bg-blue-100 border-blue-400 text-blue-800" },
  { value: "mid_check",    label: "중간점검", cls: "bg-slate-100 border-slate-400 text-slate-700" },
  { value: "end",          label: "종료",     cls: "bg-purple-100 border-purple-400 text-purple-800" },
  { value: "material_out", label: "원료소진", cls: "bg-orange-100 border-orange-400 text-orange-800" },
  { value: "move",         label: "슬롯이동", cls: "bg-teal-100 border-teal-400 text-teal-800" },
] as { value: string; label: string; cls: string }[]).map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                              ccpEventType === t.value
                                ? t.cls + " shadow-sm scale-105"
                                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                            }`}
                            onClick={() => setCcpEventType(t.value)}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div>
                        <div className="mb-1 text-xs text-slate-500">측정시각 (HHmm)</div>
                        <input
                          className={inp}
                          inputMode="numeric"
                          placeholder="예: 1430"
                          maxLength={4}
                          value={ccpTime}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
                            setCcpTime(raw);
                          }}
                        />
                        {ccpTime.length === 4 && (
                          <div className="mt-0.5 text-xs text-slate-400 text-right">
                            {ccpTime.slice(0, 2)}:{ccpTime.slice(2, 4)}
                          </div>
                        )}
                      </div>
                      {!["move", "material_in", "material_out"].includes(ccpEventType) && (
  <>
    <div>
      <div className="mb-1 text-xs text-slate-500">온도 (40~50°C)</div>
                            <input className={inpR} inputMode="numeric" placeholder="예: 45.0" value={ccpTemp}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g, "");
                                if (!raw) { setCcpTemp(""); return; }
                                // 3자리 이상 입력 시 자동 소수점: 451 → 45.1
                                let v: string;
                                if (raw.length >= 3) {
                                  const intPart = raw.slice(0, -1);
                                  const decPart = raw.slice(-1);
                                  v = `${intPart}.${decPart}`;
                                } else {
                                  v = raw;
                                }
                                setCcpTemp(v);
                                const n = Number(v);
                                if (raw.length >= 3) setCcpIsOk(n >= 40 && n <= 50);
                              }} />
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-slate-500">판정</div>
                            <select className={`${inp} ${ccpIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
                              value={ccpIsOk ? "ok" : "ng"} onChange={(e) => setCcpIsOk(e.target.value === "ok")}>
                              <option value="ok">✅ 적합</option>
                              <option value="ng">❌ 부적합</option>
                            </select>
                          </div>
                        </>
                      )}
                      {/* 슬롯이동 선택 시 이동 대상 슬롯 탭 */}
                      {ccpEventType === "move" && (
                        <div className="col-span-2 md:col-span-4">
                          <div className="mb-1 text-xs text-slate-500">이동할 슬롯 *</div>
                          <div className="flex flex-wrap gap-2">
                            {warmerSlots.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${
                                  ccpMoveTargetSlotId === s.id
                                    ? "border-teal-500 bg-teal-600 text-white shadow-sm scale-105"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50"
                                }`}
                                onClick={() => setCcpMoveTargetSlotId(ccpMoveTargetSlotId === s.id ? "" : s.id)}
                              >
                                {s.slot_name}
                                <span className="ml-1 text-[10px] opacity-70">({s.purpose})</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {!["move", "material_in"].includes(ccpEventType) && !ccpIsOk && (
                      <div>
                        <div className="mb-1 text-xs text-red-600 font-semibold">⚠ 한계기준 이탈 — 조치사항 *</div>
                        <input className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm focus:outline-none" value={ccpActionNote} onChange={(e) => setCcpActionNote(e.target.value)} placeholder="온도 이탈 조치 내용" />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={ccpSaving} onClick={saveCcpEvent}>{ccpSaving ? "저장 중..." : "💾 기록"}</button>
                    </div>
                  </div>
                )}

                {/* 기록 테이블
                     - 세션 원래 슬롯 === 작업지시서 슬롯: 전체 기록 표시 (원래 작업지시서)
                     - 세션 슬롯 !== 작업지시서 슬롯: 마지막 슬롯이동부터 표시 (이동 후 연결된 작업지시서) */}
                {(() => {
                  const sorted = [...ccpEvents].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
                  const mySlotName = warmerSlots.find((s) => s.id === (eCcpSlotId || selectedWo.ccp_slot_id))?.slot_name ?? "";
                  // 내 슬롯으로 도착한 이동 인덱스 (시작점)
                  const arriveMoveIdx = mySlotName
                    ? sorted.reduce((found, e, i) => e.event_type === "move" && (e.action_note ?? "").endsWith(`→ ${mySlotName}`) ? i : found, -1)
                    : -1;
                  // 내 슬롯에서 떠나는 첫 번째 이동 인덱스 (끝점) - 도착 이후에서만 찾기
                  const startSearch = arriveMoveIdx >= 0 ? arriveMoveIdx + 1 : 0;
                  const departMoveIdx = mySlotName
                    ? sorted.slice(startSearch).reduce((found, e, i) => e.event_type === "move" && (e.action_note ?? "").startsWith(`${mySlotName} →`) ? startSearch + i : found, -1)
                    : -1;
                  // 시작: 도착 이동부터 / 끝: 떠나는 이동까지 (포함)
                  const startIdx = arriveMoveIdx >= 0 ? arriveMoveIdx : 0;
                  const endIdx = departMoveIdx >= 0 ? departMoveIdx + 1 : sorted.length;
                  const visibleEvents = sorted.slice(startIdx, endIdx);
                  return visibleEvents.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-400">
                    {"기록된 온도가 없습니다."}
                  </div>
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
                        {visibleEvents.map((ev, idx) => {
                          const isNG = ev.is_ok === false;
                          const isEditing = ccpEditingId === ev.id;
                          const needsTemp = !["move", "material_in", "material_out"].includes(ev.event_type);
                          return (
                            <tr key={ev.id} className={`border-b border-slate-100 transition-colors ${isEditing ? "bg-blue-50" : isNG ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                              {/* 시각 */}
                              <td className="py-2 px-3 font-mono text-sm text-slate-700 whitespace-nowrap">
                                {isEditing ? (
                                  <input
                                    className="w-24 rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none"
                                    inputMode="numeric" placeholder="HHmm" maxLength={4}
                                    value={ccpEditTime}
                                    onChange={(e) => setCcpEditTime(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                                  />
                                ) : ev.measured_at.slice(11, 16)}
                              </td>
                              {/* 유형 */}
                              <td className="py-2 px-3 whitespace-nowrap">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ccpEventBadgeCls(ev.event_type)}`}>{CCP_EVENT_LABELS[ev.event_type] ?? ev.event_type}</span>
                              </td>
                              {/* 온도 */}
                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                {isEditing && needsTemp ? (
                                  <input className="w-20 rounded-lg border border-blue-300 px-2 py-1 text-xs text-right tabular-nums focus:outline-none"
                                    inputMode="decimal" value={ccpEditTemp}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/[^\d]/g, "");
                                      if (!raw) { setCcpEditTemp(""); return; }
                                      let v: string;
                                      if (raw.length >= 3) {
                                        const intPart = raw.slice(0, -1);
                                        const decPart = raw.slice(-1);
                                        v = `${intPart}.${decPart}`;
                                      } else {
                                        v = raw;
                                      }
                                      setCcpEditTemp(v);
                                      if (raw.length >= 3) setCcpEditIsOk(Number(v) >= 40 && Number(v) <= 50);
                                    }} />
                                ) : ev.temperature != null ? (
                                  <span className={`text-sm font-bold tabular-nums ${isNG ? "text-red-600" : "text-blue-700"}`}>{ev.temperature}°C</span>
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                              {/* 판정 */}
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                {isEditing && needsTemp ? (
                                  <select className={`rounded-lg border px-1.5 py-1 text-xs focus:outline-none ${ccpEditIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
                                    value={ccpEditIsOk ? "ok" : "ng"} onChange={(e) => setCcpEditIsOk(e.target.value === "ok")}>
                                    <option value="ok">O 적합</option>
                                    <option value="ng">X 부적합</option>
                                  </select>
                                ) : ev.is_ok != null ? (
                                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ev.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>{ev.is_ok ? "O" : "X"}</span>
                                ) : <span className="text-slate-300 text-xs">—</span>}
                              </td>
                              {/* 조치/이동슬롯 */}
                              <td className="py-2 px-3 text-xs">
                                {isEditing ? (
                                  <input className="w-full rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none"
                                    value={ccpEditActionNote} onChange={(e) => setCcpEditActionNote(e.target.value)} placeholder="조치사항" />
                                ) : ev.event_type === "move" && ev.action_note ? (
                                  <span className="font-semibold text-teal-700">{ev.action_note}</span>
                                ) : (
                                  <span className="text-red-600">{ev.action_note ?? ""}</span>
                                )}
                              </td>
                              {/* 수정/삭제 버튼 */}
                              <td className="py-2 px-2 text-center whitespace-nowrap">
                                {isEditing ? (
                                  <div className="flex gap-1">
                                    <button className="rounded-lg border border-blue-400 bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                      disabled={ccpEditSaving} onClick={() => saveCcpEdit(ev)}>
                                      {ccpEditSaving ? "..." : "저장"}
                                    </button>
                                    <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50"
                                      onClick={() => setCcpEditingId(null)}>취소</button>
                                  </div>
                                ) : (
                                  <div className="flex gap-1">
                                    <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
                                      onClick={() => startCcpEdit(ev)}>수정</button>
                                    <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500"
                                      onClick={() => deleteCcpEvent(ev.id)}>삭제</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {/* 요약 */}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                      {(() => {
                        const temps = visibleEvents.filter((e) => e.temperature != null).map((e) => e.temperature as number);
                        const ngCount = visibleEvents.filter((e) => e.is_ok === false).length;
                        return (
                          <>
                            <span>측정 {temps.length}회</span>
                            {temps.length > 0 && <span>최저 <b className={Math.min(...temps) < 40 ? "text-red-500" : ""}>{Math.min(...temps)}°C</b></span>}
                            {temps.length > 0 && <span>최고 <b className={Math.max(...temps) > 50 ? "text-red-500" : ""}>{Math.max(...temps)}°C</b></span>}
                            {ngCount > 0 && <span className="text-red-500 font-semibold">⚠ 이탈 {ngCount}회</span>}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
                })()}
              </div>

              {/* 납기일별 생산 입력 카드 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between"><div className="font-semibold text-sm">🏭 납기일별 생산 입력</div><div className="text-xs text-slate-400">{isEditMode ? "✏️ 수정 모드" : "수정 버튼을 눌러 편집하세요"}</div></div>
                {(selectedWo.work_order_items ?? []).length === 0 ? <div className="py-4 text-center text-sm text-slate-400">납기일별 항목이 없습니다.</div> : (
                  <div className="space-y-3">
                    {(selectedWo.work_order_items ?? []).slice().sort((a, b) => a.delivery_date.localeCompare(b.delivery_date)).filter((item) => { const name = (item.sub_items ?? [])[0]?.name ?? ""; return !name.startsWith("성형틀") && !name.startsWith("인쇄제판"); }).map((item) => {
                      const pi = prodInputs[item.id] ?? { actual_qty: "", unit_weight: "", expiry_date: "" };
                      const actualQty = toInt(pi.actual_qty); const unitWeight = toNum(pi.unit_weight);
                      const totalWeight = actualQty > 0 && unitWeight > 0 ? actualQty * unitWeight : null;
                      const isDone = !!(pi.actual_qty && pi.unit_weight && pi.expiry_date);
                      return (
                        <div key={item.id} className={`rounded-2xl border p-3 ${isDone ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div><div className="font-semibold text-sm">📅 납기일: <span className="tabular-nums">{item.delivery_date}</span></div>{(item.sub_items ?? [])[0]?.name ? <div className="mt-0.5 text-sm font-medium text-slate-700">{(item.sub_items[0]).name}</div> : null}</div>
                            <div className="flex items-center gap-2 text-xs"><span className={pill}>주문 {fmt(item.order_qty)}개</span>{isDone ? <span className="rounded-full bg-green-100 border border-green-200 px-2 py-0.5 text-xs font-semibold text-green-700">완료</span> : null}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                            <div><div className="mb-1 text-xs text-slate-500">출고수량 (실생산)</div><input className={inpR} inputMode="numeric" value={pi.actual_qty} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setProdInputs((prev) => ({ ...prev, [item.id]: { ...pi, actual_qty: e.target.value.replace(/[^\d]/g, "") } }))} /><div className="mt-1 text-xs text-slate-400">주문수량: <span className="font-semibold text-slate-600">{fmt(item.order_qty)}개</span></div></div>
                            <div><div className="mb-1 text-xs text-slate-500">개당 중량 (g)</div><input className={inpR} inputMode="decimal" value={pi.unit_weight} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setProdInputs((prev) => ({ ...prev, [item.id]: { ...pi, unit_weight: e.target.value.replace(/[^\d.]/g, "") } }))} /></div>
                            <div><div className="mb-1 text-xs text-slate-500">총 중량 (자동)</div><div className={`rounded-xl border px-3 py-2 text-sm text-right tabular-nums font-semibold ${totalWeight ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-100 text-slate-400"}`}>{totalWeight ? fmt(Math.round(totalWeight)) + "g" : "—"}</div></div>
                            <div>
                              <div className="mb-1 flex items-center justify-between"><span className="text-xs text-slate-500">소비기한</span><button type="button" disabled={selectedWo?.status === "완료" && !isEditMode} className={`rounded-lg border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 ${selectedWo?.status === "완료" && !isEditMode ? "opacity-40 cursor-not-allowed" : ""}`} onClick={() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1); const ymd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; setProdInputs((prev) => ({ ...prev, [item.id]: { ...pi, expiry_date: ymd } })); }}>+1년-1일</button></div>
                              <input type="date" className={inp} value={pi.expiry_date} disabled={selectedWo?.status === "완료" && !isEditMode} onChange={(e) => setProdInputs((prev) => ({ ...prev, [item.id]: { ...pi, expiry_date: e.target.value } }))} />
                            </div>
                          </div>
                          {(item.images ?? []).length > 0 ? <ItemImages images={item.images ?? []} logoSpec={selectedWo.logo_spec} /> : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 하단 버튼 */}
              <div className={`${card} p-4 flex gap-3`}>
                {selectedWo.status !== "완료" && !isEditMode ? (
                  <button className="flex-1 rounded-xl border border-green-500 bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-60 disabled:cursor-not-allowed" onClick={markProductionComplete} disabled={isCompleting}>
                    {isCompleting ? "⏳ 처리 중..." : "✅ 생산완료 처리 (기본정보 · 담당자 · 생산입력 저장 포함)"}
                  </button>
                ) : selectedWo.status === "완료" && !isEditMode ? (
                  <button className="rounded-xl border border-blue-400 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 active:bg-blue-200" onClick={() => setIsEditMode(true)}>✏️ 수정</button>
                ) : (
                  <>
                    <button className="flex-1 rounded-xl border border-blue-500 bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 active:bg-blue-800"
                      onClick={async () => {
                        if (!selectedWo) return;
                        try {
                          if (isAdminOrSubadmin) {
                            const { error } = await supabase.from("work_orders").update({ sub_name: eSubName.trim() || null, product_name: eProductName.trim(), food_type: eFoodType.trim() || null, logo_spec: eLogoSpec.trim() || null, thickness: eThickness || null, delivery_method: eDeliveryMethod || null, packaging_type: ePackagingType || null, tray_slot: ePackagingType === "트레이" ? eTraySlot : null, package_unit: ePackageUnit || null, mold_per_sheet: eMoldPerSheet ? Number(eMoldPerSheet) : null, note: eNote.trim() || null, reference_note: eReferenceNote.trim() || null, updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
                            if (error) { showToast("❌ 수정 실패: " + error.message, "error"); return; }
                          }
                          if (woChecks) {
                            const { error } = await supabase.from("work_orders").update({ assignee_transfer: woChecks.assignee_transfer || null, assignee_print_check: woChecks.assignee_print_check || null, assignee_production: woChecks.assignee_production || null, assignee_input: woChecks.assignee_input || null, updated_at: new Date().toISOString() }).eq("id", selectedWo.id);
                            if (error) { showToast("❌ 수정 실패: " + error.message, "error"); return; }
                          }
                          const items = (selectedWo.work_order_items ?? []).filter((item) => { const name = (item.sub_items ?? [])[0]?.name ?? ""; return !name.startsWith("성형틀") && !name.startsWith("인쇄제판"); });
                          for (const item of items) {
                            const pi = prodInputs[item.id];
                            if (!pi || (!pi.actual_qty && !pi.unit_weight && !pi.expiry_date)) continue;
                            const { error } = await supabase.from("work_order_items").update({ actual_qty: pi.actual_qty ? toInt(pi.actual_qty) : null, unit_weight: pi.unit_weight ? toNum(pi.unit_weight) : null, expiry_date: pi.expiry_date || null }).eq("id", item.id);
                            if (error) { showToast("❌ 수정 실패: " + error.message, "error"); return; }
                          }
                          showToast("✅ 수정완료!"); setIsEditMode(false);
                          if (selectedWo.status === "완료") await triggerPdfUpload(selectedWo, eProductName ?? "품목미상", eFoodType ?? "", eLogoSpec ?? "");
                          await loadWoList();
                        } catch (e: any) { showToast("❌ 수정 오류: " + (e?.message ?? e), "error"); }
                      }}>💾 수정 저장</button>
                    <button className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50" onClick={() => { setIsEditMode(false); applySelection(selectedWo); }}>취소</button>
                  </>
                )}
              </div>

            </div>
          ) : (
            <div className={`${card} flex items-center justify-center p-12`}>
              <div className="text-center text-slate-400">
                <div className="text-4xl mb-3">📋</div>
                <div className="text-sm">왼쪽 목록에서 작업지시서를 선택하거나<br/>📦 재고생산 버튼으로 새 작업지시서를 등록하세요</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {printOpen && selectedWo ? (
  <WoPrintModal
    wo={selectedWo}
    onClose={() => setPrintOpen(false)}
    employees={employees}
  />
) : null}
    </div>
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
  if (signedUrls.length === 0) return <div className="mt-2 text-xs text-slate-400">이미지 로딩 중...</div>;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {signedUrls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-slate-200 bg-white p-1 hover:border-blue-300 transition-colors">
          <img src={url} alt={`디자인 ${i + 1}`} style={size ? { width: size.w, height: size.h, objectFit: "contain" } : { width: 80, height: 80, objectFit: "cover" }} className="rounded-lg" />
          {logoSpec ? <div className="mt-1 text-center text-[10px] text-slate-400">{logoSpec}</div> : null}
        </a>
      ))}
    </div>
  );
}

// ─────────────────────── 유틸 함수 ───────────────────────
function isSpecialItem(itemName: string): boolean {
  const n = String(itemName ?? "").trim();
  return n.startsWith("성형틀") || n.startsWith("인쇄제판");
}

function parseLogoSize(logoSpec: string | null): { width: string; height: string } | null {
  if (!logoSpec) return null;
  const m = logoSpec.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i);
  if (!m) return null;
  const unit = m[3] ?? "mm";
  return { width: `${m[1]}${unit}`, height: `${m[2]}${unit}` };
}

// ─────────────────────── WoPrintModal (trade-client 버전) ───────────────────────
function WoPrintModal({ wo, onClose, employees }: {
  wo: WorkOrderRow; onClose: () => void; employees: { id: string; name: string | null }[];
}) {
  const items = (wo.work_order_items ?? [])
    .slice()
    .sort((a, b) => (a.barcode_no ?? "").localeCompare(b.barcode_no ?? ""))
    .filter((i) => !isSpecialItem((i.sub_items ?? [])[0]?.name || ""));
  const totalOrder = items.reduce((s, i) => s + (i.order_qty ?? 0), 0);

  const [itemNotes, setItemNotes] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of items) {
      if (item.note) { init[item.id] = item.note; continue; }
      const foodType = wo.food_type ?? "";
      const qty = item.order_qty ?? 0;
      const mold = wo.mold_per_sheet ?? 0;
      const isChocBase = foodType.includes("초콜릿중간재");
      const isNeoColor = foodType.includes("네오컬러");
      if (!isChocBase && mold > 0 && qty > 0) {
        if (isNeoColor) {
          const perRow = mold === 108 ? 9 : mold === 88 ? 8 : mold === 66 ? 6 : mold === 63 ? 7 : Math.round(Math.sqrt(mold));
          const buffer = mold === 63 || mold === 66 ? 20 : 30;
          const totalNeeded = qty + buffer;
          const sheets = totalNeeded / mold;
          const fullSheets = Math.floor(sheets);
          const remainder = sheets - fullSheets;
          const extraRows = remainder > 0 ? Math.ceil(remainder * mold / perRow) : 0;
          const totalProduced = (fullSheets * mold) + (extraRows * perRow);
          init[item.id] = extraRows > 0
            ? `전사지: ${fullSheets}장 ${extraRows}줄  참고: ${totalProduced.toLocaleString("ko-KR")}개`
            : `전사지: ${fullSheets}장  참고: ${(fullSheets * mold).toLocaleString("ko-KR")}개`;
        } else {
          const sheets2 = Math.ceil(qty / mold);
          init[item.id] = `전사지: ${sheets2}장  참고: ${(sheets2 * mold).toLocaleString("ko-KR")}개`;
        }
        const needsLabel = (wo.packaging_type ?? "").includes("벌크");
        if (needsLabel) {
          const labelBuffer = mold === 63 || mold === 66 ? 20 : 30;
          const labelQty = Math.ceil((qty + labelBuffer) / (6 * mold));
          init[item.id] = init[item.id] + `  라벨: ${labelQty}장`;
        }
      } else {
        init[item.id] = item.note ?? "";
      }
    }
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [signedImages, setSignedImages] = useState<string[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [signedItemImagesMap, setSignedItemImagesMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    async function resolveImages() {
      const rawUrls = wo.images ?? [];
      if (rawUrls.length > 0) {
        const signedUrls = await resolveSignedImageUrls(rawUrls, supabase);
        setSignedImages(signedUrls);
      } else {
        setSignedImages([]);
      }
      const itemImagesMap: Record<string, string[]> = {};
      for (const item of (wo.work_order_items ?? [])) {
        const rawItemUrls: string[] = (item as any).images ?? [];
        if (rawItemUrls.length === 0) continue;
        const paths = rawItemUrls.map((v: string) => {
          if (v.startsWith("http")) { const m = v.match(/work-order-images\/(.+?)(\?|$)/); return m ? m[1] : null; }
          return v;
        }).filter(Boolean) as string[];
        if (paths.length === 0) continue;
        const { data } = await supabase.storage.from("work-order-images").createSignedUrls(paths, 60 * 60);
        if (data) itemImagesMap[item.id] = data.map((d: any) => d.signedUrl);
      }
      setSignedItemImagesMap(itemImagesMap);
      setImagesLoading(false);
    }
    resolveImages();
  }, [wo.images]); // eslint-disable-line

  const woWithSigned = { ...wo, images: imagesLoading ? (wo.images ?? []) : signedImages };

  async function saveAndPrint() {
    setSaving(true);
    for (const item of items) {
      const newNote = itemNotes[item.id] ?? "";
      if (newNote !== (item.note ?? "")) {
        await supabase.from("work_order_items").update({ note: newNote || null }).eq("id", item.id);
      }
    }
    setSaving(false);
    doPrint();
  }

  function doPrint() {
    const content = document.getElementById("wo-print-preview-inner");
    if (!content) return;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:none;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    const _san = (s: string) => (s ?? "").replace(/[\\/:*?"<>|]/g, "").trim();
    const _orderDate = wo.order_date ?? "";
    const _datePart = _orderDate.slice(2,4) + _orderDate.slice(5,7) + _orderDate.slice(8,10);
    const EXCLUDE_PREFIXES = ["성형틀", "인쇄제판", "아이스박스"];
    const _visItems = (wo.work_order_items ?? []).filter((i: any) => {
      const n = (i.sub_items ?? [])[0]?.name ?? "";
      return !EXCLUDE_PREFIXES.some(p => n.startsWith(p));
    });
    const _itemNames = _visItems
      .map((i: any) => _san((i.sub_items ?? [])[0]?.name ?? ""))
      .filter(Boolean).join("_");
    const _logoSpec = (wo.logo_spec ?? "")
      .replace(/[xX×*]/g, "-").replace(/mm/gi, "")
      .replace(/[\\/:?"<>|]/g, "").trim();
    const _title = [
      "작업지시서", _datePart, _san(wo.client_name),
      wo.sub_name ? _san(wo.sub_name) : "",
      _logoSpec,
      _itemNames ? `(${_itemNames}${wo.food_type ? "-" + _san(wo.food_type) : ""})` : ""
    ].filter(Boolean).join("-");

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${_title}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      <style>@page{size:A4 portrait;margin:12mm 14mm;}body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:10pt;color:#111;}*{box-sizing:border-box;}img{max-width:none;}div[style*="overflow:hidden"] img,div[style*="overflow: hidden"] img{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:cover!important;object-position:top left!important;}textarea{border:1px solid #cbd5e1!important;background:#fff!important;}</style>
    </head><body>${content.innerHTML}
    <script>window.onload=function(){if(typeof JsBarcode!=="undefined"){document.querySelectorAll("svg[data-barcode]").forEach(function(el){JsBarcode(el,el.getAttribute("data-barcode"),{format:"CODE128",displayValue:false,width:2,height:26,margin:0});});}window.print();};<\/script>
    </body></html>`);
    doc.close();
    const _origTitle = document.title;
    document.title = _title;
    setTimeout(() => { document.title = _origTitle; onClose(); }, 1500);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", background: "#f1f5f9" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#1e3a5f", color: "#fff", flexShrink: 0 }}>
        <div style={{ fontWeight: "bold", fontSize: "14pt" }}>작업지시서 인쇄 미리보기</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={saveAndPrint} disabled={saving} style={{ padding: "8px 20px", background: saving ? "#94a3b8" : "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11pt", fontWeight: "bold", cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "저장 중..." : "🖨️ 인쇄"}
          </button>
          <button onClick={onClose} style={{ padding: "8px 16px", background: "#64748b", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11pt", cursor: "pointer" }}>닫기</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "20px", display: "flex", justifyContent: "center" }}>
        <div style={{ background: "#fff", width: "210mm", minHeight: "297mm", padding: "12mm 14mm", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}>
          <div id="wo-print-preview-inner">
            <WoPrintContent
              wo={woWithSigned} items={items} totalOrder={totalOrder}
              itemNotes={itemNotes} imagesLoading={imagesLoading}
              signedItemImagesMap={signedItemImagesMap}
              onItemNoteChange={(id, val) => setItemNotes((prev) => ({ ...prev, [id]: val }))}
              isReorder={wo.is_reorder}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function WoPrintContent({ wo, items, totalOrder, itemNotes, imagesLoading, signedItemImagesMap, onItemNoteChange, isReorder }: {
  wo: WorkOrderRow; items: WoItemRow[]; totalOrder: number;
  itemNotes: Record<string, string>; imagesLoading?: boolean;
  signedItemImagesMap?: Record<string, string[]>;
  onItemNoteChange: (itemId: string, value: string) => void;
  isReorder: boolean;
}) {
  const f = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("ko-KR");
  const thS: React.CSSProperties = { background: "#f8fafc", border: "1px solid #cbd5e1", padding: "3px 6px", fontWeight: "bold", fontSize: "11pt", color: "#374151", whiteSpace: "nowrap", width: "80px" };
  const tdS: React.CSSProperties = { border: "1px solid #cbd5e1", padding: "3px 8px", fontSize: "11pt" };
  const cellBase: React.CSSProperties = { border: "1px solid #cbd5e1", fontSize: "8.5pt", verticalAlign: "middle", padding: "4px 6px" };
  const cellHead: React.CSSProperties = { ...cellBase, background: "#f1f5f9", fontWeight: "bold", fontSize: "8pt", textAlign: "center", whiteSpace: "nowrap" };
  const statusRows = [
    { label: "전사인쇄", checked: wo.status_transfer },
    { label: "인쇄검수", checked: wo.status_print_check },
    { label: "생산완료", checked: wo.status_production },
    { label: "입력완료", checked: wo.status_input },
  ];
  const visibleItems = items.filter((i) => !isSpecialItem((i.sub_items ?? [])[0]?.name || ""));
  const deliveryDate = items[0]?.delivery_date ?? wo.order_date;
  const isMultiItem = visibleItems.length > 1;
  const productNameDisplay = (() => {
    const names = visibleItems.map((i) => (i.sub_items ?? [])[0]?.name).filter(Boolean) as string[];
    if (names.length === 0) return wo.product_name;
    if (names.length === 1) return names[0];
    return `${names[0]} 외 ${names.length - 1}건`;
  })();

  return (
    <div style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: "10pt", color: "#111", background: "#fff" }}>
      <div style={{ textAlign: "center", fontSize: "8.5pt", color: "#555", marginBottom: "4px", letterSpacing: "2px" }}>성실! 신뢰! 화합!</div>
      <div style={{ textAlign: "center", fontSize: "17pt", fontWeight: "bold", letterSpacing: "6px", marginBottom: "8px", borderBottom: "2px solid #111", paddingBottom: "6px" }}>
        작 업 지 시 서
        <span style={{ marginLeft: "14px", fontSize: "10pt", fontWeight: "bold", letterSpacing: "0px", padding: "2px 10px", borderRadius: "12px", verticalAlign: "middle", background: isReorder ? "#fef3c7" : "#dbeafe", color: isReorder ? "#b45309" : "#1d4ed8", border: `1px solid ${isReorder ? "#fcd34d" : "#93c5fd"}` }}>
          {isReorder ? "재주문" : "신규"}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px" }}>
        <tbody>
          <tr><td style={thS}>거래처명</td><td style={tdS}>{wo.client_name}{wo.sub_name ? ` (${wo.sub_name})` : ""}</td><td style={thS}>납기일</td><td style={{ ...tdS, fontWeight: "bold" }}>{deliveryDate}{deliveryDate ? ` (${["일","월","화","수","목","금","토"][new Date(deliveryDate + "T00:00:00+09:00").getDay()]})` : ""}</td></tr>
          <tr><td style={thS}>제품명</td><td style={tdS} colSpan={3}>{productNameDisplay}</td></tr>
          <tr><td style={thS}>식품유형</td><td style={tdS}>{wo.food_type ?? "—"}</td><td style={thS}>두께</td><td style={tdS}>{wo.thickness ?? "—"}</td></tr>
          <tr><td style={thS}>규격(로고)</td><td style={tdS}>{wo.logo_spec ?? "—"}</td><td style={thS}>포장방법</td><td style={tdS}>{wo.packaging_type ?? "—"}{wo.packaging_type === "트레이" && wo.tray_slot ? ` / ${wo.tray_slot}` : ""}</td></tr>
          <tr><td style={thS}>포장단위</td><td style={tdS}>{wo.package_unit ?? "—"}</td><td style={thS}>장/성형틀</td><td style={tdS}>{wo.mold_per_sheet ? `${wo.mold_per_sheet}개` : "—"}</td></tr>
          <tr><td style={thS}>납품방법</td><td style={tdS}>{wo.delivery_method ?? "—"}</td><td style={thS}>주문일</td><td style={tdS}>{(() => { const d = wo.order_date; return d ? `${d} (${["일","월","화","수","목","금","토"][new Date(d + "T00:00:00+09:00").getDay()]})` : ""; })()}</td></tr>
          <tr><td style={thS}>지시번호</td><td style={tdS} colSpan={3}>{wo.work_order_no}</td></tr>
          {wo.note ? <tr><td style={thS}>비고</td><td style={tdS} colSpan={3}>{wo.note}</td></tr> : null}
          {wo.reference_note ? <tr><td style={thS}>참고사항</td><td style={tdS} colSpan={3}>{wo.reference_note}</td></tr> : null}
        </tbody>
      </table>
      <div style={{ fontWeight: "bold", fontSize: "9pt", marginBottom: "3px", marginTop: "6px", borderLeft: "3px solid #2563eb", paddingLeft: "5px" }}>진행상태 확인</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px" }}>
        <tbody><tr>{statusRows.map(({ label, checked }) => (
          <td key={label} style={{ border: "1px solid #cbd5e1", padding: "3px 6px", textAlign: "center", width: "25%" }}>
            <span style={{ fontSize: "8pt", color: "#555" }}>{label} </span><span style={{ fontSize: "10pt" }}>{checked ? "✅" : "☐"}</span>
          </td>
        ))}</tr></tbody>
      </table>
      <div style={{ fontWeight: "bold", fontSize: "9pt", marginBottom: "6px", borderLeft: "3px solid #2563eb", paddingLeft: "5px" }}>
        {isMultiItem ? `품목별 생산 현황 (총 ${visibleItems.length}건)` : "생산 현황"}
      </div>
      {items.filter((item) => !isSpecialItem((item.sub_items ?? [])[0]?.name || "")).map((item, idx, arr) => {
        const aq = item.actual_qty ?? null, uw = item.unit_weight ?? null;
        const tw = aq && uw ? aq * uw : null;
        const exp = item.expiry_date ?? "", itemName = (item.sub_items ?? [])[0]?.name || "—";
        const itemBarcode = item.barcode_no ?? null;
        const noteVal = itemNotes[item.id] ?? (item.note ?? "");
        return (
          <div key={item.id} style={{ marginBottom: idx < arr.length - 1 ? "10px" : "6px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #94a3b8", borderBottom: "none", padding: "5px 10px", width: "30%", background: "#f1f5f9", color: "#111", fontWeight: "bold", fontSize: "9pt", verticalAlign: "middle", whiteSpace: "nowrap" }}>{itemName}</td>
                  <td style={{ border: "1px solid #94a3b8", borderBottom: "none", borderLeft: "none", padding: "5px 10px", background: "#f8fafc", verticalAlign: "middle" }}>
                    {itemBarcode ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "8pt", color: "#444", whiteSpace: "nowrap" }}>{itemBarcode}</span>
                        <svg data-barcode={itemBarcode} style={{ height: "26px", flex: 1, display: "block", minWidth: 0 }} />
                      </div>
                    ) : <span style={{ color: "#aaa", fontSize: "8pt" }}>바코드 없음</span>}
                  </td>
                </tr>
                <tr>
                  <td style={cellHead}>주문수량</td>
                  <td style={{ border: "1px solid #cbd5e1", borderLeft: "none", padding: 0 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
                      <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1", width: "14%" }}>출고수량</td>
                      <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1", width: "14%" }}>개당중량(g)</td>
                      <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1", width: "14%" }}>총중량(g)</td>
                      <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1", width: "18%" }}>소비기한</td>
                      <td style={{ ...cellHead, border: "none", width: "40%" }}>비고</td>
                    </tr></tbody></table>
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellBase, textAlign: "right", fontWeight: "bold", fontSize: "11pt", borderTop: "none" }}>{f(item.order_qty)}</td>
                  <td style={{ border: "1px solid #cbd5e1", borderLeft: "none", borderTop: "none", padding: 0 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
                      <td style={{ ...cellBase, border: "none", borderRight: "1px solid #cbd5e1", textAlign: "right", fontWeight: "bold", color: aq ? "#1d4ed8" : "#111", width: "14%" }}>{aq != null ? f(aq) : ""}</td>
                      <td style={{ ...cellBase, border: "none", borderRight: "1px solid #cbd5e1", textAlign: "right", width: "14%" }}>{uw != null ? uw : ""}</td>
                      <td style={{ ...cellBase, border: "none", borderRight: "1px solid #cbd5e1", textAlign: "right", color: tw ? "#1d4ed8" : "#999", width: "14%" }}>{tw ? f(Math.round(tw)) : ""}</td>
                      <td style={{ ...cellBase, border: "none", borderRight: "1px solid #cbd5e1", textAlign: "center", fontSize: "8pt", width: "18%" }}>{exp || ""}</td>
                      <td style={{ ...cellBase, border: "none", padding: "4px 6px", width: "40%", fontSize: "11pt", verticalAlign: "middle" }}>{noteVal}</td>
                    </tr></tbody></table>
                  </td>
                </tr>
              </tbody>
            </table>
            {/* 품목별 이미지 */}
            {(() => {
              const itemSignedUrls = signedItemImagesMap?.[item.id] ?? [];
              if (itemSignedUrls.length === 0) return null;
              const logoSize = parseLogoSize(wo.logo_spec);
              return (
                <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "flex-end" }}>
                  {imagesLoading
                    ? <div style={{ fontSize: "8pt", color: "#94a3b8", padding: "4px" }}>이미지 로딩 중...</div>
                    : itemSignedUrls.map((url, imgIdx) => (
                      <div key={imgIdx} style={{ textAlign: "center" }}>
                        <div style={{ width: logoSize ? logoSize.width : "150mm", height: logoSize ? logoSize.height : "150mm", overflow: "hidden", border: "1px solid #e2e8f0", borderRadius: "4px", display: "inline-block", flexShrink: 0, position: "relative" }}>
                          <img src={url} alt={`이미지${imgIdx+1}`} style={{ position: "absolute", top: 0, left: 0, width: logoSize ? logoSize.width : "150mm", height: logoSize ? logoSize.height : "150mm", objectFit: "cover", objectPosition: "top left", display: "block" }} />
                        </div>
                        {wo.logo_spec ? <div style={{ fontSize: "7pt", color: "#94a3b8", marginTop: "2px" }}>{wo.logo_spec}</div> : null}
                      </div>
                    ))
                  }
                </div>
              );
            })()}
          </div>
        );
      })}
      {/* wo.images 공통 이미지 */}
      {(wo.images ?? []).length > 0 ? (
        <div style={{ marginBottom: "10px" }}>
          <div style={{ fontWeight: "bold", fontSize: "9pt", marginBottom: "2px", borderLeft: "3px solid #2563eb", paddingLeft: "5px" }}>인쇄 디자인 이미지</div>
          <div style={{ fontSize: "7.5pt", color: "#94a3b8", marginBottom: "4px" }}>
            {parseLogoSize(wo.logo_spec) ? `※ 실제크기 적용 (${wo.logo_spec})` : "※ 실제크기 적용: 규격(로고스펙)에 25x25mm 형식으로 입력하세요"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {imagesLoading ? <div style={{ fontSize: "8pt", color: "#94a3b8", padding: "8px" }}>이미지 로딩 중...</div>
              : wo.images.map((url, i) => {
                const logoSize = parseLogoSize(wo.logo_spec);
                return (
                  <div key={i} style={{ width: logoSize ? logoSize.width : "150mm", height: logoSize ? logoSize.height : "150mm", overflow: "hidden", border: "1px solid #e2e8f0", borderRadius: "4px", display: "inline-block", position: "relative" }}>
                    <img src={url} alt={`디자인 ${i + 1}`} style={{ position: "absolute", top: 0, left: 0, width: logoSize ? logoSize.width : "150mm", height: logoSize ? logoSize.height : "150mm", objectFit: "cover", objectPosition: "top left", display: "block" }} />
                  </div>
                );
              })}
          </div>
        </div>
      ) : null}
    </div>
  );
}