"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PinModal, usePinSession } from "@/app/contexts/PinSessionContext";

const supabase = createClient();

// ─── 타입 ───────────────────────────────────────────────────
type Period = "AM" | "PM";
type DeviceType = "냉장고" | "냉동고" | "온장고";
type Role = "inspector" | "author" | "approver";

type LogEntry = {
  id?: string;
  log_date: string;
  period: Period;
  device_type: DeviceType;
  device_no: string;
  temperature: number | null;
  is_ok: boolean | null;
  action_note: string;
  special_note: string;
  inspector_id: string | null;
  inspector_name: string | null;
  check_time: string | null;
};

type SignatureEntry = {
  id?: string;
  log_date: string;
  period: string;
  role: Role;
  inspector_id: string | null;
  inspector_name: string | null;
  signature_data: string | null;
};

type Employee = {
  id: string;
  name: string;
  pin: string | null;
};

// ─── 상수 ───────────────────────────────────────────────────
const DEVICES: { type: DeviceType; nos: string[]; min: number; max: number }[] = [
  { type: "냉장고", nos: ["01","02","03","04","05","06"], min: 0,   max: 10  },
  { type: "냉동고", nos: ["01","02"],                     min: -35, max: 0   },
  { type: "온장고", nos: ["01","02","03","04","05","06","07","08","09"], min: 40, max: 50 },
];

// 빠른선택 버튼 제거됨

function todayKST(): string {
  const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function parseTemp(raw: string, type: DeviceType): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 1) return null;
  // 3자리: 앞 2자리.뒷 1자리 (예: 012 → 1.2, 260 → 26.0, 459 → 45.9)
  const padded = digits.padStart(3, "0");
  const intPart = parseInt(padded.slice(0, 2), 10);
  const decPart = parseInt(padded.slice(2), 10);
  const val = intPart + decPart / 10;
  return type === "냉동고" ? -val : val;
}

function formatTemp(t: number | null): string {
  if (t === null) return "";
  return `${t >= 0 ? "" : ""}${t.toFixed(1)}℃`;
}

function isInRange(t: number | null, type: DeviceType): boolean {
  if (t === null) return true;
  const dev = DEVICES.find(d => d.type === type)!;
  return t >= dev.min && t <= dev.max;
}

function getTempRange(type: DeviceType): string {
  const dev = DEVICES.find(d => d.type === type)!;
  return `${dev.min}~${dev.max}℃`;
}

// ─── 온도 입력 셀 ─────────────────────────────────────────────
function TempCell({
  type, entry, onSelect, disabled,
}: {
  type: DeviceType;
  entry: LogEntry;
  onSelect: (temp: number | null) => void;
  disabled: boolean;
}) {
  const [rawInput, setRawInput] = useState("");
  const temp = entry.temperature;
  const ok = temp === null ? null : isInRange(temp, type);

  function handleRaw(val: string) {
    const digits = val.replace(/[^\d]/g, "").slice(0, 3);
    setRawInput(digits);
    if (digits.length === 3) {
      const parsed = parseTemp(digits, type);
      onSelect(parsed);
      setRawInput("");
    }
  }

  const cellBg = temp === null
    ? "bg-slate-50 border-slate-200"
    : ok
    ? "bg-blue-50 border-blue-300"
    : "bg-red-50 border-red-400";

  return (
    <div className={`rounded-xl border-2 p-2 transition-all ${cellBg}`}>
      {/* 현재값 표시 */}
      <div className={`text-center font-bold tabular-nums text-sm mb-1.5 ${temp === null ? "text-slate-300" : ok ? "text-blue-700" : "text-red-600"}`}>
        {temp !== null ? (
          <>{formatTemp(temp)}{!ok && <span className="ml-1">⚠</span>}</>
        ) : "미입력"}
      </div>

      {!disabled && (
        <div className="space-y-1">
          {/* 3자리 직접입력 */}
          <input
            type="text"
            inputMode="numeric"
            maxLength={3}
            placeholder={type === "냉동고" ? "260" : type === "온장고" ? "459" : "012"}
            value={rawInput}
            onChange={(e) => handleRaw(e.target.value)}
            className={`w-full rounded-lg border px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none transition-all
              ${rawInput.length > 0 ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}
          />
          {/* 입력 힌트 */}
          {rawInput.length > 0 && rawInput.length < 3 && (
            <div className="text-center text-[10px] text-slate-400">
              {type === "냉동고" ? "-" : ""}{parseTemp(rawInput.padEnd(3,"0"), type)?.toFixed(1) ?? ""}℃ (3자리 입력)
            </div>
          )}
          {/* 지우기 */}
          {temp !== null && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="w-full text-[10px] text-slate-300 hover:text-red-400 underline"
            >지우기</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────
export default function FridgeMonitoringClient() {
  const [logDate, setLogDate] = useState(todayKST());
  const [period, setPeriod] = useState<Period>("AM");
  const [entries, setEntries] = useState<Record<string, LogEntry>>({});
  const [specialNote, setSpecialNote] = useState("");
  const [signatures, setSignatures] = useState<Record<string, SignatureEntry>>({});
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error" } | null>(null);
  const [viewMode, setViewMode] = useState<"input"|"query">("input");

  // PIN — 오전/오후 각각 독립
  const { login: pinLogin } = usePinSession();
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinTarget, setPinTarget] = useState<"AM"|"PM">("AM");
  const [amInspector, setAmInspector] = useState<{ id: string; name: string } | null>(null);
  const [pmInspector, setPmInspector] = useState<{ id: string; name: string } | null>(null);

  // 점검시각 — 오전/오후 각각
  const [amCheckTime, setAmCheckTime] = useState("");
  const [pmCheckTime, setPmCheckTime] = useState("");

  const currentInspector = period === "AM" ? amInspector : pmInspector;
  const currentCheckTime = period === "AM" ? amCheckTime : pmCheckTime;
  const setCurrentCheckTime = (v: string) => period === "AM" ? setAmCheckTime(v) : setPmCheckTime(v);

  function showToast(msg: string, type: "success"|"error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  // 직원 목록
  useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => { if (data) setEmployees(data as Employee[]); });
  }, []);

  // 초기화 - 빈 엔트리 생성
  const initEntries = useCallback(() => {
    const map: Record<string, LogEntry> = {};
    for (const dev of DEVICES) {
      for (const no of dev.nos) {
        const key = `${dev.type}-${no}`;
        map[key] = {
          log_date: logDate,
          period,
          device_type: dev.type,
          device_no: no,
          temperature: null,
          is_ok: null,
          action_note: "",
          special_note: "",
          inspector_id: null,
          inspector_name: null,
          check_time: null,
        };
      }
    }
    return map;
  }, [logDate, period]);

  // 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 현재 날짜+period 기록
      const { data: logs } = await supabase
        .from("fridge_monitoring_logs")
        .select("*")
        .eq("log_date", logDate)
        .eq("period", period);

      // 사인(inspector) 로드
      const { data: sigs } = await supabase
        .from("fridge_monitoring_signatures")
        .select("*")
        .eq("log_date", logDate)
        .in("period", ["AM", "PM"])
        .eq("role", "inspector");

      const base = initEntries();

      if (logs && logs.length > 0) {
        let note = "";
        for (const log of logs) {
          const key = `${log.device_type}-${log.device_no}`;
          if (base[key]) {
            base[key] = { ...base[key], ...log };
          }
          if (log.special_note) note = log.special_note;
        }
        setSpecialNote(note);
      }
      setEntries(base);

      // 기존 점검자 복원
      for (const sig of sigs ?? []) {
        if (sig.period === "AM" && sig.inspector_id && sig.inspector_name) {
          setAmInspector({ id: sig.inspector_id, name: sig.inspector_name });
        }
        if (sig.period === "PM" && sig.inspector_id && sig.inspector_name) {
          setPmInspector({ id: sig.inspector_id, name: sig.inspector_name });
        }
        setSignatures(prev => ({ ...prev, [`${sig.period}-${sig.role}`]: sig }));
      }
    } finally {
      setLoading(false);
    }
  }, [logDate, period, initEntries]);

  useEffect(() => { loadData(); }, [loadData]);

  // 온도 입력
  function handleTempSelect(key: string, temp: number | null) {
    setEntries(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        temperature: temp,
        is_ok: temp === null ? null : isInRange(temp, prev[key].device_type),
      }
    }));
  }

  // 조치사항 입력
  function handleActionNote(key: string, note: string) {
    setEntries(prev => ({ ...prev, [key]: { ...prev[key], action_note: note } }));
  }

  // 저장
  async function handleSave() {
    if (!currentInspector) {
      setPinTarget(period);
      setShowPinModal(true);
      return;
    }

    // 이탈 항목에 조치사항 미입력 체크
    const missing = Object.entries(entries).filter(([, e]) =>
      e.temperature !== null && !isInRange(e.temperature, e.device_type) && !e.action_note.trim()
    );
    if (missing.length > 0) {
      showToast(`⚠ 기준 이탈 항목의 조치사항을 입력해주세요.`, "error");
      return;
    }

    setSaving(true);
    try {
      const checkTimeStr = currentCheckTime.length === 4
        ? `${currentCheckTime.slice(0,2)}:${currentCheckTime.slice(2,4)}`
        : null;

      const toSave = Object.values(entries).map(e => ({
        ...e,
        special_note: specialNote.trim() || null,
        inspector_id: currentInspector.id,
        inspector_name: currentInspector.name,
        action_note: e.action_note.trim() || null,
        check_time: checkTimeStr,
      }));

      const { error } = await supabase.from("fridge_monitoring_logs").upsert(toSave, {
        onConflict: "log_date,period,device_type,device_no"
      });
      if (error) throw error;

      // 점검자 사인 기록
      await supabase.from("fridge_monitoring_signatures").upsert({
        log_date: logDate,
        period,
        role: "inspector",
        inspector_id: currentInspector.id,
        inspector_name: currentInspector.name,
        signature_data: null,
      }, { onConflict: "log_date,period,role" });

      showToast("✅ 저장 완료!");
      await loadData();
    } catch (e: any) {
      showToast("저장 실패: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  // 사인 저장 함수 제거됨 (작성/승인란 삭제)

  const isReadOnly = logDate !== todayKST();

  // 이탈 항목 목록
  const outOfRangeEntries = Object.entries(entries).filter(([, e]) =>
    e.temperature !== null && !isInRange(e.temperature, e.device_type)
  );

  // 점검자 이름 (현재 period 기준)
  const inspectorName = (() => {
    if (currentInspector) return currentInspector.name;
    const first = Object.values(entries).find(e => e.inspector_name);
    return first?.inspector_name ?? null;
  })();

  const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50";
  const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";

  return (
    <div className="space-y-4">

        {/* PIN 모달 */}
        {showPinModal && (
          <PinModal
            employees={employees.filter(e => e.name !== null) as any}
            title={`${pinTarget === "AM" ? "오전" : "오후"} 점검자 확인`}
            onSuccess={(empId, empName) => {
              pinLogin(empId, empName);
              if (pinTarget === "AM") setAmInspector({ id: empId, name: empName });
              else setPmInspector({ id: empId, name: empName });
              setShowPinModal(false);
            }}
            onCancel={() => setShowPinModal(false)}
          />
        )}

        {/* 토스트 */}
        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] rounded-2xl border px-5 py-3 text-sm font-semibold shadow-xl ${toast.type === "success" ? "border-green-300 bg-green-600 text-white" : "border-red-300 bg-red-600 text-white"}`}>
            {toast.msg}
          </div>
        )}

        {/* 헤더 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">❄️ 냉장·냉동·온장고 모니터링</h1>
            <div className="text-xs text-slate-500 mt-0.5">냉장 0~10℃ · 냉동 0~-35℃ · 온장 40~50℃ · 2회/일</div>
          </div>
          <div className="flex gap-2">
            <button className={viewMode === "input" ? btnOn : btn} onClick={() => setViewMode("input")}>📝 기록입력</button>
            <button className={viewMode === "query" ? btnOn : btn} onClick={() => setViewMode("query")}>🔍 일자별 조회</button>
          </div>
        </div>

        {viewMode === "query" ? (
          <FridgeQueryView employees={employees} />
        ) : (
          <>
            {/* 날짜·오전오후 선택 */}
            <div className={`${card} p-4`}>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <div className="mb-1 text-xs text-slate-500">점검일</div>
                  <input type="date" className={inp} style={{ width: 160 }}
                    value={logDate} max={todayKST()}
                    onChange={e => {
                      setLogDate(e.target.value);
                      setAmInspector(null);
                      setPmInspector(null);
                      setAmCheckTime("");
                      setPmCheckTime("");
                    }} />
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-500">점검시간</div>
                  <div className="flex gap-2">
                    <button className={period === "AM" ? btnOn : btn} onClick={() => setPeriod("AM")}>오전</button>
                    <button className={period === "PM" ? btnOn : btn} onClick={() => setPeriod("PM")}>오후</button>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  {/* 점검시각 입력 */}
                  {currentInspector && !isReadOnly && (
                    <div className="flex items-center gap-1.5">
                      <div className="text-xs text-slate-500">점검시각</div>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="예: 0900"
                        value={currentCheckTime}
                        onChange={e => {
                          const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
                          setCurrentCheckTime(digits);
                        }}
                        className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-center tabular-nums focus:border-blue-400 focus:outline-none"
                      />
                      {currentCheckTime.length === 4 && (
                        <span className="text-xs text-slate-500">
                          {currentCheckTime.slice(0,2)}:{currentCheckTime.slice(2,4)}
                        </span>
                      )}
                    </div>
                  )}
                  {/* 현재 period 점검자 표시 */}
                  {currentInspector ? (
                    <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                      <span className="text-green-600 text-sm font-semibold">👤 {currentInspector.name}</span>
                      <span className="text-xs text-green-500">{period === "AM" ? "오전" : "오후"} 점검자 확인됨</span>
                    </div>
                  ) : (
                    <button className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                      onClick={() => { setPinTarget(period); setShowPinModal(true); }}>
                      🔑 {period === "AM" ? "오전" : "오후"} PIN 입력
                    </button>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-slate-400">불러오는 중...</div>
            ) : (
              <>
                {/* PIN 미인증 안내 */}
                {!currentInspector && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
                    <span className="text-lg">🔑</span>
                    <div className="text-sm text-amber-700 font-semibold">PIN을 입력해야 온도 기록이 가능합니다.</div>
                  </div>
                )}
                {/* 장비별 입력 */}
                {DEVICES.map(dev => (
                  <div key={dev.type} className={`${card} p-4`}>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        <span>{dev.type === "냉장고" ? "🧊" : dev.type === "냉동고" ? "❄️" : "🌡️"}</span>
                        <span>{dev.type}</span>
                        <span className="text-xs text-slate-400 font-normal">기준: {getTempRange(dev.type)}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {dev.nos.filter(no => entries[`${dev.type}-${no}`]?.temperature !== null).length}/{dev.nos.length} 입력
                      </div>
                    </div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(dev.nos.length, 3)}, 1fr)` }}>
                      {dev.nos.map(no => {
                        const key = `${dev.type}-${no}`;
                        const entry = entries[key];
                        if (!entry) return null;
                        return (
                          <div key={no}>
                            <div className="mb-1 text-xs font-semibold text-slate-600">{dev.type}-{no}</div>
                            <TempCell
                              type={dev.type}
                              entry={entry}
                              onSelect={(temp) => handleTempSelect(key, temp)}
                              disabled={isReadOnly || !currentInspector}
                            />
                            {/* 이탈 조치사항 */}
                            {entry.temperature !== null && !isInRange(entry.temperature, dev.type) && (
                              <div className="mt-1.5">
                                <div className="text-[11px] text-red-600 font-semibold mb-0.5">⚠ 조치사항 *</div>
                                <textarea
                                  className="w-full rounded-xl border border-red-300 px-2 py-1.5 text-xs focus:outline-none resize-none"
                                  rows={2}
                                  placeholder="이탈 원인 및 조치 내용"
                                  value={entry.action_note}
                                  disabled={isReadOnly}
                                  onChange={e => handleActionNote(key, e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* 이탈 요약 */}
                {outOfRangeEntries.length > 0 && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <div className="font-semibold text-sm text-red-700 mb-2">⚠ 기준 이탈 항목 ({outOfRangeEntries.length}건)</div>
                    <div className="space-y-1">
                      {outOfRangeEntries.map(([key, e]) => (
                        <div key={key} className="flex items-center gap-2 text-sm">
                          <span className="font-semibold text-red-700">{key}</span>
                          <span className="text-red-600">{formatTemp(e.temperature)}</span>
                          <span className="text-xs text-slate-500">기준: {getTempRange(e.device_type)}</span>
                          {!e.action_note.trim() && <span className="text-xs text-red-500 font-semibold">조치사항 미입력</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 특이사항 */}
                <div className={`${card} p-4`}>
                  <div className="mb-2 font-semibold text-sm">📋 특이사항</div>
                  <textarea
                    className={`${inp} resize-none`}
                    rows={2}
                    placeholder="특이사항 없음"
                    value={specialNote}
                    disabled={isReadOnly}
                    onChange={e => setSpecialNote(e.target.value)}
                  />
                </div>

                {/* 저장 버튼 */}
                {!isReadOnly && (
                  <div className="flex gap-3">
                    <button
                      className="flex-1 rounded-xl border border-green-500 bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
                      disabled={saving}
                      onClick={handleSave}
                    >
                      {saving ? "⏳ 저장 중..." : "💾 저장"}
                    </button>
                    <PrintButton logDate={logDate} period={period} entries={entries} signatures={signatures} specialNote={specialNote} />
                  </div>
                )}
              </>
            )}
          </>
        )}
    </div>
  );
}

// ─── 조회 뷰 ─────────────────────────────────────────────────
function FridgeQueryView({ employees }: { employees: Employee[] }) {
  const [queryDate, setQueryDate] = useState(todayKST());
  const [queryData, setQueryData] = useState<{ AM: Record<string, LogEntry>; PM: Record<string, LogEntry> }>({ AM: {}, PM: {} });
  const [queryInspectors, setQueryInspectors] = useState<{ AM: string | null; PM: string | null }>({ AM: null, PM: null });
  const [queryCheckTimes, setQueryCheckTimes] = useState<{ AM: string | null; PM: string | null }>({ AM: null, PM: null });
  const [loading, setLoading] = useState(false);

  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const inp = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";

  async function loadQuery() {
    setLoading(true);
    const [{ data }, { data: sigs }] = await Promise.all([
      supabase.from("fridge_monitoring_logs").select("*").eq("log_date", queryDate),
      supabase.from("fridge_monitoring_signatures").select("period,inspector_name").eq("log_date", queryDate).eq("role", "inspector"),
    ]);
    setLoading(false);

    const am: Record<string, LogEntry> = {};
    const pm: Record<string, LogEntry> = {};
    for (const row of data ?? []) {
      const key = `${row.device_type}-${row.device_no}`;
      if (row.period === "AM") am[key] = row;
      else pm[key] = row;
    }
    setQueryData({ AM: am, PM: pm });

    const inspectors = { AM: null as string | null, PM: null as string | null };
    for (const sig of sigs ?? []) {
      if (sig.period === "AM") inspectors.AM = sig.inspector_name;
      if (sig.period === "PM") inspectors.PM = sig.inspector_name;
    }
    setQueryInspectors(inspectors);

    // 점검시각 — 첫 번째 행에서 추출
    const times = { AM: null as string | null, PM: null as string | null };
    for (const row of data ?? []) {
      if (row.period === "AM" && !times.AM && row.check_time) times.AM = row.check_time;
      if (row.period === "PM" && !times.PM && row.check_time) times.PM = row.check_time;
    }
    setQueryCheckTimes(times);
  }

  useEffect(() => { loadQuery(); }, [queryDate]);

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex items-center gap-3">
          <input type="date" className={inp} value={queryDate} max={todayKST()} onChange={e => setQueryDate(e.target.value)} />
          <button className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700" onClick={loadQuery}>조회</button>
        </div>
      </div>

      {loading ? <div className="text-center text-sm text-slate-400 py-8">불러오는 중...</div> : (
        <div className={`${card} p-4 overflow-x-auto`}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-3 py-2 text-xs text-left font-semibold text-slate-500">구분</th>
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">오전</th>
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">오후</th>
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">기준</th>
              </tr>
            </thead>
            <tbody>
              {DEVICES.map(dev => dev.nos.map(no => {
                const key = `${dev.type}-${no}`;
                const am = queryData.AM[key];
                const pm = queryData.PM[key];
                const amOk = am?.temperature !== null && isInRange(am?.temperature ?? null, dev.type);
                const pmOk = pm?.temperature !== null && isInRange(pm?.temperature ?? null, dev.type);
                return (
                  <tr key={key} className="border-b border-slate-100">
                    <td className="border border-slate-200 px-3 py-1.5 text-xs font-medium">{dev.type}-{no}</td>
                    <td className={`border border-slate-200 px-3 py-1.5 text-center tabular-nums text-sm font-semibold ${am?.temperature !== null ? (amOk ? "text-blue-700" : "text-red-600") : "text-slate-300"}`}>
                      {am?.temperature !== null ? formatTemp(am?.temperature ?? null) : "—"}
                    </td>
                    <td className={`border border-slate-200 px-3 py-1.5 text-center tabular-nums text-sm font-semibold ${pm?.temperature !== null ? (pmOk ? "text-blue-700" : "text-red-600") : "text-slate-300"}`}>
                      {pm?.temperature !== null ? formatTemp(pm?.temperature ?? null) : "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-1.5 text-center text-xs text-slate-400">{getTempRange(dev.type)}</td>
                  </tr>
                );
              }))}
              {/* 점검시각 행 */}
              <tr className="bg-slate-50">
                <td className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">점검시각</td>
                <td className="border border-slate-200 px-3 py-2 text-center text-sm text-slate-600 tabular-nums">
                  {queryCheckTimes.AM ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-center text-sm text-slate-600 tabular-nums">
                  {queryCheckTimes.PM ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="border border-slate-200 px-3 py-2" />
              </tr>
              {/* 점검자 행 */}
              <tr className="bg-slate-50">
                <td className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">점검자</td>
                <td className="border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700">
                  {queryInspectors.AM ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700">
                  {queryInspectors.PM ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="border border-slate-200 px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── 인쇄 버튼 ─────────────────────────────────────────────
function PrintButton({ logDate, period, entries, signatures, specialNote }: {
  logDate: string;
  period: Period;
  entries: Record<string, LogEntry>;
  signatures: Record<string, SignatureEntry>;
  specialNote: string;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        onClick={() => setShowModal(true)}
      >
        🖨️ 인쇄
      </button>
      {showModal && (
        <PrintModal
          logDate={logDate}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── 인쇄 모달 (주간 단위) ────────────────────────────────────
function PrintModal({ logDate, onClose }: { logDate: string; onClose: () => void }) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(logDate + "T00:00:00+09:00");
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return mon.toISOString().slice(0, 10);
  });
  const [printData, setPrintData] = useState<Record<string, Record<string, LogEntry>>>({});
  const [printSigs, setPrintSigs] = useState<Record<string, SignatureEntry[]>>({});
  const [loading, setLoading] = useState(false);

  // 주간 날짜 배열 (월~금)
  function getWeekDates(start: string): string[] {
    const dates: string[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(start + "T00:00:00+09:00");
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  const weekDates = getWeekDates(weekStart);

  async function loadPrint() {
    setLoading(true);
    const { data: logs } = await supabase
      .from("fridge_monitoring_logs")
      .select("*")
      .in("log_date", weekDates);

    const { data: sigs } = await supabase
      .from("fridge_monitoring_signatures")
      .select("*")
      .in("log_date", weekDates);

    // 날짜-period 키로 맵핑
    const dataMap: Record<string, Record<string, LogEntry>> = {};
    for (const row of logs ?? []) {
      const colKey = `${row.log_date}-${row.period}`;
      if (!dataMap[colKey]) dataMap[colKey] = {};
      dataMap[colKey][`${row.device_type}-${row.device_no}`] = row;
    }
    setPrintData(dataMap);

    const sigMap: Record<string, SignatureEntry[]> = {};
    for (const sig of sigs ?? []) {
      if (!sigMap[sig.log_date]) sigMap[sig.log_date] = [];
      sigMap[sig.log_date].push(sig);
    }
    setPrintSigs(sigMap);
    setLoading(false);
  }

  useEffect(() => { loadPrint(); }, [weekStart]);

  const DAY_LABELS = ["월", "화", "수", "목", "금"];

  function doPrint() {
    const content = document.getElementById("fridge-print-content");
    if (!content) return;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:none;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>냉장냉동온장고 모니터링일지</title>
      <style>
        @page{size:A4 landscape;margin:8mm 10mm;}
        body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:8pt;color:#111;}
        *{box-sizing:border-box;}
        table{border-collapse:collapse;width:100%;}
        th,td{border:1px solid #999;padding:2px 4px;text-align:center;font-size:7.5pt;}
        .header-title{text-align:center;font-size:14pt;font-weight:bold;letter-spacing:4px;margin-bottom:6px;}
        .ok{color:#1d4ed8;}
        .ng{color:#dc2626;font-weight:bold;}
        .sig-img{max-width:60px;max-height:24px;}
      </style>
    </head><body>${content.innerHTML}</body></html>`);
    doc.close();
    setTimeout(() => { window.print?.(); document.body.removeChild(iframe); onClose(); }, 500);
  }

  const inp = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-100">
      <div className="flex items-center justify-between gap-3 bg-slate-800 px-5 py-3">
        <div className="text-white font-bold">🖨️ 인쇄 미리보기</div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-300">주 시작일 (월요일)</div>
          <input type="date" className={`${inp} text-sm`} value={weekStart}
            onChange={e => setWeekStart(e.target.value)} />
          <button className="rounded-xl border border-blue-400 bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700" onClick={doPrint}>인쇄</button>
          <button className="rounded-xl border border-slate-500 bg-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-700" onClick={onClose}>닫기</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div className="bg-white shadow-xl" style={{ width: "297mm", minHeight: "210mm", padding: "8mm 10mm" }}>
          {loading ? <div className="text-center text-sm text-slate-400 py-12">불러오는 중...</div> : (
            <div id="fridge-print-content">
              <div className="header-title" style={{ textAlign: "center", fontSize: 16, fontWeight: "bold", letterSpacing: 4, marginBottom: 8, borderBottom: "2px solid #111", paddingBottom: 4 }}>
                냉장·냉동·온장고 모니터링일지
              </div>

              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "7.5pt" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ border: "1px solid #999", padding: "3px 4px", width: 55 }} rowSpan={2}>구분</th>
                    <th style={{ border: "1px solid #999", padding: "3px 4px", width: 40 }} rowSpan={2}>온도기준</th>
                    {weekDates.map((d, i) => (
                      <th key={d} colSpan={2} style={{ border: "1px solid #999", padding: "3px 4px" }}>
                        {d.slice(5).replace("-", "/")} ({DAY_LABELS[i]})
                      </th>
                    ))}
                    <th style={{ border: "1px solid #999", padding: "3px 4px", width: 50 }} rowSpan={2}>이탈시<br/>조치사항</th>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    {weekDates.map(d => (
                      <React.Fragment key={d}>
                        <th style={{ border: "1px solid #999", padding: "2px 3px", fontSize: "7pt" }}>오전</th>
                        <th style={{ border: "1px solid #999", padding: "2px 3px", fontSize: "7pt" }}>오후</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEVICES.map((dev, dIdx) => dev.nos.map((no, nIdx) => {
                    const key = `${dev.type}-${no}`;
                    const actionNotes: string[] = [];
                    return (
                      <tr key={key} style={{ borderBottom: "1px solid #ccc" }}>
                        {nIdx === 0 && (
                          <td rowSpan={dev.nos.length} style={{ border: "1px solid #999", padding: "2px 4px", fontWeight: "bold", background: dIdx === 0 ? "#e0f2fe" : dIdx === 1 ? "#e0e7ff" : "#fef3c7", writingMode: "vertical-lr", textOrientation: "upright", letterSpacing: 2, fontSize: "8pt" }}>
                            {dev.type}
                          </td>
                        )}
                        <td style={{ border: "1px solid #999", padding: "2px 4px" }}>{dev.type}-{no}</td>
                        <td style={{ border: "1px solid #999", padding: "2px 4px", fontSize: "7pt", color: "#555" }}>{getTempRange(dev.type)}</td>
                        {weekDates.map(d => {
                          const amEntry = printData[`${d}-AM`]?.[key];
                          const pmEntry = printData[`${d}-PM`]?.[key];
                          if (amEntry?.action_note) actionNotes.push(amEntry.action_note);
                          if (pmEntry?.action_note) actionNotes.push(pmEntry.action_note);
                          return (
                            <React.Fragment key={d}>
                              <td style={{ border: "1px solid #999", padding: "2px 3px", textAlign: "center", color: amEntry?.temperature !== null ? (isInRange(amEntry?.temperature ?? null, dev.type) ? "#1d4ed8" : "#dc2626") : "#ccc", fontWeight: amEntry?.is_ok === false ? "bold" : "normal" }}>
                                {amEntry?.temperature != null ? formatTemp(amEntry.temperature) : "℃"}
                              </td>
                              <td style={{ border: "1px solid #999", padding: "2px 3px", textAlign: "center", color: pmEntry?.temperature !== null ? (isInRange(pmEntry?.temperature ?? null, dev.type) ? "#1d4ed8" : "#dc2626") : "#ccc", fontWeight: pmEntry?.is_ok === false ? "bold" : "normal" }}>
                                {pmEntry?.temperature != null ? formatTemp(pmEntry.temperature) : "℃"}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td style={{ border: "1px solid #999", padding: "2px 4px", fontSize: "6.5pt", color: "#dc2626" }}>
                          {actionNotes.join(" / ")}
                        </td>
                      </tr>
                    );
                  }))}

                  {/* 점검자 사인 행 */}
                  <tr style={{ background: "#f8fafc" }}>
                    <td colSpan={2} style={{ border: "1px solid #999", padding: "3px 4px", fontWeight: "bold", textAlign: "center", fontSize: "7.5pt" }}>점검자</td>
                    <td style={{ border: "1px solid #999", padding: "2px" }} colSpan={2}>
                      {/* 서명 여기 */}
                    </td>
                    {weekDates.map((d, i) => {
                      if (i === 0) return null;
                      const daySigs = printSigs[d] ?? [];
                      const amSig = daySigs.find(s => s.period === "AM" && s.role === "inspector");
                      const pmSig = daySigs.find(s => s.period === "PM" && s.role === "inspector");
                      return (
                        <React.Fragment key={d}>
                          <td style={{ border: "1px solid #999", padding: "2px", height: 28, textAlign: "center" }}>
                            {amSig?.signature_data && <img src={amSig.signature_data} style={{ maxWidth: 60, maxHeight: 24 }} alt="사인" />}
                          </td>
                          <td style={{ border: "1px solid #999", padding: "2px", textAlign: "center" }}>
                            {pmSig?.signature_data && <img src={pmSig.signature_data} style={{ maxWidth: 60, maxHeight: 24 }} alt="사인" />}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td style={{ border: "1px solid #999" }} />
                  </tr>
                </tbody>
              </table>

              {/* 특이사항 + 작성/승인 */}
              <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flex: 1, border: "1px solid #999", borderRadius: 4, padding: "4px 8px", minHeight: 32, fontSize: "7.5pt" }}>
                  <span style={{ fontWeight: "bold" }}>특이사항: </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["AUTHOR", "APPROVER"] as const).map(role => {
                    const sig = Object.values(printSigs).flat().find(s => s.period === role);
                    return (
                      <div key={role} style={{ border: "1px solid #999", borderRadius: 4, padding: "4px 8px", textAlign: "center", width: 80 }}>
                        <div style={{ fontSize: "7pt", color: "#555", marginBottom: 2 }}>{role === "AUTHOR" ? "작성" : "승인"}</div>
                        {sig?.signature_data
                          ? <img src={sig.signature_data} style={{ maxWidth: 60, maxHeight: 24 }} alt="사인" />
                          : <div style={{ height: 24 }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
