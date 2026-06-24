"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PinModal, usePinSession } from "@/app/contexts/PinSessionContext";

const supabase = createClient();

// ─── 타입 ───────────────────────────────────────────────────
type Period = "AM" | "PM";
type Room = "외포장실" | "원부재료실" | "생산실";
type Role = "inspector";

type LogEntry = {
  id?: string;
  log_date: string;
  period: Period;
  check_time: string | null;
  room: Room;
  temperature: number | null;
  humidity: number | null;
  note: string;
  inspector_id: string | null;
  inspector_name: string | null;
};

type Employee = {
  id: string;
  name: string;
  pin: string | null;
};

// ─── 상수 ───────────────────────────────────────────────────
const ROOMS: Room[] = ["외포장실", "원부재료실", "생산실"];

function todayKST(): string {
  const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + "T00:00:00+09:00");
  const end = new Date(to + "T00:00:00+09:00");
  while (cur <= end) {
    const kst = new Date(cur.getTime() + 9 * 60 * 60 * 1000);
    dates.push(kst.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
function getDayLabel(dateStr: string): string {
  return DAY_LABELS[new Date(dateStr + "T00:00:00+09:00").getDay()];
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────
export default function HumidityTempClient() {
  const [logDate, setLogDate] = useState(todayKST());
  const [period, setPeriod] = useState<Period>("AM");
  const [entries, setEntries] = useState<Record<Room, LogEntry>>({} as Record<Room, LogEntry>);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [viewMode, setViewMode] = useState<"input" | "query">("input");

  // PIN — 오전/오후 각각 독립
  const { login: pinLogin } = usePinSession();
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinTarget, setPinTarget] = useState<Period>("AM");
  const [amInspector, setAmInspector] = useState<{ id: string; name: string } | null>(null);
  const [pmInspector, setPmInspector] = useState<{ id: string; name: string } | null>(null);

  // 점검시각 — 오전/오후 각각
  const [amCheckTime, setAmCheckTime] = useState("");
  const [pmCheckTime, setPmCheckTime] = useState("");

  const currentInspector = period === "AM" ? amInspector : pmInspector;

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  // 직원 목록
  useEffect(() => {
    supabase
      .from("employees")
      .select("id,name,pin")
      .is("resign_date", null)
      .order("name")
      .then(({ data }) => {
        if (data) setEmployees(data as Employee[]);
      });
  }, []);

  // 초기 엔트리 생성
  const initEntries = useCallback((): Record<Room, LogEntry> => {
    const map = {} as Record<Room, LogEntry>;
    for (const room of ROOMS) {
      map[room] = {
        log_date: logDate,
        period,
        check_time: null,
        room,
        temperature: null,
        humidity: null,
        note: "",
        inspector_id: null,
        inspector_name: null,
      };
    }
    return map;
  }, [logDate, period]);

  // 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: logs } = await supabase
        .from("humidity_temp_logs")
        .select("*")
        .eq("log_date", logDate)
        .eq("period", period);

      const { data: sigs } = await supabase
        .from("fridge_monitoring_signatures")
        .select("*")
        .eq("log_date", logDate)
        .in("period", ["AM", "PM"])
        .eq("role", "inspector");

      const base = initEntries();

      if (logs && logs.length > 0) {
        for (const log of logs) {
          if (base[log.room as Room]) {
            base[log.room as Room] = { ...base[log.room as Room], ...log };
          }
        }
      }
      setEntries(base);

      // 기존 점검자·점검시각 복원
      for (const sig of sigs ?? []) {
        if (sig.period === "AM" && sig.inspector_id && sig.inspector_name) {
          setAmInspector({ id: sig.inspector_id, name: sig.inspector_name });
        }
        if (sig.period === "PM" && sig.inspector_id && sig.inspector_name) {
          setPmInspector({ id: sig.inspector_id, name: sig.inspector_name });
        }
      }
      if (logs && logs.length > 0) {
        const amLog = logs.find((l) => l.period === "AM" && l.check_time);
        const pmLog = logs.find((l) => l.period === "PM" && l.check_time);
        if (amLog?.check_time) setAmCheckTime(amLog.check_time.replace(":", ""));
        if (pmLog?.check_time) setPmCheckTime(pmLog.check_time.replace(":", ""));
      }
    } finally {
      setLoading(false);
    }
  }, [logDate, period, initEntries]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 값 변경 핸들러
  function handleChange(room: Room, field: "temperature" | "humidity" | "note", value: string) {
    setEntries((prev) => ({
      ...prev,
      [room]: {
        ...prev[room],
        [field]:
          field === "temperature"
            ? value === "" ? null : parseFloat(value)
            : field === "humidity"
            ? value === "" ? null : parseInt(value, 10)
            : value,
      },
    }));
  }

  // 저장
  async function handleSave() {
    if (!currentInspector) {
      setPinTarget(period);
      setShowPinModal(true);
      return;
    }

    const currentCheckTime = period === "AM" ? amCheckTime : pmCheckTime;
    if (currentCheckTime.length < 4) {
      showToast(`⚠ ${period === "AM" ? "오전" : "오후"} 점검시각을 입력해주세요. (예: 0900)`, "error");
      return;
    }

    const hasEmpty = ROOMS.some((r) => entries[r].temperature === null || entries[r].humidity === null);
    if (hasEmpty) {
      showToast("⚠ 모든 구역의 온도·습도를 입력해주세요.", "error");
      return;
    }

    setSaving(true);
    try {
      const checkTimeStr = `${currentCheckTime.slice(0, 2)}:${currentCheckTime.slice(2, 4)}`;

      const toSave = ROOMS.map((room) => ({
        ...entries[room],
        log_date: logDate,
        period,
        check_time: checkTimeStr,
        inspector_id: currentInspector.id,
        inspector_name: currentInspector.name,
        note: (entries[room].note ?? "").trim() || null,
      }));

      const { error } = await supabase.from("humidity_temp_logs").upsert(toSave, {
        onConflict: "log_date,period,room",
      });
      if (error) throw error;

      // 점검자 사인 기록
      const { error: sigError } = await supabase.from("fridge_monitoring_signatures").upsert(
        {
          log_date: logDate,
          period,
          role: "inspector",
          inspector_id: currentInspector.id,
          inspector_name: currentInspector.name,
          signature_data: null,
        },
        { onConflict: "log_date,period,role" }
      );
      if (sigError) console.error("서명 저장 오류:", sigError.message);

      showToast("✅ 저장 완료!");
      await loadData();
    } catch (e: any) {
      showToast("저장 실패: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  const isReadOnly = logDate !== todayKST();

  const inp =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none text-center tabular-nums";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50";
  const btnOn =
    "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";

  return (
    <div className="space-y-4">
      {/* PIN 모달 */}
      {showPinModal && (
        <PinModal
          employees={employees.filter((e) => e.name !== null) as any}
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
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] rounded-2xl border px-5 py-3 text-sm font-semibold shadow-xl ${
            toast.type === "success"
              ? "border-green-300 bg-green-600 text-white"
              : "border-red-300 bg-red-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">🌡️ 중요지점 온·습도 관리일지</h1>
          <div className="text-xs text-slate-500 mt-0.5">외포장실 · 원부재료실 · 생산실 · 2회/일 (오전·오후)</div>
        </div>
        <div className="flex gap-2">
          <button className={viewMode === "input" ? btnOn : btn} onClick={() => setViewMode("input")}>
            📝 기록입력
          </button>
          <button className={viewMode === "query" ? btnOn : btn} onClick={() => setViewMode("query")}>
            🔍 일자별 조회
          </button>
          <PrintButton logDate={logDate} />
        </div>
      </div>

      {viewMode === "query" ? (
        <HumidityQueryView />
      ) : (
        <>
          {/* 날짜·오전오후 선택 */}
          <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="mb-1 text-xs text-slate-500">점검일</div>
                <input
                  type="date"
                  className={`${inp} w-40 text-left`}
                  value={logDate}
                  max={todayKST()}
                  onChange={(e) => {
                    setLogDate(e.target.value);
                    setAmInspector(null);
                    setPmInspector(null);
                    setAmCheckTime("");
                    setPmCheckTime("");
                  }}
                />
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-500">점검시간 · 시각</div>
                <div className="flex items-center gap-2">
                  {/* 오전 */}
                  <button className={period === "AM" ? btnOn : btn} onClick={() => setPeriod("AM")}>
                    오전
                  </button>
                  <CheckTimeInput
                    value={amCheckTime}
                    onChange={setAmCheckTime}
                    placeholder="0900"
                    disabled={isReadOnly}
                  />
                  <div className="w-px h-5 bg-slate-200" />
                  {/* 오후 */}
                  <button className={period === "PM" ? btnOn : btn} onClick={() => setPeriod("PM")}>
                    오후
                  </button>
                  <CheckTimeInput
                    value={pmCheckTime}
                    onChange={setPmCheckTime}
                    placeholder="1500"
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              <div className="ml-auto flex items-center gap-3">
                {amInspector && (
                  <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                    <span className="text-green-600 text-sm font-semibold">👤 {amInspector.name}</span>
                    <span className="text-xs text-green-500">오전 점검자 확인됨</span>
                  </div>
                )}
                {pmInspector && (
                  <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                    <span className="text-green-600 text-sm font-semibold">👤 {pmInspector.name}</span>
                    <span className="text-xs text-green-500">오후 점검자 확인됨</span>
                  </div>
                )}
                {!currentInspector && (
                  <button
                    className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                    onClick={() => {
                      setPinTarget(period);
                      setShowPinModal(true);
                    }}
                  >
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
              {!currentInspector && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
                  <span className="text-lg">🔑</span>
                  <div className="text-sm text-amber-700 font-semibold">PIN을 입력해야 온·습도 기록이 가능합니다.</div>
                </div>
              )}

              {/* 입력 테이블 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 text-sm font-semibold text-slate-700">
                  {period === "AM" ? "오전" : "오후"} 점검 기록
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 text-left">
                          구역
                        </th>
                        <th className="border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">
                          온도 (°C)
                        </th>
                        <th className="border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">
                          습도 (%)
                        </th>
                        <th className="border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 text-left">
                          비고
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROOMS.map((room) => {
                        const e = entries[room];
                        return (
                          <tr key={room} className="border-b border-slate-100">
                            <td className="border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 whitespace-nowrap">
                              {room}
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              <input
                                type="number"
                                step="0.1"
                                placeholder="—"
                                value={e?.temperature ?? ""}
                                disabled={isReadOnly || !currentInspector}
                                onChange={(v) => handleChange(room, "temperature", v.target.value)}
                                className={`${inp} w-28 disabled:bg-slate-50 disabled:text-slate-400`}
                              />
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                placeholder="—"
                                value={e?.humidity ?? ""}
                                disabled={isReadOnly || !currentInspector}
                                onChange={(v) => handleChange(room, "humidity", v.target.value)}
                                className={`${inp} w-28 disabled:bg-slate-50 disabled:text-slate-400`}
                              />
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              <input
                                type="text"
                                placeholder="특이사항"
                                value={e?.note ?? ""}
                                disabled={isReadOnly}
                                onChange={(v) => handleChange(room, "note", v.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 저장 버튼 */}
              {!isReadOnly && (
                <button
                  className="w-full rounded-xl border border-green-500 bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? "⏳ 저장 중..." : "💾 저장"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── 점검시각 입력 컴포넌트 ─────────────────────────────────────
function CheckTimeInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <div className="relative w-24">
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        className="w-24 rounded-xl border px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:border-blue-400"
        style={{ opacity: value.length === 4 ? 0 : 1, position: "relative", zIndex: 1 }}
      />
      {value.length === 4 && (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-blue-700 rounded-xl cursor-text"
          style={{ border: "1px solid #93c5fd", background: "#eff6ff", zIndex: 2 }}
          onClick={() => onChange(value.slice(0, 3))}
        >
          {value.slice(0, 2)}:{value.slice(2, 4)}
        </div>
      )}
    </div>
  );
}

// ─── 조회 뷰 ─────────────────────────────────────────────────
function HumidityQueryView() {
  const [queryDate, setQueryDate] = useState(todayKST());
  const [data, setData] = useState<{ AM: Record<Room, LogEntry>; PM: Record<Room, LogEntry> }>({
    AM: {} as Record<Room, LogEntry>,
    PM: {} as Record<Room, LogEntry>,
  });
  const [inspectors, setInspectors] = useState<{ AM: string | null; PM: string | null }>({ AM: null, PM: null });
  const [checkTimes, setCheckTimes] = useState<{ AM: string | null; PM: string | null }>({ AM: null, PM: null });
  const [loading, setLoading] = useState(false);

  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const inp = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";

  async function load() {
    setLoading(true);
    const [{ data: logs }, { data: sigs }] = await Promise.all([
      supabase.from("humidity_temp_logs").select("*").eq("log_date", queryDate),
      supabase
        .from("fridge_monitoring_signatures")
        .select("period,inspector_name,check_time")
        .eq("log_date", queryDate)
        .eq("role", "inspector"),
    ]);
    setLoading(false);

    const am = {} as Record<Room, LogEntry>;
    const pm = {} as Record<Room, LogEntry>;
    const times = { AM: null as string | null, PM: null as string | null };

    for (const row of logs ?? []) {
      if (row.period === "AM") am[row.room as Room] = row;
      else pm[row.room as Room] = row;
      if (row.check_time && !times[row.period as Period]) times[row.period as Period] = row.check_time;
    }
    setData({ AM: am, PM: pm });
    setCheckTimes(times);

    const ins = { AM: null as string | null, PM: null as string | null };
    for (const sig of sigs ?? []) {
      ins[sig.period as Period] = sig.inspector_name;
    }
    setInspectors(ins);
  }

  useEffect(() => {
    load();
  }, [queryDate]);

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex items-center gap-3">
          <input type="date" className={inp} value={queryDate} max={todayKST()} onChange={(e) => setQueryDate(e.target.value)} />
          <button
            className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            onClick={load}
          >
            조회
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-sm text-slate-400 py-8">불러오는 중...</div>
      ) : (
        <div className={`${card} p-4 overflow-x-auto`}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 text-left">구역</th>
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500" colSpan={2}>오전</th>
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500" colSpan={2}>오후</th>
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">비고</th>
              </tr>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-3 py-2" />
                <th className="border border-slate-200 px-3 py-2 text-xs text-slate-400">온도</th>
                <th className="border border-slate-200 px-3 py-2 text-xs text-slate-400">습도</th>
                <th className="border border-slate-200 px-3 py-2 text-xs text-slate-400">온도</th>
                <th className="border border-slate-200 px-3 py-2 text-xs text-slate-400">습도</th>
                <th className="border border-slate-200 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {ROOMS.map((room) => {
                const am = data.AM[room];
                const pm = data.PM[room];
                return (
                  <tr key={room} className="border-b border-slate-100">
                    <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-700">{room}</td>
                    <td className="border border-slate-200 px-3 py-2 text-center tabular-nums text-blue-700 font-semibold">
                      {am?.temperature != null ? `${am.temperature}°C` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="border border-slate-200 px-3 py-2 text-center tabular-nums text-blue-700 font-semibold">
                      {am?.humidity != null ? `${am.humidity}%` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="border border-slate-200 px-3 py-2 text-center tabular-nums text-blue-700 font-semibold">
                      {pm?.temperature != null ? `${pm.temperature}°C` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="border border-slate-200 px-3 py-2 text-center tabular-nums text-blue-700 font-semibold">
                      {pm?.humidity != null ? `${pm.humidity}%` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="border border-slate-200 px-3 py-2 text-xs text-slate-500">
                      {am?.note || pm?.note || ""}
                    </td>
                  </tr>
                );
              })}
              {/* 점검시각 */}
              <tr className="bg-slate-50">
                <td className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">점검시각</td>
                <td className="border border-slate-200 px-3 py-2 text-center text-sm tabular-nums text-slate-600" colSpan={2}>
                  {checkTimes.AM ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-center text-sm tabular-nums text-slate-600" colSpan={2}>
                  {checkTimes.PM ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="border border-slate-200 px-3 py-2" />
              </tr>
              {/* 점검자 */}
              <tr className="bg-slate-50">
                <td className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">점검자</td>
                <td className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-700" colSpan={2}>
                  {inspectors.AM ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-700" colSpan={2}>
                  {inspectors.PM ?? <span className="text-slate-300">—</span>}
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
function PrintButton({ logDate }: { logDate: string }) {
  const [showModal, setShowModal] = useState(false);
  return (
    <>
      <button
        className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        onClick={() => setShowModal(true)}
      >
        🖨️ 인쇄
      </button>
      {showModal && <PrintModal logDate={logDate} onClose={() => setShowModal(false)} />}
    </>
  );
}

// ─── 인쇄 모달 ─────────────────────────────────────────────
function PrintModal({ logDate, onClose }: { logDate: string; onClose: () => void }) {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(logDate + "T00:00:00+09:00");
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const kst = new Date(mon.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date(logDate + "T00:00:00+09:00");
    const day = d.getDay();
    const fri = new Date(d);
    fri.setDate(d.getDate() + (day === 0 ? 0 : 5 - day));
    const kst = new Date(fri.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  });

  const [printData, setPrintData] = useState<Record<string, { AM: LogEntry | null; PM: LogEntry | null }>>({});
  const [printSigs, setPrintSigs] = useState<Record<string, { AM: string | null; PM: string | null }>>({});
  const [printTimes, setPrintTimes] = useState<Record<string, { AM: string | null; PM: string | null }>>({});
  const [loading, setLoading] = useState(false);

  async function loadPrint() {
    if (dateFrom > dateTo) return;
    setLoading(true);
    const dates = getDates(dateFrom, dateTo);
    const [{ data: logs }, { data: sigs }] = await Promise.all([
      supabase.from("humidity_temp_logs").select("*").in("log_date", dates),
      supabase.from("fridge_monitoring_signatures").select("*").in("log_date", dates).eq("role", "inspector"),
    ]);
    setLoading(false);

    // room × date × period 구조로 변환
    // key: `${date}-${room}` → { AM, PM }
    const dataMap: Record<string, { AM: LogEntry | null; PM: LogEntry | null }> = {};
    const timesMap: Record<string, { AM: string | null; PM: string | null }> = {};
    for (const row of logs ?? []) {
      const key = `${row.log_date}-${row.room}`;
      if (!dataMap[key]) dataMap[key] = { AM: null, PM: null };
      dataMap[key][row.period as Period] = row;
      if (!timesMap[row.log_date]) timesMap[row.log_date] = { AM: null, PM: null };
      if (row.check_time && !timesMap[row.log_date][row.period as Period])
        timesMap[row.log_date][row.period as Period] = row.check_time;
    }
    setPrintData(dataMap);
    setPrintTimes(timesMap);

    const sigMap: Record<string, { AM: string | null; PM: string | null }> = {};
    for (const sig of sigs ?? []) {
      if (!sigMap[sig.log_date]) sigMap[sig.log_date] = { AM: null, PM: null };
      sigMap[sig.log_date][sig.period as Period] = sig.inspector_name;
    }
    setPrintSigs(sigMap);
  }

  useEffect(() => {
    loadPrint();
  }, [dateFrom, dateTo]);

  function doPrint() {
    const content = document.getElementById("humidity-print-content");
    if (!content) return;
    const title = `온습도관리일지_${dateFrom}_${dateTo}`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>
        @page{size:A4 landscape;margin:8mm 10mm;}
        body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:8pt;color:#111;}
        *{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
        table{border-collapse:collapse;width:100%;page-break-inside:avoid;}
        th,td{border:0.5px solid #aaa;padding:2px 4px;text-align:center;font-size:7pt;}
        .th{background:#f0f4f8;font-weight:bold;}
        .val{color:#1d4ed8;font-weight:bold;}
        .empty{color:#bbb;}
        .print-page-break{page-break-after:always !important;}
      </style>
    </head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  const dates = getDates(dateFrom, dateTo);
  const inp =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";

  // 날짜를 월요일 기준으로 주 단위 청크 분할
  const chunks: string[][] = [];
  let chunk: string[] = [];
  for (const d of dates) {
    const dow = new Date(d + "T00:00:00+09:00").getDay();
    if (dow === 1 && chunk.length > 0) { chunks.push(chunk); chunk = []; }
    chunk.push(d);
    if (dow === 0) { chunks.push(chunk); chunk = []; }
  }
  if (chunk.length > 0) chunks.push(chunk);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-100">
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between gap-3 bg-slate-800 px-5 py-3">
        <div className="text-white font-bold">🖨️ 인쇄 미리보기</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-300">출력 기간</span>
          <input
            type="date"
            className={inp}
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-slate-300 text-sm">~</span>
          <input
            type="date"
            className={inp}
            value={dateTo}
            min={dateFrom}
            max={todayKST()}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <span className="text-xs text-slate-400">{dates.length}일</span>
          <button
            className="rounded-xl border border-blue-400 bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            onClick={doPrint}
          >
            인쇄
          </button>
          <button
            className="rounded-xl border border-slate-500 bg-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-700"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>

      {/* 미리보기 영역 */}
      <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-6">
        {loading ? (
          <div className="text-center text-sm text-slate-400 py-12">불러오는 중...</div>
        ) : (
          <div id="humidity-print-content">
            {chunks.map((weekDates, pageIdx) => {
              const weekNotes = weekDates
                .flatMap((d) =>
                  ROOMS.map((room) => {
                    const amNote = printData[`${d}-${room}`]?.AM?.note;
                    const pmNote = printData[`${d}-${room}`]?.PM?.note;
                    return [amNote, pmNote].filter(Boolean).join(" / ");
                  })
                )
                .filter(Boolean)
                .join(" | ");

              return (
                <div
                  key={pageIdx}
                  className={pageIdx < chunks.length - 1 ? "print-page-break" : ""}
                  style={{
                    background: "#fff",
                    width: "297mm",
                    minHeight: "210mm",
                    padding: "8mm 10mm",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
                    marginBottom: "16px",
                  }}
                >
                  {/* 제목 */}
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "14pt",
                      fontWeight: "bold",
                      letterSpacing: "4px",
                      marginBottom: "4px",
                      paddingBottom: "4px",
                      borderBottom: "1.5px solid #111",
                    }}
                  >
                    중요지점 온·습도 관리일지
                  </div>
                  <div style={{ fontSize: "7.5pt", color: "#555", marginBottom: "6px", display: "flex", gap: "16px" }}>
                    <span>※ 이상 발생시 즉시 조치 후 보고</span>
                    <span>
                      점검기간: {weekDates[0].slice(5).replace("-", "/")} ({getDayLabel(weekDates[0])}) ~{" "}
                      {weekDates[weekDates.length - 1].slice(5).replace("-", "/")} (
                      {getDayLabel(weekDates[weekDates.length - 1])})
                    </span>
                  </div>

                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "7pt" }}>
                    <thead>
                      <tr style={{ background: "#f0f4f8" }}>
                        <th
                          className="th"
                          rowSpan={2}
                          style={{ width: "64px", textAlign: "left", paddingLeft: "6px" }}
                        >
                          구역
                        </th>
                        {weekDates.map((d) => (
                          <th key={d} className="th" colSpan={4} style={{ fontSize: "7pt" }}>
                            {d.slice(5).replace("-", "/")} ({getDayLabel(d)})
                          </th>
                        ))}
                        <th className="th" rowSpan={2} style={{ width: "60px" }}>
                          비고
                        </th>
                      </tr>
                      <tr style={{ background: "#f0f4f8" }}>
                        {weekDates.map((d) => (
                          <React.Fragment key={d}>
                            <th className="th" style={{ fontSize: "6.5pt", width: "26px" }}>오전온도</th>
                            <th className="th" style={{ fontSize: "6.5pt", width: "26px" }}>오전습도</th>
                            <th className="th" style={{ fontSize: "6.5pt", width: "26px" }}>오후온도</th>
                            <th className="th" style={{ fontSize: "6.5pt", width: "26px" }}>오후습도</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ROOMS.map((room) => {
                        // 이 주의 비고 수집
                        const roomNote = weekDates
                          .flatMap((d) => {
                            const amN = printData[`${d}-${room}`]?.AM?.note;
                            const pmN = printData[`${d}-${room}`]?.PM?.note;
                            return [amN, pmN].filter(Boolean);
                          })
                          .join(" / ");

                        return (
                          <tr key={room}>
                            <td
                              style={{
                                border: "0.5px solid #aaa",
                                textAlign: "left",
                                paddingLeft: "6px",
                                fontWeight: "bold",
                                fontSize: "7.5pt",
                              }}
                            >
                              {room}
                            </td>
                            {weekDates.map((d) => {
                              const am = printData[`${d}-${room}`]?.AM;
                              const pm = printData[`${d}-${room}`]?.PM;
                              return (
                                <React.Fragment key={d}>
                                  <td style={{ border: "0.5px solid #aaa", color: am?.temperature != null ? "#1d4ed8" : "#bbb", fontWeight: am?.temperature != null ? "bold" : "normal" }}>
                                    {am?.temperature != null ? `${am.temperature}°C` : "—"}
                                  </td>
                                  <td style={{ border: "0.5px solid #aaa", color: am?.humidity != null ? "#1d4ed8" : "#bbb", fontWeight: am?.humidity != null ? "bold" : "normal" }}>
                                    {am?.humidity != null ? `${am.humidity}%` : "—"}
                                  </td>
                                  <td style={{ border: "0.5px solid #aaa", color: pm?.temperature != null ? "#1d4ed8" : "#bbb", fontWeight: pm?.temperature != null ? "bold" : "normal" }}>
                                    {pm?.temperature != null ? `${pm.temperature}°C` : "—"}
                                  </td>
                                  <td style={{ border: "0.5px solid #aaa", color: pm?.humidity != null ? "#1d4ed8" : "#bbb", fontWeight: pm?.humidity != null ? "bold" : "normal" }}>
                                    {pm?.humidity != null ? `${pm.humidity}%` : "—"}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                            <td
                              style={{
                                border: "0.5px solid #aaa",
                                fontSize: "6pt",
                                color: "#555",
                                textAlign: "left",
                                padding: "1px 3px",
                              }}
                            >
                              {roomNote}
                            </td>
                          </tr>
                        );
                      })}

                      {/* 점검시각 */}
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={{ border: "0.5px solid #aaa", fontWeight: "bold", textAlign: "center", fontSize: "7pt" }}>
                          점검시각
                        </td>
                        {weekDates.map((d) => (
                          <React.Fragment key={d}>
                            <td colSpan={2} style={{ border: "0.5px solid #aaa", fontSize: "7pt" }}>
                              {printTimes[d]?.AM ?? "—"}
                            </td>
                            <td colSpan={2} style={{ border: "0.5px solid #aaa", fontSize: "7pt" }}>
                              {printTimes[d]?.PM ?? "—"}
                            </td>
                          </React.Fragment>
                        ))}
                        <td style={{ border: "0.5px solid #aaa" }} />
                      </tr>

                      {/* 점검자 */}
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={{ border: "0.5px solid #aaa", fontWeight: "bold", textAlign: "center", fontSize: "7pt" }}>
                          점검자
                        </td>
                        {weekDates.map((d) => (
                          <React.Fragment key={d}>
                            <td colSpan={2} style={{ border: "0.5px solid #aaa", fontSize: "7pt" }}>
                              {printSigs[d]?.AM ?? "—"}
                            </td>
                            <td colSpan={2} style={{ border: "0.5px solid #aaa", fontSize: "7pt" }}>
                              {printSigs[d]?.PM ?? "—"}
                            </td>
                          </React.Fragment>
                        ))}
                        <td style={{ border: "0.5px solid #aaa" }} />
                      </tr>
                    </tbody>
                  </table>

                  {/* 특이사항 */}
                  <div
                    style={{
                      marginTop: "6px",
                      border: "0.5px solid #aaa",
                      borderRadius: "3px",
                      padding: "4px 8px",
                      fontSize: "7.5pt",
                      minHeight: "24px",
                    }}
                  >
                    <span style={{ fontWeight: "bold" }}>비고: </span>
                    {weekNotes}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
