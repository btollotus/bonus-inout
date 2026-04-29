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
};

type ViewMode = "daily" | "range" | "monthly";

export default function AttendanceAdminClient() {
  const supabase = useMemo(() => createClient(), []);

  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [date, setDate] = useState(todayKST());
  const [rangeFrom, setRangeFrom] = useState(todayKST());
  const [rangeTo, setRangeTo] = useState(todayKST());
  const [month, setMonth] = useState(todayKST().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [dailyRows, setDailyRows] = useState<DailySummary[]>([]);
  const [rangeRows, setRangeRows] = useState<{ date: string; summaries: DailySummary[] }[]>([]);
  const [loading, setLoading] = useState(false);

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
  }, [employees]);

  useEffect(() => {
    if (employees.length > 0) load();
  }, [viewMode, date, rangeFrom, rangeTo, month]);

  async function fetchRecords(from: string, to: string): Promise<AttendanceRecord[]> {
    const { data, error } = await supabase
      .from("attendance")
      .select("id,employee_id,happened_at,type,distance_m")
      .gte("happened_at", `${from}T00:00:00+09:00`)
      .lte("happened_at", `${to}T23:59:59+09:00`)
      .order("happened_at", { ascending: true });
    console.log("fetchRecords", from, to, "data:", data, "error:", error);
    return (data ?? []) as AttendanceRecord[];
  }

  function buildSummaries(records: AttendanceRecord[], targetDate: string): DailySummary[] {
    return employees.map(emp => {
      const empRecords = records.filter(r => {
        const kst = new Date(r.happened_at).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 10);
        return r.employee_id === emp.id && kst === targetDate;
      });
      return {
        employeeId:   emp.id,
        employeeName: emp.name,
        inTime:       empRecords.find(r => r.type === "IN")?.happened_at ?? null,
        outTime:      empRecords.find(r => r.type === "OUT")?.happened_at ?? null,
      };
    });
  }

  function getDatesInRange(from: string, to: string): string[] {
    const dates: string[] = [];
    const cur = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
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
        const dates = getDatesInRange(rangeFrom, rangeTo);
        setRangeRows(dates.map(d => ({ date: d, summaries: buildSummaries(records, d) })));

      } else if (viewMode === "monthly") {
        const [y, m] = month.split("-");
        const from = `${y}-${m}-01`;
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        const to = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
        const records = await fetchRecords(from, to);
        const dates = getDatesInRange(from, to);
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
    const kst = new Date(new Date(row.inTime).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    const isLate = kst.getHours() > 9 || (kst.getHours() === 9 && kst.getMinutes() > 0);
    if (isLate) return { label: "지각", style: "border-amber-200 bg-amber-50 text-amber-700" };
    return { label: "정상", style: "border-green-200 bg-green-50 text-green-700" };
  }

  function SummaryTable({ summaries }: { summaries: DailySummary[] }) {
    const presentCount = summaries.filter(r => r.inTime).length;
    const lateCount    = summaries.filter(r => getStatus(r).label === "지각").length;
    const absentCount  = summaries.filter(r => !r.inTime).length;
    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
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
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">이름</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">출근</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">퇴근</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">상태</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((row, i) => {
              const st = getStatus(row);
              return (
                <tr key={row.employeeId} className={`border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // 월별 달력 뷰
  function MonthlyCalendar() {
    console.log("rangeRows:", JSON.stringify(rangeRows.filter(r => r.date === "2026-04-30")));
    const [y, m] = month.split("-").map(Number);
    const firstDow = new Date(y, m - 1, 1).getDay(); // 0=일
    const lastDay  = new Date(y, m, 0).getDate();

    // 달력 셀 배열 (빈칸 포함)
    const cells: (string | null)[] = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: lastDay }, (_, i) =>
        `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
      ),
    ];
    // 7의 배수로 맞추기
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
        {/* 달력 */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 border-b border-slate-200">
            {dayLabels.map((d, i) => (
              <div key={d} className={`py-2 text-center text-xs font-bold
                ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-500"}`}>
                {d}
              </div>
            ))}
          </div>
          {/* 날짜 셀 */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-0">
              {week.map((d, di) => {
                if (!d) return <div key={di} className="min-h-[72px] bg-slate-50/50" />;
                const dow = (firstDow + Number(d.slice(8)) - 1) % 7;
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
                      ${isSelected ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-slate-50"}
                    `}
                  >
                    {/* 날짜 숫자 */}
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                        ${isToday ? "bg-blue-600 text-white" :
                          dow === 0 ? "text-red-400" :
                          dow === 6 ? "text-blue-400" : "text-slate-700"}`}>
                        {Number(d.slice(8))}
                      </span>
                      {/* 상태 도트 */}
                      {status && (
                        <span className={`w-2 h-2 rounded-full
                          ${status === "ok" ? "bg-green-400" :
                            status === "late" ? "bg-amber-400" : "bg-red-400"}`} />
                      )}
                    </div>
                    {/* 출근 인원 */}
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

        {/* 범례 */}
        <div className="flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"/>정상</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>지각있음</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>결근있음</span>
        </div>

        {/* 선택된 날짜 상세 */}
        {selectedDate && selectedData && (
          <div>
            <div className="text-sm font-bold text-slate-700 mb-2">
              {new Date(selectedDate).toLocaleDateString("ko-KR", {
                timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short",
              })} 상세
            </div>
            <SummaryTable summaries={selectedData.summaries} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-bold text-slate-800">출퇴근 현황</div>
          <button className={btnOn} onClick={load} disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>

        {/* 모드 탭 */}
        <div className="flex gap-2 mb-4">
          <button className={modeBtn(viewMode === "daily")}   onClick={() => setViewMode("daily")}>일별</button>
          <button className={modeBtn(viewMode === "range")}   onClick={() => setViewMode("range")}>기간별</button>
          <button className={modeBtn(viewMode === "monthly")} onClick={() => setViewMode("monthly")}>월별</button>
        </div>

        {/* 날짜 입력 */}
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

        {/* 콘텐츠 */}
        {loading ? (
          <div className="text-center py-12 text-sm text-slate-400">조회 중...</div>
        ) : (
          <>
            {viewMode === "daily" && <SummaryTable summaries={dailyRows} />}
            {viewMode === "range" && (
              <div className="flex flex-col gap-6">
                {rangeRows.map(({ date: d, summaries }) => (
                  <div key={d}>
                    <div className="text-sm font-bold text-slate-600 mb-2">
                      {new Date(d).toLocaleDateString("ko-KR", {
                        timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short",
                      })}
                    </div>
                    <SummaryTable summaries={summaries} />
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
    </div>
  );
}