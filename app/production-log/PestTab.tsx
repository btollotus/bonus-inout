"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PinModal } from "@/app/contexts/PinSessionContext";
import { todayKST } from "@/lib/utils/date";

const supabase = createClient();

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

type FlyingRecord = {
  id?: string;
  record_date: string;
  location: string;
  fly: number;
  mosquito: number;
  midges: number;
  fruit_fly: number;
  moth: number;
  housefly: number;
  other: number;
  total: number;
  step: number;
  action_note: string;
  lure_left: string;
  damage_left: string;
  rat_left: string;
  lure_right: string;
  damage_right: string;
  rat_right: string;
  rat_action_note: string;
  inspector_id: string | null;
  inspector_name: string | null;
};

type WalkingRecord = {
  id?: string;
  record_date: string;
  trap_no: string;
  grima: number;
  spider: number;
  centipede: number;
  mosquito: number;
  earwig: number;
  other: number;
  total: number;
  inspector_id: string | null;
  inspector_name: string | null;
};

type Employee = { id: string; name: string; pin: string | null };

const LOCATIONS = [
  "P1-입구",
  "P2-위생전실",
  "P3-생산실",
  "P4-입출고실",
  "P5-원부재료실",
];

const TRAP_LABELS: Record<string, string> = {
  "NO-01": "NO-01 (원부재료실 우측)",
  "NO-02": "NO-02 (외포장실 좌측)",
  "NO-03": "NO-03 (외포장실 우측)",
  "NO-04": "NO-04 (원부재료실 좌측)",
  "NO-05": "NO-05 (위생전실입구 좌측)",
  "NO-06": "NO-06 (위생전실입구 우측)",
  "NO-07": "NO-07 (생산실입구 좌측)",
  "NO-08": "NO-08 (생산실입구 우측)",
};
const TRAPS = Object.keys(TRAP_LABELS);

const ZONE_MAP: Record<string, "entrance" | "sanitary" | "production"> = {
  "P1-입구":       "entrance",
  "P2-위생전실":   "sanitary",
  "P3-생산실":     "production",
  "P4-입출고실":   "entrance",
  "P5-원부재료실": "sanitary",
};

const THRESHOLDS = {
  summer: { entrance: [19, 30], sanitary: [9, 15], production: [9, 15] },
  winter: { entrance: [14, 25], sanitary: [9, 15], production: [9, 15] },
};

const CRITERIA_LABELS = {
  summer: {
    entrance:   ["20 미만", "20~30", "30 초과"],
    sanitary:   ["10 미만", "10~15", "15 초과"],
    production: ["10 미만", "10~15", "15 초과"],
  },
  winter: {
    entrance:   ["15 미만", "15~25", "25 초과"],
    sanitary:   ["10 미만", "10~15", "15 초과"],
    production: ["10 미만", "10~15", "15 초과"],
  },
};

function getSeason(dateStr: string): "summer" | "winter" {
  const m = new Date(dateStr + "T00:00:00+09:00").getMonth() + 1;
  return m >= 5 && m <= 10 ? "summer" : "winter";
}

function getStep(total: number, location: string, season: "summer" | "winter"): number {
  const zone = ZONE_MAP[location];
  if (!zone) return 1;
  const [t1, t2] = THRESHOLDS[season][zone];
  if (total <= t1) return 1;
  if (total <= t2) return 2;
  return 3;
}

const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp  = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const btn  = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn= "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";

function StepBadge({ step }: { step: number }) {
  const cfg = [
    null,
    { bg: "bg-green-50", border: "border-green-300", text: "text-green-700",  label: "1단계" },
    { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700",  label: "2단계" },
    { bg: "bg-red-50",   border: "border-red-300",   text: "text-red-700",    label: "3단계" },
  ];
  const c = cfg[step] ?? cfg[1]!;
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.bg} ${c.border} ${c.text}`}>
      {c.label}
    </span>
  );
}

function totalCellClass(step: number): string {
  if (step === 3) return "bg-red-50 text-red-700 font-bold";
  if (step === 2) return "bg-amber-50 text-amber-700 font-bold";
  return "bg-blue-50 text-blue-700 font-semibold";
}

// 숫자 입력 셀 — 0이면 빈칸, 포커스 시에도 0 숨기고 커서만 위치, PIN 없으면 비활성
function NumCell({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled: boolean;
}) {
  const [focused, setFocused] = useState(false);
  // 포커스 중이고 값이 0이면 빈문자열로 표시 → 커서만 위치
  const displayVal = focused && value === 0 ? "" : value !== 0 ? value : "";
  return (
    <input
      type="number" min={0}
      value={displayVal}
      placeholder=""
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
      className={`w-full text-center text-xs py-1 rounded bg-transparent focus:outline-none
        ${disabled ? "text-slate-300 cursor-not-allowed" : "focus:bg-blue-50 hover:bg-slate-50"}`}
    />
  );
}

// O/X 토글 버튼
function OXBtn({ value, onChange, disabled }: {
  value: string; onChange: (v: string) => void; disabled: boolean;
}) {
  return (
    <div className="flex gap-1">
      {["O", "X"].map(v => (
        <button key={v} disabled={disabled}
          className={`flex-1 rounded-lg border py-1 text-xs font-bold transition-all
            ${value === v
              ? v === "O" ? "border-green-400 bg-green-100 text-green-700" : "border-red-400 bg-red-100 text-red-700"
              : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"}
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => !disabled && onChange(v)}>
          {v}
        </button>
      ))}
    </div>
  );
}

function initFlying(date: string): Record<string, FlyingRecord> {
  const map: Record<string, FlyingRecord> = {};
  for (const loc of LOCATIONS) {
    map[loc] = {
      record_date: date, location: loc,
      fly: 0, mosquito: 0, midges: 0, fruit_fly: 0, moth: 0, housefly: 0, other: 0,
      total: 0, step: 1, action_note: "",
      lure_left: "X", damage_left: "X", rat_left: "X",
      lure_right: "X", damage_right: "X", rat_right: "X",
      rat_action_note: "",
      inspector_id: null, inspector_name: null,
    };
  }
  return map;
}

function initWalking(date: string): Record<string, WalkingRecord> {
  const map: Record<string, WalkingRecord> = {};
  for (const trap of TRAPS) {
    map[trap] = {
      record_date: date, trap_no: trap,
      grima: 0, spider: 0, centipede: 0, mosquito: 0, earwig: 0, other: 0,
      total: 0, inspector_id: null, inspector_name: null,
    };
  }
  return map;
}

export function PestTab({ role, userId, showToast }: {
  role: UserRole;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [subTab, setSubTab] = useState<"input" | "view">("input");
  const [recDate, setRecDate] = useState(todayKST());
  const [flying,  setFlying]  = useState<Record<string, FlyingRecord>>(() => initFlying(todayKST()));
  const [walking, setWalking] = useState<Record<string, WalkingRecord>>(() => initWalking(todayKST()));
  const [saving,  setSaving]  = useState(false);
  const [employees,    setEmployees]    = useState<Employee[]>([]);
  const [inspector,    setInspector]    = useState<{ id: string; name: string } | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [viewYear,    setViewYear]    = useState(new Date().getFullYear());
  const [viewMonth,   setViewMonth]   = useState(new Date().getMonth() + 1);
  const [viewFlying,  setViewFlying]  = useState<FlyingRecord[]>([]);
  const [viewWalking, setViewWalking] = useState<WalkingRecord[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const season = getSeason(recDate);
  const inputDisabled = !inspector;

  useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees((data ?? []) as Employee[]));
  }, []);

  const loadInput = useCallback(async (date: string) => {
    const [{ data: fRows }, { data: wRows }] = await Promise.all([
      supabase.from("pest_flying_records").select("*").eq("record_date", date),
      supabase.from("pest_walking_records").select("*").eq("record_date", date),
    ]);
    const fMap = initFlying(date);
    const wMap = initWalking(date);
    let firstInspector: { id: string; name: string } | null = null;
    for (const row of fRows ?? []) {
      if (fMap[row.location]) {
        fMap[row.location] = {
          ...fMap[row.location], ...row,
          action_note:     row.action_note     ?? "",
          rat_action_note: row.rat_action_note ?? "",
          lure_left:    row.lure_left    ?? "X",
          damage_left:  row.damage_left  ?? "X",
          rat_left:     row.rat_left     ?? "X",
          lure_right:   row.lure_right   ?? "X",
          damage_right: row.damage_right ?? "X",
          rat_right:    row.rat_right    ?? "X",
        };
        if (!firstInspector && row.inspector_id)
          firstInspector = { id: row.inspector_id, name: row.inspector_name };
      }
    }
    for (const row of wRows ?? []) {
      if (wMap[row.trap_no]) {
        wMap[row.trap_no] = { ...wMap[row.trap_no], ...row };
        if (!firstInspector && row.inspector_id)
          firstInspector = { id: row.inspector_id, name: row.inspector_name };
      }
    }
    setFlying(fMap);
    setWalking(wMap);
    if (firstInspector) setInspector(firstInspector);
  }, []);

  useEffect(() => { loadInput(recDate); }, [recDate, loadInput]);

  function updateFlying(loc: string, field: keyof FlyingRecord, value: number | string) {
    setFlying(prev => {
      const rec = { ...prev[loc], [field]: value };
      if (["fly","mosquito","midges","fruit_fly","moth","housefly","other"].includes(field as string)) {
        rec.total = rec.fly + rec.mosquito + rec.midges + rec.fruit_fly + rec.moth + rec.housefly + rec.other;
        rec.step  = getStep(rec.total, loc, season);
        if (rec.step === 1) rec.action_note = "";
      }
      return { ...prev, [loc]: rec };
    });
  }

  function updateWalking(trap: string, field: keyof WalkingRecord, value: number) {
    setWalking(prev => {
      const rec = { ...prev[trap], [field]: value };
      rec.total = rec.grima + rec.spider + rec.centipede + rec.mosquito + rec.earwig + rec.other;
      return { ...prev, [trap]: rec };
    });
  }

  function setRatBox(side: "left" | "right", field: "lure" | "damage" | "rat", val: string) {
    const key = `${field}_${side}` as keyof FlyingRecord;
    setFlying(prev => ({
      ...prev,
      "P1-입구": { ...prev["P1-입구"], [key]: val },
    }));
  }

  async function handleSave() {
    if (!inspector) { setShowPinModal(true); return; }
    const missingAction = LOCATIONS.filter(loc => flying[loc].step >= 2 && !flying[loc].action_note.trim());
    const p1 = flying["P1-입구"];
    const missingRat = (p1.rat_left === "O" || p1.rat_right === "O") && !p1.rat_action_note.trim();
    if (missingAction.length > 0 || missingRat) {
      showToast("⚠ 기준 초과 항목의 조치사항을 입력해주세요.", "error"); return;
    }
    setSaving(true);
    try {
      const happenedAt = `${recDate}T00:00:00+09:00`;
      const flyRows = LOCATIONS.map(loc => ({
        ...flying[loc],
        happened_at: happenedAt, inspector_id: inspector.id,
        inspector_name: inspector.name, created_by: userId,
        action_note:     flying[loc].action_note.trim()     || null,
        rat_action_note: flying[loc].rat_action_note.trim() || null,
      }));
      const { error: fErr } = await supabase.from("pest_flying_records")
        .upsert(flyRows, { onConflict: "record_date,location" });
      if (fErr) throw fErr;
      const walkRows = TRAPS.map(trap => ({
        ...walking[trap],
        happened_at: happenedAt, inspector_id: inspector.id,
        inspector_name: inspector.name, created_by: userId,
      }));
      const { error: wErr } = await supabase.from("pest_walking_records")
        .upsert(walkRows, { onConflict: "record_date,trap_no" });
      if (wErr) throw wErr;
      showToast("✅ 저장 완료!");
      await loadInput(recDate);
    } catch (e: any) {
      showToast("저장 실패: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function loadView() {
    setViewLoading(true);
    const [{ data: fRows }, { data: wRows }] = await Promise.all([
      supabase.from("pest_flying_records").select("*")
        .eq("year", viewYear).eq("month", viewMonth).order("record_date").order("location"),
      supabase.from("pest_walking_records").select("*")
        .eq("year", viewYear).eq("month", viewMonth).order("record_date").order("trap_no"),
    ]);
    setViewFlying((fRows ?? []) as FlyingRecord[]);
    setViewWalking((wRows ?? []) as WalkingRecord[]);
    setViewLoading(false);
  }

  useEffect(() => { if (subTab === "view") loadView(); }, [subTab, viewYear, viewMonth]);

  const viewDates = [...new Set(viewFlying.map(r => r.record_date))].sort();
  const flyingByDate: Record<string, Record<string, FlyingRecord>> = {};
  for (const r of viewFlying) {
    if (!flyingByDate[r.record_date]) flyingByDate[r.record_date] = {};
    flyingByDate[r.record_date][r.location] = r;
  }
  const walkingByDate: Record<string, Record<string, WalkingRecord>> = {};
  for (const r of viewWalking) {
    if (!walkingByDate[r.record_date]) walkingByDate[r.record_date] = {};
    walkingByDate[r.record_date][r.trap_no] = r;
  }
  const flyingCumul: Record<string, Record<string, number>> = {};
  for (const date of viewDates) {
    flyingCumul[date] = {};
    for (const loc of LOCATIONS)
      flyingCumul[date][loc] = viewDates.filter(d => d <= date)
        .reduce((s, d) => s + (flyingByDate[d]?.[loc]?.total ?? 0), 0);
  }
  const walkingCumul: Record<string, Record<string, number>> = {};
  for (const date of viewDates) {
    walkingCumul[date] = {};
    for (const trap of TRAPS)
      walkingCumul[date][trap] = viewDates.filter(d => d <= date)
        .reduce((s, d) => s + (walkingByDate[d]?.[trap]?.total ?? 0), 0);
  }
  const flyingMonthTotal = LOCATIONS.reduce((acc, loc) => {
    acc[loc] = viewFlying.filter(r => r.location === loc).reduce((s, r) => s + r.total, 0);
    return acc;
  }, {} as Record<string, number>);
  const walkingMonthTotal = TRAPS.reduce((acc, trap) => {
    acc[trap] = viewWalking.filter(r => r.trap_no === trap).reduce((s, r) => s + r.total, 0);
    return acc;
  }, {} as Record<string, number>);

  const viewSeason = getSeason(`${viewYear}-${String(viewMonth).padStart(2,"0")}-01`);
  const criteriaLabels = CRITERIA_LABELS[viewSeason];

  function fmtDate(d: string) {
    const dt = new Date(d + "T00:00:00+09:00");
    return `${dt.getMonth()+1}/${dt.getDate()}`;
  }

  const p1 = flying["P1-입구"];
  const ratFound = p1.rat_left === "O" || p1.rat_right === "O";

  return (
    <div className="space-y-4">
      {showPinModal && (
        <PinModal
          employees={employees.filter(e => e.name !== null) as any}
          title="점검자 PIN 확인"
          onSuccess={(empId, empName) => { setInspector({ id: empId, name: empName }); setShowPinModal(false); }}
          onCancel={() => setShowPinModal(false)}
        />
      )}

      <div className="flex gap-2">
        <button className={subTab === "input" ? btnOn : btn} onClick={() => setSubTab("input")}>기록 입력</button>
        <button className={subTab === "view"  ? btnOn : btn} onClick={() => setSubTab("view")}>월별 조회</button>
      </div>

      {/* ══ 기록 입력 ══ */}
      {subTab === "input" && (
        <>
          {/* 날짜 + 점검자 */}
          <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="mb-1 text-xs text-slate-500">점검 날짜</div>
                <input type="date" className={inp} style={{ width: 160 }} value={recDate}
                  onChange={e => { setRecDate(e.target.value); setInspector(null); }} />
              </div>
              <div className="flex items-center gap-2 mt-5">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold
                  ${season === "summer" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-green-300 bg-green-50 text-green-700"}`}>
                  {season === "summer" ? "하계 (5~10월)" : "동계 (11~4월)"}
                </span>
              </div>
              <div className="ml-auto">
                {inspector ? (
                  <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                    <span className="text-sm font-semibold text-green-700">👤 {inspector.name}</span>
                    <span className="text-xs text-green-500">점검자 확인됨</span>
                    <button className="text-xs text-slate-400 hover:text-red-400 ml-1" onClick={() => setInspector(null)}>변경</button>
                  </div>
                ) : (
                  <button className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                    onClick={() => setShowPinModal(true)}>🔑 PIN 입력</button>
                )}
              </div>
            </div>
          </div>

          {!inspector && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
              <span className="text-lg">🔑</span>
              <div className="text-sm text-amber-700 font-semibold">PIN을 입력해야 기록이 가능합니다.</div>
            </div>
          )}

          {/* 기준표 */}
          <div className={card}>
            <div className={`rounded-t-2xl px-4 py-2 text-xs font-semibold
              ${season === "summer" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
              현재 적용 기준 — {season === "summer" ? "하계 (5~10월)" : "동계 (11~4월)"}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="py-2 px-3 text-left font-medium text-slate-500">위치</th>
                    <th className="py-2 px-3 text-center font-medium text-green-600">1단계 (정상)</th>
                    <th className="py-2 px-3 text-center font-medium text-amber-600">2단계 (주의)</th>
                    <th className="py-2 px-3 text-center font-medium text-red-600">3단계 (초과)</th>
                    <th className="py-2 px-3 text-center font-medium text-slate-500">쥐</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    { label: "P1-입구 / P4-입출고실",      zone: "entrance"   as const },
                    { label: "P2-위생전실 / P5-원부재료실", zone: "sanitary"   as const },
                    { label: "P3-생산실",                   zone: "production" as const },
                  ]).map(({ label, zone }, idx) => (
                    <tr key={zone} className="border-b border-slate-100">
                      <td className="py-1.5 px-3 text-slate-500">{label}</td>
                      <td className="py-1.5 px-3 text-center text-green-600 font-medium">{criteriaLabels[zone][0]}</td>
                      <td className="py-1.5 px-3 text-center text-amber-600 font-medium">{criteriaLabels[zone][1]}</td>
                      <td className="py-1.5 px-3 text-center text-red-600 font-medium">{criteriaLabels[zone][2]}</td>
                      {idx === 0 && <td className="py-1.5 px-3 text-center text-red-500 font-medium" rowSpan={3}>1마리 이하</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 비래해충 입력 */}
          <div className={card}>
            <div className="px-4 pt-4 pb-2 font-semibold text-sm border-b border-slate-100">비래해충 — 포충등 기록</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" style={{ minWidth: 560 }}>
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 py-2 px-2 text-slate-500 w-20">위치</th>
                    <th className="border border-slate-200 py-2 px-1">파리</th>
                    <th className="border border-slate-200 py-2 px-1">모기</th>
                    <th className="border border-slate-200 py-2 px-1">링다구</th>
                    <th className="border border-slate-200 py-2 px-1">초파리</th>
                    <th className="border border-slate-200 py-2 px-1">나방</th>
                    <th className="border border-slate-200 py-2 px-1">날파리</th>
                    <th className="border border-slate-200 py-2 px-1">기타</th>
                    <th className="border border-slate-200 py-2 px-2 bg-blue-50 text-blue-700 w-10">계</th>
                    <th className="border border-slate-200 py-2 px-2 w-14">단계</th>
                  </tr>
                </thead>
                <tbody>
                  {LOCATIONS.map(loc => {
                    const r = flying[loc];
                    const fields: (keyof FlyingRecord)[] = ["fly","mosquito","midges","fruit_fly","moth","housefly","other"];
                    return (
                      <React.Fragment key={loc}>
                        <tr>
                          <td className="border border-slate-200 py-1.5 px-2 font-medium bg-slate-50 text-slate-600 text-[11px]">{loc}</td>
                          {fields.map(f => (
                            <td key={f as string} className="border border-slate-200 p-0.5">
                              <NumCell value={r[f] as number} onChange={v => updateFlying(loc, f, v)} disabled={inputDisabled} />
                            </td>
                          ))}
                          <td className={`border border-slate-200 py-1.5 px-2 text-center font-semibold text-xs ${totalCellClass(r.step)}`}>
                            {r.total > 0 ? r.total : ""}
                          </td>
                          <td className="border border-slate-200 py-1.5 px-2 text-center"><StepBadge step={r.step} /></td>
                        </tr>
                        {r.step >= 2 && (
                          <tr>
                            <td colSpan={10} className={`border px-3 py-2 ${r.step === 3 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                              <div className={`text-[11px] font-semibold mb-1 ${r.step === 3 ? "text-red-600" : "text-amber-700"}`}>
                                {r.step === 3 ? "⚠ 3단계 초과" : "⚠ 2단계"} — 조치사항 입력 필수
                              </div>
                              <input disabled={inputDisabled}
                                className={`w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none
                                  ${r.step === 3 ? "border-red-300 focus:border-red-400" : "border-amber-300 focus:border-amber-400"}
                                  ${!r.action_note.trim() ? "bg-red-50" : "bg-white"}`}
                                placeholder="조치사항 입력"
                                value={r.action_note}
                                onChange={e => updateFlying(loc, "action_note", e.target.value)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 쥐먹이 상자 — 좌/우 */}
          <div className={`${card} p-4`}>
            <div className="font-semibold text-sm mb-3 pb-2 border-b border-slate-100">쥐먹이 상자 점검</div>
            <div className="grid grid-cols-2 gap-4">
              {(["left", "right"] as const).map(side => (
                <div key={side} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600 mb-3">{side === "left" ? "좌측" : "우측"}</div>
                  <div className="space-y-2">
                    {(["lure","damage","rat"] as const).map(field => {
                      const labels = { lure: "이끼상태", damage: "훼손여부", rat: "쥐흔적" };
                      const key = `${field}_${side}` as keyof FlyingRecord;
                      return (
                        <div key={field}>
                          <div className="text-[11px] text-slate-500 mb-1">{labels[field]}</div>
                          <OXBtn
                            value={p1[key] as string}
                            onChange={v => setRatBox(side, field, v)}
                            disabled={inputDisabled}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {ratFound && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                <div className="text-[11px] font-semibold text-red-600 mb-1">⚠ 쥐흔적 발견 — 조치사항 입력 필수</div>
                <input disabled={inputDisabled}
                  className={`w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none
                    ${!p1.rat_action_note.trim() ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}
                  placeholder="예: 서식장소 확인, 구서제 추가 설치 및 투여"
                  value={p1.rat_action_note}
                  onChange={e => setFlying(prev => ({
                    ...prev, "P1-입구": { ...prev["P1-입구"], rat_action_note: e.target.value },
                  }))}
                />
              </div>
            )}
          </div>

          {/* 보행해충 입력 */}
          <div className={card}>
            <div className="px-4 pt-4 pb-2 font-semibold text-sm border-b border-slate-100">보행해충 — 트랩 기록</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" style={{ minWidth: 520 }}>
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 py-2 px-2 text-slate-500" style={{ minWidth: 160 }}>트랩</th>
                    <th className="border border-slate-200 py-2 px-1">그리마</th>
                    <th className="border border-slate-200 py-2 px-1">거미</th>
                    <th className="border border-slate-200 py-2 px-1">노래기</th>
                    <th className="border border-slate-200 py-2 px-1">모기</th>
                    <th className="border border-slate-200 py-2 px-1">집게벌래</th>
                    <th className="border border-slate-200 py-2 px-1">기타</th>
                    <th className="border border-slate-200 py-2 px-2 bg-blue-50 text-blue-700 w-10">계</th>
                  </tr>
                </thead>
                <tbody>
                  {TRAPS.map(trap => {
                    const r = walking[trap];
                    const fields: (keyof WalkingRecord)[] = ["grima","spider","centipede","mosquito","earwig","other"];
                    return (
                      <tr key={trap}>
                        <td className="border border-slate-200 py-1.5 px-2 font-medium bg-slate-50 text-slate-600 text-[11px]">
                          {TRAP_LABELS[trap]}
                        </td>
                        {fields.map(f => (
                          <td key={f as string} className="border border-slate-200 p-0.5">
                            <NumCell value={r[f] as number} onChange={v => updateWalking(trap, f, v)} disabled={inputDisabled} />
                          </td>
                        ))}
                        <td className="border border-slate-200 py-1.5 px-2 text-center font-semibold text-xs bg-blue-50 text-blue-700">
                          {r.total > 0 ? r.total : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <button
            className="w-full rounded-xl border border-green-500 bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
            disabled={saving} onClick={handleSave}>
            {saving ? "⏳ 저장 중..." : "💾 저장"}
          </button>
        </>
      )}

      {/* ══ 월별 조회 ══ */}
      {subTab === "view" && (
        <>
          <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="mb-1 text-xs text-slate-500">연도</div>
                <select className={inp} style={{ width: 100 }} value={viewYear} onChange={e => setViewYear(Number(e.target.value))}>
                  {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-500">월</div>
                <select className={inp} style={{ width: 80 }} value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))}>
                  {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
                </select>
              </div>
              <button className={btn} onClick={loadView}>🔄 조회</button>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold
                ${viewSeason === "summer" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-green-300 bg-green-50 text-green-700"}`}>
                {viewSeason === "summer" ? "하계 기준" : "동계 기준"}
              </span>
            </div>
          </div>

          {viewLoading ? (
            <div className="py-8 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : viewDates.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">{viewYear}년 {viewMonth}월 기록이 없습니다.</div>
          ) : (
            <>
              {/* 비래해충 조회 */}
              <div className={card}>
                <div className="px-4 pt-4 pb-2 font-semibold text-sm border-b border-slate-100">
                  비래해충 — {viewYear}년 {viewMonth}월
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 680 }}>
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 py-2 px-2 text-slate-500 w-12">날짜</th>
                        <th className="border border-slate-200 py-2 px-2 text-slate-500 w-20">위치</th>
                        <th className="border border-slate-200 py-2 px-1">파리</th>
                        <th className="border border-slate-200 py-2 px-1">모기</th>
                        <th className="border border-slate-200 py-2 px-1">링다구</th>
                        <th className="border border-slate-200 py-2 px-1">초파리</th>
                        <th className="border border-slate-200 py-2 px-1">나방</th>
                        <th className="border border-slate-200 py-2 px-1">날파리</th>
                        <th className="border border-slate-200 py-2 px-1">기타</th>
                        <th className="border border-slate-200 py-2 px-2 bg-blue-50 text-blue-700 w-10">계</th>
                        <th className="border border-slate-200 py-2 px-2 bg-green-50 text-green-700 w-10">누계</th>
                        <th className="border border-slate-200 py-2 px-2 w-12">단계</th>
                        <th className="border border-slate-200 py-1 px-1 bg-amber-50 text-amber-700 text-[10px]" colSpan={3}>쥐먹이(좌)</th>
                        <th className="border border-slate-200 py-1 px-1 bg-orange-50 text-orange-700 text-[10px]" colSpan={3}>쥐먹이(우)</th>
                      </tr>
                      <tr className="bg-slate-50 text-[10px]">
                        <th className="border border-slate-200" colSpan={12}></th>
                        <th className="border border-slate-200 py-1 bg-amber-50 text-amber-600">이끼</th>
                        <th className="border border-slate-200 py-1 bg-amber-50 text-amber-600">훼손</th>
                        <th className="border border-slate-200 py-1 bg-amber-50 text-amber-600">쥐</th>
                        <th className="border border-slate-200 py-1 bg-orange-50 text-orange-600">이끼</th>
                        <th className="border border-slate-200 py-1 bg-orange-50 text-orange-600">훼손</th>
                        <th className="border border-slate-200 py-1 bg-orange-50 text-orange-600">쥐</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewDates.map(date => (
                        <React.Fragment key={date}>
                          {LOCATIONS.map((loc, li) => {
                            const r = flyingByDate[date]?.[loc];
                            const total = r?.total ?? 0;
                            const step  = r ? r.step : 1;
                            const cumul = flyingCumul[date]?.[loc] ?? 0;
                            const vp1 = flyingByDate[date]?.["P1-입구"];
                            return (
                              <React.Fragment key={loc}>
                                <tr>
                                  {li === 0 && (
                                    <td className="border border-slate-200 py-1.5 px-2 font-medium bg-slate-50 text-center text-[11px]"
                                      rowSpan={LOCATIONS.length}>
                                      {fmtDate(date)}
                                    </td>
                                  )}
                                  <td className="border border-slate-200 py-1 px-2 bg-slate-50 text-[11px] text-slate-600">{loc}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.fly || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.mosquito || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.midges || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.fruit_fly || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.moth || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.housefly || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.other || ""}</td>
                                  <td className={`border border-slate-200 py-1 px-2 text-center font-semibold ${totalCellClass(step)}`}>
                                    {total > 0 ? total : ""}
                                  </td>
                                  <td className="border border-slate-200 py-1 px-2 text-center font-semibold bg-green-50 text-green-700">
                                    {cumul > 0 ? cumul : ""}
                                  </td>
                                  <td className="border border-slate-200 py-1 px-2 text-center"><StepBadge step={step} /></td>
                                  {li === 0 && (
                                    <>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-amber-50 text-[11px]">
                                        <span className={vp1?.lure_left === "O" ? "text-green-600 font-bold" : "text-slate-400"}>{vp1?.lure_left ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-amber-50 text-[11px]">
                                        <span className={vp1?.damage_left === "O" ? "text-red-600 font-bold" : "text-slate-400"}>{vp1?.damage_left ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-amber-50 text-[11px]">
                                        <span className={vp1?.rat_left === "O" ? "text-red-600 font-bold" : "text-slate-400"}>{vp1?.rat_left ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-orange-50 text-[11px]">
                                        <span className={vp1?.lure_right === "O" ? "text-green-600 font-bold" : "text-slate-400"}>{vp1?.lure_right ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-orange-50 text-[11px]">
                                        <span className={vp1?.damage_right === "O" ? "text-red-600 font-bold" : "text-slate-400"}>{vp1?.damage_right ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-orange-50 text-[11px]">
                                        <span className={vp1?.rat_right === "O" ? "text-red-600 font-bold" : "text-slate-400"}>{vp1?.rat_right ?? "—"}</span>
                                      </td>
                                    </>
                                  )}
                                </tr>
                                {r && r.step >= 2 && r.action_note && (
                                  <tr>
                                    <td colSpan={18} className={`border px-3 py-1 text-[10px] ${r.step === 3 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                                      <span className="font-semibold">{r.step === 3 ? "3단계 조치: " : "2단계 조치: "}</span>{r.action_note}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      <tr className="bg-slate-50 font-semibold">
                        <td colSpan={2} className="border border-slate-200 py-2 px-2 text-center text-xs">월 합계</td>
                        <td colSpan={7} className="border border-slate-200 py-2 px-2 text-center text-xs text-slate-400">—</td>
                        <td className="border border-slate-200 py-2 px-2 text-center text-xs bg-blue-50 text-blue-700">
                          {Object.values(flyingMonthTotal).reduce((a,b)=>a+b,0) || ""}
                        </td>
                        <td colSpan={8} className="border border-slate-200" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 보행해충 조회 */}
              <div className={card}>
                <div className="px-4 pt-4 pb-2 font-semibold text-sm border-b border-slate-100">
                  보행해충 — {viewYear}년 {viewMonth}월
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 540 }}>
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 py-2 px-2 text-slate-500 w-12">날짜</th>
                        <th className="border border-slate-200 py-2 px-2 text-slate-500" style={{ minWidth: 160 }}>트랩</th>
                        <th className="border border-slate-200 py-2 px-1">그리마</th>
                        <th className="border border-slate-200 py-2 px-1">거미</th>
                        <th className="border border-slate-200 py-2 px-1">노래기</th>
                        <th className="border border-slate-200 py-2 px-1">모기</th>
                        <th className="border border-slate-200 py-2 px-1">집게벌래</th>
                        <th className="border border-slate-200 py-2 px-1">기타</th>
                        <th className="border border-slate-200 py-2 px-2 bg-blue-50 text-blue-700 w-10">계</th>
                        <th className="border border-slate-200 py-2 px-2 bg-green-50 text-green-700 w-10">누계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewDates.map(date => (
                        <React.Fragment key={date}>
                          {TRAPS.map((trap, ti) => {
                            const r = walkingByDate[date]?.[trap];
                            const total = r?.total ?? 0;
                            const cumul = walkingCumul[date]?.[trap] ?? 0;
                            return (
                              <tr key={trap}>
                                {ti === 0 && (
                                  <td className="border border-slate-200 py-1.5 px-2 font-medium bg-slate-50 text-center text-[11px]"
                                    rowSpan={TRAPS.length}>{fmtDate(date)}</td>
                                )}
                                <td className="border border-slate-200 py-1 px-2 bg-slate-50 text-[11px] text-slate-600">{TRAP_LABELS[trap]}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.grima || ""}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.spider || ""}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.centipede || ""}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.mosquito || ""}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.earwig || ""}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.other || ""}</td>
                                <td className="border border-slate-200 py-1 px-2 text-center font-semibold bg-blue-50 text-blue-700">
                                  {total > 0 ? total : ""}
                                </td>
                                <td className="border border-slate-200 py-1 px-2 text-center font-semibold bg-green-50 text-green-700">
                                  {cumul > 0 ? cumul : ""}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      <tr className="bg-slate-50 font-semibold">
                        <td colSpan={2} className="border border-slate-200 py-2 px-2 text-center text-xs">월 합계</td>
                        <td colSpan={6} className="border border-slate-200 py-2 px-2 text-center text-xs text-slate-400">—</td>
                        <td className="border border-slate-200 py-2 px-2 text-center text-xs bg-blue-50 text-blue-700">
                          {Object.values(walkingMonthTotal).reduce((a,b)=>a+b,0) || ""}
                        </td>
                        <td className="border border-slate-200" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
