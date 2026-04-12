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

// 빈 기록 초기값
function emptyLog(workOrderId: string, productName: string, clientName: string, logDate: string): Omit<MetalLog, "id"> {
  const ox = (def: string) => def;
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
  zone, fields, onChange, showExtra = false, disabled = false,
}: {
  zone: "A" | "B";
  fields: ZoneFields;
  onChange: (key: keyof ZoneFields, val: string | number | null) => void;
  showExtra?: boolean;
  disabled?: boolean;
}) {
  const thTop = "border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[11px] font-semibold text-slate-500 whitespace-nowrap";
  const thSub = "border border-slate-200 bg-slate-50 px-1 py-1 text-center text-[10px] text-slate-400 whitespace-nowrap";
  const td = "border border-slate-200 px-1 py-2 text-center";
  const tdDim = "border border-slate-200 px-1 py-2 text-center bg-slate-50 opacity-30 pointer-events-none";
  const label = "border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-600 whitespace-nowrap";

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs" style={{ minWidth: 900 }}>
        <thead>
          <tr>
            <th className={thTop} rowSpan={2} style={{ width: 110 }}>항목</th>
            <th className={thTop} colSpan={3}>Fe 시편</th>
            <th className={thTop} colSpan={3}>SUS 시편</th>
            <th className={thTop} rowSpan={2}>제품<br />통과</th>
            <th className={thTop} colSpan={3}>Fe+제품(상)</th>
            <th className={thTop} colSpan={3}>Fe+제품(하)</th>
            <th className={thTop} colSpan={3}>SUS+제품(상)</th>
            <th className={thTop} colSpan={3}>SUS+제품(하)</th>
            {showExtra && <th className={thTop} rowSpan={2}>이탈유무</th>}
          </tr>
          <tr>
            <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>
            <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>
            <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>
            <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>
            <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>
            <th className={thSub}>좌</th><th className={thSub}>중</th><th className={thSub}>우</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={label}>감도모니터링<br />&amp;공정품확인</td>
            {(["fe_l","fe_m","fe_r","sus_l","sus_m","sus_r"] as (keyof ZoneFields)[]).map((k) => (
              <td key={k} className={disabled ? tdDim : td}>
                <OxToggle value={fields[k] as string | null} onChange={(v) => onChange(k, v)} />
              </td>
            ))}
            <td className={disabled ? tdDim : td}>
              <OxToggle value={fields.product_pass} onChange={(v) => onChange("product_pass", v)} />
            </td>
            {(["fe_up_l","fe_up_m","fe_up_r","fe_dn_l","fe_dn_m","fe_dn_r","sus_up_l","sus_up_m","sus_up_r","sus_dn_l","sus_dn_m","sus_dn_r"] as (keyof ZoneFields)[]).map((k) => (
              <td key={k} className={disabled ? tdDim : td}>
                <OxToggle value={fields[k] as string | null} onChange={(v) => onChange(k, v)} />
              </td>
            ))}
            {showExtra && (
              <td className={td}>
                {/* 이탈유무는 disabled여도 항상 활성 */}
                <OxToggle value={fields.deviation ?? "X"} onChange={(v) => onChange("deviation", v)} />
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────── Main Tab ───────────────────────
export function Ccp1pTab({ role, userId, showToast }: {
  role: UserRole;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD KST

  const [woList, setWoList] = useState<WorkOrderItem[]>([]);
  const [logMap, setLogMap] = useState<Record<string, MetalLog>>({}); // work_order_id → log
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<MetalLog, "id"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string | null }[]>([]);

  useEffect(() => {
    supabase.from("employees").select("id,name").is("resign_date", null).order("name")
      .then(({ data }: { data: any[] | null }) => setEmployees(data ?? []));
  }, []);

  // 김영각/조대성 uuid 조회
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

  // 오늘 생산완료 작업지시서 조회 (KST 기준) - 생산완료 시간 오름차순
  const loadWoList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("work_orders")
      .select("id, product_name, client_name, updated_at")
      .eq("status_production", true)
      .gte("updated_at", `${today}T00:00:00+09:00`)
      .lt("updated_at", `${today}T23:59:59+09:00`)
      .order("updated_at", { ascending: true });

    if (error) { showToast("조회 실패: " + error.message, "error"); setLoading(false); return; }
    setWoList((data ?? []) as WorkOrderItem[]);
    setLoading(false);
  }, [today]);

  // 오늘 CCP-1P 기록 조회
  const loadLogs = useCallback(async () => {
    const { data } = await supabase
      .from("ccp_metal_logs")
      .select("*")
      .gte("created_at", `${today}T00:00:00+09:00`)
      .lt("created_at", `${today}T23:59:59+09:00`);

    if (!data) return;
    const map: Record<string, MetalLog> = {};
    for (const row of data) {
      if (row.work_order_id) map[row.work_order_id] = row as MetalLog;
    }
    setLogMap(map);
  }, [today]);

  useEffect(() => {
    loadWoList();
    loadLogs();
  }, [loadWoList, loadLogs]);

  // 작업지시서 선택
  function selectWo(wo: WorkOrderItem) {
    setSelectedWoId(wo.id);
    const existing = logMap[wo.id];
    if (existing) {
      setFormData({ ...existing });
    } else {
      setFormData(emptyLog(wo.id, wo.product_name, wo.client_name, today));
    }
  }

  // A구역 필드 변경
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

  // B구역 필드 변경
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

  // 저장
  async function save() {
    if (!formData || !selectedWoId) return;
    if (!formData.start_time) return showToast("시작시간을 입력하세요.", "error");
    if (!formData.b_end_time || formData.b_end_time.length < 5) return showToast("종료시간을 입력하세요.", "error");

    // 시작시간 > 생산완료 시간 검증
    const wo = woList.find((w: any) => w.id === selectedWoId);
    if (wo && formData.start_time) {
      const completedKst = toKstTime(wo.updated_at); // HH:MM
      if (formData.start_time < completedKst) {
        return showToast(`시작시간(${formData.start_time})은 생산완료 시간(${completedKst})보다 늦어야 합니다.`, "error");
      }
    }

    if (formData.b_end_time && formData.b_end_time.length === 5 && formData.start_time) {
      if (formData.b_end_time <= formData.start_time) {
        return showToast("종료시간은 시작시간보다 늦어야 합니다.", "error");
      }
    }

    // 다른 기록과 시간 겹침 검증 (금속검출기 1대)
    const myStart = formData.start_time;
    const myEnd = formData.b_end_time && formData.b_end_time.length === 5 ? formData.b_end_time : myStart;
    const existingId = logMap[selectedWoId]?.id ?? null;

    for (const [woId, log] of Object.entries(logMap) as [string, MetalLog][]) {
      if (woId === selectedWoId) continue; // 자기 자신 제외
      if (!log.start_time) continue;
      const otherStart = log.start_time;
      const otherEnd = log.b_end_time && log.b_end_time.length === 5 ? log.b_end_time : otherStart;
      // 겹침 조건: myStart < otherEnd AND myEnd > otherStart
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

    // 기본값과 다른 값 감지 (A: O기본→X변경, X기본→O변경 / B: 통과수량 2이상일때)
    const aDefaultO = ["a_fe_l","a_fe_m","a_fe_r","a_sus_l","a_sus_m","a_sus_r",
      "a_fe_up_l","a_fe_up_m","a_fe_up_r","a_fe_dn_l","a_fe_dn_m","a_fe_dn_r",
      "a_sus_up_l","a_sus_up_m","a_sus_up_r","a_sus_dn_l","a_sus_dn_m","a_sus_dn_r"] as (keyof typeof formData)[];
    const aDefaultX = ["a_product_pass"] as (keyof typeof formData)[];
    const bDefaultO = ["b_fe_l","b_fe_m","b_fe_r","b_sus_l","b_sus_m","b_sus_r",
      "b_fe_up_l","b_fe_up_m","b_fe_up_r","b_fe_dn_l","b_fe_dn_m","b_fe_dn_r",
      "b_sus_up_l","b_sus_up_m","b_sus_up_r","b_sus_dn_l","b_sus_dn_m","b_sus_dn_r"] as (keyof typeof formData)[];
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
    showToast("✅ CCP-1P 기록 저장 완료!");
    await loadLogs();
    // 저장 후 logMap 갱신된 값으로 formData 동기화
    setSelectedWoId(null);
    setFormData(null);
  }

  // A구역 ZoneFields 추출
  const aFields = (f: Omit<MetalLog,"id">): ZoneFields => ({
    fe_l: f.a_fe_l, fe_m: f.a_fe_m, fe_r: f.a_fe_r,
    sus_l: f.a_sus_l, sus_m: f.a_sus_m, sus_r: f.a_sus_r,
    product_pass: f.a_product_pass,
    fe_up_l: f.a_fe_up_l, fe_up_m: f.a_fe_up_m, fe_up_r: f.a_fe_up_r,
    fe_dn_l: f.a_fe_dn_l, fe_dn_m: f.a_fe_dn_m, fe_dn_r: f.a_fe_dn_r,
    sus_up_l: f.a_sus_up_l, sus_up_m: f.a_sus_up_m, sus_up_r: f.a_sus_up_r,
    sus_dn_l: f.a_sus_dn_l, sus_dn_m: f.a_sus_dn_m, sus_dn_r: f.a_sus_dn_r,
  });

  // B구역 ZoneFields 추출
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

  // KST 시간 표시
  function toKstTime(utcStr: string) {
    return new Date(utcStr).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-4">

      {/* ── 공통사항 ── */}
      <div className={`${card} p-4`}>
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
      <div className={`${card} p-4`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">오늘 생산완료 목록 ({today} KST)</div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{woList.length}건</span>
            <button className={btn} onClick={() => { loadWoList(); loadLogs(); }}>🔄 새로고침</button>
          </div>
        </div>
        {loading ? (
          <div className="py-6 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : woList.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">오늘 생산완료된 작업지시서가 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {woList.map((wo: any) => {
              const hasLog = !!logMap[wo.id];
              const isSelected = selectedWoId === wo.id;
              const log = logMap[wo.id];
              return (
                <button
                  key={wo.id}
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
                          <span className="font-semibold text-slate-700 tabular-nums">{toKstTime(wo.updated_at)}</span>
                        </span>
                        {hasLog && log?.start_time && (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 py-0.5">
                            <span className="text-green-600">기록</span>
                            <span className="font-semibold text-green-700 tabular-nums">{log.start_time}</span>
                            {log.b_end_time && <span className="text-green-500">→ {log.b_end_time}</span>}
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
              );
            })}
          </div>
        )}
      </div>

      {/* ── 기록 입력 폼 ── */}
      {formData && selectedWoId && (() => {
        const wo = woList.find((w: any) => w.id === selectedWoId);
        const isEdit = !!logMap[selectedWoId];
        return (
          <div className={`${card} p-4`}>
            {/* 폼 헤더 */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-bold text-base">{wo?.client_name} — {wo?.product_name}</div>
                <div className="mt-0.5 text-xs text-slate-400">{isEdit ? "✏️ 기존 기록 수정" : "신규 기록 입력"}</div>
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                isEdit ? "border-green-200 bg-green-100 text-green-700" : "border-amber-200 bg-amber-100 text-amber-700"
              }`}>{isEdit ? "기록완료" : "미기록"}</span>
            </div>

            {/* 시작시간 + 종료시간 + 통과수량 + 담당자 + 일괄O */}
            <div className="mb-4 flex flex-wrap items-end gap-4">
              <div>
                <div className="mb-1 text-xs text-slate-500">시작시간 * <span className="text-slate-300">(예: 1430)</span></div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="1430"
                  className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  value={formData.start_time ?? ""}
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
                    formData.b_end_time?.length === 5 && formData.start_time && formData.b_end_time <= formData.start_time
                      ? "border-red-400 bg-red-50 focus:border-red-500"
                      : "border-slate-200 focus:border-blue-400"
                  }`}
                  value={formData.b_end_time ?? ""}
                  onChange={(e: any) => {
                    let v = e.target.value.replace(/[^\d:]/g, "");
                    if (/^\d{4}$/.test(v)) v = v.slice(0,2) + ":" + v.slice(2);
                    setFormData((prev: any) => prev ? { ...prev, b_end_time: v || null } : prev);
                  }}
                />
                {formData.b_end_time?.length === 5 && formData.start_time && formData.b_end_time <= formData.start_time && (
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
                <ZoneTable
                  zone="A"
                  fields={aFields(formData)}
                  onChange={setA}
                />
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

            {/* 결재 표시 */}
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-600">확인:</span> 김영각 &nbsp;&nbsp;
              <span className="font-semibold text-slate-600">승인:</span> 조대성 &nbsp;&nbsp;
              <span className="text-slate-400">(저장 시 자동 등록)</span>
            </div>

            {/* 저장/취소 */}
            <div className="flex gap-3">
              <button
                className={`flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60 ${saving ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700"}`}
                disabled={saving}
                onClick={save}
              >
                {saving ? "저장 중..." : isEdit ? "💾 수정 저장" : "💾 기록 저장"}
              </button>
              <button
                className={btn}
                onClick={() => { setSelectedWoId(null); setFormData(null); }}
              >
                취소
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
