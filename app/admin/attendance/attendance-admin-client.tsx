"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { todayKST, utcToKSTDate } from "@/utils/location";

type AttendanceRow = {
  id: string;
  employee_id: string;
  happened_at: string;
  type: string;
  distance_m: number | null;
  employee_name: string;
};

type DailySummary = {
  employeeId: string;
  employeeName: string;
  inTime: string | null;
  outTime: string | null;
};

export default function AttendanceAdminClient() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(todayKST());
  const [rows, setRows] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  const input = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btnOn = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all";

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
  }, [date, employees]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("attendance")
        .select("id,employee_id,happened_at,type,distance_m")
        .gte("happened_at", `${date}T00:00:00+09:00`)
        .lte("happened_at", `${date}T23:59:59+09:00`)
        .order("happened_at", { ascending: true });

      const records = (data ?? []) as AttendanceRow[];

      // 직원별 IN/OUT 정리
      const summary: DailySummary[] = employees.map(emp => {
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

      setRows(summary);
    } finally {
      setLoading(false);
    }
  }

  function formatTime(iso: string | null) {
    if (!iso) return "--:--";
    return new Date(iso).toLocaleTimeString("ko-KR", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul"
    });
  }

  function getStatus(row: DailySummary): { label: string; style: string } {
    if (!row.inTime) return { label: "결근", style: "border-red-200 bg-red-50 text-red-700" };
    const inHour = new Date(row.inTime).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
    const inDate = new Date(inHour);
    const isLate = inDate.getHours() > 9 || (inDate.getHours() === 9 && inDate.getMinutes() > 0);
    if (isLate) return { label: "지각", style: "border-amber-200 bg-amber-50 text-amber-700" };
    return { label: "정상", style: "border-green-200 bg-green-50 text-green-700" };
  }

  const presentCount = rows.filter(r => r.inTime).length;
  const absentCount  = rows.filter(r => !r.inTime).length;
  const lateCount    = rows.filter(r => getStatus(r).label === "지각").length;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-bold text-slate-800">출퇴근 현황</div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className={input}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
            <button className={btnOn} onClick={load} disabled={loading}>
              {loading ? "조회 중..." : "조회"}
            </button>
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "출근", count: presentCount, style: "text-green-600" },
            { label: "지각", count: lateCount,    style: "text-amber-600" },
            { label: "결근", count: absentCount,  style: "text-red-600"   },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">{s.label}</div>
              <div className={`text-2xl font-bold ${s.style}`}>{s.count}</div>
              <div className="text-xs text-slate-400">명</div>
            </div>
          ))}
        </div>

        {/* 테이블 */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">이름</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">출근</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">퇴근</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const st = getStatus(row);
                return (
                  <tr key={row.employeeId} className={`border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.employeeName}</td>
                    <td className={`px-4 py-3 font-mono ${row.inTime ? "text-green-600 font-semibold" : "text-slate-300"}`}>
                      {formatTime(row.inTime)}
                    </td>
                    <td className={`px-4 py-3 font-mono ${row.outTime ? "text-blue-600 font-semibold" : "text-slate-300"}`}>
                      {formatTime(row.outTime)}
                    </td>
                    <td className="px-4 py-3">
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

        <div className="mt-3 text-xs text-slate-400">
          ※ 09:00 이후 출근 시 지각으로 표시됩니다.
        </div>
      </div>
    </div>
  );
}