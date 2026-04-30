"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { todayKST } from "@/utils/location";

type AttendanceRecord = {
  id: string;
  employee_id: string;
  happened_at: string;
  type: string;
  distance_m: number | null;
};

type DailySummary = {
  employeeId: string;
  employeeName: string;
  inTime: string | null;
  outTime: string | null;
  inId: string | null;   // attendance.id (수정용)
  outId: string | null;  // attendance.id (수정용)
};

type ViewMode = "daily" | "range" | "monthly";

// ────────────────────────────────────────────
// 수동 수정 모달
// ────────────────────────────────────────────
function EditModal({
  summary,
  date,
  onClose,
  onSaved,
}: {
  summary: DailySummary;
  date: string;          // "YYYY-MM-DD" (KST 기준 작업 날짜)
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  // 초기값: 기존 시각 → HH:mm, 없으면 빈 문자열
  const toHHMM = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("ko-KR", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul",
    });
  };

  const [inVal, setInVal]   = useState(toHHMM(summary.inTime));
  const [outVal, setOutVal] = useState(toHHMM(summary.outTime));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // "YYYY-MM-DD" + "HH:mm" → ISO with +09:00
  function toISO(dateStr: string, timeStr: string): string {
    return `${dateStr}T${timeStr}:00+09:00`;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      // ── 출근 처리 ──
      if (inVal) {
        const happened_at = toISO(date, inVal);
        if (summary.inId) {
          // 기존 레코드 update
          const { error: e } = await supabase
            .from("attendance")
            .update({ happened_at })
            .eq("id", summary.inId);
          if (e) throw new Error(`출근 수정 실패: ${e.message}`);
        } else {
          // 새 레코드 insert
          const { error: e } = await supabase
            .from("attendance")
            .insert({
              employee_id: summary.employeeId,
              happened_at,
              type: "IN",
              distance_m: null,
              note: "ADMIN 수동 입력",
            });
          if (e) throw new Error(`출근 저장 실패: ${e.message}`);
        }
      } else if (summary.inId) {
        // 값을 지운 경우 → 레코드 삭제
        const { error: e } = await supabase
          .from("attendance")
          .delete()
          .eq("id", summary.inId);
        if (e) throw new Error(`출근 삭제 실패: ${e.message}`);
      }

      // ── 퇴근 처리 ──
      if (outVal) {
        const happened_at = toISO(date, outVal);
        if (summary.outId) {
          const { error: e } = await supabase
            .from("attendance")
            .update({ happened_at })
            .eq("id", summary.outId);
          if (e) throw new Error(`퇴근 수정 실패: ${e.message}`);
        } else {
          const { error: e } = await supabase
            .from("attendance")
            .insert({
              employee_id: summary.employeeId,
              happened_at,
              type: "OUT",
              distance_m: null,
              note: "ADMIN 수동 입력",
            });
          if (e) throw new Error(`퇴근 저장 실패: ${e.message}`);
        }
      } else if (summary.outId) {
        const { error: e } = await supabase
          .from("attendance")
          .delete()
          .eq("id", summary.outId);
        if (e) throw new Error(`퇴근 삭제 실패: ${e.message}`);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "저장 중 오류 발생");
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
        {/* 헤더 */}
        <div className="mb-4">
          <div className="text-base font-bold text-slate-800">{summary.employeeName}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {new Date(date + "T12:00:00+09:00").toLocaleDateString("ko-KR", {
              month: "long", day: "numeric", weekday: "short",
            })} 출퇴근 수정
          </div>
        </div>

        {/* 입력 필드 */}
        <div className="flex flex-col gap-3 mb-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">출근 시각</label>
            <input
              type="time"
              className={input}
              value={inVal}
              onChange={e => setInVal(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">퇴근 시각</label>
            <input
              type="time"
              className={input}
              value={outVal}
              onChange={e => setOutVal(e.target.value)}
            />
          </div>
        </div>

        {/* 안내 */}
        <p className="text-[11px] text-slate-400 mb-4">
          시각을 비우면 해당 기록이 삭제됩니다. ADMIN 수동 입력으로 표시됩니다.
        </p>

        {/* 오류 */}
        {error && (
          <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* 개별 삭제 버튼 */}
        {(summary.inId || summary.outId) && (
          <div className="flex gap-2 mb-3">
            {summary.inId && (
              <button
                className="flex-1 rounded-xl border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-all disabled:opacity-50"
                disabled={saving}
                onClick={async () => {
                  if (!confirm("출근 기록을 삭제하시겠습니까?")) return;
                  setSaving(true);
                  setError(null);
                  try {
                    const { error: e } = await supabase.from("attendance").delete().eq("id", summary.inId!);
                    if (e) throw new Error("출근 삭제 실패: " + e.message);
                    onSaved();
                    onClose();
                  } catch (err: any) {
                    setError(err.message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                출근 삭제
              </button>
            )}
            {summary.outId && (
              <button
                className="flex-1 rounded-xl border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-all disabled:opacity-50"
                disabled={saving}
                onClick={async () => {
                  if (!confirm("퇴근 기록을 삭제하시겠습니까?")) return;
                  setSaving(true);
                  setError(null);
                  try {
                    const { error: e } = await supabase.from("attendance").delete().eq("id", summary.outId!);
                    if (e) throw new Error("퇴근 삭제 실패: " + e.message);
                    onSaved();
                    onClose();
                  } catch (err: any) {
                    setError(err.message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                퇴근 삭제
              </button>
            )}
          </div>
        )}

        {/* 저장/취소 버튼 */}
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
            onClick={onClose}
            disabled={saving}
          >
            취소
          </button>
          <button
            className="flex-1 rounded-xl bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────
export default function AttendanceAdminClient() {
  const supabase = useMemo(() => createClient(), []);

  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [date, setDate]         = useState(todayKST());
  const [rangeFrom, setRangeFrom] = useState(todayKST());
  const [rangeTo, setRangeTo]     = useState(todayKST());
  const [month, setMonth]         = useState(todayKST().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [dailyRows, setDailyRows] = useState<DailySummary[]>([]);
  const [rangeRows, setRangeRows] = useState<{ date: string; summaries: DailySummary[] }[]>([]);
  const [loading, setLoading]     = useState(false);

  // 수정 모달 상태
  const [editTarget, setEditTarget] = useState<{ summary: DailySummary; date: string } | null>(null);

  const input = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btnOn = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all";
  const modeBtn = (active: boolean) =>
    `rounded-xl px-4 py-2 text-sm font-bold border transition-all ${
      active
        ? "bg-slate-800 border-slate-800 text-white"
        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
    }`;

  useEffect(() => {
    supabase
      .from("employees")
      .select("id,name")
      .is("resign_date", null)
      .order("name")
      .then(({ data }) => setEmployees(data ?? []));
  }, [supabase]);

  useEffect(() => {
    if (employees.length > 0) load();
  }, [viewMode, date, rangeFrom, rangeTo, month, employees]);

  async function fetchRecords(from: string, to: string): Promise<AttendanceRecord[]> {
    const { data } = await supabase
      .from("attendance")
      .select("id,employee_id,happened_at,type,distance_m")
      .gte("happened_at", `${from}T00:00:00+09:00`)
      .lte("happened_at", `${to}T23:59:59+09:00`)
      .order("happened_at", { ascending: true });
    return (data ?? []) as AttendanceRecord[];
  }

  function buildSummaries(records: AttendanceRecord[], targetDate: string): DailySummary[] {
    return employees.map(emp => {
      const empRecords = records.filter(r => {
        const kst = new Date(r.happened_at)
          .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
          .slice(0, 10);
        return r.employee_id === emp.id && kst === targetDate;
      });
      const inRec  = empRecords.find(r => r.type === "IN")  ?? null;
      const outRec = empRecords.find(r => r.type === "OUT") ?? null;
      return {
        employeeId:   emp.id,
        employeeName: emp.name,
        inTime:  inRec?.happened_at  ?? null,
        outTime: outRec?.happened_at ?? null,
        inId:    inRec?.id  ?? null,
        outId:   outRec?.id ?? null,
      };
    });
  }

  function getDatesInRange(from: string, to: string): string[] {
    const dates: string[] = [];
    const cur = new Date(from + "T00:00:00+09:00");
    const end = new Date(to   + "T00:00:00+09:00");
    while (cur <= end) {
      const kst = new Date(cur.getTime() + 9 * 60 * 60 * 1000);
      dates.push(kst.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  async function load() {
    setLoading(true);
    setSelectedDate(null);
    try {
      if (viewMode === "daily") {
        const records = await fetchRecords(date, date);
        setDailyRows(buildSummaries(records, date));

      } else if (viewMode === "range") {
        const records = await fetchRecords(rangeFrom, rangeTo);
        const dates   = getDatesInRange(rangeFrom, rangeTo);
        setRangeRows(dates.map(d => ({ date: d, summaries: buildSummaries(records, d) })));

      } else if (viewMode === "monthly") {
        const [y, m] = month.split("-");
        const from   = `${y}-${m}-01`;
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        const to     = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
        const records = await fetchRecords(from, to);
        const dates   = getDatesInRange(from, to);
        setRangeRows(dates.map(d => ({ date: d, summaries: buildSummaries(records, d) })));
      }
    } finally {
      setLoading(false);
    }
  }

  function formatTime(iso: string | null) {
    if (!iso) return "--:--";
    return new Date(iso).toLocaleTimeString("ko-KR", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
    });
  }

  function getStatus(row: DailySummary) {
    if (!row.inTime) return { label: "결근", style: "border-red-200 bg-red-50 text-red-700" };
    const kst = new Date(
      new Date(row.inTime).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    );
    const isLate = kst.getHours() > 9 || (kst.getHours() === 9 && kst.getMinutes() > 0);
    if (isLate) return { label: "지각", style: "border-amber-200 bg-amber-50 text-amber-700" };
    return { label: "정상", style: "border-green-200 bg-green-50 text-green-700" };
  }

  // ── 테이블 (수정 버튼 포함) ──
  function SummaryTable({ summaries, tableDate }: { summaries: DailySummary[]; tableDate: string }) {
    const presentCount = summaries.filter(r => r.inTime).length;
    const lateCount    = summaries.filter(r => getStatus(r).label === "지각").length;
    const absentCount  = summaries.filter(r => !r.inTime).length;

    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* 집계 */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-200">
          {[
            { label: "출근", count: presentCount, style: "text-green-600" },
            { label: "지각", count: lateCount,    style: "text-amber-600" },
            { label: "결근", count: absentCount,  style: "text-red-600"   },
          ].map(s => (
            <div key={s.label} className="py-3 text-center">
              <div className="text-xs text-slate-400">{s.label}</div>
              <div className={`text-xl font-bold ${s.style}`}>{s.count}</div>
            </div>
          ))}
        </div>

        {/* 테이블 */}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">이름</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">출근</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">퇴근</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">상태</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500"></th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((row, i) => {
              const st = getStatus(row);
              return (
                <tr
                  key={row.employeeId}
                  className={`border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                >
                  <td className="px-4 py-2 font-semibold text-slate-800">{row.employeeName}</td>
                  <td className={`px-4 py-2 font-mono text-xs ${row.inTime ? "text-green-600 font-semibold" : "text-slate-300"}`}>
                    {formatTime(row.inTime)}
                  </td>
                  <td className={`px-4 py-2 font-mono text-xs ${row.outTime ? "text-blue-600 font-semibold" : "text-slate-300"}`}>
                    {formatTime(row.outTime)}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.style}`}>
                      {st.label}
                    </span>
                  </td>
                  {/* 수정 버튼 */}
                  <td className="px-2 py-2">
                    <button
                      onClick={() => setEditTarget({ summary: row, date: tableDate })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all active:scale-95"
                      title="출퇴근 수동 수정"
                    >
                      ✏️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── 월별 달력 ──
  function MonthlyCalendar() {
    const [y, m]   = month.split("-").map(Number);
    const firstDow = new Date(y, m - 1, 1).getDay();
    const lastDay  = new Date(y, m, 0).getDate();

    const cells: (string | null)[] = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: lastDay }, (_, i) =>
        `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
      ),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];
    const today = todayKST();

    function getDayData(d: string) {
      return rangeRows.find(r => r.date === d);
    }

    function getDayStatus(d: string) {
      const data = getDayData(d);
      if (!data) return null;
      const hasAbsent = data.summaries.some(s => !s.inTime);
      const hasLate   = data.summaries.some(s => getStatus(s).label === "지각");
      if (hasAbsent) return "absent";
      if (hasLate)   return "late";
      return "ok";
    }

    const selectedData = selectedDate ? rangeRows.find(r => r.date === selectedDate) : null;

    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200">
            {dayLabels.map((d, i) => (
              <div key={d} className={`py-2 text-center text-xs font-bold
                ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-500"}`}>
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-0">
              {week.map((d, di) => {
                if (!d) return <div key={di} className="min-h-[72px] bg-slate-50/50" />;
                const dow        = (firstDow + Number(d.slice(8)) - 1) % 7;
                const isToday    = d === today;
                const isSelected = d === selectedDate;
                const status     = getDayStatus(d);
                const dayData    = getDayData(d);
                const presentCnt = dayData?.summaries.filter(s => s.inTime).length ?? 0;

                return (
                  <div
                    key={d}
                    onClick={() => setSelectedDate(isSelected ? null : d)}
                    className={`min-h-[72px] p-1.5 cursor-pointer transition-all border-l border-slate-100 first:border-0
                      ${isSelected ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-slate-50"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                        ${isToday ? "bg-blue-600 text-white" :
                          dow === 0 ? "text-red-400" :
                          dow === 6 ? "text-blue-400" : "text-slate-700"}`}>
                        {Number(d.slice(8))}
                      </span>
                      {status && (
                        <span className={`w-2 h-2 rounded-full
                          ${status === "ok" ? "bg-green-400" :
                            status === "late" ? "bg-amber-400" : "bg-red-400"}`} />
                      )}
                    </div>
                    {dayData && (
                      <div className="text-[10px] text-slate-500">
                        {presentCnt}/{employees.length}명
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"/>정상</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>지각있음</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>결근있음</span>
        </div>

        {selectedDate && selectedData && (
          <div>
            <div className="text-sm font-bold text-slate-700 mb-2">
              {new Date(selectedDate + "T12:00:00+09:00").toLocaleDateString("ko-KR", {
                month: "long", day: "numeric", weekday: "short",
              })} 상세
            </div>
            <SummaryTable summaries={selectedData.summaries} tableDate={selectedDate} />
          </div>
        )}
      </div>
    );
  }

  // ── 렌더 ──
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto">

        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-bold text-slate-800">출퇴근 현황</div>
          <button className={btnOn} onClick={load} disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button className={modeBtn(viewMode === "daily")}   onClick={() => setViewMode("daily")}>일별</button>
          <button className={modeBtn(viewMode === "range")}   onClick={() => setViewMode("range")}>기간별</button>
          <button className={modeBtn(viewMode === "monthly")} onClick={() => setViewMode("monthly")}>월별</button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {viewMode === "daily" && (
            <input type="date" className={input} value={date}
              onChange={e => setDate(e.target.value)} />
          )}
          {viewMode === "range" && (
            <>
              <input type="date" className={input} value={rangeFrom}
                onChange={e => setRangeFrom(e.target.value)} />
              <span className="self-center text-slate-400 text-sm">~</span>
              <input type="date" className={input} value={rangeTo}
                onChange={e => setRangeTo(e.target.value)} />
            </>
          )}
          {viewMode === "monthly" && (
            <input type="month" className={input} value={month}
              onChange={e => setMonth(e.target.value)} />
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-slate-400">조회 중...</div>
        ) : (
          <>
            {viewMode === "daily" && (
              <SummaryTable summaries={dailyRows} tableDate={date} />
            )}
            {viewMode === "range" && (
              <div className="flex flex-col gap-6">
                {rangeRows.map(({ date: d, summaries }) => (
                  <div key={d}>
                    <div className="text-sm font-bold text-slate-600 mb-2">
                      {new Date(d + "T12:00:00+09:00").toLocaleDateString("ko-KR", {
                        month: "long", day: "numeric", weekday: "short",
                      })}
                    </div>
                    <SummaryTable summaries={summaries} tableDate={d} />
                  </div>
                ))}
              </div>
            )}
            {viewMode === "monthly" && <MonthlyCalendar />}
          </>
        )}

        <div className="mt-3 text-xs text-slate-400">
          ※ 09:00 이후 출근 시 지각으로 표시됩니다.
        </div>
      </div>

      {/* 수동 수정 모달 */}
      {editTarget && (
        <EditModal
          summary={editTarget.summary}
          date={editTarget.date}
          onClose={() => setEditTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
