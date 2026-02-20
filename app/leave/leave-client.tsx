"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type LeaveType = "FULL" | "AM" | "PM";

type LeaveRow = {
  id: string;
  user_id: string;
  employee_name: string;
  leave_date: string; // YYYY-MM-DD
  leave_type: LeaveType;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function firstOfMonth(ym: string) {
  return new Date(`${ym}-01T00:00:00`);
}
function addMonths(date: Date, delta: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}
function monthKey(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export default function LeaveClient() {
  const supabase = useMemo(() => createClient(), []);

  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";

  const [msg, setMsg] = useState<string | null>(null);

  const [curMonth, setCurMonth] = useState(() => monthKey(new Date()));
  const curMonthDate = useMemo(() => firstOfMonth(curMonth), [curMonth]);

  const range = useMemo(() => {
    const yyyy = curMonthDate.getFullYear();
    const mm = curMonthDate.getMonth();
    const from = new Date(yyyy, mm, 1);
    const to = new Date(yyyy, mm + 1, 1);
    return { from: ymd(from), to: ymd(to) };
  }, [curMonthDate]);

  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(false);

  // form
  const [leaveDate, setLeaveDate] = useState(() => ymd(new Date()));
  const [leaveType, setLeaveType] = useState<LeaveType>("FULL");
  const [note, setNote] = useState("");

  const [uid, setUid] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  async function loadAuth() {
    const { data } = await supabase.auth.getUser();
    const u = data?.user;
    setUid(u?.id ?? null);

    // 기존에 쓰던 rpc is_admin() 그대로 활용(있으면)
    try {
      if (u?.id) {
        const { data: r, error } = await supabase.rpc("is_admin", { p_uid: u.id });
        if (!error) setIsAdmin(!!r);
        else setIsAdmin(false);
      } else {
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    }
  }

  async function load() {
    setMsg(null);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id,user_id,employee_name,leave_date,leave_type,note,created_at,updated_at")
        .gte("leave_date", range.from)
        .lt("leave_date", range.to)
        .order("leave_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      setRows((data ?? []) as LeaveRow[]);
    } catch (e: any) {
      setMsg(e?.message ?? "휴가 목록 조회 오류");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function leaveTypeLabel(t: LeaveType) {
    if (t === "FULL") return "연차";
    if (t === "AM") return "오전반차";
    return "오후반차";
  }

  async function create() {
    setMsg(null);
    setLoading(true);
    try {
      // employee_name / user_id는 트리거가 자동 입력
      const { error } = await supabase.from("leave_requests").insert({
        leave_date: leaveDate,
        leave_type: leaveType,
        note: note.trim() || null,
      });

      if (error) throw error;

      setNote("");
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "등록 오류");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    const ok = window.confirm("삭제할까요?");
    if (!ok) return;

    setMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.from("leave_requests").delete().eq("id", id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "삭제 오류");
    } finally {
      setLoading(false);
    }
  }

  const monthLabel = useMemo(() => {
    const d = curMonthDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [curMonthDate]);

  useEffect(() => {
    loadAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curMonth]);

  return (
    <div className={`${pageBg} min-h-screen`}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {msg}
          </div>
        ) : null}

        <div className={`${card} p-4`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold">연차/반차 입력</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={pill}>월: {monthLabel}</span>
                <span className="text-xs text-slate-500">휴가 일정은 전 직원이 볼 수 있습니다. (수정/삭제는 본인 또는 관리자)</span>
                {isAdmin ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                    ADMIN
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className={btn}
                onClick={() => setCurMonth(monthKey(addMonths(curMonthDate, -1)))}
                disabled={loading}
              >
                ◀ 이전달
              </button>
              <button className={btn} onClick={() => setCurMonth(monthKey(new Date()))} disabled={loading}>
                오늘
              </button>
              <button
                className={btn}
                onClick={() => setCurMonth(monthKey(addMonths(curMonthDate, +1)))}
                disabled={loading}
              >
                다음달 ▶
              </button>
              <button className={btnOn} onClick={load} disabled={loading}>
                {loading ? "불러오는 중..." : "새로고침"}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">날짜</div>
                <input className={input} type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">구분</div>
                <select className={input} value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
                  <option value="FULL">연차</option>
                  <option value="AM">오전반차</option>
                  <option value="PM">오후반차</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-semibold text-slate-700">메모(선택)</div>
                <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 병원 / 개인사정" />
              </div>
            </div>

            <div className="mt-3">
              <button className={btnOn} onClick={create} disabled={loading}>
                등록
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-3 py-2">날짜</th>
                  <th className="px-3 py-2">구분</th>
                  <th className="px-3 py-2">메모</th>
                  <th className="px-3 py-2">작성자</th>
                  <th className="px-3 py-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      {loading ? "불러오는 중..." : "이번 달 휴가 데이터가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const isMine = uid && r.user_id === uid;
                    const canEdit = isMine || isAdmin;

                    return (
                      <tr key={r.id} className="border-t border-slate-200 bg-white">
                        <td className="px-3 py-2 tabular-nums">{r.leave_date}</td>
                        <td className="px-3 py-2 font-semibold">{leaveTypeLabel(r.leave_type)}</td>
                        <td className="px-3 py-2">{r.note ?? ""}</td>
                        <td className="px-3 py-2">
                          {/* employees는 직원이 볼 수 없으므로 leave_requests에 저장된 employee_name만 표시 */}
                          {r.employee_name}
                          {!isMine ? <span className="ml-2 text-xs text-slate-500">({r.user_id.slice(0, 6)}…)</span> : null}
                        </td>
                        <td className="px-3 py-2">
                          {canEdit ? (
                            <button className={btn} onClick={() => remove(r.id)} disabled={loading}>
                              삭제
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">권한없음</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            ※ 직원 인사정보(employees)는 전 직원이 볼 수 없도록 설계되어 있으며(요구사항), 휴가 목록은 leave_requests로 전원 공유됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}