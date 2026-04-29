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
  const [month, setMonth] = useState(todayKST().slice(0, 7)); // YYYY-MM

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
      const empRecords = records.filter(r => r.employee_id === emp.id);
      const inRecord  = empRecords.find(r => r.type === "IN");
      const outRecord = empRecords.find(r => r.type === "OUT");
      return {
        employeeId:   emp.id,
        employeeName: emp.name,
        inTime:       inRecord?.happened_at ?? null,
        outTime:      outRecord?.happened_at ?? null,
      };
    });
  }

  // 날짜 범위 배열 생성
  function getDatesInRange(from: string, to: string): string[] {
    const dates: string[] = [];
    const cur = new Date(from);
    const end = new Date(to);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  async function load() {
    setLoading(true);
    try {
      if (viewMode === "daily") {
        const records = await fetchRecords(date, date);
        setDailyRows(buildSummaries(records, date));

      } else if (viewMode === "range") {
        const records = await fetchRecords(rangeFrom, rangeTo);
        const dates = getDatesInRange(rangeFrom, rangeTo);
        const grouped = dates.map(d => ({
          date: d,
          summaries: buildSummaries(
            records.filter(r => r.happened_at.startsWith(d) ||
              new Date(r.happened_at).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).startsWith(d)),
            d
          ),
        }));
        setRangeRows(grouped);

      } else if (viewMode === "monthly") {
        const [y, m] = month.split("-");
        const from = `${y}-${m}-01`;
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        const to = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
        const records = await fetchRecords(from, to);
        const dates = getDatesInRange(from, to);
        const grouped = dates.map(d => ({
          date: d,
          summaries: buildSummaries(
            records.filter(r => {
              const kst = new Date(r.happened_at).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
              return kst.startsWith(d);
            }),
            d
          ),
        }));
        setRangeRows(grouped);
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

  function formatDateLabel(d: string) {
    return new Date(d).toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short",
    });
  }

  function getStatus(row: DailySummary): { label: string; style: string } {
    if (!row.inTime) return { label: "결근", style: "border-red-200 bg-red-50 text-red-700" };
    const kst = new Date(new Date(row.inTime).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    const isLate = kst.getHours() > 9 || (kst.getHours() === 9 && kst.getMinutes() > 0);
    if (isLate) return { label: "지각", style: "border-amber-200 bg-amber-50 text-amber-700" };
    return { label: "정상", style: "border-green-200 bg-green-50 text-green-700" };
  }

  // 일별 요약 테이블
  function SummaryTable({ summaries }: { summaries: DailySummary[] }) {
    const presentCount = summaries.filter(r => r.inTime).length;
    const lateCount    = summaries.filter(r => getStatus(r).label === "지각").length;
    const absentCount  = summaries.filter(r => !r.inTime).length;

    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* 요약 */}
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

        {/* 조회 모드 선택 */}
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
        {viewMode === "daily" && (
          <SummaryTable summaries={dailyRows} />
        )}

        {(viewMode === "range" || viewMode === "monthly") && (
          <div className="flex flex-col gap-6">
            {rangeRows.map(({ date: d, summaries }) => (
              <div key={d}>
                <div className="text-sm font-bold text-slate-600 mb-2">
                  {formatDateLabel(d)}
                </div>
                <SummaryTable summaries={summaries} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 text-xs text-slate-400">
          ※ 09:00 이후 출근 시 지각으로 표시됩니다.
        </div>
      </div>
    </div>
  );
}