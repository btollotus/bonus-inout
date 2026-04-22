"use client";

// ============================================================
// 이 파일은 기존 ProductionClient.tsx 에서
// CCP 관련 state / 함수 / UI 만 발췌하여 새 구조로 교체한 것입니다.
// 나머지 코드(작업지시서 목록, 기본정보, 진행상태 등)는 동일합니다.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { usePinSession, PinModal } from "@/app/contexts/PinSessionContext";

const supabase = createClient();

// ─── 타입 ───────────────────────────────────────────────────

type SlotEvent = {
  id: string;
  slot_id: string;
  event_date: string;
  event_type: "material_in" | "material_out" | "move";
  measured_at: string;
  work_order_no: string | null;
  action_note: string | null;
  material_type: string | null;
};

type WoEvent = {
  id: string;
  work_order_no: string;
  slot_id: string;
  event_type: "start" | "mid_check" | "end";
  measured_at: string;
  temperature: number | null;
  is_ok: boolean | null;
  action_note: string | null;
};

// ─── 상수 ───────────────────────────────────────────────────

const CCP_SLOT_EVENT_LABELS: Record<string, string> = {
  material_in:  "원료투입",
  material_out: "원료소진",
  move:         "슬롯이동",
};

const CCP_WO_EVENT_LABELS: Record<string, string> = {
  start:     "시작",
  mid_check: "중간점검",
  end:       "종료",
};

function ccpWoEventBadgeCls(type: string) {
  if (type === "start")     return "bg-blue-100 border-blue-200 text-blue-700";
  if (type === "end")       return "bg-purple-100 border-purple-200 text-purple-700";
  if (type === "mid_check") return "bg-slate-100 border-slate-200 text-slate-600";
  return "bg-slate-100 border-slate-200 text-slate-600";
}

function ccpSlotEventBadgeCls(type: string) {
  if (type === "material_in")  return "bg-green-100 border-green-200 text-green-700";
  if (type === "material_out") return "bg-orange-100 border-orange-200 text-orange-700";
  if (type === "move")         return "bg-teal-100 border-teal-200 text-teal-700";
  return "bg-slate-100 border-slate-200 text-slate-600";
}

function toKSTTime(isoStr: string): string {
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const inp  = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";

// ─── CCP 훅 ──────────────────────────────────────────────────

export function useCcpState(
  warmerSlots: { id: string; slot_name: string; purpose: string }[],
  currentUserIdRef: React.RefObject<string | null>,
  showToast: (msg: string, type?: "success" | "error") => void,
) {
  const [woEvents, setWoEvents] = useState<WoEvent[]>([]);
  const [slotEvents, setSlotEvents] = useState<SlotEvent[]>([]);

  const [ccpWoEventType, setCcpWoEventType] = useState<"start"|"mid_check"|"end">("start");
  const [ccpWoTime, setCcpWoTime] = useState("");
  const [ccpWoTemp, setCcpWoTemp] = useState("");
  const [ccpWoIsOk, setCcpWoIsOk] = useState(true);
  const [ccpWoActionNote, setCcpWoActionNote] = useState("");
  const [ccpWoSaving, setCcpWoSaving] = useState(false);

  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [slotMoveTargetId, setSlotMoveTargetId] = useState<string | null>(null);
  const [slotActionTime, setSlotActionTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
  });
  const [slotActionDate, setSlotActionDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  });
  const [slotActionSaving, setSlotActionSaving] = useState(false);

  const [slotStatus, setSlotStatus] = useState<Record<string, { date: string; daysAgo: number; materialType: string | null } | null>>({});

  const [ccpWoEditingId, setCcpWoEditingId] = useState<string | null>(null);
  const [ccpWoEditTime, setCcpWoEditTime] = useState("");
  const [ccpWoEditTemp, setCcpWoEditTemp] = useState("");
  const [ccpWoEditIsOk, setCcpWoEditIsOk] = useState(true);
  const [ccpWoEditActionNote, setCcpWoEditActionNote] = useState("");
  const [ccpWoEditSaving, setCcpWoEditSaving] = useState(false);

  function todayKST() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  }

  const loadWoEvents = useCallback(async (workOrderNo: string, slotId?: string | null) => {
    let query = supabase
      .from("ccp_wo_events")
      .select("id, work_order_no, slot_id, event_type, measured_at, temperature, is_ok, action_note")
      .order("measured_at", { ascending: true });
  
      if (slotId) {
        const today = todayKST();
        query = query
          .eq("slot_id", slotId)
          .eq("work_order_no", workOrderNo)
          .gte("measured_at", `${today}T00:00:00+09:00`)
          .lte("measured_at", `${today}T23:59:59+09:00`);
      } else {
        query = query.eq("work_order_no", workOrderNo);
      }

    const { data } = await query;
    const seen = new Set<string>();
    const deduped = (data ?? []).filter((e: any) => {
      const key = `${e.measured_at}_${e.event_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setWoEvents(deduped as WoEvent[]);

    const lastEvent = deduped[deduped.length - 1];
if (!lastEvent || lastEvent.event_type === "end") {
  setCcpWoEventType("start");
} else if (lastEvent.event_type === "start" || lastEvent.event_type === "mid_check") {
  setCcpWoEventType("mid_check");
}
    setCcpWoTime("");
  }, []);

  const loadSlotEvents = useCallback(async () => {
    const today = todayKST();
    const { data } = await supabase
      .from("ccp_slot_events")
      .select("id, slot_id, event_date, event_type, measured_at, work_order_no, action_note")
      .eq("event_date", today)
      .order("measured_at", { ascending: true });
    setSlotEvents((data ?? []) as SlotEvent[]);
  }, []);

  const loadSlotStatus = useCallback(async () => {
    if (warmerSlots.length === 0) return;
    const today = todayKST();
    const slotIds = warmerSlots.map((s) => s.id);
  
    const { data: todayEvents } = await supabase
      .from("ccp_slot_events")
      .select("slot_id, event_type, measured_at, material_type")
      .eq("event_date", today)
      .in("slot_id", slotIds)
      .order("measured_at", { ascending: true });
  
    const needsHistorySlotIds: string[] = [];
    const map: Record<string, { date: string; daysAgo: number; materialType: string | null } | null> = {};
  
    for (const slot of warmerSlots) {
      const events = (todayEvents ?? []).filter((e) => e.slot_id === slot.id);
      const last = events[events.length - 1];
      if (!last || last.event_type === "material_out") {
        needsHistorySlotIds.push(slot.id);
      } else {
        const materialIn = events.filter((e) => e.event_type === "material_in").slice(-1)[0];
        if (materialIn) {
          map[slot.id] = { date: today, daysAgo: 0, materialType: (materialIn as any).material_type ?? null };
        } else {
          needsHistorySlotIds.push(slot.id);
        }
      }
    }
  
    if (needsHistorySlotIds.length > 0) {
      const { data: historyEvents } = await supabase
        .from("ccp_slot_events")
        .select("slot_id, event_type, measured_at, material_type")
        .in("slot_id", needsHistorySlotIds)
        .order("measured_at", { ascending: false });
  
      for (const slotId of needsHistorySlotIds) {
        const slotHistory = (historyEvents ?? []).filter((e) => e.slot_id === slotId);
        const lastEvent = slotHistory[0];
        if (!lastEvent || lastEvent.event_type === "material_out") {
          map[slotId] = null; continue;
        }
        const lastIn = slotHistory.find((e) => e.event_type === "material_in");
        if (!lastIn) { map[slotId] = null; continue; }
        const hasOutAfter = slotHistory.some(
          (e) => e.event_type === "material_out" && e.measured_at >= lastIn.measured_at
        );
        if (hasOutAfter) { map[slotId] = null; continue; }
        const materialDate = lastIn.measured_at.slice(0, 10);
        const diffMs = new Date(today).getTime() - new Date(materialDate).getTime();
        const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        map[slotId] = { date: materialDate, daysAgo, materialType: (lastIn as any).material_type ?? null };
      }
    }
  
    setSlotStatus(map);
  }, [warmerSlots]);

  useEffect(() => { loadSlotStatus(); }, [loadSlotStatus]);

  async function saveWoEvent(
    selectedWo: { work_order_no: string; ccp_slot_id: string | null },
    eCcpSlotId: string,
  ) {
    const slotId = eCcpSlotId || selectedWo.ccp_slot_id;
    if (!slotId) return showToast("슬롯을 먼저 지정해주세요.", "error");
    if (!ccpWoTime || ccpWoTime.length < 4) return showToast("측정시각을 입력하세요. (예: 1430)", "error");

    const today = todayKST();
    const { data: slotEventsData } = await supabase
      .from("ccp_wo_events")
      .select("id, work_order_no, slot_id, event_type, measured_at, temperature, is_ok, action_note")
      .eq("slot_id", slotId)
      .gte("measured_at", `${today}T00:00:00+09:00`)
      .lte("measured_at", `${today}T23:59:59+09:00`)
      .order("measured_at", { ascending: true });
    const slotAllEvents = (slotEventsData ?? []) as WoEvent[];

    if (slotAllEvents.length > 0) {
      const lastEv = [...slotAllEvents].sort((a,b) => a.measured_at.localeCompare(b.measured_at)).slice(-1)[0];
      const lastTimeStr = toKSTTime(lastEv.measured_at);
      const newTimeStr = `${ccpWoTime.slice(0,2)}:${ccpWoTime.slice(2,4)}`;
      if (newTimeStr <= lastTimeStr) {
        return showToast(`⚠ 측정시각은 마지막 기록(${lastTimeStr})보다 늦어야 합니다.`, "error");
      }
    }

    if (!ccpWoTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(ccpWoTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50°C 범위여야 합니다.", "error");

    const sorted = [...slotAllEvents].sort((a,b) => a.measured_at.localeCompare(b.measured_at));
    const lastEv = sorted[sorted.length - 1];

    if (ccpWoEventType === "start") {
      const currentSlotStatus = slotStatus[slotId];
      if (currentSlotStatus === null || currentSlotStatus === undefined) {
        return showToast("⚠ 해당 슬롯에 원료가 없습니다. 원료투입 또는 슬롯이동 후 시작 기록을 해주세요.", "error");
      }
      const { data: lastMaterialIn } = await supabase
        .from("ccp_slot_events")
        .select("measured_at")
        .eq("slot_id", slotId)
        .eq("event_type", "material_in")
        .order("measured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastMaterialIn) {
        const materialInTime = new Date(lastMaterialIn.measured_at);
        const startTimeKst = new Date(`${today}T${ccpWoTime.slice(0,2)}:${ccpWoTime.slice(2,4)}:00+09:00`);
        if (startTimeKst < materialInTime) {
          const materialInKst = toKSTTime(lastMaterialIn.measured_at);
          return showToast(`⚠ 시작 시각은 원료투입(${materialInKst}) 이후여야 합니다.`, "error");
        }
      }
    }

    if (ccpWoEventType === "start" && lastEv && lastEv.event_type !== "end") {
      return showToast("⚠ 시작은 종료 후에만 다시 기록할 수 있습니다.", "error");
    }
    if (ccpWoEventType === "mid_check" && (!lastEv || lastEv.event_type === "end")) {
      return showToast("⚠ 중간점검은 시작 후에만 기록할 수 있습니다.", "error");
    }
    if (ccpWoEventType === "end") {
      if (!lastEv || (lastEv.event_type !== "start" && lastEv.event_type !== "mid_check")) {
        return showToast("⚠ 종료는 시작 또는 중간점검 후에만 가능합니다.", "error");
      }
      const startEv = [...sorted].reverse().find((e) => e.event_type === "start");
      const hasMidCheck = sorted.some((e) => e.event_type === "mid_check");
      if (startEv && !hasMidCheck) {
        const startTime = new Date(startEv.measured_at);
        const endTimeKst = new Date(`${today}T${ccpWoTime.slice(0,2)}:${ccpWoTime.slice(2,4)}:00+09:00`);
        if ((endTimeKst.getTime() - startTime.getTime()) / 60000 >= 120) {
          return showToast("⚠ 시작~종료 2시간 이상 — 중간점검을 먼저 추가해주세요.", "error");
        }
      }
    }

    setCcpWoSaving(true);
    const measuredAt = `${today}T${ccpWoTime.slice(0,2)}:${ccpWoTime.slice(2,4)}:00+09:00`;

    const { error } = await supabase.from("ccp_wo_events").insert({
      work_order_no: selectedWo.work_order_no,
      slot_id:       slotId,
      event_type:    ccpWoEventType,
      measured_at:   measuredAt,
      temperature:   temp,
      is_ok:         ccpWoIsOk,
      action_note:   ccpWoActionNote.trim() || null,
      created_by:    currentUserIdRef.current,
    });
    setCcpWoSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");

    await supabase.from("ccp_slot_events").insert({
      slot_id:       slotId,
      event_date:    today,
      event_type:    ccpWoEventType,
      measured_at:   measuredAt,
      work_order_no: selectedWo.work_order_no,
      temperature:   temp,
      is_ok:         ccpWoIsOk,
      action_note:   ccpWoActionNote.trim() || null,
      created_by:    currentUserIdRef.current,
    });

    const { data: sameSlotWos } = await supabase
      .from("work_orders")
      .select("work_order_no")
      .eq("ccp_slot_id", slotId)
      .eq("status", "생산중")
      .neq("work_order_no", selectedWo.work_order_no);

    for (const wo of sameSlotWos ?? []) {
      await supabase.from("ccp_wo_events").insert({
        work_order_no: wo.work_order_no,
        slot_id: slotId,
        event_type: ccpWoEventType,
        measured_at: measuredAt,
        temperature: temp,
        is_ok: ccpWoIsOk,
        action_note: ccpWoActionNote.trim() || null,
        created_by: currentUserIdRef.current,
      });
    }

    showToast("✅ CCP 온도 기록 완료!");
    setCcpWoTemp(""); setCcpWoActionNote(""); setCcpWoIsOk(true); setCcpWoTime("");
    await loadWoEvents(selectedWo.work_order_no, slotId);
  }

  function startWoEventEdit(ev: WoEvent) {
    setCcpWoEditingId(ev.id);
    const kstTime = toKSTTime(ev.measured_at);
    setCcpWoEditTime(kstTime.replace(":", ""));
    setCcpWoEditTemp(ev.temperature != null ? String(ev.temperature) : "");
    setCcpWoEditIsOk(ev.is_ok ?? true);
    setCcpWoEditActionNote(ev.action_note ?? "");
  }

  async function saveWoEventEdit(ev: WoEvent, workOrderNo: string) {
    if (!ccpWoEditTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(ccpWoEditTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50°C 범위여야 합니다.", "error");
    setCcpWoEditSaving(true);
    const dateStr = ev.measured_at.slice(0, 10);
    const { error } = await supabase.from("ccp_wo_events").update({
      measured_at: `${dateStr}T${ccpWoEditTime.slice(0,2)}:${ccpWoEditTime.slice(2,4)}:00+09:00`,
      temperature: temp,
      is_ok:       ccpWoEditIsOk,
      action_note: ccpWoEditActionNote.trim() || null,
    }).eq("id", ev.id);
    setCcpWoEditSaving(false);
    if (error) return showToast("수정 실패: " + error.message, "error");
    showToast("✅ 수정 완료!");
    setCcpWoEditingId(null);
    await loadWoEvents(workOrderNo, ev.slot_id);
  }

  async function deleteWoEvent(eventId: string, workOrderNo: string) {
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
    await loadWoEvents(workOrderNo, evData?.slot_id ?? null);
  }

  // after
  async function saveSlotMaterialIn(slotId: string, workOrderNo?: string, materialType?: string, actionBy?: string) {
    if (!slotActionTime || slotActionTime.length < 4) return showToast("시각을 입력하세요. (예: 1430)", "error");
    if (parseInt(slotActionTime.slice(0,2)) > 23 || parseInt(slotActionTime.slice(2,4)) > 59)
      return showToast("올바른 시각을 입력하세요.", "error");

    const inMeasuredAt = `${slotActionDate}T${slotActionTime.slice(0,2)}:${slotActionTime.slice(2,4)}:00+09:00`;
    const slotName = warmerSlots.find((s) => s.id === slotId)?.slot_name ?? slotId;

    // 5-2: 마지막 material_out 시각보다 투입 시각이 이전인지 확인
    const { data: lastSlotEvents } = await supabase
      .from("ccp_slot_events")
      .select("event_type, measured_at")
      .eq("slot_id", slotId)
      .eq("event_date", slotActionDate)
      .order("measured_at", { ascending: false })
      .limit(5);

    const lastOut = (lastSlotEvents ?? []).find((e) => e.event_type === "material_out");
    if (lastOut && inMeasuredAt <= lastOut.measured_at) {
      const outTime = toKSTTime(lastOut.measured_at);
      return showToast(`⚠ 투입 시각은 마지막 소진/이동(${outTime}) 이후여야 합니다.`, "error");
    }

    // 동일 시각 중복 체크
    const duplicate = (lastSlotEvents ?? []).find(
      (e) => e.measured_at === inMeasuredAt && e.event_type === "material_in"
    );
    if (duplicate) return showToast("⚠ 동일 시각에 이미 원료투입 기록이 있습니다.", "error");

    if (!confirm(`[${slotName}] 원료투입을 기록합니다. 맞습니까?`)) return;

    setSlotActionSaving(true);
    try {
      const { error } = await supabase.from("ccp_slot_events").insert({
        slot_id:       slotId,
        event_date:    slotActionDate,
        event_type:    "material_in",
        measured_at:   inMeasuredAt,
        work_order_no: workOrderNo ?? null,
        action_note:   null,
        material_type: materialType || null,
        action_by:     actionBy ?? null,
        created_by:    currentUserIdRef.current,
      });
      if (error) return showToast("원료투입 기록 실패: " + error.message, "error");
      showToast("✅ 원료투입이 기록됐습니다!");
      setActiveSlotId(null);
      await loadSlotStatus();
      await loadSlotEvents();
    } catch (e: any) {
      showToast("오류: " + (e?.message ?? e), "error");
    } finally {
      setSlotActionSaving(false);
    }
  }

// after
// after
async function saveSlotMaterialOut(slotId: string, actionBy?: string) {
  if (!slotActionTime || slotActionTime.length < 4) return showToast("시각을 입력하세요. (예: 1430)", "error");
  if (parseInt(slotActionTime.slice(0,2)) > 23 || parseInt(slotActionTime.slice(2,4)) > 59)
    return showToast("올바른 시각을 입력하세요.", "error");

  const outMeasuredAt = `${slotActionDate}T${slotActionTime.slice(0,2)}:${slotActionTime.slice(2,4)}:00+09:00`;
  const slotName = warmerSlots.find((s) => s.id === slotId)?.slot_name ?? slotId;

  // 4-A: 이미 마지막 이벤트가 material_out인지 확인 (중복 소진 방지)
  if (slotStatus[slotId] === null || slotStatus[slotId] === undefined) {
    return showToast("⚠ 이미 원료가 없는 슬롯입니다. 소진 처리를 할 수 없습니다.", "error");
  }
  
  // 이후 검증에서 사용할 슬롯 이벤트 조회
  const { data: lastSlotEvents } = await supabase
    .from("ccp_slot_events")
    .select("event_type, measured_at")
    .eq("slot_id", slotId)
    .eq("event_date", slotActionDate)
    .order("measured_at", { ascending: false })
    .limit(5);

  // 5-1: 소진 시각이 마지막 material_in 시각보다 이전인지 확인
  const lastIn = (lastSlotEvents ?? []).find((e) => e.event_type === "material_in");
  if (lastIn && outMeasuredAt <= lastIn.measured_at) {
    const inTime = toKSTTime(lastIn.measured_at);
    return showToast(`⚠ 소진 시각은 원료투입(${inTime}) 이후여야 합니다.`, "error");
  }

  // 4-B: 동일 시각 중복 체크
  const duplicate = (lastSlotEvents ?? []).find(
    (e) => e.measured_at === outMeasuredAt && e.event_type === "material_out"
  );
  if (duplicate) return showToast("⚠ 동일 시각에 이미 소진 기록이 있습니다.", "error");

  // 1,3: slotActionDate 기준으로 온도기록 조회 (today 아님)
  const { data: woEventsData } = await supabase
    .from("ccp_wo_events")
    .select("event_type, measured_at")
    .eq("slot_id", slotId)
    .gte("measured_at", `${slotActionDate}T00:00:00+09:00`)
    .lte("measured_at", `${slotActionDate}T23:59:59+09:00`)
    .order("measured_at", { ascending: true });

  const woEvList = woEventsData ?? [];
  const lastWoEv = woEvList[woEvList.length - 1];

  // 진행 중 차단 (start/mid_check 상태)
  if (lastWoEv?.event_type === "start" || lastWoEv?.event_type === "mid_check") {
    return showToast("⚠ 진행 중인 작업이 있습니다. 종료 후에만 원료소진이 가능합니다.", "error");
  }

  // 마지막 종료 시각보다 소진 시각이 이전인지 확인
  if (lastWoEv?.event_type === "end" && outMeasuredAt <= lastWoEv.measured_at) {
    const endTime = toKSTTime(lastWoEv.measured_at);
    return showToast(`⚠ 소진 시각은 마지막 종료(${endTime}) 이후여야 합니다.`, "error");
  }

  // 2: confirm으로 실수 방지
  if (!confirm(`[${slotName}] 원료소진을 기록합니다.\n소진 후에는 원료가 없는 상태로 변경됩니다. 맞습니까?`)) return;

  setSlotActionSaving(true);
  try {
    const { error } = await supabase.from("ccp_slot_events").insert({
      slot_id:       slotId,
      event_date:    slotActionDate,
      event_type:    "material_out",
      measured_at:   outMeasuredAt,
      work_order_no: null,
      action_note:   "원료소진",
action_by:     actionBy ?? null,
created_by:    currentUserIdRef.current,
    });
    if (error) return showToast("원료소진 기록 실패: " + error.message, "error");
    showToast("✅ 원료소진이 기록됐습니다!");
    setActiveSlotId(null);
    setSlotMoveTargetId(null);
    await loadSlotStatus();
    await loadSlotEvents();
  } catch (e: any) {
    showToast("오류: " + (e?.message ?? e), "error");
  } finally {
    setSlotActionSaving(false);
  }
}

async function saveSlotMove(fromSlotId: string, toSlotId: string, workOrderNo?: string, actionBy?: string) {
    if (!slotActionTime || slotActionTime.length < 4) return showToast("시각을 입력하세요. (예: 1430)", "error");

    const fromSlotName = warmerSlots.find((s) => s.id === fromSlotId)?.slot_name ?? fromSlotId;
    const toSlotName   = warmerSlots.find((s) => s.id === toSlotId)?.slot_name ?? toSlotId;

    const { data: lastInEvent } = await supabase
      .from("ccp_slot_events")
      .select("material_type")
      .eq("slot_id", fromSlotId)
      .eq("event_type", "material_in")
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fromSlot = warmerSlots.find((s) => s.id === fromSlotId);
    const movedMaterialType = lastInEvent?.material_type
      ?? (fromSlot?.purpose === "화이트컴파운드" ? "화이트"
        : fromSlot?.purpose === "다크컴파운드" ? "다크"
        : null);

    setSlotActionSaving(true);
    try {
      await supabase.from("ccp_slot_events").insert({
        slot_id:       fromSlotId,
        event_date:    slotActionDate,
        event_type:    "material_out",
        measured_at: `${slotActionDate}T${slotActionTime.slice(0,2)}:${slotActionTime.slice(2,4)}:00+09:00`,
        work_order_no: workOrderNo ?? null,
        action_note:   `→ ${toSlotName}`,
        action_by:     actionBy ?? null,
        created_by:    currentUserIdRef.current,
      });
      await supabase.from("ccp_slot_events").insert({
        slot_id:       toSlotId,
        event_date:    slotActionDate,
        event_type:    "material_in",
        measured_at: `${slotActionDate}T${slotActionTime.slice(0,2)}:${slotActionTime.slice(2,4)}:00+09:00`,
        work_order_no: workOrderNo ?? null,
        action_note:   `${fromSlotName} → ${toSlotName}`,
        material_type: movedMaterialType,
        action_by:     actionBy ?? null,
        created_by:    currentUserIdRef.current,
      });
      showToast(`✅ ${fromSlotName} → ${toSlotName} 이동 완료!`);
      setActiveSlotId(null);
      setSlotMoveTargetId(null);
      await loadSlotStatus();
      await loadSlotEvents();
    } catch (e: any) {
      showToast("오류: " + (e?.message ?? e), "error");
    } finally {
      setSlotActionSaving(false);
    }
  }

  return {
    woEvents, slotEvents, slotStatus,
    ccpWoEventType, setCcpWoEventType,
    ccpWoTime, setCcpWoTime,
    ccpWoTemp, setCcpWoTemp,
    ccpWoIsOk, setCcpWoIsOk,
    ccpWoActionNote, setCcpWoActionNote,
    ccpWoSaving,
    activeSlotId, setActiveSlotId,
    slotMoveTargetId, setSlotMoveTargetId,
    slotActionTime, setSlotActionTime,
    slotActionDate, setSlotActionDate,
    slotActionSaving,
    ccpWoEditingId, setCcpWoEditingId,
    ccpWoEditTime, setCcpWoEditTime,
    ccpWoEditTemp, setCcpWoEditTemp,
    ccpWoEditIsOk, setCcpWoEditIsOk,
    ccpWoEditActionNote, setCcpWoEditActionNote,
    ccpWoEditSaving,
    loadWoEvents, loadSlotEvents, loadSlotStatus,
    saveWoEvent, startWoEventEdit, saveWoEventEdit, deleteWoEvent,
    // after
    saveSlotMaterialIn, saveSlotMaterialOut, saveSlotMove,
  };
}


// ─── UI 컴포넌트 ─────────────────────────────────────────────

export function SlotStatusPanel({
  warmerSlots,
  slotStatus,
  activeSlotId, setActiveSlotId,
  slotMoveTargetId, setSlotMoveTargetId,
  slotActionDate, setSlotActionDate,
  slotActionTime, setSlotActionTime,
  slotActionSaving,
  loadSlotStatus,
  saveSlotMaterialIn,
  saveSlotMaterialOut,
  saveSlotMove,
}: {
  warmerSlots: { id: string; slot_name: string; purpose: string }[];
  slotStatus: Record<string, { date: string; daysAgo: number; materialType: string | null } | null>;
  activeSlotId: string | null; setActiveSlotId: (v: string | null) => void;
  slotMoveTargetId: string | null; setSlotMoveTargetId: (v: string | null) => void;
  slotActionDate: string; setSlotActionDate: (v: string) => void;
  slotActionTime: string; setSlotActionTime: (v: string) => void;
  slotActionSaving: boolean;
  loadSlotStatus: () => void;
  saveSlotMaterialIn: (slotId: string, workOrderNo?: string, materialType?: string, actionBy?: string) => void;
  saveSlotMaterialOut: (slotId: string, actionBy?: string) => void;
  saveSlotMove: (fromSlotId: string, toSlotId: string, workOrderNo?: string, actionBy?: string) => void;
}) {
  const [selectedMaterialType, setSelectedMaterialType] = React.useState<string>("");
  const [isExpanded, setIsExpanded] = React.useState(true);

  // ── PIN 세션 state (SlotStatusPanel 내부) ──
const { session: pinSession, isValid: isPinValid, login: pinLogin } = usePinSession();
const [showPinModal, setShowPinModal] = useState(false);
const [pinPendingAction, setPinPendingAction] = useState<((name: string) => void) | null>(null);
const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);

useEffect(() => {
  supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
    .then(({ data }) => setEmployees((data ?? []) as any));
}, []);

function requirePin(action: (actionBy: string) => void) {
  if (isPinValid() && pinSession) {
    action(pinSession.employeeName);
  } else {
    setPinPendingAction(() => (name: string) => action(name));
    setShowPinModal(true);
  }
}

// purpose 기반 원료 선택지
function getMaterialOptions(purpose: string): string[] {
  if (purpose === "유동") return ["다크", "화이트", "핑크"];
  if (purpose === "코팅용도") return ["팜유", "핑크"];
  return [];
}


  const renderSlot = (s: { id: string; slot_name: string; purpose: string }) => {
    const st = slotStatus[s.id];
    const isEmpty = st === null || st === undefined;
    const daysAgo = st?.daysAgo ?? 0;
    const dateStr = st?.date ? st.date.slice(5) : null;
    const materialType = st?.materialType ?? null;
    const isOverdue = !isEmpty && daysAgo >= 15;
    const isActive = activeSlotId === s.id;
    const isMoveTarget = slotMoveTargetId === s.id;

    const baseCls = isEmpty
      ? "border-slate-200 bg-slate-50 text-slate-400"
      : isOverdue
      ? "border-red-300 bg-red-50 text-red-600"
      : materialType === "다크"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : materialType === "화이트"
      ? "border-yellow-200 bg-yellow-50 text-yellow-700"
      : materialType === "핑크"
      ? "border-pink-300 bg-pink-50 text-pink-700"
      : materialType === "팜유"
      ? "border-orange-200 bg-orange-50 text-orange-700"
      : "border-blue-200 bg-blue-50 text-blue-700";

    const activeCls = isActive
      ? "ring-2 ring-blue-500 ring-offset-1 scale-105 shadow-md"
      : isMoveTarget
      ? "ring-2 ring-teal-500 ring-offset-1 scale-105 shadow-md border-teal-300 bg-teal-50 text-teal-700"
      : "";

    return (
      <button
        key={s.id}
        type="button"
        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer hover:scale-105 ${baseCls} ${activeCls}`}
        onClick={() => {
          if (activeSlotId === s.id) {
            setActiveSlotId(null); setSlotMoveTargetId(null);
          } else if (activeSlotId !== null && slotStatus[activeSlotId] !== null && slotStatus[activeSlotId] !== undefined) {
            setSlotMoveTargetId(isMoveTarget ? null : s.id);
          } else {
            setActiveSlotId(s.id); setSlotMoveTargetId(null);
            const now = new Date();
            setSlotActionTime(`${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`);
          }
        }}
      >
        <div className={isOverdue ? "text-red-600 font-bold" : ""}>{s.slot_name}</div>
        <div className={`mt-0.5 text-[10px] text-center ${isOverdue ? "text-red-600 font-bold" : "font-normal"}`}>
          {isEmpty ? "비어있음" : dateStr}
        </div>
      </button>
    );
  };

  // 유동 슬롯: 2열 3행 (A열/B열), 각 슬롯 오른쪽에 materialType 라벨
  const renderFluidGrid = () => {
    const fluidSlots = warmerSlots.filter((s) => s.purpose === "유동");
    const aSlots = fluidSlots.filter((s) => s.slot_name.endsWith("A")).sort((a,b) => a.slot_name.localeCompare(b.slot_name));
    const bSlots = fluidSlots.filter((s) => s.slot_name.endsWith("B")).sort((a,b) => a.slot_name.localeCompare(b.slot_name));
    const rowCount = Math.max(aSlots.length, bSlots.length);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {Array.from({ length: rowCount }).map((_, i) => {
          const aSlot = aSlots[i];
          const bSlot = bSlots[i];
          return (
            <div key={i} style={{ display: "flex", flexDirection: "row", gap: "4px", alignItems: "center" }}>
              {aSlot && (
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "3px" }}>
                  {renderSlot(aSlot)}
                  {(() => {
                    const mt = slotStatus[aSlot.id]?.materialType ?? null;
                    if (!mt) return null;
                    const cls = mt === "다크" ? "text-amber-800"
                      : mt === "화이트" ? "text-yellow-700"
                      : mt === "핑크" ? "text-pink-700"
                      : "text-orange-700";
                    return <span className={`text-[9px] font-semibold whitespace-nowrap ${cls}`}>{mt}</span>;
                  })()}
                </div>
              )}
              {bSlot && (
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "3px" }}>
                  {renderSlot(bSlot)}
                  {(() => {
                    const mt = slotStatus[bSlot.id]?.materialType ?? null;
                    if (!mt) return null;
                    const cls = mt === "다크" ? "text-amber-800"
                      : mt === "화이트" ? "text-yellow-700"
                      : mt === "핑크" ? "text-pink-700"
                      : "text-orange-700";
                    return <span className={`text-[9px] font-semibold whitespace-nowrap ${cls}`}>{mt}</span>;
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`${card} p-4`}>

       {/* PIN 모달 */}
    {showPinModal && (
      <PinModal
        employees={employees}
        title="슬롯 작업 — 본인 확인"
        onSuccess={(empId, empName) => {
          pinLogin(empId, empName);
          setShowPinModal(false);
          if (pinPendingAction) {
            pinPendingAction(empName);
            setPinPendingAction(null);
          }
        }}
        onCancel={() => { setShowPinModal(false); setPinPendingAction(null); }}
      />
    )}

      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setIsExpanded((v) => !v)}
        >
          <div className="font-semibold text-sm">🌡️ 온장고 슬롯 현황</div>
          <span className="text-xs text-slate-400">{isExpanded ? "▲" : "▼"}</span>
        </button>
        <div className="flex items-center gap-2">
          <input type="date" className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            value={slotActionDate} onChange={(e) => setSlotActionDate(e.target.value)} />
          <button className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50" onClick={loadSlotStatus}>🔄 갱신</button>
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="flex flex-wrap gap-4">
            {/* 다크컴파운드 3×3 */}
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-500">다크컴파운드</div>
              <div className="grid grid-cols-3 gap-1.5">
                {warmerSlots.filter(s => s.purpose === "다크컴파운드").map(renderSlot)}
              </div>
            </div>

            {/* 화이트컴파운드 3×3 */}
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-500">화이트컴파운드</div>
              <div className="grid grid-cols-3 gap-1.5">
                {warmerSlots.filter(s => s.purpose === "화이트컴파운드").map(renderSlot)}
              </div>
            </div>

{/* 코팅/핑크 가로 1줄 */}
<div>
              <div className="mb-1.5 text-xs font-semibold text-slate-500">코팅/핑크</div>

              <div className="flex flex-row gap-1.5">
                {warmerSlots.filter(s => s.purpose === "코팅용도").map(renderSlot)}
              </div>
            </div>

            {/* 전사 */}
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-500">전사</div>
              <div className="flex flex-row gap-1.5">
                {warmerSlots.filter(s => s.purpose === "전사용도").map(renderSlot)}
              </div>
            </div>

            {/* 유동 2열 3행 */}
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-500">유동</div>
              {renderFluidGrid()}
            </div>
          </div>

          {/* 슬롯 액션 패널 */}
          {activeSlotId && (() => {
            const slot = warmerSlots.find((s) => s.id === activeSlotId);
            const st = slotStatus[activeSlotId];
            const isEmpty = st === null || st === undefined;

            return (
              <div className="mt-4 pt-4 border-t border-slate-200 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm">
                  {isEmpty ? `🧪 ${slot?.slot_name} — 원료투입` : `⚙️ ${slot?.slot_name} — 작업선택`}
                  </div>
                  <button className="text-xs text-slate-400 hover:text-slate-600"
                    onClick={() => { setActiveSlotId(null); setSlotMoveTargetId(null); }}>✕ 닫기</button>
                </div>

                {isEmpty ? (
                  <div className="flex gap-3 items-center flex-wrap">
                    {(() => {
                      const materialOptions = getMaterialOptions(slot?.purpose ?? "");
                      const needsMaterialSelect = materialOptions.length > 0;
                      return needsMaterialSelect ? (
                        <div>
                          <div className="mb-1 text-xs text-slate-500">원료 종류 *</div>
                          <div className="flex gap-2">
                            {materialOptions.map((t) => (
                              <button
                                key={t}
                                type="button"
                                className={`rounded-xl border px-4 py-2 text-sm font-bold transition-all ${
                                  selectedMaterialType === t
                                    ? t === "다크"
                                      ? "border-amber-600 bg-amber-700 text-white"
                                      : t === "화이트"
                                      ? "border-yellow-400 bg-yellow-400 text-amber-900"
                                      : t === "핑크"
                                      ? "border-pink-500 bg-pink-500 text-white"
                                      : t === "팜유"
                                      ? "border-orange-500 bg-orange-500 text-white"
                                      : "border-slate-400 bg-slate-600 text-white"
                                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                                }`}
                                onClick={() => setSelectedMaterialType(t)}
                              >{t}</button>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}
                    <div>
                      <div className="mb-1 text-xs text-slate-500">투입시각 (HHmm)</div>
                      <input className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        inputMode="numeric" placeholder="예: 1430" maxLength={4}
                        value={slotActionTime}
                        onChange={(e) => setSlotActionTime(e.target.value.replace(/[^\d]/g,"").slice(0,4))} />
                    </div>
                    {slotActionTime.length === 4 && (
                      <div className="text-xs text-slate-400 text-center self-center">
                        {slotActionTime.slice(0,2)}:{slotActionTime.slice(2,4)}
                      </div>
                    )}
                    <button
                      className="rounded-xl border border-green-500 bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
                      disabled={slotActionSaving || slotActionTime.length < 4 || (getMaterialOptions(slot?.purpose ?? "").length > 0 && !selectedMaterialType)}
                      onClick={() => requirePin((actionBy) => { saveSlotMaterialIn(activeSlotId, undefined, selectedMaterialType || undefined, actionBy); setSelectedMaterialType(""); })}
                    >
                      {slotActionSaving ? "저장 중..." : "🧪 원료투입"}
                    </button>
                  </div>            
             // after
            ) : (
              <div className="space-y-3">
                {/* 원료소진 / 슬롯이동 선택 버튼 */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`rounded-xl border px-4 py-2 text-sm font-bold transition-all ${slotMoveTargetId === "__out__" ? "border-orange-500 bg-orange-600 text-white" : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"}`}
                    onClick={() => setSlotMoveTargetId("__out__")}
                  >🗑️ 원료소진</button>
                  <button
                    type="button"
                    className={`rounded-xl border px-4 py-2 text-sm font-bold transition-all ${slotMoveTargetId !== "__out__" && slotMoveTargetId !== null ? "border-teal-500 bg-teal-600 text-white" : "border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100"}`}
                    onClick={() => setSlotMoveTargetId(null)}
                  >🔀 슬롯이동</button>
                </div>

                {slotMoveTargetId === "__out__" ? (
                  /* 원료소진 UI */
                  <div className="flex gap-3 items-end flex-wrap">
                    <div>
                      <div className="mb-1 text-xs text-slate-500">소진시각 (HHmm)</div>
                      <input className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        inputMode="numeric" placeholder="예: 1430" maxLength={4}
                        value={slotActionTime}
                        onChange={(e) => setSlotActionTime(e.target.value.replace(/[^\d]/g,"").slice(0,4))} />
                      {slotActionTime.length === 4 && (
                        <div className="mt-0.5 text-xs text-slate-400 text-center">
                          {slotActionTime.slice(0,2)}:{slotActionTime.slice(2,4)}
                        </div>
                      )}
                    </div>
                    <button
                      className="rounded-xl border border-orange-500 bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60"
                      disabled={slotActionSaving || slotActionTime.length < 4}
                      onClick={() => requirePin((actionBy) => saveSlotMaterialOut(activeSlotId!, actionBy))}
                    >
                      {slotActionSaving ? "저장 중..." : "🗑️ 원료소진 확정"}
                    </button>
                  </div>
                ) : (
                  /* 슬롯이동 UI */
                  <>
                    <div className="text-xs text-slate-500">
                      📤 <span className="font-semibold text-orange-600">{slot?.slot_name}</span>에서 이동할 슬롯을 클릭하세요
                    </div>
                    {slotMoveTargetId && (
                      <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm">
                        <span className="font-semibold text-orange-600">{slot?.slot_name}</span>
                        <span className="text-slate-400">→</span>
                        <span className="font-semibold text-teal-700">{warmerSlots.find((s) => s.id === slotMoveTargetId)?.slot_name}</span>
                      </div>
                    )}
                    <div className="flex gap-3 items-end flex-wrap">
                      <div>
                        <div className="mb-1 text-xs text-slate-500">이동시각 (HHmm)</div>
                        <input className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                          inputMode="numeric" placeholder="예: 1430" maxLength={4}
                          value={slotActionTime}
                          onChange={(e) => setSlotActionTime(e.target.value.replace(/[^\d]/g,"").slice(0,4))} />
                        {slotActionTime.length === 4 && (
                          <div className="mt-0.5 text-xs text-slate-400 text-center">
                            {slotActionTime.slice(0,2)}:{slotActionTime.slice(2,4)}
                          </div>
                        )}
                      </div>
                      {slotMoveTargetId && (
                        <button
                          className="rounded-xl border border-teal-500 bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60"
                          disabled={slotActionSaving || slotActionTime.length < 4}
                          onClick={() => requirePin((actionBy) => saveSlotMove(activeSlotId!, slotMoveTargetId, undefined, actionBy))}
                        >
                          {slotActionSaving ? "저장 중..." : "🔀 이동"}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}


              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ── 작업지시서 CCP 온도기록 카드 ──
export function WoCcpCard({
  selectedWo,
  eCcpSlotId, setECcpSlotId,
  warmerSlots,
  woEvents,
  ccpWoEventType, setCcpWoEventType,
  ccpWoTime, setCcpWoTime,
  ccpWoTemp, setCcpWoTemp,
  ccpWoIsOk, setCcpWoIsOk,
  ccpWoActionNote, setCcpWoActionNote,
  ccpWoSaving,
  ccpWoEditingId, setCcpWoEditingId,
  ccpWoEditTime, setCcpWoEditTime,
  ccpWoEditTemp, setCcpWoEditTemp,
  ccpWoEditIsOk, setCcpWoEditIsOk,
  ccpWoEditActionNote, setCcpWoEditActionNote,
  ccpWoEditSaving,
  isEditMode,
  saveWoEvent,
  startWoEventEdit,
  saveWoEventEdit,
  deleteWoEvent,
  supabaseClient,
  currentUserIdRef,
  onSlotSaved,
  foodCategory,
}: any) {
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const inp  = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
  const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";

  // 유동 슬롯 2열 3행 렌더 (CCP 슬롯 지정용, 라벨 없음)
  const renderWoFluidGrid = () => {
    const fluidSlots = warmerSlots.filter((s: any) => s.purpose === "유동");
    const aSlots = fluidSlots.filter((s: any) => s.slot_name.endsWith("A")).sort((a: any, b: any) => a.slot_name.localeCompare(b.slot_name));
    const bSlots = fluidSlots.filter((s: any) => s.slot_name.endsWith("B")).sort((a: any, b: any) => a.slot_name.localeCompare(b.slot_name));
    const rowCount = Math.max(aSlots.length, bSlots.length);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "row", gap: "6px" }}>
            {[aSlots[i], bSlots[i]].filter(Boolean).map((s: any) => (
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
                  if (eCcpSlotId === s.id) return;
                  setECcpSlotId(s.id);
                  await supabaseClient.from("work_orders")
                    .update({ ccp_slot_id: s.id, updated_at: new Date().toISOString() })
                    .eq("id", selectedWo.id);
                  onSlotSaved?.(s.id);
                }}
              >
                {s.slot_name}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const renderSlotBtn = (s: any) => (
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
        if (eCcpSlotId === s.id) return;
        setECcpSlotId(s.id);
        await supabaseClient.from("work_orders")
          .update({ ccp_slot_id: s.id, updated_at: new Date().toISOString() })
          .eq("id", selectedWo.id);
        onSlotSaved?.(s.id);
      }}
    >
      {s.slot_name}
    </button>
  );

  return (
    <>
      {/* 슬롯 지정 */}
      <div className={`${card} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="font-semibold text-sm">🌡️ CCP-1B 온장고 슬롯 지정</div>
        </div>

        <div className="flex flex-wrap gap-4">
          {/* 다크 3×3 */}
          {warmerSlots.filter((s: any) => s.purpose === "다크컴파운드").length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">다크</div>
              <div className="grid grid-cols-3 gap-1.5">
                {warmerSlots.filter((s: any) => s.purpose === "다크컴파운드").map(renderSlotBtn)}
              </div>
            </div>
          )}

          {/* 화이트 3×3 */}
          {warmerSlots.filter((s: any) => s.purpose === "화이트컴파운드").length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">화이트</div>
              <div className="grid grid-cols-3 gap-1.5">
                {warmerSlots.filter((s: any) => s.purpose === "화이트컴파운드").map(renderSlotBtn)}
              </div>
            </div>
          )}

{/* 코팅/핑크 가로 1줄 */}
{warmerSlots.filter((s: any) => s.purpose === "코팅용도").length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">코팅/핑크</div>
              <div className="flex flex-row gap-1.5">
                {warmerSlots.filter((s: any) => s.purpose === "코팅용도").map(renderSlotBtn)}
              </div>
            </div>
          )}

          {/* 전사 */}
          {warmerSlots.filter((s: any) => s.purpose === "전사용도").length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">전사</div>
              <div className="flex flex-row gap-1.5">
                {warmerSlots.filter((s: any) => s.purpose === "전사용도").map(renderSlotBtn)}
              </div>
            </div>
          )}

          {/* 유동 2열 3행, 라벨 없음 */}
          {warmerSlots.filter((s: any) => s.purpose === "유동").length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">유동</div>
              {renderWoFluidGrid()}
            </div>
          )}
        </div>
      </div>

      {/* 온도 기록 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-semibold text-sm">🌡️ CCP-1B 온도 기록 (작업지시서)</div>
            {eCcpSlotId
              ? <div className="mt-0.5 text-xs text-slate-400">슬롯: {warmerSlots.find((s: any) => s.id === eCcpSlotId)?.slot_name ?? "—"}</div>
              : <div className="mt-0.5 text-xs text-amber-500">⚠ 위의 슬롯 지정에서 온장고를 선택하면 기록할 수 있습니다</div>
            }
          </div>
        </div>

        {(eCcpSlotId || selectedWo?.ccp_slot_id) && (
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">유형</div>
              <div className="flex flex-wrap gap-1">
                {([
                  { value: "start",     label: "시작",     cls: "bg-blue-100 border-blue-400 text-blue-800" },
                  { value: "mid_check", label: "중간점검", cls: "bg-slate-100 border-slate-400 text-slate-700" },
                  { value: "end",       label: "종료",     cls: "bg-purple-100 border-purple-400 text-purple-800" },
                ] as { value: string; label: string; cls: string }[]).map((t) => (
                  <button key={t.value} type="button"
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                      ccpWoEventType === t.value ? t.cls + " shadow-sm scale-105" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                    onClick={() => setCcpWoEventType(t.value as any)}
                  >{t.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div>
                <div className="mb-1 text-xs text-slate-500">측정시각 (HHmm)</div>
                <input className={inp} inputMode="numeric" placeholder="예: 1430" maxLength={4}
                  value={ccpWoTime}
                  onChange={(e) => setCcpWoTime(e.target.value.replace(/[^\d]/g,"").slice(0,4))} />
                {ccpWoTime.length === 4 && (
                  <div className="mt-0.5 text-xs text-slate-400 text-right">
                    {ccpWoTime.slice(0,2)}:{ccpWoTime.slice(2,4)}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-500">온도 (40~50°C)</div>
                <input className={inpR} inputMode="numeric" placeholder="예: 45.0" value={ccpWoTemp}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g,"");
                    if (!raw) { setCcpWoTemp(""); return; }
                    const v = raw.length >= 3 ? `${raw.slice(0,-1)}.${raw.slice(-1)}` : raw;
                    setCcpWoTemp(v);
                    if (raw.length >= 3) setCcpWoIsOk(Number(v) >= 40 && Number(v) <= 50);
                  }} />
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-500">판정</div>
                <select className={`${inp} ${ccpWoIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
                  value={ccpWoIsOk ? "ok" : "ng"} onChange={(e) => setCcpWoIsOk(e.target.value === "ok")}>
                  <option value="ok">✅ 적합</option>
                  <option value="ng">❌ 부적합</option>
                </select>
              </div>
            </div>
            {!ccpWoIsOk && (
              <div>
                <div className="mb-1 text-xs text-red-600 font-semibold">⚠ 한계기준 이탈 — 조치사항 *</div>
                <input className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm focus:outline-none"
                  value={ccpWoActionNote} onChange={(e) => setCcpWoActionNote(e.target.value)} placeholder="온도 이탈 조치 내용" />
              </div>
            )}
            <button className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={ccpWoSaving}
              onClick={() => saveWoEvent(selectedWo, eCcpSlotId)}>
              {ccpWoSaving ? "저장 중..." : "💾 기록"}
            </button>
          </div>
        )}

        {woEvents.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">기록된 온도가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">시각</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">슬롯</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">유형</th>
                  <th className="py-2 px-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">온도</th>
                  <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">판정</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">조치</th>
                  <th className="py-2 px-2 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody>
                {[...woEvents].sort((a,b) => a.measured_at.localeCompare(b.measured_at)).map((ev, idx) => {
                  const isNG = ev.is_ok === false;
                  const isEditing = ccpWoEditingId === ev.id;
                  const slotName = warmerSlots.find((s: any) => s.id === ev.slot_id)?.slot_name ?? "—";
                  return (
                    <tr key={ev.id} className={`border-b border-slate-100 ${isEditing ? "bg-blue-50" : isNG ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                      <td className="py-2 px-3 font-mono text-sm text-slate-700 whitespace-nowrap">
                        {isEditing
                          ? <input className="w-24 rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none"
                              inputMode="numeric" placeholder="HHmm" maxLength={4}
                              value={ccpWoEditTime} onChange={(e) => setCcpWoEditTime(e.target.value.replace(/[^\d]/g,"").slice(0,4))} />
                          : toKSTTime(ev.measured_at)}
                      </td>
                      <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">{slotName}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ccpWoEventBadgeCls(ev.event_type)}`}>
                          {CCP_WO_EVENT_LABELS[ev.event_type] ?? ev.event_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {isEditing
                          ? <input className="w-20 rounded-lg border border-blue-300 px-2 py-1 text-xs text-right tabular-nums focus:outline-none"
                              inputMode="decimal" value={ccpWoEditTemp}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g,"");
                                if (!raw) { setCcpWoEditTemp(""); return; }
                                const v = raw.length >= 3 ? `${raw.slice(0,-1)}.${raw.slice(-1)}` : raw;
                                setCcpWoEditTemp(v);
                                if (raw.length >= 3) setCcpWoEditIsOk(Number(v) >= 40 && Number(v) <= 50);
                              }} />
                          : ev.temperature != null
                            ? <span className={`text-sm font-bold tabular-nums ${isNG ? "text-red-600" : "text-blue-700"}`}>{ev.temperature}°C</span>
                            : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        {isEditing
                          ? <select className={`rounded-lg border px-1.5 py-1 text-xs focus:outline-none ${ccpWoEditIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
                              value={ccpWoEditIsOk ? "ok" : "ng"} onChange={(e) => setCcpWoEditIsOk(e.target.value === "ok")}>
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
                              value={ccpWoEditActionNote} onChange={(e) => setCcpWoEditActionNote(e.target.value)} placeholder="조치사항" />
                          : <span className={isNG ? "text-red-600" : ""}>{ev.action_note ?? ""}</span>}
                      </td>
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        {isEditing
                          ? <div className="flex gap-1">
                              <button className="rounded-lg border border-blue-400 bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                disabled={ccpWoEditSaving} onClick={() => saveWoEventEdit(ev, ev.work_order_no)}>
                                {ccpWoEditSaving ? "..." : "저장"}
                              </button>
                              <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50"
                                onClick={() => setCcpWoEditingId(null)}>취소</button>
                            </div>
                          : <div className="flex gap-1">
                              <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
                                onClick={() => startWoEventEdit(ev)}>수정</button>
                              <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500"
                                onClick={() => deleteWoEvent(ev.id, ev.work_order_no)}>삭제</button>
                            </div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
              {(() => {
                const temps = woEvents.filter((e: WoEvent) => e.temperature != null).map((e: WoEvent) => e.temperature as number);
                const ngCount = woEvents.filter((e: WoEvent) => e.is_ok === false).length;
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
        )}
      </div>
    </>
  );
}

// ── 슬롯 상세 이벤트 패널 (CCP-1B 조회 페이지용) ──
export function SlotDetailPanel({
  slotId,
  slotName,
  slotEvents,
  warmerSlots,
}: {
  slotId: string;
  slotName: string;
  slotEvents: SlotEvent[];
  warmerSlots: { id: string; slot_name: string }[];
}) {
  const events = slotEvents.filter((e) => e.slot_id === slotId)
    .sort((a,b) => a.measured_at.localeCompare(b.measured_at));

  if (events.length === 0) return (
    <div className="py-4 text-center text-sm text-slate-400">{slotName} — 오늘 기록 없음</div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-200 bg-slate-50">
            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">시각</th>
            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">유형</th>
            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">작업지시서</th>
            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">비고</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev, idx) => (
            <tr key={ev.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
              <td className="py-2 px-3 font-mono text-sm text-slate-700 whitespace-nowrap">
                {toKSTTime(ev.measured_at)}
              </td>
              <td className="py-2 px-3 whitespace-nowrap">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ccpSlotEventBadgeCls(ev.event_type)}`}>
                  {CCP_SLOT_EVENT_LABELS[ev.event_type] ?? ev.event_type}
                </span>
              </td>
              <td className="py-2 px-3 text-xs text-slate-600">{ev.work_order_no ?? "—"}</td>
              <td className="py-2 px-3 text-xs text-slate-500">{ev.action_note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
