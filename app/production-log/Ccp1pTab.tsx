"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

// ─────────────────────── Styles ───────────────────────
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnBlue = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

// ─────────────────────── Types ───────────────────────
type WorkOrderItem = {
  id: string;
  product_name: string;
  client_name: string;
  updated_at: string;
  ccp_end_time?: string | null;
};

type MetalLog = {
  id: string;
  work_order_id: string;
  log_date: string;
  product_name: string | null;
  client_name: string | null;
  start_time: string | null;
  // A구역
  a_fe_l: string | null; a_fe_m: string | null; a_fe_r: string | null;
  a_sus_l: string | null; a_sus_m: string | null; a_sus_r: string | null;
  a_product_pass: string | null;
  a_fe_up_l: string | null; a_fe_up_m: string | null; a_fe_up_r: string | null;
  a_fe_dn_l: string | null; a_fe_dn_m: string | null; a_fe_dn_r: string | null;
  a_sus_up_l: string | null; a_sus_up_m: string | null; a_sus_up_r: string | null;
  a_sus_dn_l: string | null; a_sus_dn_m: string | null; a_sus_dn_r: string | null;
  // B구역
  b_fe_l: string | null; b_fe_m: string | null; b_fe_r: string | null;
  b_sus_l: string | null; b_sus_m: string | null; b_sus_r: string | null;
  b_product_pass: string | null;
  b_fe_up_l: string | null; b_fe_up_m: string | null; b_fe_up_r: string | null;
  b_fe_dn_l: string | null; b_fe_dn_m: string | null; b_fe_dn_r: string | null;
  b_sus_up_l: string | null; b_sus_up_m: string | null; b_sus_up_r: string | null;
  b_sus_dn_l: string | null; b_sus_dn_m: string | null; b_sus_dn_r: string | null;
  b_end_time: string | null;
  b_deviation: string | null;
  b_pass_qty: number | null;
  action_note: string | null;
  note: string | null;
  worker_name: string | null;
  confirmed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

// 담당자 → 서명 이미지 경로
const SIGN_MAP: Record<string, string> = {
  "조은미": "/sign-choem.png",
  "강미라": "/sign-kangml.png",
  "나현우": "/sign-nahw.png",
  "나미영": "/sign-namiy.png",
  "조대성": "/sign-chods.png",
  "김영각": "/sign-kimyg.png",
  "고한결": "/sign-gohg.png",
};

// 빈 기록 초기값
function emptyLog(workOrderId: string, productName: string, clientName: string, logDate: string): Omit<MetalLog, "id"> {
  return {
    work_order_id: workOrderId,
    log_date: logDate,
    product_name: productName,
    client_name: clientName,
    start_time: null,
    a_fe_l: "O", a_fe_m: "O", a_fe_r: "O",
    a_sus_l: "O", a_sus_m: "O", a_sus_r: "O",
    a_product_pass: "X",
    a_fe_up_l: "O", a_fe_up_m: "O", a_fe_up_r: "O",
    a_fe_dn_l: "O", a_fe_dn_m: "O", a_fe_dn_r: "O",
    a_sus_up_l: "O", a_sus_up_m: "O", a_sus_up_r: "O",
    a_sus_dn_l: "O", a_sus_dn_m: "O", a_sus_dn_r: "O",
    b_fe_l: null, b_fe_m: null, b_fe_r: null,
    b_sus_l: null, b_sus_m: null, b_sus_r: null,
    b_product_pass: "X",
    b_fe_up_l: null, b_fe_up_m: null, b_fe_up_r: null,
    b_fe_dn_l: null, b_fe_dn_m: null, b_fe_dn_r: null,
    b_sus_up_l: null, b_sus_up_m: null, b_sus_up_r: null,
    b_sus_dn_l: null, b_sus_dn_m: null, b_sus_dn_r: null,
    b_end_time: null,
    b_deviation: "X",
    b_pass_qty: null,
    action_note: null,
    note: null,
    worker_name: null,
    confirmed_by: null,
    approved_by: null,
    approved_at: null,
  };
}

// ─────────────────────── O/X 토글 ───────────────────────
function OxToggle({
  value, onChange,
}: { value: string | null; onChange: (v: string) => void; }) {
  const cur = value ?? "O";
  const isO = cur === "O";
  return (
    <button
      type="button"
      className={`w-8 h-7 rounded-lg text-xs font-bold transition-colors border ${
        isO
          ? "bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200"
          : "bg-red-100 text-red-600 border-red-300 hover:bg-red-200"
      }`}
      onClick={() => onChange(isO ? "X" : "O")}
    >
      {cur}
    </button>
  );
}

// ─────────────────────── 섹션 헤더 ───────────────────────
function ZoneHeader({ label, color, title, sub }: { label: string; color: "blue" | "amber"; title: string; sub?: string }) {
  const cls = color === "blue"
    ? "bg-blue-100 text-blue-700"
    : "bg-amber-100 text-amber-700";
  return (
    <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-200 bg-slate-50 px-4 py-2.5">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${cls}`}>{label}</span>
      <span className="text-sm font-semibold">{title}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

// ─────────────────────── 구역 테이블 ───────────────────────
type ZoneFields = {
  fe_l: string | null; fe_m: string | null; fe_r: string | null;
  sus_l: string | null; sus_m: string | null; sus_r: string | null;
  product_pass: string | null;
  fe_up_l: string | null; fe_up_m: string | null; fe_up_r: string | null;
  fe_dn_l: string | null; fe_dn_m: string | null; fe_dn_r: string | null;
  sus_up_l: string | null; sus_up_m: string | null; sus_up_r: string | null;
  sus_dn_l: string | null; sus_dn_m: string | null; sus_dn_r: string | null;
  end_time?: string | null;
  deviation?: string | null;
  pass_qty?: number | null;
};

function ZoneTable({
    zone, fields, onChange, showExtra = false, disabled = false, showFull = true,
  }: {
    zone: "A" | "B";
    fields: ZoneFields;
    onChange: (key: keyof ZoneFields, val: string | number | null) => void;
    showExtra?: boolean;
    disabled?: boolean;
    showFull?: boolean;
  })


{
  const thTop = "border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[11px] font-semibold text-slate-500 whitespace-nowrap";
  const thSub = "border border-slate-200 bg-slate-50 px-1 py-1 text-center text-[10px] text-slate-400 whitespace-nowrap";
  const td = "border border-slate-200 px-1 py-2 text-center";
  const tdDim = "border border-slate-200 px-1 py-2 text-center bg-slate-50 opacity-30 pointer-events-none";
  const label = "border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-600 whitespace-nowrap";

  return (
    <div className="overflow-x-auto">
    <table className="w-full border-collapse text-xs" style={{ minWidth: showFull ? 900 : 460 }}>
    <thead>
          <tr>

          <th className={thTop} rowSpan={2} style={{ width: 110 }}>항목</th>
{!showFull && <th className={thTop} rowSpan={2}>제품<br />통과</th>}
<th className={thTop} colSpan={3}>Fe 시편</th>
<th className={thTop} colSpan={3}>SUS 시편</th>

{showFull && (
  <>
    <th className={thTop} colSpan={3}>Fe+제품(상)</th>
    <th className={thTop} colSpan={3}>Fe+제품(하)</th>
    <th className={thTop} colSpan={3}>SUS+제품(상)</th>
    <th className={thTop} colSpan={3}>SUS+제품(하)</th>
  </>
)}
{showExtra && <th className={thTop} rowSpan={2}>이탈유무</th>}  


          </tr>
          <tr>
          <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>  {/* Fe */}
<th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>  {/* SUS */}
{showFull && (
  <>
    <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>
    <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>
    <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>
    <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>
  </>
)}
          </tr>
        </thead>
 
        <tbody>
  <tr>
    <td className={label}>감도모니터링<br />&amp;공정품확인</td>
   
    {!showFull && (
  <td className={disabled ? tdDim : td}>
    <OxToggle value={fields.product_pass} onChange={(v) => onChange("product_pass", v)} />
  </td>
)}
{(["fe_l","fe_m","fe_r","sus_l","sus_m","sus_r"] as (keyof ZoneFields)[]).map((k) => (
  <td key={k} className={disabled ? tdDim : td}>
    <OxToggle value={fields[k] as string | null} onChange={(v) => onChange(k, v)} />
  </td>
))}
    {showFull && (() => {
      const extraKeys: (keyof ZoneFields)[] = [
        "fe_up_l","fe_up_m","fe_up_r",
        "fe_dn_l","fe_dn_m","fe_dn_r",
        "sus_up_l","sus_up_m","sus_up_r",
        "sus_dn_l","sus_dn_m","sus_dn_r",
      ];
      return extraKeys.map((k) => (
        <td key={k} className={disabled ? tdDim : td}>
          <OxToggle value={fields[k] as string | null} onChange={(v) => onChange(k, v)} />
        </td>
      ));
    })()}
    {showExtra && (
      <td className={td}>
        <OxToggle value={fields.deviation ?? "X"} onChange={(v) => onChange("deviation", v)} />
      </td>
    )}
  </tr>
</tbody>

      </table>
    </div>
  );
}

// ─────────────────────── 인쇄 전용 OX 셀 ───────────────────────
function PrintOx({ val }: { val: string | null }) {
  const v = val ?? "O";
  return (
    <td
      style={{
        border: "1px solid #000",
        textAlign: "center",
        fontSize: "8pt",
        fontWeight: "bold",
        color: v === "O" ? "#059669" : "#DC2626",
        padding: "1px",
        width: 22,
      }}
    >
      {v}
    </td>
  );
}

// ─────────────────────── 인쇄 전용 빈 OX 셀 ───────────────────────
function PrintOxEmpty() {
  return (
    <td style={{ border: "1px solid #000", textAlign: "center", fontSize: "8pt", width: 22, padding: "1px" }}>
      &nbsp;
    </td>
  );
}

// ─────────────────────── Main Tab ───────────────────────
export function Ccp1pTab({ role, userId, showToast, initialWoId }: {
  role: UserRole;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
  initialWoId?: string | null;
}) {
  const todayKST = () =>
    new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 10);

  const [selectedDate, setSelectedDate] = useState<string>(todayKST());

  const [woList, setWoList] = useState<WorkOrderItem[]>([]);
  const [logMap, setLogMap] = useState<Record<string, MetalLog>>({});
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<MetalLog, "id"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rangePanelOpen, setRangePanelOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState<string>(todayKST());
  const [rangeTo, setRangeTo] = useState<string>(todayKST());
  const [rangeLogs, setRangeLogs] = useState<Record<string, MetalLog[]>>({});
  const [rangeLoading, setRangeLoading] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string | null }[]>([]);

  useEffect(() => {
    supabase.from("employees").select("id,name").is("resign_date", null).order("name")
      .then(({ data }: { data: any[] | null }) => setEmployees(data ?? []));
  }, []);

  const [confirmerUserId, setConfirmerUserId] = useState<string | null>(null);
  const [approverUserId, setApproverUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("users").select("id,name").then(({ data }: { data: any[] | null }) => {
      const confirmer = data?.find((u: any) => u.name === "김영각");
      const approver = data?.find((u: any) => u.name === "조대성");
      setConfirmerUserId(confirmer?.id ?? null);
      setApproverUserId(approver?.id ?? null);
    });
  }, []);

  const loadWoList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
    .from("work_orders")
    .select("id, product_name, client_name, updated_at, work_order_no")
    .eq("status_production", true)
    .in("status", ["생산중", "완료"])
    .gte("updated_at", `${selectedDate}T00:00:00+09:00`)
    .lt("updated_at", `${selectedDate}T23:59:59+09:00`)
    .order("updated_at", { ascending: true });

    // CCP 종료 시각 조회
    const woNos = (data ?? []).map((w: any) => w.work_order_no);
    let ccpEndMap: Record<string, string> = {};
    if (woNos.length > 0) {
      const { data: ccpEvs } = await supabase
        .from("ccp_wo_events")
        .select("work_order_no, measured_at")
        .in("work_order_no", woNos)
        .eq("event_type", "end")
        .order("measured_at", { ascending: false });
      for (const ev of ccpEvs ?? []) {
        if (!ccpEndMap[ev.work_order_no]) {
          ccpEndMap[ev.work_order_no] = ev.measured_at;
        }
      }
    }
    const enriched = (data ?? []).map((w: any) => ({
      ...w,
      ccp_end_time: ccpEndMap[w.work_order_no] ?? null,
    }));
    setWoList(enriched as WorkOrderItem[]);
    setLoading(false);
  }, [selectedDate]);

  const loadLogs = useCallback(async () => {
    const { data } = await supabase
      .from("ccp_metal_logs")
      .select("*")
      .eq("log_date", selectedDate);

    if (!data) return;
    const map: Record<string, MetalLog> = {};
    for (const row of data) {
      if (row.work_order_id) map[row.work_order_id] = row as MetalLog;
    }
    setLogMap(map);
  }, [selectedDate]);

  async function loadRangeLogs() {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return;
    setRangeLoading(true);
    const { data } = await supabase
      .from("ccp_metal_logs")
      .select("*")
      .gte("log_date", rangeFrom)
      .lte("log_date", rangeTo)
      .order("log_date", { ascending: true })
      .order("start_time", { ascending: true });
    setRangeLoading(false);
    if (!data) return;
    const grouped: Record<string, MetalLog[]> = {};
    for (const row of data) {
      const d = row.log_date as string;
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(row as MetalLog);
    }
    setRangeLogs(grouped);
  }

  useEffect(() => {
    loadWoList();
    loadLogs();
  }, [loadWoList, loadLogs]);

  // URL로 전달된 WO 자동 선택 — 미기록 항목만
  useEffect(() => {
    if (!initialWoId || loading) return;
    const wo = woList.find((w) => w.id === initialWoId);
    if (wo && selectedWoId !== initialWoId && !logMap[initialWoId]) {
      selectWo(wo);
    }
  }, [initialWoId, woList, loading, logMap]);

// 변경 후
function selectWo(wo: WorkOrderItem) {
  setSelectedWoId(wo.id);
  const existing = logMap[wo.id];
  if (existing) {
    setFormData({ ...existing });
  } else {
    setFormData(emptyLog(wo.id, wo.product_name, wo.client_name, selectedDate)); 
  }
  setTimeout(() => {
    document.getElementById(`form-${wo.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 50);
}

  function setA(key: keyof ZoneFields, val: string | number | null) {
    if (!formData) return;
    const map: Record<keyof ZoneFields, keyof Omit<MetalLog,"id">> = {
      fe_l: "a_fe_l", fe_m: "a_fe_m", fe_r: "a_fe_r",
      sus_l: "a_sus_l", sus_m: "a_sus_m", sus_r: "a_sus_r",
      product_pass: "a_product_pass",
      fe_up_l: "a_fe_up_l", fe_up_m: "a_fe_up_m", fe_up_r: "a_fe_up_r",
      fe_dn_l: "a_fe_dn_l", fe_dn_m: "a_fe_dn_m", fe_dn_r: "a_fe_dn_r",
      sus_up_l: "a_sus_up_l", sus_up_m: "a_sus_up_m", sus_up_r: "a_sus_up_r",
      sus_dn_l: "a_sus_dn_l", sus_dn_m: "a_sus_dn_m", sus_dn_r: "a_sus_dn_r",
    } as any;
    setFormData((prev: any) => prev ? { ...prev, [map[key]]: val } : prev);
  }

  function setB(key: keyof ZoneFields, val: string | number | null) {
    if (!formData) return;
    const map: Record<string, keyof Omit<MetalLog,"id">> = {
      fe_l: "b_fe_l", fe_m: "b_fe_m", fe_r: "b_fe_r",
      sus_l: "b_sus_l", sus_m: "b_sus_m", sus_r: "b_sus_r",
      product_pass: "b_product_pass",
      fe_up_l: "b_fe_up_l", fe_up_m: "b_fe_up_m", fe_up_r: "b_fe_up_r",
      fe_dn_l: "b_fe_dn_l", fe_dn_m: "b_fe_dn_m", fe_dn_r: "b_fe_dn_r",
      sus_up_l: "b_sus_up_l", sus_up_m: "b_sus_up_m", sus_up_r: "b_sus_up_r",
      sus_dn_l: "b_sus_dn_l", sus_dn_m: "b_sus_dn_m", sus_dn_r: "b_sus_dn_r",
      end_time: "b_end_time",
      deviation: "b_deviation",
      pass_qty: "b_pass_qty",
    };
    setFormData((prev: any) => prev ? { ...prev, [map[key]]: val } : prev);
  }

  async function save() {
    if (!formData || !selectedWoId) return;
    if (!formData.start_time) return showToast("시작시간을 입력하세요.", "error");
    if (!formData.b_end_time || formData.b_end_time.length < 5) return showToast("종료시간을 입력하세요.", "error");

    const wo = woList.find((w: any) => w.id === selectedWoId);
    if (wo && formData.start_time) {
      const completedDate = new Date(wo.updated_at);
      const completedKst24 = completedDate.toLocaleTimeString("ko-KR", {
        timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
      });
      if (formData.start_time < completedKst24) {
        return showToast(`시작시간(${formData.start_time})은 생산완료 시간(${completedKst24})보다 늦어야 합니다.`, "error");
      }
    }

    if (formData.b_end_time && formData.b_end_time.length === 5 && formData.start_time) {
      if (formData.b_end_time <= formData.start_time) {
        return showToast("종료시간은 시작시간보다 늦어야 합니다.", "error");
      }
    }

    const myStart = formData.start_time;
    const myEnd = formData.b_end_time && formData.b_end_time.length === 5 ? formData.b_end_time : myStart;

    for (const [woId, log] of Object.entries(logMap) as [string, MetalLog][]) {
      if (woId === selectedWoId) continue;
      if (!log.start_time) continue;
      const otherStart = log.start_time;
      const otherEnd = log.b_end_time && log.b_end_time.length === 5 ? log.b_end_time : otherStart;
      const overlaps = myStart < otherEnd && myEnd > otherStart;
      if (overlaps) {
        const otherWo = woList.find((w: any) => w.id === woId);
        const otherName = otherWo ? `${otherWo.client_name} — ${otherWo.product_name}` : woId;
        return showToast(
          `시간이 겹칩니다: "${otherName}" (${otherStart}~${otherEnd})\n금속검출기는 1대이므로 시간이 겹칠 수 없습니다.`,
          "error"
        );
      }
    }

    const aDefaultO = ["a_fe_l","a_fe_m","a_fe_r","a_sus_l","a_sus_m","a_sus_r",
      "a_fe_up_l","a_fe_up_m","a_fe_up_r","a_fe_dn_l","a_fe_dn_m","a_fe_dn_r",
      "a_sus_up_l","a_sus_up_m","a_sus_up_r","a_sus_dn_l","a_sus_dn_m","a_sus_dn_r"] as (keyof typeof formData)[];
    const aDefaultX = ["a_product_pass"] as (keyof typeof formData)[];
    const bDefaultO = ["b_fe_l","b_fe_m","b_fe_r","b_sus_l","b_sus_m","b_sus_r"] as (keyof typeof formData)[];
  const bDefaultX = ["b_product_pass","b_deviation"] as (keyof typeof formData)[];

    const aChanged = aDefaultO.some((k) => formData[k] === "X") || aDefaultX.some((k) => formData[k] === "O");
    const bActive = (formData.b_pass_qty ?? 0) > 1;
    const bChanged = bActive && (bDefaultO.some((k) => formData[k] === "X") || bDefaultX.some((k) => formData[k] === "O"));

    if (aChanged || bChanged) {
      const zones = [aChanged && "A구역", bChanged && "B구역"].filter(Boolean).join(", ");
      const ok = confirm(`[${zones}] 기본값과 다른 입력값이 있습니다.\n내용을 다시 확인하셨나요?\n\n확인 → 저장 / 취소 → 다시 검토`);
      if (!ok) return;
    }

    setSaving(true);

    const existing = logMap[selectedWoId];
    const payload = {
      ...formData,
      confirmed_by: confirmerUserId,
      approved_by: approverUserId,
      approved_at: approverUserId ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existing?.id) {
      ({ error } = await supabase.from("ccp_metal_logs").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("ccp_metal_logs").insert(payload));
    }

    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");

    // ── CCP-1P 저장 완료 후: 재고 입고 + assignee_input + status = "완료" ──
    try {
      const { data: woData } = await supabase
        .from("work_orders")
        .select("variant_id, work_order_no, food_type, work_order_items(id, actual_qty, unit_weight, expiry_date, barcode_no, sub_items, transfer_lot_id, transfer_qty)")
        .eq("id", selectedWoId)
        .single();

      if (woData) {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id ?? null;
        const stockErrors: string[] = [];

        const items = ((woData as any).work_order_items ?? []).filter((item: any) => {
          const name = (item.sub_items ?? [])[0]?.name ?? "";
          return !name.startsWith("성형틀") && !name.startsWith("인쇄제판");
        });

        // 재고 입고
        for (const item of items) {
          if (!item.actual_qty || !item.expiry_date) continue;
          const actual_qty = Number(item.actual_qty);
          if (actual_qty <= 0) continue;

          let variantId: string | null = null;
          if (item.barcode_no) {
            const { data: pbData } = await supabase
              .from("product_barcodes").select("variant_id")
              .eq("barcode", item.barcode_no).maybeSingle();
            variantId = pbData?.variant_id ?? null;
          }
          if (!variantId) variantId = (woData as any).variant_id;
          if (!variantId) { stockErrors.push(`variant 없음 (${(item.sub_items ?? [])[0]?.name ?? item.id})`); continue; }

          let lotId: string | null = null;
          const { data: existingLot } = await supabase
            .from("lots").select("id")
            .eq("variant_id", variantId).eq("expiry_date", item.expiry_date).maybeSingle();
          if (existingLot) {
            lotId = existingLot.id;
          } else {
            const { data: newLot, error: lotErr } = await supabase
              .from("lots").insert({ variant_id: variantId, expiry_date: item.expiry_date })
              .select("id").single();
            if (lotErr) { stockErrors.push("LOT 생성 실패: " + lotErr.message); continue; }
            lotId = newLot.id;
          }

          const endTime = (formData.b_end_time ?? "00:00").slice(0, 5);
          const { error: movErr } = await supabase.from("movements").insert({
            lot_id: lotId,
            type: "IN",
            qty: actual_qty,
            happened_at: `${selectedDate}T${endTime}:00+09:00`,
            note: "작업지시서 생산완료 - " + (woData as any).work_order_no,
            created_by: userId,
          });
          if (movErr) stockErrors.push("입고 기록 실패: " + movErr.message);
        }

        // work_orders: assignee_input = 담당자, status_input = true, status = "완료"
        const workerName = formData.worker_name ?? null;
        const { error: updateErr } = await supabase.from("work_orders").update({
          assignee_input: workerName,
          status_input: true,
          status: "완료",
        }).eq("id", selectedWoId);

        if (updateErr) {
          showToast("⚠️ CCP-1P 저장됐으나 완료 처리 실패: " + updateErr.message, "error");
        } else if (stockErrors.length > 0) {
          showToast("⚠️ CCP-1P 저장됐으나 재고 연동 오류: " + stockErrors.join(" / "), "error");
        } else {
          showToast("✅ CCP-1P 기록 완료! 작업지시서가 완료 처리됐습니다.");
        }
      }
    } catch (e: any) {
      showToast("⚠️ CCP-1P 저장됐으나 완료 처리 오류: " + (e?.message ?? e), "error");
    }

    await loadLogs();
    await loadWoList();
    setSelectedWoId(null);
    setFormData(null);
  }

  const aFields = (f: Omit<MetalLog,"id">): ZoneFields => ({
    fe_l: f.a_fe_l, fe_m: f.a_fe_m, fe_r: f.a_fe_r,
    sus_l: f.a_sus_l, sus_m: f.a_sus_m, sus_r: f.a_sus_r,
    product_pass: f.a_product_pass,
    fe_up_l: f.a_fe_up_l, fe_up_m: f.a_fe_up_m, fe_up_r: f.a_fe_up_r,
    fe_dn_l: f.a_fe_dn_l, fe_dn_m: f.a_fe_dn_m, fe_dn_r: f.a_fe_dn_r,
    sus_up_l: f.a_sus_up_l, sus_up_m: f.a_sus_up_m, sus_up_r: f.a_sus_up_r,
    sus_dn_l: f.a_sus_dn_l, sus_dn_m: f.a_sus_dn_m, sus_dn_r: f.a_sus_dn_r,
  });

  const bFields = (f: Omit<MetalLog,"id">): ZoneFields => ({
    fe_l: f.b_fe_l, fe_m: f.b_fe_m, fe_r: f.b_fe_r,
    sus_l: f.b_sus_l, sus_m: f.b_sus_m, sus_r: f.b_sus_r,
    product_pass: f.b_product_pass,
    fe_up_l: f.b_fe_up_l, fe_up_m: f.b_fe_up_m, fe_up_r: f.b_fe_up_r,
    fe_dn_l: f.b_fe_dn_l, fe_dn_m: f.b_fe_dn_m, fe_dn_r: f.b_fe_dn_r,
    sus_up_l: f.b_sus_up_l, sus_up_m: f.b_sus_up_m, sus_up_r: f.b_sus_up_r,
    sus_dn_l: f.b_sus_dn_l, sus_dn_m: f.b_sus_dn_m, sus_dn_r: f.b_sus_dn_r,
    end_time: f.b_end_time,
    deviation: f.b_deviation,
    pass_qty: f.b_pass_qty,
  });

  function toKstTime(utcStr: string) {
    return new Date(utcStr).toLocaleTimeString("ko-KR", {
      timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
    });
  }

  function printRange() {
    const dates = Object.keys(rangeLogs).sort();
    if (dates.length === 0) return showToast("조회된 기록이 없습니다.", "error");
    const content = document.getElementById("ccp1p-range-print-inner");
    if (!content) return;
    const printTitle = `CCP-1P_금속검출_${rangeFrom}_${rangeTo}`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>${printTitle}</title>
      <style>
        @page { size: A4 landscape; margin: 8mm 10mm; }
        body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 8.5pt; color: #000; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        table { border-collapse: collapse; }
        img { max-width: none; }
        .page-block { page-break-after: always; }
        .page-block:last-child { page-break-after: avoid; }
      </style>
    </head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  // ── 인쇄용: logMap을 시작시간 순으로 정렬한 기록 목록 ──
  const sortedLogs: MetalLog[] = Object.values(logMap).sort((a, b) => {
    const ta = a.start_time ?? "";
    const tb = b.start_time ?? "";
    return ta.localeCompare(tb);
  });

  // ── 인쇄용: 이탈 기록 수집 ──
  function getDeviationDesc(log: MetalLog): string {
    const parts: string[] = [];
    const aFields: [string, string][] = [
      ["a_fe_l","Fe시편(좌)"],["a_fe_m","Fe시편(중)"],["a_fe_r","Fe시편(우)"],
      ["a_sus_l","SUS시편(좌)"],["a_sus_m","SUS시편(중)"],["a_sus_r","SUS시편(우)"],
      ["a_product_pass","제품통과"],
      ["a_fe_up_l","Fe+제품상(좌)"],["a_fe_up_m","Fe+제품상(중)"],["a_fe_up_r","Fe+제품상(우)"],
      ["a_fe_dn_l","Fe+제품하(좌)"],["a_fe_dn_m","Fe+제품하(중)"],["a_fe_dn_r","Fe+제품하(우)"],
      ["a_sus_up_l","SUS+제품상(좌)"],["a_sus_up_m","SUS+제품상(중)"],["a_sus_up_r","SUS+제품상(우)"],
      ["a_sus_dn_l","SUS+제품하(좌)"],["a_sus_dn_m","SUS+제품하(중)"],["a_sus_dn_r","SUS+제품하(우)"],
    ];
    for (const [key, label] of aFields) {
      const val = (log as any)[key];
      const defaultVal = key === "a_product_pass" ? "X" : "O";
      if (val && val !== defaultVal) parts.push(`A-${label}`);
    }
    if (log.b_deviation === "O") parts.push("B-이탈");
    const name = `${log.start_time ?? ""} ${log.client_name ?? ""} ${log.product_name ?? ""}`.trim();
    return parts.length > 0 ? `${name} / ${parts.join(", ")}` : "";
  }

  const deviationRows = sortedLogs
    .map((log) => ({ log, desc: getDeviationDesc(log) }))
    .filter((r) => r.desc !== "");

  // ── 인쇄용 날짜 포맷 ──
  const printDate = (() => {
    const d = new Date(selectedDate + "T00:00:00+09:00");
    const days = ["일","월","화","수","목","금","토"];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  })();

  // ── 빈 행 (테이블 여백용, 최소 3행 보장) ──
  const EMPTY_ROW_MIN = 3;
  const emptyRowCount = Math.max(EMPTY_ROW_MIN, EMPTY_ROW_MIN - sortedLogs.length);

  const tdBase: React.CSSProperties = { border: "1px solid #000", padding: "2px 3px", fontSize: "8pt", verticalAlign: "middle" };
  const thBase: React.CSSProperties = { border: "1px solid #000", padding: "2px 3px", fontSize: "7.5pt", fontWeight: "bold", textAlign: "center", background: "#fff", verticalAlign: "middle" };
  const thSub: React.CSSProperties = { border: "1px solid #000", padding: "1px 2px", fontSize: "7pt", textAlign: "center", background: "#fff", verticalAlign: "middle" };
  const thA: React.CSSProperties = { ...thSub, background: "#dbeafe" };
  const thB: React.CSSProperties = { ...thSub, background: "#fef9c3" };
  const thATop: React.CSSProperties = { ...thBase, background: "#dbeafe" };
  const thBTop: React.CSSProperties = { ...thBase, background: "#fef9c3" };

  return (
    <div className="space-y-4">

   

      {/* ══════════════════════════════════════════
          화면용 UI (기존 그대로)
      ══════════════════════════════════════════ */}

      {/* ── 기간 인쇄 패널 ── */}
      <div className={`${card} print:hidden overflow-hidden transition-all`}>
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => setRangePanelOpen((v) => !v)}
        >
          <span>📅 기간별 인쇄</span>
          <span className="text-slate-400 text-xs">{rangePanelOpen ? "▲ 닫기" : "▼ 열기"}</span>
        </button>
        {rangePanelOpen && (
          <div className="border-t border-slate-100 px-4 py-4 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
            <div>
                <div className="mb-1 text-xs text-slate-500">시작일</div>
                <input
                  type="date"
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                  value={rangeFrom}
                  max={rangeTo}
                  onChange={(e) => { setRangeFrom(e.target.value); setRangeLogs({}); }}
                />
              </div>
              <div className="text-slate-400 pb-1.5">~</div>
              <div>
                <div className="mb-1 text-xs text-slate-500">종료일</div>
                <input
                  type="date"
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                  value={rangeTo}
                  max={todayKST()}
                  onChange={(e) => { setRangeTo(e.target.value); setRangeLogs({}); }}
                />
              </div>
              <button
                className={`rounded-xl px-4 py-1.5 text-sm font-semibold text-white ${rangeLoading ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700"}`}
                disabled={rangeLoading || !rangeFrom || !rangeTo || rangeFrom > rangeTo}
                onClick={loadRangeLogs}
              >
                {rangeLoading ? "조회 중..." : "🔍 조회"}
              </button>
              {Object.keys(rangeLogs).length > 0 && !rangeLoading && (
                <button
                  className="rounded-xl border border-slate-300 bg-slate-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
                  onClick={printRange}
                >
                  🖨️ 인쇄
                </button>
              )}
            </div>
            {Object.keys(rangeLogs).length > 0 && !rangeLoading && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {Object.keys(rangeLogs).sort().map((d) => (
                  <span key={d} className="mr-3">
                    <span className="font-semibold">{d}</span>
                    <span className="text-slate-400 ml-1">{rangeLogs[d].length}건</span>
                  </span>
                ))}
              </div>
            )}
            {Object.keys(rangeLogs).length === 0 && !rangeLoading && rangeFrom && rangeTo && (
              <div className="text-xs text-slate-400">조회 버튼을 눌러 기간 내 기록을 불러오세요.</div>
            )}
          </div>
        )}
      </div>

   {/* ── 날짜 선택 ── */}
   <div className={`${card} p-3 print:hidden flex flex-wrap items-center gap-3`}>
        <span className="text-sm font-semibold text-slate-600">조회 날짜</span>
        <input
          type="date"
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          value={selectedDate}
          max={todayKST()}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            setSelectedWoId(null);
            setFormData(null);
          }}
        />
        <button className={btn} onClick={() => { loadWoList(); loadLogs(); }}>🔄 새로고침</button>
        <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50" onClick={() => {
          const content = document.getElementById("ccp1p-print-inner");
          if (!content) return;
          const printTitle = `CCP-1P_금속검출_${selectedDate}`;
          const win = window.open("", "_blank");
          if (!win) return;
          win.document.write(`<!DOCTYPE html><html><head>
            <meta charset="utf-8">
            <title>${printTitle}</title>
            <style>
              @page { size: A4 landscape; margin: 8mm 10mm; }
              body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 8.5pt; color: #000; }
              * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              table { border-collapse: collapse; }
              img { max-width: none; }
            </style>
          </head><body>${content.innerHTML}</body></html>`);
          win.document.close();
          win.focus();
          setTimeout(() => { win.print(); }, 500);
        }}>🖨️ 인쇄</button>
        {selectedDate !== todayKST() && (
          <>
            <button
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
              onClick={() => { setSelectedDate(todayKST()); setSelectedWoId(null); setFormData(null); }}
            >
              오늘로 돌아가기
            </button>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              과거 기록 조회 중
            </span>
          </>
        )}
      </div>

      {/* ── 공통사항 ── */}
      <div className={`${card} p-4 print:hidden`}> 
        <div className="mb-2 text-xs font-semibold text-slate-500">공통사항</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm md:grid-cols-4 mb-3">
          <div><span className="text-xs text-slate-400">한계기준</span><div>Fe 2.5mmφ &nbsp;/&nbsp; SUS 3.0mmφ</div></div>
          <div><span className="text-xs text-slate-400">검교정주기</span><div>연 1회</div></div>
          <div><span className="text-xs text-slate-400">감도 모니터링 점검주기</span><div>작업시작 전 · 작업중 2시간마다 · 종료 후</div></div>
          <div><span className="text-xs text-slate-400">공정품 확인</span><div>제품변경 시 &amp; 작업 중 상시</div></div>
        </div>
        <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
          <div><span className="font-semibold text-slate-700">방법 —</span> 감도 모니터링: &nbsp;① 표준시편만 통과 &nbsp;② 금속이물이 없는 것으로 확인된 공정품 통과 &nbsp;③ 표준시편과 공정품을 함께 통과</div>
          <div><span className="font-semibold text-slate-700">공정품 확인:</span> &nbsp;제품 금속검출기 통과</div>
          <div className="text-slate-500">
            제품 1개 → <span className="font-semibold text-blue-700">A단계</span> 실행 후 종료시간 기록
            &nbsp;&nbsp;|&nbsp;&nbsp;
            제품 2개 이상 → <span className="font-semibold text-amber-700">A단계 + B단계</span> 실행
          </div>
        </div>
      </div>

      {/* ── 오늘 생산완료 목록 ── */}
      <div className={`${card} p-4 print:hidden`}>
        <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">
            생산완료 목록 ({selectedDate} KST)
            {selectedDate === todayKST() && <span className="ml-1 text-xs font-normal text-slate-400">오늘</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{woList.length}건</span>
            <button className={btn} onClick={() => { loadWoList(); loadLogs(); }}>🔄 새로고침</button>
          </div>
        </div>
        
        {loading ? (
  <div className="py-6 text-center text-sm text-slate-400">불러오는 중...</div>
) : woList.length === 0 ? (
  <div className="py-6 text-center text-sm text-slate-400">{selectedDate} CCP-1P 대기 중인 작업지시서가 없습니다.</div>
) : (
  <div className="space-y-2">
    {woList.map((wo: any) => {
      const hasLog = !!logMap[wo.id];
      const isSelected = selectedWoId === wo.id;
      const log = logMap[wo.id];
      const isEdit = !!logMap[wo.id];
      return (
        <React.Fragment key={wo.id}>
          <button
            className={`w-full rounded-2xl border p-3 text-left transition-all ${
              isSelected
                ? "border-blue-400 bg-blue-50"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
            onClick={() => selectWo(wo)}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{wo.client_name} — {wo.product_name}</div>
                <div className="mt-1 flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5">
                  <span className="text-slate-400">생산완료</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{wo.ccp_end_time ? toKstTime(wo.ccp_end_time) : toKstTime(wo.updated_at)}</span> 
                  </span>
                  {hasLog && log?.start_time && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 py-0.5">
                      <span className="text-green-600">기록</span>
                      <span className="font-semibold text-green-700 tabular-nums">{log.start_time.slice(0,5)}</span>
                      {log.b_end_time && <span className="text-green-500">→ {log.b_end_time.slice(0,5)}</span>}
                    </span>
                  )}
                </div>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                hasLog
                  ? "border-green-200 bg-green-100 text-green-700"
                  : "border-amber-200 bg-amber-100 text-amber-700"
              }`}>
                {hasLog ? "기록완료" : "미기록"}
              </span>
            </div>
          </button>

          {isSelected && formData && (
            <div id={`form-${wo.id}`} className={`${card} p-4 print:hidden`}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-bold text-base">{wo.client_name} — {wo.product_name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{isEdit ? "✏️ 기존 기록 수정" : "신규 기록 입력"}</div>
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  isEdit ? "border-green-200 bg-green-100 text-green-700" : "border-amber-200 bg-amber-100 text-amber-700"
                }`}>{isEdit ? "기록완료" : "미기록"}</span>
              </div>

              <div className="mb-4 flex flex-wrap items-end gap-4">
                <div>
                  <div className="mb-1 text-xs text-slate-500">시작시간 * <span className="text-slate-300">(예: 1430)</span></div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="1430"
                    className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    value={(formData.start_time ?? "").slice(0, 5)}
                    onChange={(e: any) => {
                      let v = e.target.value.replace(/[^\d:]/g, "");
                      if (/^\d{4}$/.test(v)) v = v.slice(0,2) + ":" + v.slice(2);
                      setFormData((prev: any) => prev ? { ...prev, start_time: v || null } : prev);
                    }}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-500">종료시간 <span className="text-slate-300">(예: 1500)</span></div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="1500"
                    className={`w-28 rounded-xl border px-3 py-2 text-sm focus:outline-none ${
                      (formData.b_end_time ?? "").slice(0,5).length === 5 && formData.start_time && (formData.b_end_time ?? "").slice(0,5) <= formData.start_time.slice(0,5)
                        ? "border-red-400 bg-red-50 focus:border-red-500"
                        : "border-slate-200 focus:border-blue-400"
                    }`}
                    value={(formData.b_end_time ?? "").slice(0, 5)}
                    onChange={(e: any) => {
                      let v = e.target.value.replace(/[^\d:]/g, "");
                      if (/^\d{4}$/.test(v)) v = v.slice(0,2) + ":" + v.slice(2);
                      setFormData((prev: any) => prev ? { ...prev, b_end_time: v || null } : prev);
                    }}
                  />
                  {(formData.b_end_time ?? "").slice(0,5).length === 5 && formData.start_time && (formData.b_end_time ?? "").slice(0,5) <= formData.start_time.slice(0,5) && (
                    <div className="mt-1 text-[11px] text-red-500">시작시간보다 늦게 입력하세요</div>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-500">통과수량</div>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm text-right focus:border-blue-400 focus:outline-none"
                    value={formData.b_pass_qty ?? ""}
                    onChange={(e: any) => setFormData((prev: any) => prev ? { ...prev, b_pass_qty: e.target.value ? Number(e.target.value) : null } : prev)}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-500">담당자</div>
                  <select
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    value={formData.worker_name ?? ""}
                    onChange={(e: any) => setFormData((prev: any) => prev ? { ...prev, worker_name: e.target.value || null } : prev)}
                  >
                    <option value="">— 선택 —</option>
                    {employees.map((e: any) => e.name ? (
                      <option key={e.id} value={e.name}>{e.name}</option>
                    ) : null)}
                  </select>
                </div>
              </div>

              {/* A구역 */}
              <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200">
                <ZoneHeader label="A" color="blue" title="제품 1개일 경우" />
                <div className="p-3">
                  <ZoneTable zone="A" fields={aFields(formData)} onChange={setA} />
                </div>
              </div>

              {/* B구역 */}
              <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200">
                <ZoneHeader label="B" color="amber" title="제품 2개 이상일 경우" sub="— 해당 시에만 입력" />
                <div className="p-3">
                  {(formData.b_pass_qty ?? 0) <= 1 && (
                    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                      통과수량이 1개 이하 → 이탈유무만 입력 가능합니다.
                    </div>
                  )}
                  <ZoneTable
                    zone="B"
                    fields={bFields(formData)}
                    onChange={setB}
                    showExtra
                    showFull={false}
                    disabled={(formData.b_pass_qty ?? 0) <= 1}
                  />
                </div>
              </div>

              {/* 비고 */}
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-slate-500">개선조치 내용</div>
                  <input
                    className={inp}
                    value={formData.action_note ?? ""}
                    onChange={(e: any) => setFormData((prev: any) => prev ? { ...prev, action_note: e.target.value || null } : prev)}
                    placeholder="이탈 시 조치사항"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-500">비고</div>
                  <input
                    className={inp}
                    value={formData.note ?? ""}
                    onChange={(e: any) => setFormData((prev: any) => prev ? { ...prev, note: e.target.value || null } : prev)}
                  />
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-600">확인:</span> 김영각 &nbsp;&nbsp;
                <span className="font-semibold text-slate-600">승인:</span> 조대성 &nbsp;&nbsp;
                <span className="text-slate-400">(저장 시 자동 등록)</span>
              </div>

              <div className="flex gap-3">
                <button
                  className={`flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60 ${saving ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700"}`}
                  disabled={saving}
                  onClick={save}
                >
                 {saving ? "처리 중..." : isEdit ? "💾 수정 저장" : "✅ CCP-1P 기록 저장 및 완료 처리"}
                </button>
                <button
                  className={btn}
                  onClick={() => { setSelectedWoId(null); setFormData(null); }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </React.Fragment>
      );
    })}
  </div>
)}

      </div>

    
   

      {/* ══════════════════════════════════════════
          인쇄 전용 영역
      ══════════════════════════════════════════ */}
<style>{`
  .ccp1p-print-only { display: none; }
`}</style>

{/* ── 기간 인쇄 전용 숨김 영역 ── */}
<div id="ccp1p-range-print-inner" style={{ display: "none" }}>
  {Object.keys(rangeLogs).sort().map((date) => {
    const logs = rangeLogs[date].slice().sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    const d = new Date(date + "T00:00:00+09:00");
    const days = ["일","월","화","수","목","금","토"];
    const dateLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;  
    const rangeEmptyCount = Math.max(3, 3 - logs.length);
    return (
      <div key={date} className="page-block">
        {/* 제목 + 결재란 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ ...tdBase, fontSize: "13pt", fontWeight: "bold", textAlign: "center", padding: "6px 8px" }}>
                중요관리점(CCP-1P) 점검표 [금속검출공정]
              </td>
              <td style={{ ...tdBase, width: 28, fontWeight: "bold", background: "#fff", textAlign: "center", fontSize: "8pt" }} rowSpan={2}>결<br/>재<br/>란</td>
              <td style={{ ...tdBase, width: 80, textAlign: "center", fontWeight: "bold" }}>작성</td>
              <td style={{ ...tdBase, width: 80, textAlign: "center", fontWeight: "bold" }}>승인</td>
            </tr>
            <tr>
              <td style={{ ...tdBase, textAlign: "center", padding: "3px" }}>
                <img src="/sign-kimyg.png" style={{ height: 30, objectFit: "contain", display: "block", margin: "0 auto" }} alt="김영각" />
                <div style={{ fontSize: "7pt", marginTop: 2 }}>김영각</div>
              </td>
              <td style={{ ...tdBase, textAlign: "center", padding: "3px" }}>
                <img src="/sign-chods.png" style={{ height: 30, objectFit: "contain", display: "block", margin: "0 auto" }} alt="조대성" />
                <div style={{ fontSize: "7pt", marginTop: 2 }}>조대성</div>
              </td>
            </tr>
          </tbody>
        </table>
        {/* 작성일자 행 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
          <tbody>
            <tr>
              <td style={{ ...tdBase, width: 60, fontWeight: "bold", background: "#fff" }}>작성일자</td>
              <td style={tdBase}>{dateLabel}</td>
              <td style={{ ...tdBase, width: 60, fontWeight: "bold", background: "#fff" }}>한계기준</td>
              <td style={tdBase}>악성 85</td>
              <td style={{ ...tdBase, width: 20, fontWeight: "bold", background: "#fff" }}>Fe</td>
              <td style={tdBase}>2.5mmφ</td>
              <td style={{ ...tdBase, width: 30, fontWeight: "bold", background: "#fff" }}>SUS</td>
              <td style={tdBase}>3.0mmφ</td>
              <td style={{ ...tdBase, width: 80, fontWeight: "bold", background: "#fff", whiteSpace: "nowrap" }}>검교정주기</td>
              <td style={tdBase}>연 1회</td>
            </tr>
          </tbody>
        </table>
        {/* 점검주기 + 방법 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ ...tdBase, width: 60, fontWeight: "bold", background: "#fff", textAlign: "center" }}>점검주기</td>
              <td style={{ ...tdBase, width: 80, fontWeight: "bold", background: "#fff" }}>감도 모니터링</td>
              <td style={tdBase}>금속검출 작업시작 전, 작업중 2시간마다, 작업 종료 후</td>
            </tr>
            <tr>
              <td style={{ ...tdBase, fontWeight: "bold", background: "#fff" }}>공정품 확인</td>
              <td style={tdBase}>제품변경 시 &amp; 작업 중 상시</td>
            </tr>
            <tr>
              <td rowSpan={3} style={{ ...tdBase, fontWeight: "bold", background: "#fff", textAlign: "center" }}>방&nbsp;&nbsp;&nbsp;법</td>
              <td style={{ ...tdBase, fontWeight: "bold", background: "#fff", whiteSpace: "nowrap" }}>감도 모니터링</td>
              <td style={{ ...tdBase, fontSize: "7.5pt" }}>① 표준시편만 통과&nbsp;&nbsp;② 금속이물이 없는 것으로 확인된 공정품 통과&nbsp;&nbsp;③ 표준시편과 공정품을 함께 통과</td>
            </tr>
            <tr>
              <td style={{ ...tdBase, fontWeight: "bold", background: "#fff" }}>공정품 확인</td>
              <td style={{ ...tdBase, fontSize: "7.5pt" }}>제품 금속검출기 통과</td>
            </tr>
            <tr>
              <td colSpan={2} style={{ ...tdBase, fontSize: "7.5pt", color: "#555" }}>
                제품 1개 → <span style={{ color: "#1D6FB5", fontWeight: "bold" }}>A단계</span> 실행 후 종료시간 기록&nbsp;&nbsp;|&nbsp;&nbsp;제품 2개 이상 → <span style={{ color: "#B45309", fontWeight: "bold" }}>A단계 + B단계</span> 실행
              </td>
            </tr>
          </tbody>
        </table>
        {/* 헤더 테이블 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 0, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "86px" }} /><col style={{ width: "22px" }} /><col style={{ width: "22px" }} />
            <col style={{ width: "16px" }} /><col style={{ width: "18px" }} />
            <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
            <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
            <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
            <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
            <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
            <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
            <col style={{ width: "18px" }} /><col style={{ width: "18px" }} /><col style={{ width: "30px" }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={3} style={{ ...thBase }}>품명<br />(업체명)</th>
              <th rowSpan={3} style={{ ...thBase }}>시작<br />시간</th>
              <th rowSpan={3} style={{ ...thBase }}>종료<br />시간</th>
              <th rowSpan={3} style={{ ...thBase }}>구역</th>
              <th rowSpan={3} style={{ ...thBase, fontSize: "5.5pt" }}>제품<br />통과<br />(B행)</th>
              <th colSpan={18} style={{ ...thBase }}>A (제품 1개일 경우) / B행: Fe시편·SUS시편</th>
              <th rowSpan={3} style={{ ...thBase }}>이탈<br />유무</th>
              <th rowSpan={3} style={{ ...thBase }}>통과<br />수량</th>
              <th rowSpan={3} style={{ ...thBase }}>확 인<br />(서명)</th>
            </tr>
            <tr>
              <th colSpan={3} style={thSub}>Fe 시편</th>
              <th colSpan={3} style={thSub}>SUS 시편</th>
              <th colSpan={3} style={thSub}>Fe+제품(상)</th>
              <th colSpan={3} style={thSub}>Fe+제품(하)</th>
              <th colSpan={3} style={thSub}>SUS+제품(상)</th>
              <th colSpan={3} style={thSub}>SUS+제품(하)</th>
            </tr>
            <tr>
              {["좌","중","우","좌","중","우","좌","중","우","좌","중","우","좌","중","우","좌","중","우"].map((l, i) => (
                <th key={i} style={thSub}>{l}</th>
              ))}
            </tr>
          </thead>
        </table>
        {/* 데이터 행 */}
        {logs.map((log) => {
          const signSrc = log.worker_name ? SIGN_MAP[log.worker_name] : null;
          const hasDeviation = getDeviationDesc(log) !== "";
          const bActive = (log.b_pass_qty ?? 0) > 1;
          const cg = (
            <colgroup>
              <col style={{ width: "86px" }} /><col style={{ width: "22px" }} /><col style={{ width: "22px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "18px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "18px" }} /><col style={{ width: "18px" }} /><col style={{ width: "30px" }} />
            </colgroup>
          );
          return (
            <table key={log.id} style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", pageBreakInside: "avoid" }}>
              {cg}
              <tbody>
                <tr style={{ background: hasDeviation ? "#fff9f9" : "#fff" }}>
                  <td rowSpan={2} style={{ ...tdBase, textAlign: "left", fontSize: "6.5pt", paddingLeft: 3, whiteSpace: "normal", wordBreak: "keep-all" }}>
                    {hasDeviation && <span style={{ color: "#DC2626" }}>⚠ </span>}
                    {log.client_name} — {log.product_name}
                  </td>
                  <td rowSpan={2} style={{ ...tdBase, textAlign: "center", fontSize: "7pt" }}>{(log.start_time ?? "").slice(0,5)}</td>
                  <td rowSpan={2} style={{ ...tdBase, textAlign: "center", fontSize: "7pt" }}>{(log.b_end_time ?? "").slice(0,5)}</td>
                  <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", fontSize: "7pt" }}>A</td>
                  <td style={tdBase} />
                  {(["a_fe_l","a_fe_m","a_fe_r","a_sus_l","a_sus_m","a_sus_r","a_fe_up_l","a_fe_up_m","a_fe_up_r","a_fe_dn_l","a_fe_dn_m","a_fe_dn_r","a_sus_up_l","a_sus_up_m","a_sus_up_r","a_sus_dn_l","a_sus_dn_m","a_sus_dn_r"] as (keyof MetalLog)[]).map((k, i) => (
                    <td key={i} style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{(log[k] as string) ?? "O"}</td>
                  ))}
                  <td rowSpan={2} style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.b_deviation ?? "X"}</td>
                  <td rowSpan={2} style={{ ...tdBase, textAlign: "center", fontSize: "7pt" }}>{log.b_pass_qty ?? ""}</td>
                  <td rowSpan={2} style={{ ...tdBase, textAlign: "center", padding: "2px" }}>
                    {signSrc ? (
                      <><img src={signSrc} style={{ height: 22, objectFit: "contain", display: "block", margin: "0 auto" }} alt={log.worker_name ?? ""} /><div style={{ fontSize: "6pt" }}>{log.worker_name}</div></>
                    ) : log.worker_name ? <div style={{ fontSize: "7pt" }}>{log.worker_name}</div> : null}
                  </td>
                </tr>
                <tr>
                  <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", fontSize: "7pt" }}>B</td>
                  <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{bActive ? (log.b_product_pass ?? "X") : ""}</td>
                  {(["b_fe_l","b_fe_m","b_fe_r","b_sus_l","b_sus_m","b_sus_r"] as (keyof MetalLog)[]).map((k, i) => (
                    <td key={i} style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{bActive ? ((log[k] as string) ?? "O") : ""}</td>
                  ))}
                  {Array.from({ length: 12 }).map((_, i) => <td key={i} style={tdBase} />)}
                </tr>
              </tbody>
            </table>
          );
        })}
        {/* 빈 행 */}
        {Array.from({ length: rangeEmptyCount }).map((_, i) => (
          <table key={`re-${i}`} style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", pageBreakInside: "avoid" }}>
            <colgroup>
              <col style={{ width: "86px" }} /><col style={{ width: "22px" }} /><col style={{ width: "22px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "18px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
              <col style={{ width: "18px" }} /><col style={{ width: "18px" }} /><col style={{ width: "30px" }} />
            </colgroup>
            <tbody>
              <tr style={{ height: 18 }}>
                <td rowSpan={2} style={tdBase} /><td rowSpan={2} style={tdBase} /><td rowSpan={2} style={tdBase} />
                <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", fontSize: "7pt" }}>A</td>
                <td style={tdBase} />
                {Array.from({ length: 18 }).map((__, j) => <td key={j} style={tdBase} />)}
                <td rowSpan={2} style={tdBase} /><td rowSpan={2} style={tdBase} /><td rowSpan={2} style={tdBase} />
              </tr>
              <tr style={{ height: 18 }}>
                <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", fontSize: "7pt" }}>B</td>
                <td style={tdBase} />
                {Array.from({ length: 18 }).map((__, j) => <td key={j} style={tdBase} />)}
              </tr>
            </tbody>
          </table>
        ))}
      </div>
    );
  })}
</div>

      <div
      id="ccp1p-print-inner"
        className="ccp1p-print-only"
        style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: "8.5pt", color: "#000" }}
      >
        {/* ① 제목 + 결재란 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ ...tdBase, fontSize: "13pt", fontWeight: "bold", textAlign: "center", padding: "6px 8px" }}>
                중요관리점(CCP-1P) 점검표 [금속검출공정]
              </td>
              <td style={{ ...tdBase, width: 28, fontWeight: "bold", background: "#fff", textAlign: "center", fontSize: "8pt" }} rowSpan={2}>
                결<br/>재<br/>란
              </td>
              <td style={{ ...tdBase, width: 80, textAlign: "center", fontWeight: "bold" }}>작성</td>
              <td style={{ ...tdBase, width: 80, textAlign: "center", fontWeight: "bold" }}>승인</td>
            </tr>
            <tr>
              <td style={{ ...tdBase, textAlign: "center", padding: "3px" }}>
                <img src="/sign-kimyg.png" style={{ height: 30, objectFit: "contain", display: "block", margin: "0 auto" }} alt="김영각" />
                <div style={{ fontSize: "7pt", marginTop: 2 }}>김영각</div>
              </td>
              <td style={{ ...tdBase, textAlign: "center", padding: "3px" }}>
                <img src="/sign-chods.png" style={{ height: 30, objectFit: "contain", display: "block", margin: "0 auto" }} alt="조대성" />
                <div style={{ fontSize: "7pt", marginTop: 2 }}>조대성</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ② 작성일자 + 한계기준 + 검교정주기 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
          <tbody>
            <tr>
              <td style={{ ...tdBase, width: 60, fontWeight: "bold", background: "#fff" }}>작성일자</td>
              <td style={tdBase}>{printDate}</td>
              <td style={{ ...tdBase, width: 60, fontWeight: "bold", background: "#fff" }}>한계기준</td>
              <td style={tdBase}>악성 85</td>
              <td style={{ ...tdBase, width: 20, fontWeight: "bold", background: "#fff" }}>Fe</td>
              <td style={tdBase}>2.5mmφ</td>
              <td style={{ ...tdBase, width: 30, fontWeight: "bold", background: "#fff" }}>SUS</td>
              <td style={tdBase}>3.0mmφ</td>
              <td style={{ ...tdBase, width: 80, fontWeight: "bold", background: "#fff", whiteSpace: "nowrap" }}>검교정주기</td>
              <td style={tdBase}>연 1회</td>
            </tr>
          </tbody>
        </table>

        {/* ③ 점검주기 + 방법 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ ...tdBase, width: 60, fontWeight: "bold", background: "#fff", textAlign: "center" }}>점검주기</td>
              <td style={{ ...tdBase, width: 80, fontWeight: "bold", background: "#fff" }}>감도 모니터링</td>
              <td style={tdBase}>금속검출 작업시작 전, 작업중 2시간마다, 작업 종료 후</td>
            </tr>
            <tr>
              <td style={{ ...tdBase, fontWeight: "bold", background: "#fff" }}>공정품 확인</td>
              <td style={tdBase}>제품변경 시 &amp; 작업 중 상시</td>
            </tr>
            <tr>
              <td rowSpan={3} style={{ ...tdBase, fontWeight: "bold", background: "#fff", textAlign: "center" }}>방&nbsp;&nbsp;&nbsp;법</td>
              <td style={{ ...tdBase, fontWeight: "bold", background: "#fff", whiteSpace: "nowrap" }}>감도 모니터링</td>
              <td style={{ ...tdBase, fontSize: "7.5pt" }}>① 표준시편만 통과&nbsp;&nbsp;② 금속이물이 없는 것으로 확인된 공정품 통과&nbsp;&nbsp;③ 표준시편과 공정품을 함께 통과</td>
            </tr>
            <tr>
              <td style={{ ...tdBase, fontWeight: "bold", background: "#fff" }}>공정품 확인</td>
              <td style={{ ...tdBase, fontSize: "7.5pt" }}>제품 금속검출기 통과</td>
            </tr>
            <tr>
              <td colSpan={2} style={{ ...tdBase, fontSize: "7.5pt", color: "#555" }}>
                제품 1개 → <span style={{ color: "#1D6FB5", fontWeight: "bold" }}>A단계</span> 실행 후 종료시간 기록&nbsp;&nbsp;|&nbsp;&nbsp;제품 2개 이상 → <span style={{ color: "#B45309", fontWeight: "bold" }}>A단계 + B단계</span> 실행
              </td>
            </tr>
          </tbody>
        </table>

{/* ④ 본문 테이블 — 헤더 테이블 */}
<table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 0, tableLayout: "fixed" }}>
  <colgroup>
    <col style={{ width: "86px" }} />
    <col style={{ width: "22px" }} />
    <col style={{ width: "22px" }} />
    <col style={{ width: "16px" }} />
    <col style={{ width: "18px" }} />
    <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
    <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
    <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
    <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
    <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
    <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
    <col style={{ width: "18px" }} />
    <col style={{ width: "18px" }} />
    <col style={{ width: "30px" }} />
  </colgroup>
  <thead>
    <tr>
      <th rowSpan={3} style={{ ...thBase }}>품명<br />(업체명)</th>
      <th rowSpan={3} style={{ ...thBase }}>시작<br />시간</th>
      <th rowSpan={3} style={{ ...thBase }}>종료<br />시간</th>
      <th rowSpan={3} style={{ ...thBase }}>구역</th>
      <th rowSpan={3} style={{ ...thBase, fontSize: "5.5pt" }}>제품<br />통과<br />(B행)</th>
      <th colSpan={18} style={{ ...thBase }}>A (제품 1개일 경우) / B행: Fe시편·SUS시편</th>
      <th rowSpan={3} style={{ ...thBase }}>이탈<br />유무</th>
      <th rowSpan={3} style={{ ...thBase }}>통과<br />수량</th>
      <th rowSpan={3} style={{ ...thBase }}>확 인<br />(서명)</th>
    </tr>
    <tr>
      <th colSpan={3} style={thSub}>Fe 시편</th>
      <th colSpan={3} style={thSub}>SUS 시편</th>
      <th colSpan={3} style={thSub}>Fe+제품(상)</th>
      <th colSpan={3} style={thSub}>Fe+제품(하)</th>
      <th colSpan={3} style={thSub}>SUS+제품(상)</th>
      <th colSpan={3} style={thSub}>SUS+제품(하)</th>
    </tr>
    <tr>
      {["좌","중","우","좌","중","우","좌","중","우","좌","중","우","좌","중","우","좌","중","우"].map((l, i) => (
        <th key={i} style={thSub}>{l}</th>
      ))}
    </tr>
  </thead>
</table>

{/* 데이터 행 — 품명 1개당 별도 table */}
{sortedLogs.map((log) => {
  const signSrc = log.worker_name ? SIGN_MAP[log.worker_name] : null;
  const hasDeviation = getDeviationDesc(log) !== "";
  const bActive = (log.b_pass_qty ?? 0) > 1;
  const colgroup = (
    <colgroup>
      <col style={{ width: "86px" }} />
      <col style={{ width: "22px" }} />
      <col style={{ width: "22px" }} />
      <col style={{ width: "16px" }} />
      <col style={{ width: "18px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "18px" }} />
      <col style={{ width: "18px" }} />
      <col style={{ width: "30px" }} />
    </colgroup>
  );
  return (
    <table key={log.id} style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", pageBreakInside: "avoid" }}>
      {colgroup}
      <tbody>
        <tr style={{ background: hasDeviation ? "#fff9f9" : "#fff" }}>
          <td rowSpan={2} style={{ ...tdBase, textAlign: "left", fontSize: "6.5pt", paddingLeft: 3, whiteSpace: "normal", wordBreak: "keep-all" }}>
            {hasDeviation && <span style={{ color: "#DC2626" }}>⚠ </span>}
            {log.client_name} — {log.product_name}
          </td>
          <td rowSpan={2} style={{ ...tdBase, textAlign: "center", fontSize: "7pt" }}>{(log.start_time ?? "").slice(0, 5)}</td>
          <td rowSpan={2} style={{ ...tdBase, textAlign: "center", fontSize: "7pt" }}>{(log.b_end_time ?? "").slice(0, 5)}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", fontSize: "7pt" }}>A</td>
          <td style={tdBase} />
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_fe_l ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_fe_m ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_fe_r ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_sus_l ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_sus_m ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_sus_r ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_fe_up_l ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_fe_up_m ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_fe_up_r ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_fe_dn_l ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_fe_dn_m ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_fe_dn_r ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_sus_up_l ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_sus_up_m ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_sus_up_r ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_sus_dn_l ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_sus_dn_m ?? "O"}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.a_sus_dn_r ?? "O"}</td>
          <td rowSpan={2} style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{log.b_deviation ?? "X"}</td>
          <td rowSpan={2} style={{ ...tdBase, textAlign: "center", fontSize: "7pt" }}>{log.b_pass_qty ?? ""}</td>
          <td rowSpan={2} style={{ ...tdBase, textAlign: "center", padding: "2px" }}>
            {signSrc ? (
              <>
                <img src={signSrc} style={{ height: 22, objectFit: "contain", display: "block", margin: "0 auto" }} alt={log.worker_name ?? ""} />
                <div style={{ fontSize: "6pt", color: "#000" }}>{log.worker_name}</div>
              </>
            ) : log.worker_name ? (
              <div style={{ fontSize: "7pt" }}>{log.worker_name}</div>
            ) : null}
          </td>
        </tr>
        <tr style={{ background: "#fff" }}>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", fontSize: "7pt" }}>B</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>
            {bActive ? (log.b_product_pass ?? "X") : ""}
          </td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{bActive ? (log.b_fe_l ?? "O") : ""}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{bActive ? (log.b_fe_m ?? "O") : ""}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{bActive ? (log.b_fe_r ?? "O") : ""}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{bActive ? (log.b_sus_l ?? "O") : ""}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{bActive ? (log.b_sus_m ?? "O") : ""}</td>
          <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", color: "#000" }}>{bActive ? (log.b_sus_r ?? "O") : ""}</td>
          <td style={tdBase} /><td style={tdBase} /><td style={tdBase} />
          <td style={tdBase} /><td style={tdBase} /><td style={tdBase} />
          <td style={tdBase} /><td style={tdBase} /><td style={tdBase} />
          <td style={tdBase} /><td style={tdBase} /><td style={tdBase} />
        </tr>
      </tbody>
    </table>
  );
})}

{/* 빈 행 — 별도 table */}
{Array.from({ length: emptyRowCount }).map((_, i) => (
  <table key={`empty-${i}`} style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", pageBreakInside: "avoid" }}>
    <colgroup>
      <col style={{ width: "86px" }} />
      <col style={{ width: "22px" }} />
      <col style={{ width: "22px" }} />
      <col style={{ width: "16px" }} />
      <col style={{ width: "18px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "16px" }} /><col style={{ width: "16px" }} /><col style={{ width: "16px" }} />
      <col style={{ width: "18px" }} />
      <col style={{ width: "18px" }} />
      <col style={{ width: "30px" }} />
    </colgroup>
    <tbody>
      <tr style={{ height: 18 }}>
        <td rowSpan={2} style={tdBase} />
        <td rowSpan={2} style={tdBase} />
        <td rowSpan={2} style={tdBase} />
        <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", fontSize: "7pt" }}>A</td>
        <td style={tdBase} />
        {Array.from({ length: 18 }).map((__, j) => <td key={j} style={tdBase} />)}
        <td rowSpan={2} style={tdBase} />
        <td rowSpan={2} style={tdBase} />
        <td rowSpan={2} style={tdBase} />
      </tr>
      <tr style={{ height: 18 }}>
        <td style={{ ...tdBase, textAlign: "center", fontWeight: "bold", fontSize: "7pt" }}>B</td>
        <td style={tdBase} />
        {Array.from({ length: 18 }).map((__, j) => <td key={j} style={tdBase} />)}
      </tr>
    </tbody>
  </table>
))}
      </div>
    </div> 
  );
}