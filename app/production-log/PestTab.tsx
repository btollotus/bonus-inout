"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PinModal } from "@/app/contexts/PinSessionContext";
import { todayKST } from "@/lib/utils/date";

const supabase = createClient();

// ─── 타입 ────────────────────────────────────────────────────────
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
  lure_status: string;   // O|X
  damage: string;        // O|X
  rat_trace: string;     // O|X
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

// ─── 상수 ────────────────────────────────────────────────────────
const LOCATIONS = [
  "P1-입구",
  "P2-위생전실",
  "P3-생산실",
  "P4-입출고실",
  "P5-원부재료실",
];

const TRAPS = ["NO-01","NO-02","NO-03","NO-04","NO-05","NO-06","NO-07","NO-08"];

// 위치 → 기준 구역 매핑
const ZONE_MAP: Record<string, "entrance" | "sanitary" | "production"> = {
  "P1-입구":       "entrance",
  "P2-위생전실":   "sanitary",
  "P3-생산실":     "production",
  "P4-입출고실":   "entrance",
  "P5-원부재료실": "sanitary",
};

// 계절별 단계 기준 [1단계 상한, 2단계 상한]
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

// ─── 스타일 ──────────────────────────────────────────────────────
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp  = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const btn  = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn= "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";

// 단계 배지
function StepBadge({ step }: { step: number }) {
  const cfg = [
    null,
    { bg: "bg-green-50",  border: "border-green-300",  text: "text-green-700",  label: "1단계" },
    { bg: "bg-amber-50",  border: "border-amber-300",  text: "text-amber-700",  label: "2단계" },
    { bg: "bg-red-50",    border: "border-red-300",    text: "text-red-700",    label: "3단계" },
  ];
  const c = cfg[step] ?? cfg[1]!;
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.bg} ${c.border} ${c.text}`}>
      {c.label}
    </span>
  );
}

// 계 셀 배경색
function totalCellClass(step: number): string {
  if (step === 3) return "bg-red-50 text-red-700 font-bold";
  if (step === 2) return "bg-amber-50 text-amber-700 font-bold";
  return "bg-blue-50 text-blue-700 font-semibold";
}

// ─── 기본값 생성 ─────────────────────────────────────────────────
function initFlying(date: string): Record<string, FlyingRecord> {
  const map: Record<string, FlyingRecord> = {};
  for (const loc of LOCATIONS) {
    map[loc] = {
      record_date: date, location: loc,
      fly: 0, mosquito: 0, midges: 0, fruit_fly: 0, moth: 0, housefly: 0, other: 0,
      total: 0, step: 1, action_note: "",
      lure_status: "X", damage: "X", rat_trace: "X", rat_action_note: "",
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

// ─── 메인 컴포넌트 ────────────────────────────────────────────────
export function PestTab({ role, userId, showToast }: {
  role: UserRole;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  // 탭
  const [subTab, setSubTab] = useState<"input" | "view">("input");

  // 입력 상태
  const [recDate, setRecDate]     = useState(todayKST());
  const [flying,  setFlying]      = useState<Record<string, FlyingRecord>>(() => initFlying(todayKST()));
  const [walking, setWalking]     = useState<Record<string, WalkingRecord>>(() => initWalking(todayKST()));
  const [saving,  setSaving]      = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null); // 이미 저장된 기록 여부

  // PIN
  const [employees,    setEmployees]    = useState<Employee[]>([]);
  const [inspector,    setInspector]    = useState<{ id: string; name: string } | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  // 조회 상태
  const [viewYear,  setViewYear]  = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);
  const [viewFlying,  setViewFlying]  = useState<FlyingRecord[]>([]);
  const [viewWalking, setViewWalking] = useState<WalkingRecord[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const season = getSeason(recDate);

  // 직원 목록
  useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees((data ?? []) as Employee[]));
  }, []);

  // 날짜 변경 시 기존 데이터 로드
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
          lure_status:     row.lure_status     ?? "X",
          damage:          row.damage          ?? "X",
          rat_trace:       row.rat_trace       ?? "X",
        };
        if (!firstInspector && row.inspector_id) {
          firstInspector = { id: row.inspector_id, name: row.inspector_name };
        }
      }
    }
    for (const row of wRows ?? []) {
      if (wMap[row.trap_no]) {
        wMap[row.trap_no] = { ...wMap[row.trap_no], ...row };
        if (!firstInspector && row.inspector_id) {
          firstInspector = { id: row.inspector_id, name: row.inspector_name };
        }
      }
    }

    setFlying(fMap);
    setWalking(wMap);
    if (firstInspector) setInspector(firstInspector);
    setExistingId(fRows && fRows.length > 0 ? fRows[0].id : null);
  }, []);

  useEffect(() => { loadInput(recDate); }, [recDate, loadInput]);

  // ── 비래해충 수치 변경 ──────────────────────────────────────────
  function updateFlying(
    loc: string,
    field: keyof FlyingRecord,
    value: number | string
  ) {
    setFlying(prev => {
      const rec = { ...prev[loc], [field]: value };
      // total · step 재계산 (숫자 필드만)
      if (["fly","mosquito","midges","fruit_fly","moth","housefly","other"].includes(field as string)) {
        rec.total = (rec.fly + rec.mosquito + rec.midges +
                     rec.fruit_fly + rec.moth + rec.housefly + rec.other);
        rec.step  = getStep(rec.total, loc, season);
        if (rec.step === 1) rec.action_note = "";
      }
      return { ...prev, [loc]: rec };
    });
  }

  // ── 보행해충 수치 변경 ──────────────────────────────────────────
  function updateWalking(trap: string, field: keyof WalkingRecord, value: number) {
    setWalking(prev => {
      const rec = { ...prev[trap], [field]: value };
      rec.total = rec.grima + rec.spider + rec.centipede + rec.mosquito + rec.earwig + rec.other;
      return { ...prev, [trap]: rec };
    });
  }

  // ── 저장 ───────────────────────────────────────────────────────
  async function handleSave() {
    // PIN 인증 체크
    if (!inspector) { setShowPinModal(true); return; }

    // 조치사항 필수 체크
    const missingAction = LOCATIONS.filter(loc => {
      const r = flying[loc];
      return r.step >= 2 && !r.action_note.trim();
    });
    // 쥐흔적 조치사항 체크
    const p1 = flying["P1-입구"];
    const missingRat = p1.rat_trace === "O" && !p1.rat_action_note.trim();

    if (missingAction.length > 0 || missingRat) {
      showToast("⚠ 기준 초과 항목의 조치사항을 입력해주세요.", "error");
      return;
    }

    setSaving(true);
    try {
      const happenedAt = `${recDate}T00:00:00+09:00`;

      // 비래해충 upsert
      const flyRows = LOCATIONS.map(loc => ({
        ...flying[loc],
        happened_at:   happenedAt,
        inspector_id:  inspector.id,
        inspector_name: inspector.name,
        created_by:    userId,
        action_note:     flying[loc].action_note.trim()     || null,
        rat_action_note: flying[loc].rat_action_note.trim() || null,
      }));
      const { error: fErr } = await supabase
        .from("pest_flying_records")
        .upsert(flyRows, { onConflict: "record_date,location" });
      if (fErr) throw fErr;

      // 보행해충 upsert
      const walkRows = TRAPS.map(trap => ({
        ...walking[trap],
        happened_at:    happenedAt,
        inspector_id:   inspector.id,
        inspector_name: inspector.name,
        created_by:     userId,
      }));
      const { error: wErr } = await supabase
        .from("pest_walking_records")
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

  // ── 월별 조회 로드 ─────────────────────────────────────────────
  async function loadView() {
    setViewLoading(true);
    const [{ data: fRows }, { data: wRows }] = await Promise.all([
      supabase.from("pest_flying_records").select("*")
        .eq("year", viewYear).eq("month", viewMonth)
        .order("record_date").order("location"),
      supabase.from("pest_walking_records").select("*")
        .eq("year", viewYear).eq("month", viewMonth)
        .order("record_date").order("trap_no"),
    ]);
    setViewFlying((fRows ?? []) as FlyingRecord[]);
    setViewWalking((wRows ?? []) as WalkingRecord[]);
    setViewLoading(false);
  }

  useEffect(() => {
    if (subTab === "view") loadView();
  }, [subTab, viewYear, viewMonth]);

  // ── 월별 조회 데이터 가공 ──────────────────────────────────────
  // 날짜 목록
  const viewDates = [...new Set(viewFlying.map(r => r.record_date))].sort();
  // 날짜 → 위치 → 레코드
  const flyingByDate: Record<string, Record<string, FlyingRecord>> = {};
  for (const r of viewFlying) {
    if (!flyingByDate[r.record_date]) flyingByDate[r.record_date] = {};
    flyingByDate[r.record_date][r.location] = r;
  }
  // 날짜 → 트랩 → 레코드
  const walkingByDate: Record<string, Record<string, WalkingRecord>> = {};
  for (const r of viewWalking) {
    if (!walkingByDate[r.record_date]) walkingByDate[r.record_date] = {};
    walkingByDate[r.record_date][r.trap_no] = r;
  }
  // 누계 계산 (위치별)
  const flyingCumul: Record<string, Record<string, number>> = {};
  for (const date of viewDates) {
    flyingCumul[date] = {};
    for (const loc of LOCATIONS) {
      const prev = viewDates
        .filter(d => d <= date)
        .reduce((sum, d) => sum + (flyingByDate[d]?.[loc]?.total ?? 0), 0);
      flyingCumul[date][loc] = prev;
    }
  }
  const walkingCumul: Record<string, Record<string, number>> = {};
  for (const date of viewDates) {
    walkingCumul[date] = {};
    for (const trap of TRAPS) {
      const prev = viewDates
        .filter(d => d <= date)
        .reduce((sum, d) => sum + (walkingByDate[d]?.[trap]?.total ?? 0), 0);
      walkingCumul[date][trap] = prev;
    }
  }

  // 월 합계
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

  // 날짜 표시 (M/D)
  function fmtDate(d: string) {
    const dt = new Date(d + "T00:00:00+09:00");
    return `${dt.getMonth()+1}/${dt.getDate()}`;
  }

  // ── 렌더 ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* PIN 모달 */}
      {showPinModal && (
        <PinModal
          employees={employees.filter(e => e.name !== null) as any}
          title="점검자 PIN 확인"
          onSuccess={(empId, empName) => {
            setInspector({ id: empId, name: empName });
            setShowPinModal(false);
          }}
          onCancel={() => setShowPinModal(false)}
        />
      )}

      {/* 탭 */}
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
                <input type="date" className={inp} style={{ width: 160 }}
                  value={recDate}
                  onChange={e => {
                    setRecDate(e.target.value);
                    setInspector(null);
                  }} />
              </div>
              <div className="flex items-center gap-2 mt-5">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold
                  ${season === "summer"
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-green-300 bg-green-50 text-green-700"}`}>
                  {season === "summer" ? "하계 (5~10월)" : "동계 (11~4월)"}
                </span>
              </div>
              <div className="ml-auto">
                {inspector ? (
                  <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                    <span className="text-sm font-semibold text-green-700">👤 {inspector.name}</span>
                    <span className="text-xs text-green-500">점검자 확인됨</span>
                    <button className="text-xs text-slate-400 hover:text-red-400 ml-1"
                      onClick={() => setInspector(null)}>변경</button>
                  </div>
                ) : (
                  <button
                    className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                    onClick={() => setShowPinModal(true)}>
                    🔑 PIN 입력
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* PIN 미인증 안내 */}
          {!inspector && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
              <span className="text-lg">🔑</span>
              <div className="text-sm text-amber-700 font-semibold">PIN을 입력해야 저장이 가능합니다.</div>
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
                  {[
                    { label: "P1-입구 / P4-입출고실", zone: "entrance"   as const },
                    { label: "P2-위생전실 / P5-원부재료실", zone: "sanitary"  as const },
                    { label: "P3-생산실",                  zone: "production" as const },
                  ].map(({ label, zone }) => (
                    <tr key={zone} className="border-b border-slate-100">
                      <td className="py-1.5 px-3 text-slate-500">{label}</td>
                      <td className="py-1.5 px-3 text-center text-green-600 font-medium">{criteriaLabels[zone][0]}</td>
                      <td className="py-1.5 px-3 text-center text-amber-600 font-medium">{criteriaLabels[zone][1]}</td>
                      <td className="py-1.5 px-3 text-center text-red-600 font-medium">{criteriaLabels[zone][2]}</td>
                      <td className="py-1.5 px-3 text-center text-red-500 font-medium" rowSpan={zone === "entrance" ? 3 : undefined}>
                        {zone === "entrance" ? "1마리 이하" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 비래해충 입력 ── */}
          <div className={card}>
            <div className="px-4 pt-4 pb-2 font-semibold text-sm border-b border-slate-100">
              비래해충 — 포충등 기록
            </div>
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
                              <input
                                type="number" min={0}
                                value={r[f] as number}
                                onChange={e => updateFlying(loc, f, Math.max(0, parseInt(e.target.value)||0))}
                                className="w-full text-center text-xs py-1 bg-transparent focus:outline-none focus:bg-blue-50 rounded"
                              />
                            </td>
                          ))}
                          <td className={`border border-slate-200 py-1.5 px-2 text-center font-semibold text-xs ${totalCellClass(r.step)}`}>
                            {r.total}
                          </td>
                          <td className="border border-slate-200 py-1.5 px-2 text-center">
                            <StepBadge step={r.step} />
                          </td>
                        </tr>
                        {/* 조치사항 행 — 2단계 이상 */}
                        {r.step >= 2 && (
                          <tr>
                            <td colSpan={10}
                              className={`border px-3 py-2 ${r.step === 3
                                ? "border-red-200 bg-red-50"
                                : "border-amber-200 bg-amber-50"}`}>
                              <div className={`text-[11px] font-semibold mb-1 ${r.step === 3 ? "text-red-600" : "text-amber-700"}`}>
                                {r.step === 3 ? "⚠ 3단계 초과" : "⚠ 2단계"} — 조치사항 입력 필수
                              </div>
                              <input
                                className={`w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none
                                  ${r.step === 3 ? "border-red-300 focus:border-red-400" : "border-amber-300 focus:border-amber-400"}
                                  ${r.step >= 2 && !r.action_note.trim() ? "bg-red-50" : "bg-white"}`}
                                placeholder={r.step === 3
                                  ? "예: 밀폐관리 확인 및 개보수, 서식장소 확인, 발생원인 분석"
                                  : "예: 서식장소 및 취약지역 확인 및 개보수"}
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

          {/* ── 쥐먹이 상자 점검 ── */}
          <div className={`${card} p-4`}>
            <div className="font-semibold text-sm mb-3 pb-2 border-b border-slate-100">
              쥐먹이 상자 점검
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {(["lure_status","damage","rat_trace"] as const).map((field, i) => {
                const labels = ["이끼상태","훼손여부","쥐흔적"];
                const val = flying["P1-입구"][field];
                return (
                  <div key={field} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500 font-medium mb-2">{labels[i]}</div>
                    <div className="flex gap-2">
                      {["O","X"].map(v => (
                        <button key={v}
                          className={`flex-1 rounded-lg border py-2 text-sm font-bold transition-all
                            ${val === v
                              ? v === "O"
                                ? "border-green-400 bg-green-100 text-green-700"
                                : "border-red-400 bg-red-100 text-red-700"
                              : "border-slate-200 bg-white text-slate-400 hover:bg-slate-100"}`}
                          onClick={() => {
                            // P1에만 저장 (날짜당 1세트)
                            setFlying(prev => ({
                              ...prev,
                              "P1-입구": { ...prev["P1-입구"], [field]: v },
                            }));
                          }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* 쥐흔적 O → 조치사항 */}
            {flying["P1-입구"].rat_trace === "O" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <div className="text-[11px] font-semibold text-red-600 mb-1">⚠ 쥐흔적 발견 — 조치사항 입력 필수</div>
                <input
                  className={`w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none
                    ${!flying["P1-입구"].rat_action_note.trim() ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}
                  placeholder="예: 서식장소 확인, 구서제 추가 설치 및 투여"
                  value={flying["P1-입구"].rat_action_note}
                  onChange={e => setFlying(prev => ({
                    ...prev,
                    "P1-입구": { ...prev["P1-입구"], rat_action_note: e.target.value },
                  }))}
                />
              </div>
            )}
          </div>

          {/* ── 보행해충 입력 ── */}
          <div className={card}>
            <div className="px-4 pt-4 pb-2 font-semibold text-sm border-b border-slate-100">
              보행해충 — 트랩 기록
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" style={{ minWidth: 480 }}>
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 py-2 px-2 text-slate-500 w-14">트랩</th>
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
                        <td className="border border-slate-200 py-1.5 px-2 font-medium bg-slate-50 text-slate-600 text-[11px]">{trap}</td>
                        {fields.map(f => (
                          <td key={f as string} className="border border-slate-200 p-0.5">
                            <input
                              type="number" min={0}
                              value={r[f] as number}
                              onChange={e => updateWalking(trap, f, Math.max(0, parseInt(e.target.value)||0))}
                              className="w-full text-center text-xs py-1 bg-transparent focus:outline-none focus:bg-blue-50 rounded"
                            />
                          </td>
                        ))}
                        <td className="border border-slate-200 py-1.5 px-2 text-center font-semibold text-xs bg-blue-50 text-blue-700">
                          {r.total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 저장 버튼 */}
          <button
            className="w-full rounded-xl border border-green-500 bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
            disabled={saving}
            onClick={handleSave}>
            {saving ? "⏳ 저장 중..." : "💾 저장"}
          </button>
        </>
      )}

      {/* ══ 월별 조회 ══ */}
      {subTab === "view" && (
        <>
          {/* 필터 */}
          <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="mb-1 text-xs text-slate-500">연도</div>
                <select className={inp} style={{ width: 100 }}
                  value={viewYear} onChange={e => setViewYear(Number(e.target.value))}>
                  {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-500">월</div>
                <select className={inp} style={{ width: 80 }}
                  value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))}>
                  {Array.from({length:12},(_,i)=>i+1).map(m =>
                    <option key={m} value={m}>{m}월</option>)}
                </select>
              </div>
              <button className={btn} onClick={loadView}>🔄 조회</button>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold
                ${viewSeason === "summer"
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-green-300 bg-green-50 text-green-700"}`}>
                {viewSeason === "summer" ? "하계 기준" : "동계 기준"}
              </span>
            </div>
          </div>

          {viewLoading ? (
            <div className="py-8 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : viewDates.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              {viewYear}년 {viewMonth}월 기록이 없습니다.
            </div>
          ) : (
            <>
              {/* 비래해충 조회 */}
              <div className={card}>
                <div className="px-4 pt-4 pb-2 font-semibold text-sm border-b border-slate-100">
                  비래해충 — {viewYear}년 {viewMonth}월
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 560 }}>
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 py-2 px-2 text-slate-500 w-14">날짜</th>
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
                        <th className="border border-slate-200 py-2 px-2 bg-amber-50 text-amber-700 w-8">이끼</th>
                        <th className="border border-slate-200 py-2 px-2 bg-amber-50 text-amber-700 w-8">훼손</th>
                        <th className="border border-slate-200 py-2 px-2 bg-amber-50 text-amber-700 w-8">쥐흔적</th>
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
                            const p1 = flyingByDate[date]?.["P1-입구"];
                            return (
                              <React.Fragment key={loc}>
                                <tr>
                                  {li === 0 && (
                                    <td className="border border-slate-200 py-1.5 px-2 font-medium bg-slate-50 text-center text-[11px]"
                                      rowSpan={LOCATIONS.length * 2 - (LOCATIONS.filter(l => {
                                        const rx = flyingByDate[date]?.[l];
                                        return rx && rx.step >= 2;
                                      }).length > 0 ? 0 : 0)}>
                                      {fmtDate(date)}
                                    </td>
                                  )}
                                  <td className="border border-slate-200 py-1 px-2 bg-slate-50 text-[11px] text-slate-600">{loc}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.fly ?? 0}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.mosquito ?? 0}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.midges ?? 0}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.fruit_fly ?? 0}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.moth ?? 0}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.housefly ?? 0}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.other ?? 0}</td>
                                  <td className={`border border-slate-200 py-1 px-2 text-center font-semibold ${totalCellClass(step)}`}>{total}</td>
                                  <td className="border border-slate-200 py-1 px-2 text-center font-semibold bg-green-50 text-green-700">{cumul}</td>
                                  <td className="border border-slate-200 py-1 px-2 text-center"><StepBadge step={step} /></td>
                                  {/* 쥐먹이 — P1 rowspan */}
                                  {li === 0 && (
                                    <>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-2 text-center bg-amber-50">
                                        <span className={p1?.lure_status === "O" ? "text-green-600 font-bold" : "text-slate-400"}>{p1?.lure_status ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-2 text-center bg-amber-50">
                                        <span className={p1?.damage === "O" ? "text-red-600 font-bold" : "text-slate-400"}>{p1?.damage ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-2 text-center bg-amber-50">
                                        <span className={p1?.rat_trace === "O" ? "text-red-600 font-bold text-sm" : "text-slate-400"}>{p1?.rat_trace ?? "—"}</span>
                                      </td>
                                    </>
                                  )}
                                </tr>
                                {/* 조치사항 행 */}
                                {r && r.step >= 2 && r.action_note && (
                                  <tr>
                                    <td colSpan={13}
                                      className={`border px-3 py-1 text-[10px] ${r.step === 3 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                                      <span className="font-semibold">{r.step === 3 ? "3단계 조치: " : "2단계 조치: "}</span>{r.action_note}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {/* 월 합계 */}
                      <tr className="bg-slate-50 font-semibold">
                        <td colSpan={2} className="border border-slate-200 py-2 px-2 text-center text-xs">월 합계</td>
                        <td colSpan={7} className="border border-slate-200 py-2 px-2 text-center text-xs text-slate-400">—</td>
                        <td className="border border-slate-200 py-2 px-2 text-center text-xs bg-blue-50 text-blue-700">
                          {Object.values(flyingMonthTotal).reduce((a,b)=>a+b,0)}
                        </td>
                        <td colSpan={5} className="border border-slate-200" />
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
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 480 }}>
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 py-2 px-2 text-slate-500 w-14">날짜</th>
                        <th className="border border-slate-200 py-2 px-2 text-slate-500 w-14">트랩</th>
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
                                    rowSpan={TRAPS.length}>
                                    {fmtDate(date)}
                                  </td>
                                )}
                                <td className="border border-slate-200 py-1 px-2 bg-slate-50 text-[11px] text-slate-600">{trap}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.grima ?? 0}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.spider ?? 0}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.centipede ?? 0}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.mosquito ?? 0}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.earwig ?? 0}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.other ?? 0}</td>
                                <td className="border border-slate-200 py-1 px-2 text-center font-semibold bg-blue-50 text-blue-700">{total}</td>
                                <td className="border border-slate-200 py-1 px-2 text-center font-semibold bg-green-50 text-green-700">{cumul}</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {/* 월 합계 */}
                      <tr className="bg-slate-50 font-semibold">
                        <td colSpan={2} className="border border-slate-200 py-2 px-2 text-center text-xs">월 합계</td>
                        <td colSpan={6} className="border border-slate-200 py-2 px-2 text-center text-xs text-slate-400">—</td>
                        <td className="border border-slate-200 py-2 px-2 text-center text-xs bg-blue-50 text-blue-700">
                          {Object.values(walkingMonthTotal).reduce((a,b)=>a+b,0)}
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
