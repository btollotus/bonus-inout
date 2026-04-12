"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

function toKSTTime(isoStr: string): string {
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50";



type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;
type WarmSlot = { id: string; slot_name: string; purpose: string };

type CcpSession = {
  id: string; session_date: string; slot_id: string; status: string; note: string | null;
  slot?: WarmSlot | null; events?: CcpEvent[]; orders?: CcpSessionOrder[];
};
type CcpEvent = {
  id: string; session_id: string; event_type: string; measured_at: string;
  temperature: number | null; is_ok: boolean | null; action_note: string | null; created_by: string | null;
};
type CcpSessionOrder = { id: string; work_order_ref: string | null; client_name: string | null; product_name: string | null };
type MetalLog = {
  id: string; log_date: string; product_name: string | null; quantity: number | null;
  start_time: string | null; end_time: string | null; fe_pass: boolean | null;
  sus_pass: boolean | null; product_pass: boolean | null; zone: string | null;
  action_note: string | null; note: string | null; created_by: string | null; approved_by: string | null;
};
type OtherHeatingLog = {
  id: string; log_date: string; work_type: string; measured_at: string;
  temperature: number | null; is_ok: boolean | null; action_note: string | null;
  note: string | null; created_by: string | null; approved_by: string | null;
};
type CompressorLog = {
  id: string; log_date: string; work_type: string; worked_at: string;
  work_hours: number | null; cumulative_hours: number | null; is_damaged: boolean;
  note: string | null; created_by: string | null; approved_by: string | null;
};
type PetStockLog = {
  id: string; log_date: string; log_type: string; quantity: number; defect_qty: number;
  note: string | null; created_by: string | null; approved_by: string | null;
};
type PetStock = { stock_raw: number; stock_coated: number; stock_sprayed_prod: number; stock_sprayed_sale: number };

const SIGN_MAP: Record<string, string> = {
  "조은미": "/sign-choem.png",
  "강미라": "/sign-kangml.png",
  "나현우": "/sign-nahw.png",
  "나미영": "/sign-namiy.png",
  "조대성": "/sign-chods.png",
  "김영각": "/sign-kimyg.png",
  "고한결": "/sign-gohg.png",
};

const PET_LOG_TYPE_LABELS: Record<string, string> = {
  incoming: "입고", coating_done: "코팅완료", spray_done_prod: "분사완료(생산용)",
  spray_done_sale: "분사완료(판매용)", print_used: "인쇄사용", sale_cut: "재단판매",
};
const CCP_EVENT_LABELS: Record<string, string> = {
  start: "시작", mid_check: "중간점검", end: "종료",
  material_in: "원료투입", material_out: "원료소진", vat_refill: "밧트교체", move: "슬롯이동",
};

function eventBadgeCls(type: string) {
  if (type === "start") return "bg-blue-100 border-blue-200 text-blue-700";
  if (type === "end") return "bg-purple-100 border-purple-200 text-purple-700";
  if (type === "material_in") return "bg-green-100 border-green-200 text-green-700";
  if (type === "material_out") return "bg-orange-100 border-orange-200 text-orange-700";
  if (type === "vat_refill") return "bg-amber-100 border-amber-200 text-amber-700";
  if (type === "move") return "bg-teal-100 border-teal-200 text-teal-700";
  return "bg-slate-100 border-slate-200 text-slate-600";
}

// ═══════════════════════════════════════════════════════════
// CCP-1B 조회 탭 — 새 구조 (ccp_slot_events + ccp_wo_events)
// 기존 Ccp1bTab 전체를 이 코드로 교체하세요
// ═══════════════════════════════════════════════════════════

export function Ccp1bTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [allSlots, setAllSlots] = useState<WarmSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // 슬롯 이벤트 (원료투입/소진/이동) — 슬롯 기준
  const [slotEvents, setSlotEvents] = useState<{
    id: string; slot_id: string; event_date: string; event_type: string;
    measured_at: string; work_order_no: string | null; action_note: string | null;
    material_type: string | null;
  }[]>([]);

  // 작업지시서 온도기록 — 작업지시서 기준
  const [woEvents, setWoEvents] = useState<{
    id: string; work_order_no: string; slot_id: string; event_type: string;
    measured_at: string; temperature: number | null; is_ok: boolean | null;
    action_note: string | null;
  }[]>([]);

  // 수정 state (wo_events 수정용)
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editTemp, setEditTemp] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editIsOk, setEditIsOk] = useState(true);
  const [editActionNote, setEditActionNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [woLabelMap, setWoLabelMap] = useState<Record<string, string>>({});
  const [slotWoMap, setSlotWoMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    supabase.from("warmer_slots").select("id,slot_name,purpose")
      .eq("is_active", true).order("slot_no")
      .then(({ data }) => setAllSlots(data ?? []));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [slotRes, woRes, woSlotRes] = await Promise.all([
      supabase.from("ccp_slot_events")
      .select("id, slot_id, event_date, event_type, measured_at, work_order_no, action_note, temperature, is_ok, material_type")
        .eq("event_date", filterDate)
        .order("measured_at", { ascending: true }),
      supabase.from("ccp_wo_events")
        .select("id, work_order_no, slot_id, event_type, measured_at, temperature, is_ok, action_note")
        .order("measured_at", { ascending: true }),
      supabase.from("work_orders")
        .select("work_order_no, client_name, sub_name, product_name, ccp_slot_id")
        .not("ccp_slot_id", "is", null)
        .eq("status", "생산중"),
    ]);

    setSlotEvents((slotRes.data ?? []) as any[]);
    const filtered = (woRes.data ?? []).filter((e: any) =>
      e.measured_at.slice(0, 10) === filterDate
    );
    setWoEvents(filtered as any[]);
// work_order_no → 표시 레이블 맵 생성
const allWoNos = [...new Set([
  ...(slotRes.data ?? []).map((e: any) => e.work_order_no).filter(Boolean),
  ...(woRes.data ?? []).map((e: any) => e.work_order_no).filter(Boolean),
  ...(woSlotRes.data ?? []).map((e: any) => e.work_order_no).filter(Boolean),
])] as string[];


if (allWoNos.length > 0) {
  const { data: woData } = await supabase
    .from("work_orders")
    .select("work_order_no, client_name, sub_name, product_name")
    .in("work_order_no", allWoNos);
  const map: Record<string, string> = {};
  for (const wo of woData ?? []) {
    const rawSecond = wo.sub_name ?? wo.product_name ?? "";
    const secondPart = rawSecond.startsWith(wo.client_name)
      ? rawSecond.slice(wo.client_name.length).replace(/^[-_\s·]+/, "")
      : rawSecond;
    const label = secondPart
      ? `${wo.client_name} · ${secondPart}`
      : wo.client_name;


    map[wo.work_order_no] = label;
  }
  setWoLabelMap(map);
}  // ← if (allWoNos.length > 0) 닫는 괄호

// slotWoMap은 if 블록 밖에서 항상 실행
const slotMap: Record<string, string[]> = {};
for (const wo of woSlotRes.data ?? []) {
  if (!wo.ccp_slot_id) continue;
  if (!slotMap[wo.ccp_slot_id]) slotMap[wo.ccp_slot_id] = [];
  slotMap[wo.ccp_slot_id].push(wo.work_order_no);
}
setSlotWoMap(slotMap);
    setLoading(false);
  }, [filterDate]); 
  useEffect(() => { loadData(); }, [loadData]);

  // 슬롯별 마지막 상태 (원료 있는지)
  function slotHasMaterial(slotId: string) {
    const events = slotEvents.filter((e) => e.slot_id === slotId)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const last = events[events.length - 1];
    return last && last.event_type !== "material_out";
  }

  // 선택된 슬롯의 슬롯 이벤트
  const selectedSlotEvents = selectedSlotId
    ? slotEvents.filter((e) => e.slot_id === selectedSlotId)
        .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    : [];

  // 선택된 슬롯에서 작업한 작업지시서 온도기록
  const selectedWoEvents = selectedSlotId
    ? woEvents.filter((e) => e.slot_id === selectedSlotId)
        .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    : [];

  // 선택된 슬롯에서 작업한 작업지시서 번호 목록
  const relatedWoNos = selectedSlotId
  ? (slotWoMap[selectedSlotId] ?? [])
  : [];

  function startEdit(ev: typeof woEvents[0]) {
    setEditingEventId(ev.id);
    setEditTemp(ev.temperature != null ? String(ev.temperature) : "");
    setEditTime(ev.measured_at.slice(11, 16));
    setEditIsOk(ev.is_ok ?? true);
    setEditActionNote(ev.action_note ?? "");
  }

  async function saveEditEvent(ev: typeof woEvents[0]) {
    if (!editTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(editTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50°C 범위여야 합니다.", "error");
    setEditSaving(true);
    const { error } = await supabase.from("ccp_wo_events").update({
      measured_at: `${filterDate}T${editTime}:00`,
      temperature: temp,
      is_ok: editIsOk,
      action_note: editActionNote.trim() || null,
    }).eq("id", ev.id);
    setEditSaving(false);
    if (error) return showToast("수정 실패: " + error.message, "error");
    showToast("✅ 수정 완료!");
    setEditingEventId(null);
    await loadData();
  }

  async function deleteWoEvent(eventId: string) {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("ccp_wo_events").delete().eq("id", eventId);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료!");
    await loadData();
  }

  async function deleteSlotEvent(eventId: string) {
    if (!confirm("이 슬롯 기록을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("ccp_slot_events").delete().eq("id", eventId);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료!");
    await loadData();
  }

  const CCP_WO_EVENT_LABELS: Record<string, string> = { start: "시작", mid_check: "중간점검", end: "종료" };
  const CCP_SLOT_EVENT_LABELS: Record<string, string> = { material_in: "원료투입", material_out: "원료소진", move: "슬롯이동", start: "시작", mid_check: "중간점검", end: "종료" };

  function woBadgeCls(type: string) {
    if (type === "start") return "bg-blue-100 border-blue-200 text-blue-700";
    if (type === "end") return "bg-purple-100 border-purple-200 text-purple-700";
    return "bg-slate-100 border-slate-200 text-slate-600";
  }
  function slotBadgeCls(type: string) {
    if (type === "material_in") return "bg-green-100 border-green-200 text-green-700";
    if (type === "material_out") return "bg-orange-100 border-orange-200 text-orange-700";
    if (type === "move") return "bg-teal-100 border-teal-200 text-teal-700";
    if (type === "start") return "bg-blue-100 border-blue-200 text-blue-700";
    if (type === "mid_check") return "bg-slate-100 border-slate-200 text-slate-600";
    if (type === "end") return "bg-purple-100 border-purple-200 text-purple-700";
    return "bg-slate-100 border-slate-200 text-slate-600";
  }

  // 슬롯 목록에서 오늘 활동있는 슬롯 구분
  const activeSlotsToday = new Set(slotEvents.map((e) => e.slot_id));

  const [slotAssignees, setSlotAssignees] = useState<Record<string, string>>({});

async function handlePrint() {
  const activeSlotIds = [...activeSlotsToday];
  if (activeSlotIds.length === 0) { window.print(); return; }

  const woNosPerSlot: Record<string, string[]> = {};
  for (const slotId of activeSlotIds) {
    const wNos = [...new Set([
      ...slotEvents.filter(e => e.slot_id === slotId).map(e => e.work_order_no).filter(Boolean) as string[],
      ...woEvents.filter(e => e.slot_id === slotId).map(e => e.work_order_no),
    ])];
    woNosPerSlot[slotId] = wNos;
  }

  const allWoNos = [...new Set(Object.values(woNosPerSlot).flat())];
  const assigneeMap: Record<string, string> = {};

  if (allWoNos.length > 0) {
    const { data } = await supabase
      .from("work_orders")
      .select("work_order_no, assignee_production")
      .in("work_order_no", allWoNos);
    for (const row of data ?? []) {
      if (row.assignee_production) assigneeMap[row.work_order_no] = row.assignee_production;
    }
  }

  const newSlotAssignees: Record<string, string> = {};
  for (const slotId of activeSlotIds) {
    for (const wNo of woNosPerSlot[slotId]) {
      if (assigneeMap[wNo]) { newSlotAssignees[slotId] = assigneeMap[wNo]; break; }
    }
  }

  setSlotAssignees(newSlotAssignees);
  setTimeout(() => window.print(), 150);
}

  return (
    <div className="space-y-4">
      {/* 날짜 필터 */}
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setSelectedSlotId(null); setEditingEventId(null); }} />
          </div>
          <button className={btn} onClick={loadData}>🔄 조회</button>
          <button className={btnSm} onClick={handlePrint}>🖨️ 인쇄</button>
        </div>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span className="font-semibold">⚠ 한계기준:</span> 준초콜릿·당류가공품 45±5°C (40~50°C), 4시간 이상 유지 / 주기: 작업시작 전, 작업 중 2시간마다, 작업종료
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* 좌: 슬롯 목록 */}
        <div className={`${card} p-4`} style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
          <div className="mb-3 font-semibold text-sm">🌡️ 슬롯 목록 — {filterDate}</div>
          {loading ? (
            <div className="py-6 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : activeSlotsToday.size === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">
              <div className="text-2xl mb-2">🌡️</div>
              <div>세션이 없습니다.</div>
              <div className="text-xs mt-1 text-slate-300">작업지시서에서 온도 기록 시 자동 생성됩니다.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {allSlots.filter((s) => activeSlotsToday.has(s.id)).map((s) => {
                const sEvents = slotEvents.filter((e) => e.slot_id === s.id);
                const wEvents = woEvents.filter((e) => e.slot_id === s.id);
                const temps = wEvents.filter((e) => e.temperature != null).map((e) => e.temperature as number);
                const hasNG = wEvents.some((e) => e.is_ok === false);
                const lastTemp = [...wEvents].sort((a, b) => b.measured_at.localeCompare(a.measured_at)).find((e) => e.temperature != null);
                const hasMaterial = slotHasMaterial(s.id);
                const woNos = [...new Set(sEvents.map((e) => e.work_order_no).filter(Boolean))];

                return (
                  <button key={s.id}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${selectedSlotId === s.id ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    onClick={() => { setSelectedSlotId(s.id); setEditingEventId(null); }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm">{s.slot_name}</div>
                      <span className={`... ${
  status === "있음" ? "bg-green-100 border-green-200 text-green-700"
  : status === "슬롯이동" ? "bg-teal-100 border-teal-200 text-teal-700"
  : "bg-slate-100 border-slate-200 text-slate-500"
}`}>
  {status === "있음" ? "원료있음" : status}
</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{s.purpose}</div>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      {lastTemp && <span className={`text-xs font-bold ${hasNG ? "text-red-600" : "text-blue-600"}`}>최근 {lastTemp.temperature}°C</span>}
                      <span className="text-[11px] text-slate-400">슬롯기록 {sEvents.length}건 · 온도기록 {wEvents.length}건</span>
                      {hasNG && <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700">⚠ 이탈</span>}
                    </div>
                    {woNos.length > 0 && (
  <div className="mt-1 text-[10px] text-slate-400 truncate">
   {woNos.map((no) => (no ? woLabelMap[no] ?? no : "")).filter(Boolean).join(", ")}
  </div>
)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 우: 슬롯 상세 */}
        {selectedSlotId ? (() => {
          const slot = allSlots.find((s) => s.id === selectedSlotId);
          return (
            <div className="space-y-3" style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
              {/* 헤더 */}
              <div className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold text-base">
                      🌡️ {slot?.slot_name}
                      <span className="ml-2 text-sm font-normal text-slate-500">({slot?.purpose})</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">{filterDate}</div>
                  </div>
                </div>

                {/* 연결된 작업지시서 */}
                {relatedWoNos.length > 0 && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">📋 이 슬롯을 사용한 작업지시서</div>
                    <div className="flex flex-wrap gap-2">
                    {relatedWoNos.map((no) => (
  <span key={no} title={no} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
    {woLabelMap[no] ?? no}
  </span>
))}
                    </div>
                  </div>
                )}
              </div>

  {/* 통합 기록 */}
  <div className={`${card} p-4`}>
                <div className="mb-3 font-semibold text-sm">🌡️ 기록</div>
                {selectedSlotEvents.length === 0 && selectedWoEvents.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b-2 border-slate-200 bg-slate-50">
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">시각</th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">유형</th>
                            <th className="py-2 px-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">온도</th>
                            <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">판정</th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">비고</th>
                            {isAdminOrSubadmin && <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500">관리</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {/* 슬롯 이벤트 (원료투입/슬롯이동 등) — 중복 제거 */}
                          {(() => {
                            const seen = new Set<string>();
                            return selectedSlotEvents
                              .filter(e => e.event_type === "material_in" || e.event_type === "material_out")
                              .filter(e => {
                                const key = `${e.measured_at}_${e.event_type}`;
                                if (seen.has(key)) return false;
                                seen.add(key); return true;
                              })
                              .map((ev, idx) => {
                                const isMove = (ev.event_type === "material_out" && ev.action_note?.startsWith("→")) || (ev.event_type === "material_in" && ev.action_note?.includes("→"));
                                const label = isMove ? "슬롯이동" : ev.event_type === "material_in" ? "원료투입" : "원료소진";
                                const badgeCls = isMove ? "bg-teal-100 border-teal-200 text-teal-700" : slotBadgeCls(ev.event_type);
                                return (
                                  <tr key={ev.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                    <td className="py-2 px-3 font-mono text-sm text-slate-700 whitespace-nowrap">{toKSTTime(ev.measured_at)}</td>
                                    <td className="py-2 px-3 whitespace-nowrap">
                                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeCls}`}>{label}</span>
                                    </td>
                                    <td className="py-2 px-3 text-right whitespace-nowrap"><span className="text-slate-300">—</span></td>
                                    <td className="py-2 px-3 text-center whitespace-nowrap"><span className="text-slate-300 text-xs">—</span></td>
                                    <td className="py-2 px-3 text-xs text-slate-500">{ev.action_note ?? ""}</td>
                                    {isAdminOrSubadmin && (
                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                        <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500"
                                          onClick={() => deleteSlotEvent(ev.id)}>삭제</button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              });
                          })()}
                          {/* 온도 기록 (시작/중간점검/종료) — 중복 제거 */}
                          {(() => {
                            const seen = new Set<string>();
                            return selectedWoEvents
                              .filter(e => {
                                const key = `${e.measured_at}_${e.event_type}`;
                                if (seen.has(key)) return false;
                                seen.add(key); return true;
                              })
                              .map((ev, idx) => {
                                const isNG = ev.is_ok === false;
                                const isEditing = editingEventId === ev.id;
                                return (
                                  <tr key={ev.id} className={`border-b border-slate-100 ${isEditing ? "bg-blue-50" : isNG ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                    <td className="py-2 px-3 font-mono text-sm text-slate-700 whitespace-nowrap">
                                      {isEditing
                                        ? <input type="time" className="w-24 rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                                        : toKSTTime(ev.measured_at)}
                                    </td>
                                    <td className="py-2 px-3 whitespace-nowrap">
                                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${woBadgeCls(ev.event_type)}`}>
                                        {CCP_WO_EVENT_LABELS[ev.event_type] ?? ev.event_type}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-right whitespace-nowrap">
                                      {isEditing
                                        ? <input className="w-20 rounded-lg border border-blue-300 px-2 py-1 text-xs text-right tabular-nums focus:outline-none" inputMode="decimal" value={editTemp} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setEditTemp(v); if (v) setEditIsOk(Number(v) >= 40 && Number(v) <= 50); }} />
                                        : ev.temperature != null
                                          ? <span className={`text-sm font-bold tabular-nums ${isNG ? "text-red-600" : "text-blue-700"}`}>{ev.temperature}°C</span>
                                          : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="py-2 px-3 text-center whitespace-nowrap">
                                      {isEditing
                                        ? <select className={`rounded-lg border px-1.5 py-1 text-xs focus:outline-none ${editIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`} value={editIsOk ? "ok" : "ng"} onChange={(e) => setEditIsOk(e.target.value === "ok")}>
                                            <option value="ok">O 적합</option><option value="ng">X 부적합</option>
                                          </select>
                                        : ev.is_ok != null
                                          ? <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ev.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>{ev.is_ok ? "O" : "X"}</span>
                                          : <span className="text-slate-300 text-xs">—</span>}
                                    </td>
                                    <td className="py-2 px-3 text-xs">
                                      {isEditing
                                        ? <input className="w-full rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none" value={editActionNote} onChange={(e) => setEditActionNote(e.target.value)} placeholder="조치사항" />
                                        : <span className={isNG ? "text-red-600" : ""}>{ev.action_note ?? ""}</span>}
                                    </td>
                                    {isAdminOrSubadmin && (
                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                        {isEditing
                                          ? <div className="flex gap-1 justify-center">
                                              <button className="rounded-lg border border-blue-400 bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={editSaving} onClick={() => saveEditEvent(ev)}>{editSaving ? "..." : "저장"}</button>
                                              <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50" onClick={() => setEditingEventId(null)}>취소</button>
                                            </div>
                                          : <div className="flex gap-1 justify-center">
                                              <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600" onClick={() => startEdit(ev)}>수정</button>
                                              <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500" onClick={() => deleteWoEvent(ev.id)}>삭제</button>
                                            </div>}
                                      </td>
                                    )}
                                  </tr>
                                );
                              });
                          })()}
                        </tbody>
                      </table>
                    </div>
                    {/* 요약 */}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      {(() => {
                        const seen = new Set<string>();
                        const deduped = selectedWoEvents.filter(e => {
                          const key = `${e.measured_at}_${e.event_type}`;
                          if (seen.has(key)) return false;
                          seen.add(key); return true;
                        });
                        const temps = deduped.filter((e) => e.temperature != null).map((e) => e.temperature as number);
                        const ngCount = deduped.filter((e) => e.is_ok === false).length;
                        const okCount = deduped.filter((e) => e.is_ok === true).length;
                        return (
                          <>
                            <span>온도 측정 <b>{temps.length}</b>회</span>
                            {okCount > 0 && <span className="text-green-600">적합 <b>{okCount}</b>회</span>}
                            {ngCount > 0 && <span className="text-red-600 font-semibold">⚠ 이탈 <b>{ngCount}</b>회</span>}
                            {temps.length > 0 && <span>최저 <b className={Math.min(...temps) < 40 ? "text-red-600" : ""}>{Math.min(...temps)}°C</b></span>}
                            {temps.length > 0 && <span>최고 <b className={Math.max(...temps) > 50 ? "text-red-600" : ""}>{Math.max(...temps)}°C</b></span>}
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })() : (
              <div className={`${card} flex items-center justify-center p-12`}>
            <div className="text-center text-slate-400">
              <div className="text-3xl mb-2">🌡️</div>
              <div className="text-sm">왼쪽 목록에서 슬롯을 선택하세요</div>
              <div className="mt-1 text-xs text-slate-300">작업지시서에서 온도 기록 시 자동으로 생성됩니다</div>
            </div>
          </div>
        )}
      </div>
    
         
{/* ── 인쇄 전용 영역 ── */}
<style>{`
  @media screen { .ccp-print-only { display: none !important; } }
  @media print {
    body * { visibility: hidden; }
    .ccp-print-only, .ccp-print-only * { visibility: visible; }
    .ccp-print-only { position: absolute; top: 0; left: 0; width: 100%; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    @page { size: A4 landscape; margin: 8mm 10mm; }
    table { page-break-inside: avoid; }
  }
`}</style>

<div className="ccp-print-only" style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: "9pt", color: "#000" }}>

{/* ① 제목 + 결재란 */}
<table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
<tbody>
  <tr>
    <td rowSpan={2} style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold", fontSize: "12pt", textAlign: "center" }}>
      중요관리점(CCP-1B) 모니터링일지<br/>
      <span style={{ fontSize: "9pt" }}>[가열공정] 일반</span><br/>
      <span style={{ fontSize: "8pt" }}>*온장고 내 보관기간 : 1개월 미만*</span>
    </td>
    <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", textAlign: "center", fontSize: "8pt", width: 36 }}>결재</td>
    <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "center", fontSize: "8pt", width: 64 }}>작성</td>
    <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "center", fontSize: "8pt", width: 64 }}>승인</td>
  </tr>
  <tr>
    <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}></td>
    <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>
      <img src="/sign-kimyg.png" style={{ height: 30, objectFit: "contain", display: "block", margin: "0 auto" }} />
    </td>
    <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>
      <img src="/sign-chods.png" style={{ height: 30, objectFit: "contain", display: "block", margin: "0 auto" }} />
    </td>
  </tr>
</tbody>
</table>

  {/* ② 작성일자 */}
  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
  <tbody>
    <tr>
    <td style={{ border: "1px solid #000", padding: "1px 6px", fontWeight: "bold", width: 80, whiteSpace: "nowrap" }}>작성일자</td>
      <td style={{ border: "1px solid #000", padding: "2px 6px" }}>
        {(() => { const d = new Date(filterDate + "T00:00:00+09:00"); return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`; })()}
      </td>
    </tr>
  </tbody>
</table>

  {/* ③ 위해요소 / 한계기준 / 주기 / 방법 */}
  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
    <tbody>
      <tr>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", whiteSpace: "nowrap", width: 56 }}>위해요소</td>
        <td colSpan={3} style={{ border: "1px solid #000", padding: "2px 6px", fontSize: "8pt" }}>병원성 미생물(리스테리아모노사이토제네스, 장출혈성대장균)</td>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", textAlign: "center", width: 60 }}>온도</td>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", textAlign: "center", width: 80 }}>시간</td>
      </tr>
      <tr>
        <td rowSpan={2} style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold" }}>한계기준</td>
        <td colSpan={3} style={{ border: "1px solid #000", padding: "2px 6px", fontSize: "8pt" }}>준초콜릿(다크컴파운드)</td>
        <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "center" }}>45±5℃</td>
        <td rowSpan={2} style={{ border: "1px solid #000", padding: "1px 6px", textAlign: "center", fontSize: "8pt", width: 100, whiteSpace: "nowrap" }}>4시간 이상 유지</td>
      </tr>
      <tr>
        <td colSpan={3} style={{ border: "1px solid #000", padding: "2px 6px", fontSize: "8pt" }}>당류가공품(화이트컴파운드)</td>
        <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "center" }}>45±5℃</td>
      </tr>
      <tr>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold" }}>주 기</td>
        <td colSpan={5} style={{ border: "1px solid #000", padding: "2px 6px", fontSize: "8pt" }}>
          작업시작 전, 작업 중 2시간마다, 작업종료
        </td>
      </tr>
      <tr>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold" }}>방 법</td>
        <td colSpan={5} style={{ border: "1px solid #000", padding: "2px 6px", fontSize: "8pt" }}>
          ◦ 중탕온도 : 바트 품온 온도 확인 &nbsp;&nbsp; ◦ 가열시간 : 4시간 이상 가열. ※ 온도계,시계는 연 1회 검·교정 실시 필요
        </td>
      </tr>
    </tbody>
  </table>

 {/* ④ 슬롯별 데이터 */}
{(() => {
  const CHUNK_SIZE = 7;

  const WO_EVENT_TYPE_LABEL: Record<string, string> = {
    start: "시작", mid_check: "중간점검", end: "종료",
  };

  const slotWoEventsDedup = (slotId: string) => {
    const seen = new Set<string>();
    return woEvents
      .filter(e => e.slot_id === slotId)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
      .filter(e => {
        const key = `${e.measured_at.slice(11,16)}_${e.temperature}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  // 슬롯 활동 여부
  function hasActivity(slotId: string) {
    return (
      slotWoEventsDedup(slotId).length > 0 ||
      slotEvents.some(e => e.slot_id === slotId)
    );
  }

  // 유동 슬롯의 material_type 조회
  function getSlotMaterialType(slotId: string): string | null {
    const lastIn = [...slotEvents]
      .filter(e => e.slot_id === slotId && e.event_type === "material_in")
      .sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0];
    return (lastIn as any)?.material_type ?? null;
  }

  // 다크 활동 슬롯: 고정(다크컴파운드) + 유동 중 다크
  const darkActive = [
    ...allSlots.filter(s => s.purpose === "다크컴파운드"),
    ...allSlots.filter(s => s.purpose === "유동" && getSlotMaterialType(s.id) === "다크"),
  ].filter(s => hasActivity(s.id));

  // 화이트 활동 슬롯: 고정(화이트컴파운드) + 유동 중 화이트
  const whiteActive = [
    ...allSlots.filter(s => s.purpose === "화이트컴파운드"),
    ...allSlots.filter(s => s.purpose === "유동" && getSlotMaterialType(s.id) === "화이트"),
  ].filter(s => hasActivity(s.id));

  // CHUNK_SIZE씩 청크로 분할
  function chunkSlots(slots: WarmSlot[]) {
    const chunks: WarmSlot[][] = [];
    for (let i = 0; i < slots.length; i += CHUNK_SIZE) {
      chunks.push(slots.slice(i, i + CHUNK_SIZE));
    }
    return chunks.length > 0 ? chunks : [[]];
  }

  const renderSection = (slots: WarmSlot[], label: string) => {
    if (slots.length === 0) return null;
    const chunks = chunkSlots(slots);
    const totalRows = chunks.length; // 청크 수 (줄 수)

    // 청크별 maxRows 계산
    const chunkMaxRows = chunks.map(chunk =>
      Math.max(...chunk.map(s => slotWoEventsDedup(s.id).length), 3)
    );

    // 전체 rowspan = 각 청크의 (1슬롯명+1원료+maxRows+1빈+1판정) 합산
    const totalRowspan = chunks.reduce((sum, _, ci) => sum + 5 + chunkMaxRows[ci], 0);
    // 실제로는 section label을 각 청크 첫 행에만 표시하고 rowspan으로 병합

    return (
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6, tableLayout: "fixed", pageBreakInside: "avoid" as any }}>
        <tbody>
          {chunks.map((chunk, chunkIdx) => {
            const maxRows = chunkMaxRows[chunkIdx];
            const isFirstChunk = chunkIdx === 0;

            return (
              <React.Fragment key={chunkIdx}>
                {/* 슬롯명 행 */}
                <tr>
                  {isFirstChunk && (
                    <td rowSpan={totalRowspan} style={{
                      border: "1px solid #000", padding: "2px 4px", fontWeight: "bold",
                      textAlign: "center", width: 44, fontSize: "8pt",
                      writingMode: "vertical-rl" as any,
                    }}>
                      {label}
                    </td>
                  )}
                  {chunk.map((s, i) => (
                    <td key={i} style={{
                      border: "1px solid #000", padding: "4px", textAlign: "center",
                      fontWeight: "bold", fontSize: "8pt", height: 22,
                      width: `calc((100% - 44px) / ${CHUNK_SIZE})`,
                    }}>
                      {s.slot_name}
                      {s.purpose === "유동" && (
                        <span style={{ fontSize: "7pt", marginLeft: 2, color: getSlotMaterialType(s.id) === "다크" ? "#854F0B" : "#A16207" }}>
                          ({getSlotMaterialType(s.id)})
                        </span>
                      )}
                    </td>
                  ))}
                  {/* 빈 칸 채우기 */}
                  {Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
                    <td key={`empty-name-${i}`} style={{ border: "1px solid #000", padding: "4px", width: `calc((100% - 44px) / ${CHUNK_SIZE})` }} />
                  ))}
                </tr>

          {/* 원료투입 행 */}
<tr>
  {chunk.map((s, i) => {
    const ev = slotEvents.filter(e =>
      e.slot_id === s.id &&
      e.event_type === "material_in" &&
      !e.action_note?.includes("→")
    ).sort((a, b) => a.measured_at.localeCompare(b.measured_at))[0];
    return (
      <td key={i} style={{ border: "1px solid #000", padding: "4px", textAlign: "center", fontSize: "8pt", height: 22 }}>
        {ev ? `원료투입: ${ev.measured_at.slice(5,10).replace("-","/")} ${toKSTTime(ev.measured_at)}` : ""}
      </td>
    );
  })}
  {Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
    <td key={`empty-in-${i}`} style={{ border: "1px solid #000", padding: "4px" }} />
  ))}
</tr>

    
{/* 슬롯이동 행 */}
<tr>
  {chunk.map((s, i) => {
    // 출발 슬롯: material_out + action_note "→"로 시작
    const outEv = slotEvents.filter(e =>
      e.slot_id === s.id &&
      e.event_type === "material_out" &&
      e.action_note?.startsWith("→")
    ).sort((a, b) => a.measured_at.localeCompare(b.measured_at))[0];
    // 도착 슬롯: material_in + action_note "→" 포함 (슬롯이동으로 온 것)
    const inEv = slotEvents.filter(e =>
      e.slot_id === s.id &&
      e.event_type === "material_in" &&
      e.action_note?.includes("→")
    ).sort((a, b) => a.measured_at.localeCompare(b.measured_at))[0];
    const ev = outEv ?? inEv;
    return (
      <td key={i} style={{ border: "1px solid #000", padding: "4px", textAlign: "center", fontSize: "8pt", height: 22 }}>
        {ev ? `슬롯이동: ${ev.measured_at.slice(5,10).replace("-","/")} ${toKSTTime(ev.measured_at)} (${ev.action_note})` : ""}
      </td>
    );
  })}
  {Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
    <td key={`empty-out-${i}`} style={{ border: "1px solid #000", padding: "4px" }} />
  ))}
</tr>


                {/* 온도기록 행 */}
                {Array.from({ length: maxRows }).map((_, rowIdx) => (
                  <tr key={`temp-${rowIdx}`}>
                    {chunk.map((s, i) => {
                      const ev = slotWoEventsDedup(s.id)[rowIdx];
                      const isNG = ev?.is_ok === false;
                      const typeLabel = ev ? (WO_EVENT_TYPE_LABEL[ev.event_type] ?? ev.event_type) : "";
                      return (
                        <td key={i} style={{
                          border: "1px solid #000", padding: "4px",
                          textAlign: "center", fontSize: "8pt",
                          color: isNG ? "red" : "#000", height: 22,
                        }}>
                          {ev ? (
                            <>
                              <span style={{
                                fontSize: "7pt",
                                background: ev.event_type === "start" ? "#dbeafe"
                                  : ev.event_type === "end" ? "#ede9fe" : "#f1f5f9",
                                padding: "0 3px", borderRadius: 2, marginRight: 2,
                              }}>{typeLabel}</span>
                              {`(${toKSTTime(ev.measured_at)}) ${ev.temperature ?? ""}℃`}
                            </>
                          ) : ""}
                        </td>
                      );
                    })}
                    {Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
                      <td key={`empty-temp-${i}`} style={{ border: "1px solid #000", padding: "4px" }} />
                    ))}
                  </tr>
                ))}

                {/* 빈 행 */}
                <tr>
                  {Array.from({ length: CHUNK_SIZE }).map((_, i) => (
                    <td key={i} style={{ border: "1px solid #000", padding: "4px", height: 22 }} />
                  ))}
                </tr>

                {/* 판정 + 서명 행 */}
                <tr>
                  {chunk.map((s, i) => {
                    const events = woEvents.filter(e => e.slot_id === s.id);
                    const hasWoEvents = events.length > 0;
                    const hasNG = events.some(e => e.is_ok === false);
                    const assignee = slotAssignees[s.id];
                    const signSrc = assignee ? SIGN_MAP[assignee] : null;
                    if (!hasWoEvents) return <td key={i} style={{ border: "1px solid #000", padding: "4px", height: 28 }} />;
                    return (
                      <td key={i} style={{ border: "1px solid #000", padding: "4px", textAlign: "center", fontSize: "8pt", height: 28 }}>
                        <div style={{ marginBottom: 2 }}>
                          <span style={{ color: hasNG ? "red" : "#000", fontWeight: "bold" }}>판정: {hasNG ? "X" : "O"}</span>
                        </div>
                        {signSrc && <img src={signSrc} style={{ height: 22, display: "block", margin: "0 auto" }} />}
                        {assignee && !signSrc && <div style={{ fontSize: "7pt", color: "#555" }}>{assignee}</div>}
                      </td>
                    );
                  })}
                  {Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
                    <td key={`empty-judge-${i}`} style={{ border: "1px solid #000", padding: "4px", height: 28 }} />
                  ))}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <>
      {renderSection(darkActive, "준초콜릿")}
      {renderSection(whiteActive, "당류가공품")}
    </>
  );
})()}

  {/* ⑤ 한계기준 이탈 및 조치내용 */}
  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}>
    <tbody>
      <tr>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", fontSize: "8pt", width: 140, whiteSpace: "nowrap" }}>
          한계기준 이탈 및 조치내용
        </td>
        <td style={{ border: "1px solid #000", padding: "4px 6px", fontSize: "8pt" }}>
          {woEvents.filter(e => e.is_ok === false)
            .map(e => `${e.measured_at.slice(11,16)} ${e.action_note ?? ""}`)
            .join("  /  ") || " "}
        </td>
      </tr>
    </tbody>
  </table>

</div>
</div>
  );
}


// ═══════════════════════════════════════════════════════════
// 기타가공품 가열공정
// ═══════════════════════════════════════════════════════════
export function OtherHeatingTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";
  const [logs, setLogs] = useState<OtherHeatingLog[]>([]);
  const [slots, setSlots] = useState<WarmSlot[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fWorkType, setFWorkType] = useState("jeonsa");
  const [fSlotId, setFSlotId] = useState("");
  const [fTime, setFTime] = useState(new Date().toTimeString().slice(0, 5));
  const [fTemp, setFTemp] = useState("");
  const [fIsOk, setFIsOk] = useState(true);
  const [fActionNote, setFActionNote] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("ccp_other_heating_logs").select("*").eq("log_date", filterDate).order("measured_at", { ascending: false });
    setLogs((data ?? []) as OtherHeatingLog[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    supabase.from("warmer_slots").select("id,slot_name,purpose").eq("is_active", true).order("slot_no").then(({ data }) => setSlots(data ?? []));
  }, []);

  async function saveLog() {
    if (!fTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(fTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50도 범위여야 합니다.", "error");
    setSaving(true);
    const { error } = await supabase.from("ccp_other_heating_logs").insert({
      log_date: filterDate, work_type: fWorkType, slot_id: fSlotId || null,
      measured_at: `${filterDate}T${fTime}:00`, temperature: temp, is_ok: fIsOk,
      action_note: fActionNote.trim() || null, note: fNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 가열공정 기록 완료!");
    setShowForm(false); setFTemp(""); setFActionNote(""); setFNote(""); setFIsOk(true);
    loadLogs();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("ccp_other_heating_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!"); loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div><div className="mb-1 text-xs text-slate-500">날짜</div><input type="date" className={inp} style={{ width: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && <button className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"} onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ 닫기" : "✚ 가열공정 기록"}</button>}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 기타가공품 가열공정 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs text-slate-500">작업유형 *</div>
              <select className={inp} value={fWorkType} onChange={(e) => setFWorkType(e.target.value)}>
                <option value="jeonsa">② 전사지 생산</option><option value="pet_coating">④ PET 코팅</option>
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">온장고 슬롯</div>
              <select className={inp} value={fSlotId} onChange={(e) => setFSlotId(e.target.value)}>
                <option value="">— 선택 —</option>{slots.map((s) => <option key={s.id} value={s.id}>{s.slot_name} ({s.purpose})</option>)}
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">측정시각</div><input type="time" className={inp} value={fTime} onChange={(e) => setFTime(e.target.value)} /></div>
            <div><div className="mb-1 text-xs text-slate-500">온도 (40~50°C) *</div><input className={inpR} inputMode="decimal" value={fTemp} onChange={(e) => setFTemp(e.target.value.replace(/[^\d.]/g, ""))} placeholder="예: 45" /></div>
            <div><div className="mb-1 text-xs text-slate-500">적합 여부</div>
              <select className={inp} value={fIsOk ? "ok" : "ng"} onChange={(e) => setFIsOk(e.target.value === "ok")}>
                <option value="ok">✅ 적합</option><option value="ng">❌ 부적합</option>
              </select></div>
            {!fIsOk && <div><div className="mb-1 text-xs text-slate-500">조치사항</div><input className={inp} value={fActionNote} onChange={(e) => setFActionNote(e.target.value)} /></div>}
            <div><div className="mb-1 text-xs text-slate-500">비고</div><input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 기록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🔥 가열공정 기록 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className={`rounded-2xl border p-3 ${log.is_ok === false ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{log.work_type === "jeonsa" ? "② 전사지 생산" : "④ PET 코팅"}</span>
                        <span className="text-xs font-mono text-slate-500">{log.measured_at.slice(11, 16)}</span>
                        <span className={`text-sm font-bold ${log.is_ok === false ? "text-red-600" : "text-blue-600"}`}>{log.temperature}°C</span>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${log.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>{log.is_ok ? "적합" : "부적합"}</span>
                      </div>
                      {log.action_note && <div className="mt-1 text-xs text-red-600">조치: {log.action_note}</div>}
                      {log.note && <div className="mt-0.5 text-xs text-slate-400">비고: {log.note}</div>}
                    </div>
                    <div className="shrink-0">
                      {!log.approved_by && isAdmin && <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100" onClick={() => approveLog(log.id)}>✅ 승인</button>}
                      {log.approved_by && <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 압축공기
// ═══════════════════════════════════════════════════════════
export function CompressorTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";
  const [logs, setLogs] = useState<CompressorLog[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fWorkType, setFWorkType] = useState("pet_coating");
  const [fTime, setFTime] = useState(new Date().toTimeString().slice(0, 5));
  const [fWorkHours, setFWorkHours] = useState("");
  const [fCumulativeHours, setFCumulativeHours] = useState("");
  const [fIsDamaged, setFIsDamaged] = useState(false);
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("compressor_logs").select("*").eq("log_date", filterDate).order("worked_at", { ascending: false });
    setLogs((data ?? []) as CompressorLog[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveLog() {
    setSaving(true);
    const { error } = await supabase.from("compressor_logs").insert({
      log_date: filterDate, work_type: fWorkType, worked_at: `${filterDate}T${fTime}:00`,
      work_hours: fWorkHours ? Number(fWorkHours) : null, cumulative_hours: fCumulativeHours ? Number(fCumulativeHours) : null,
      is_damaged: fIsDamaged, note: fNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 압축공기 기록 완료!");
    setShowForm(false); setFWorkHours(""); setFCumulativeHours(""); setFIsDamaged(false); setFNote("");
    loadLogs();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("compressor_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!"); loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div><div className="mb-1 text-xs text-slate-500">날짜</div><input type="date" className={inp} style={{ width: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && <button className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"} onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ 닫기" : "✚ 압축공기 기록"}</button>}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 압축공기 작업기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs text-slate-500">작업유형 *</div>
              <select className={inp} value={fWorkType} onChange={(e) => setFWorkType(e.target.value)}>
                <option value="pet_coating">④ PET 코팅</option><option value="pet_spray">⑤ PET 분사</option>
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">작업시각</div><input type="time" className={inp} value={fTime} onChange={(e) => setFTime(e.target.value)} /></div>
            <div><div className="mb-1 text-xs text-slate-500">작업시간 (h)</div><input className={inpR} inputMode="decimal" value={fWorkHours} onChange={(e) => setFWorkHours(e.target.value.replace(/[^\d.]/g, ""))} placeholder="예: 2.5" /></div>
            <div><div className="mb-1 text-xs text-slate-500">누계시간 (h)</div><input className={inpR} inputMode="decimal" value={fCumulativeHours} onChange={(e) => setFCumulativeHours(e.target.value.replace(/[^\d.]/g, ""))} /></div>
            <div className="flex items-center gap-2 pt-5"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={fIsDamaged} onChange={(e) => setFIsDamaged(e.target.checked)} className="w-4 h-4 rounded" />손상 발생</label></div>
            <div><div className="mb-1 text-xs text-slate-500">비고</div><input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 기록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">💨 압축공기 작업기록 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className={`rounded-2xl border p-3 ${log.is_damaged ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{log.work_type === "pet_coating" ? "④ PET 코팅" : "⑤ PET 분사"}</span>
                        <span className="text-xs font-mono text-slate-500">{log.worked_at.slice(11, 16)}</span>
                        {log.is_damaged && <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">⚠ 손상</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                        {log.work_hours != null && <span>작업시간: {log.work_hours}h</span>}
                        {log.cumulative_hours != null && <span>누계: {log.cumulative_hours}h</span>}
                        {log.note && <span>비고: {log.note}</span>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {!log.approved_by && isAdmin && <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100" onClick={() => approveLog(log.id)}>✅ 승인</button>}
                      {log.approved_by && <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PET 수불부
// ═══════════════════════════════════════════════════════════
export function PetLedgerTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";
  const [logs, setLogs] = useState<PetStockLog[]>([]);
  const [stock, setStock] = useState<PetStock | null>(null);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fLogType, setFLogType] = useState("incoming");
  const [fQty, setFQty] = useState("");
  const [fDefectQty, setFDefectQty] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [logRes, stockRes] = await Promise.all([
      supabase.from("pet_stock_logs").select("*").eq("log_date", filterDate).order("created_at", { ascending: false }),
      supabase.from("v_pet_stock").select("*").single(),
    ]);
    setLogs((logRes.data ?? []) as PetStockLog[]);
    setStock(stockRes.data as PetStock ?? null);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveLog() {
    if (!fQty) return showToast("수량을 입력하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("pet_stock_logs").insert({
      log_date: filterDate, log_type: fLogType, quantity: Number(fQty),
      defect_qty: fDefectQty ? Number(fDefectQty) : 0, note: fNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ PET 수불 기록 완료!");
    setShowForm(false); setFQty(""); setFDefectQty(""); setFNote("");
    loadData();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("pet_stock_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!"); loadData();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div><div className="mb-1 text-xs text-slate-500">날짜</div><input type="date" className={inp} style={{ width: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></div>
          <button className={btn} onClick={loadData}>🔄 조회</button>
          {isAdminOrSubadmin && <button className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"} onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ 닫기" : "✚ 수불 기록"}</button>}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      {stock && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm">📦 PET 공정별 현재고</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[{ label: "원상태", value: stock.stock_raw, color: "text-slate-800" }, { label: "코팅완료", value: stock.stock_coated, color: "text-blue-700" }, { label: "분사완료(생산용)", value: stock.stock_sprayed_prod, color: "text-green-700" }, { label: "분사완료(판매용)", value: stock.stock_sprayed_sale, color: "text-purple-700" }]
              .map(({ label, value, color }) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                  <div className="text-xs text-slate-500 mb-1">{label}</div>
                  <div className={`text-xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</div>
                  <div className="text-xs text-slate-400">ea</div>
                </div>
              ))}
          </div>
        </div>
      )}
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ PET 수불 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs text-slate-500">구분 *</div>
              <select className={inp} value={fLogType} onChange={(e) => setFLogType(e.target.value)}>
                {Object.entries(PET_LOG_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">수량 (ea) *</div><input className={inpR} inputMode="numeric" value={fQty} onChange={(e) => setFQty(e.target.value.replace(/[^\d]/g, ""))} /></div>
            <div><div className="mb-1 text-xs text-slate-500">불량수량 (ea)</div><input className={inpR} inputMode="numeric" value={fDefectQty} onChange={(e) => setFDefectQty(e.target.value.replace(/[^\d]/g, ""))} /></div>
            <div><div className="mb-1 text-xs text-slate-500">비고</div><input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 기록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">📋 PET 수불 내역 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{PET_LOG_TYPE_LABELS[log.log_type] ?? log.log_type}</span>
                        <span className="text-sm font-bold tabular-nums text-blue-700">{log.quantity.toLocaleString()} ea</span>
                        {log.defect_qty > 0 && <span className="text-xs text-red-600">불량: {log.defect_qty}ea</span>}
                      </div>
                      {log.note && <div className="mt-0.5 text-xs text-slate-400">비고: {log.note}</div>}
                    </div>
                    <div className="shrink-0">
                      {!log.approved_by && isAdmin && <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100" onClick={() => approveLog(log.id)}>✅ 승인</button>}
                      {log.approved_by && <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
