// app/leave/leave-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type LeaveType = "FULL" | "AM" | "PM";

type LeaveRow = {
  id: string;
  user_id: string;
  leave_date: string; // YYYY-MM-DD
  leave_type: LeaveType | string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function monthKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}
function firstOfMonth(ym: string) {
  return new Date(`${ym}-01T00:00:00`);
}
function addMonths(date: Date, delta: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}
function shortUid(uid: string) {
  if (!uid) return "";
  return uid.slice(0, 6);
}
function typeLabel(t: string | null | undefined) {
  if (t === "FULL") return "연차";
  if (t === "AM") return "오전반차";
  if (t === "PM") return "오후반차";
  return String(t ?? "");
}

export default function LeaveClient() {
  const supabase = useMemo(() => createClient(), []);
  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";
  const badge =
    "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700";
  const badgeMine =
    "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700";

  const [msg, setMsg] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // 월 선택
  const [curMonth, setCurMonth] = useState(() => monthKey(new Date()));
  const curMonthDate = useMemo(() => firstOfMonth(curMonth), [curMonth]);

  const range = useMemo(() => {
    const yyyy = curMonthDate.getFullYear();
    const mm = curMonthDate.getMonth();
    const from = new Date(yyyy, mm, 1);
    const to = new Date(yyyy, mm + 1, 1);
    return { from: ymd(from), to: ymd(to) };
  }, [curMonthDate]);

  // 입력 폼
  const [leaveDate, setLeaveDate] = useState<string>(() => ymd(new Date()));
  const [leaveType, setLeaveType] = useState<LeaveType>("FULL");
  const [note, setNote] = useState("");

  // 데이터
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(false);

  // 편집 모달
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<LeaveRow | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState<LeaveType>("FULL");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAuth() {
    const { data } = await supabase.auth.getUser();
    const u = data?.user;
    setUid(u?.id ?? null);

    // is_admin RPC가 프로젝트에 존재한다는 전제(기존 캘린더 코드와 동일)
    if (u?.id) {
      const { data: adminData, error } = await supabase.rpc("is_admin", { p_uid: u.id });
      if (!error) setIsAdmin(!!adminData);
      else setIsAdmin(false);
    } else {
      setIsAdmin(false);
    }
  }

  async function loadLeaves() {
    setMsg(null);
    setLoading(true);
    try {
      // ✅ 스키마 차이로 깨질 위험 최소화: select("*") 사용
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .gte("leave_date", range.from)
        .lt("leave_date", range.to)
        .order("leave_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      setRows((data ?? []) as LeaveRow[]);
    } catch (e: any) {
      setRows([]);
      setMsg(e?.message ?? "휴가 목록 조회 중 오류");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curMonth]);

  async function addLeave() {
    setMsg(null);
    if (!uid) {
      setMsg("로그인이 필요합니다.");
      return;
    }
    if (!leaveDate) {
      setMsg("날짜를 선택해 주세요.");
      return;
    }

    setSaving(true);
    try {
      // ✅ RLS with_check: user_id = auth.uid() 만족
      const payload: any = {
        user_id: uid,
        leave_date: leaveDate,
        leave_type: leaveType,
        note: note.trim() ? note.trim() : null,
      };

      const { error } = await supabase.from("leave_requests").insert(payload);
      if (error) throw error;

      setNote("");
      await loadLeaves();
    } catch (e: any) {
      setMsg(e?.message ?? "휴가 등록 중 오류");
    } finally {
      setSaving(false);
    }
  }

  function canEdit(r: LeaveRow) {
    if (!uid) return false;
    return r.user_id === uid || isAdmin;
  }

  function openEdit(r: LeaveRow) {
    setMsg(null);
    setEditRow(r);
    setEditDate(r.leave_date);
    setEditType((r.leave_type as LeaveType) || "FULL");
    setEditNote(r.note ?? "");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow) return;
    setMsg(null);
    setSaving(true);
    try {
      const patch: any = {
        leave_date: editDate,
        leave_type: editType,
        note: editNote.trim() ? editNote.trim() : null,
      };

      const { error } = await supabase.from("leave_requests").update(patch).eq("id", editRow.id);
      if (error) throw error;

      setEditOpen(false);
      setEditRow(null);
      await loadLeaves();
    } catch (e: any) {
      setMsg(e?.message ?? "수정 중 오류");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(r: LeaveRow) {
    const ok = window.confirm("이 휴가를 삭제할까요?");
    if (!ok) return;

    setMsg(null);
    setSaving(true);
    try {
      const { error } = await supabase.from("leave_requests").delete().eq("id", r.id);
      if (error) throw error;

      await loadLeaves();
    } catch (e: any) {
      setMsg(e?.message ?? "삭제 중 오류");
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = useMemo(() => {
    const d = curMonthDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [curMonthDate]);

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
                <span className="text-xs text-slate-500">
                  휴가 일정은 전 직원이 볼 수 있습니다. (수정/삭제는 본인 또는 관리자)
                </span>
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
              >
                ◀ 이전달
              </button>
              <button className={btn} onClick={() => setCurMonth(monthKey(new Date()))}>
                오늘
              </button>
              <button
                className={btn}
                onClick={() => setCurMonth(monthKey(addMonths(curMonthDate, 1)))}
              >
                다음달 ▶
              </button>
              <button className={btnOn} onClick={loadLeaves} disabled={loading || saving}>
                {loading ? "불러오는 중..." : "새로고침"}
              </button>
            </div>
          </div>

          {/* 입력 폼 */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
              <div className="md:col-span-3">
                <div className="mb-1 text-sm font-semibold">날짜</div>
                <input
                  type="date"
                  className={input}
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                />
              </div>

              <div className="md:col-span-3">
                <div className="mb-1 text-sm font-semibold">구분</div>
                <select
                  className={input}
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                >
                  <option value="FULL">연차</option>
                  <option value="AM">오전반차</option>
                  <option value="PM">오후반차</option>
                </select>
              </div>

              <div className="md:col-span-4">
                <div className="mb-1 text-sm font-semibold">메모(선택)</div>
                <input
                  className={input}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 병원 / 개인사정"
                />
              </div>

              <div className="md:col-span-2">
                <button className={`${btnOn} w-full`} onClick={addLeave} disabled={saving}>
                  {saving ? "저장중..." : "등록"}
                </button>
              </div>
            </div>
          </div>

          {/* 목록 */}
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold">날짜</th>
                  <th className="px-4 py-3 text-left font-semibold">구분</th>
                  <th className="px-4 py-3 text-left font-semibold">메모</th>
                  <th className="px-4 py-3 text-left font-semibold">작성자</th>
                  <th className="px-4 py-3 text-right font-semibold">작업</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-600" colSpan={5}>
                      불러오는 중...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-600" colSpan={5}>
                      이번 달 휴가 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const mine = uid && r.user_id === uid;
                    return (
                      <tr key={r.id} className="border-b border-slate-200 last:border-b-0">
                        <td className="px-4 py-3 tabular-nums">{r.leave_date}</td>
                        <td className="px-4 py-3">
                          <span className={badge}>{typeLabel(r.leave_type)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{r.note ?? ""}</td>
                        <td className="px-4 py-3">
                          {mine ? (
                            <span className={badgeMine}>본인</span>
                          ) : (
                            <span className={badge}>UID:{shortUid(r.user_id)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canEdit(r) ? (
                            <div className="flex justify-end gap-2">
                              <button className={btn} onClick={() => openEdit(r)} disabled={saving}>
                                수정
                              </button>
                              <button className={btn} onClick={() => deleteRow(r)} disabled={saving}>
                                삭제
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">권한 없음</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            ※ 직원 인사정보(employees)는 전 직원이 볼 수 없도록 설계되어 있어,
            목록의 “작성자”는 본인 여부 또는 UID 일부만 표시합니다.
          </div>
        </div>

        {/* 편집 모달 */}
        {editOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
            onClick={() => setEditOpen(false)}
          >
            <div
              className="w-full max-w-[720px] rounded-2xl border border-slate-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">휴가 수정</div>
                  <div className="mt-1 text-xs text-slate-500">본인 또는 관리자만 수정/삭제 가능합니다.</div>
                </div>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => setEditOpen(false)} disabled={saving}>
                    닫기
                  </button>
                  <button className={btnOn} onClick={saveEdit} disabled={saving}>
                    {saving ? "저장중..." : "저장"}
                  </button>
                </div>
              </div>

              <div className="space-y-4 px-5 py-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                  <div className="md:col-span-4">
                    <div className="mb-1 text-sm font-semibold">날짜</div>
                    <input
                      type="date"
                      className={input}
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-4">
                    <div className="mb-1 text-sm font-semibold">구분</div>
                    <select
                      className={input}
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as LeaveType)}
                    >
                      <option value="FULL">연차</option>
                      <option value="AM">오전반차</option>
                      <option value="PM">오후반차</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <div className="mb-1 text-sm font-semibold">메모(선택)</div>
                    <input
                      className={input}
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="예: 병원 / 개인사정"
                    />
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  ※ 저장 시 DB에 즉시 반영됩니다. RLS 정책에 따라 권한이 없으면 실패합니다.
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}