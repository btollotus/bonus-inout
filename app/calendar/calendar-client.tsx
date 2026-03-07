"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import Holidays from "date-holidays";

type Visibility = "PUBLIC" | "ADMIN";

type MemoRow = {
  id: string;
  memo_date: string; // YYYY-MM-DD
  visibility: Visibility;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYMD(s: string) {
  // safe parse in local time
  return new Date(s + "T00:00:00");
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfCalendarGrid(month: Date) {
  // Sunday start
  const s = startOfMonth(month);
  const dow = s.getDay(); // 0=Sun
  return addDays(s, -dow);
}
function endOfCalendarGrid(month: Date) {
  const e = endOfMonth(month);
  const dow = e.getDay();
  return addDays(e, 6 - dow);
}

export default function CalendarClient() {
  const supabase = useMemo(() => createClient(), []);

  const hd = useMemo(() => new Holidays("KR"), []);

  const [msg, setMsg] = useState<string | null>(null);

  const [curMonth, setCurMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [memos, setMemos] = useState<MemoRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // modal
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [publicText, setPublicText] = useState("");
  const [adminText, setAdminText] = useState("");
  const [saving, setSaving] = useState(false);

  // ===== Theme (TradeClient 동일) =====
  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";

  async function loadIsAdmin() {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) {
      setIsAdmin(false);
      return;
    }
    const { data, error } = await supabase.rpc("is_admin", { p_uid: uid });
    if (error) {
      // 관리자함수 문제여도 캘린더는 PUBLIC로 동작
      setIsAdmin(false);
      return;
    }
    setIsAdmin(!!data);
  }

  async function loadMonthMemos(month: Date) {
    setMsg(null);

    const from = ymd(startOfCalendarGrid(month));
    const to = ymd(endOfCalendarGrid(month));

    // PUBLIC은 전원, ADMIN은 정책에 의해 관리자만 내려옴(비관리자는 자동으로 안 보임)
    const { data, error } = await supabase
      .from("calendar_memos")
      .select("id,memo_date,visibility,content,created_by,created_at,updated_at")
      .gte("memo_date", from)
      .lte("memo_date", to)
      .order("memo_date", { ascending: true });

    if (error) {
      setMemos([]);
      setMsg(error.message);
      return;
    }
    setMemos((data ?? []) as MemoRow[]);
  }

  const memoMap = useMemo(() => {
    const map = new Map<string, { PUBLIC?: MemoRow; ADMIN?: MemoRow }>();
    for (const m of memos) {
      const key = m.memo_date;
      const cur = map.get(key) ?? {};
      cur[m.visibility] = m;
      map.set(key, cur);
    }
    return map;
  }, [memos]);

  const today = ymd(new Date());

  const days = useMemo(() => {
    const start = startOfCalendarGrid(curMonth);
    const end = endOfCalendarGrid(curMonth);
    const list: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) list.push(d);
    return list;
  }, [curMonth]);

  function openDay(dateYmd: string) {
    setMsg(null);
    setSelectedDate(dateYmd);

    const hit = memoMap.get(dateYmd);
    setPublicText(hit?.PUBLIC?.content ?? "");
    setAdminText(hit?.ADMIN?.content ?? "");

    setOpen(true);
  }

  function closeDay() {
    setOpen(false);
    setSelectedDate("");
    setPublicText("");
    setAdminText("");
  }

  async function upsertMemo(vis: Visibility, content: string) {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;

    // 빈 내용이면 저장 대신 삭제 유도(버튼으로 삭제 권장) - 여기서는 빈값도 저장 가능하게 둠
    const payload: any = {
      memo_date: selectedDate,
      visibility: vis,
      content: content ?? "",
      created_by: uid,
    };

    const { error } = await supabase
      .from("calendar_memos")
      .upsert(payload, { onConflict: "memo_date,visibility" });

    if (error) throw error;
  }

  async function deleteMemo(vis: Visibility) {
    const { error } = await supabase
      .from("calendar_memos")
      .delete()
      .eq("memo_date", selectedDate)
      .eq("visibility", vis);

    if (error) throw error;
  }

  async function saveAll() {
    if (!selectedDate) return;
    setSaving(true);
    setMsg(null);

    try {
      // PUBLIC 저장
      await upsertMemo("PUBLIC", publicText);

      // ADMIN 저장은 관리자만
      if (isAdmin) {
        await upsertMemo("ADMIN", adminText);
      }

      await loadMonthMemos(curMonth);
      setOpen(false);
    } catch (e: any) {
      setMsg(e?.message ?? "저장 중 오류");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(vis: Visibility) {
    const ok = window.confirm(`${vis === "PUBLIC" ? "공개" : "관리자"} 메모를 삭제할까요?`);
    if (!ok) return;

    setSaving(true);
    setMsg(null);
    try {
      await deleteMemo(vis);
      await loadMonthMemos(curMonth);

      // modal 입력값도 동기화
      if (vis === "PUBLIC") setPublicText("");
      else setAdminText("");
    } catch (e: any) {
      setMsg(e?.message ?? "삭제 중 오류");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadIsAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMonthMemos(curMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curMonth]);

  const monthLabel = useMemo(() => {
    const y = curMonth.getFullYear();
    const m = curMonth.getMonth() + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  }, [curMonth]);

  return (
    <div className={`${pageBg} min-h-screen`}>
      <div className="mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {msg}
          </div>
        ) : null}

        <div className={`${card} p-4`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold">출고 캘린더 메모</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={pill}>월: {monthLabel}</span>
                <span className="text-xs text-slate-500">
                  공개메모: 전원 / 관리자메모: 관리자만
                </span>
                {isAdmin ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                    ADMIN
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={() => setCurMonth(addMonths(curMonth, -1))}>
                ◀ 이전달
              </button>
              <button className={btn} onClick={() => setCurMonth(startOfMonth(new Date()))}>
                오늘
              </button>
              <button className={btn} onClick={() => setCurMonth(addMonths(curMonth, +1))}>
                다음달 ▶
              </button>
              <button className={btnOn} onClick={() => loadMonthMemos(curMonth)}>
                새로고침
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <div className="grid min-w-[980px] grid-cols-7">
{["일", "월", "화", "수", "목", "금", "토"].map((d, i) => {
  const color =
    i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-slate-600";
  return (
    <div
      key={d}
      className={`border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold ${color}`}
    >
      {d}
    </div>
  );
})}

              {days.map((d) => {
                const dayYmd = ymd(d);
                const inMonth = d.getMonth() === curMonth.getMonth();
                const hit = memoMap.get(dayYmd);
                const pub = hit?.PUBLIC?.content?.trim() ?? "";
                const adm = hit?.ADMIN?.content?.trim() ?? "";

                const hasPub = pub.length > 0;
                const hasAdm = adm.length > 0;

                const isToday = dayYmd === today;

                const dow = d.getDay(); // 0=일 ... 6=토
const holiday = hd.isHoliday(parseYMD(dayYmd));
const holidayName = Array.isArray(holiday)
  ? holiday[0]?.name
  : (holiday as any)?.name;

const isSun = dow === 0;
const isSat = dow === 6;

                return (
                  <button
                    key={dayYmd}
                    className={`h-[120px] border-b border-slate-200 border-r border-slate-200 p-3 text-left hover:bg-slate-50 active:bg-slate-100 ${
                      !inMonth ? "bg-slate-50/40" : "bg-white"
                    }`}
                    onClick={() => openDay(dayYmd)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-2">
                    <div
  className={`font-semibold tabular-nums ${
    isToday
      ? "text-blue-700"
      : holidayName || isSun
      ? "text-red-600"
      : isSat
      ? "text-blue-600"
      : "text-slate-900"
  }`}
>
  {d.getDate()}
</div>
                      <div className="flex gap-1">
                        {hasPub ? (
                          <span className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-extrabold text-blue-700">
                            PUBLIC
                          </span>
                        ) : null}
                        {hasAdm ? (
                          <span className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-extrabold text-rose-700">
                            ADMIN
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-2 space-y-2">
                    {hasPub ? (
  <div className="line-clamp-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
    {pub}
  </div>
) : null}

{hasAdm ? (
  <div className="line-clamp-2 rounded-xl border border-slate-200 bg-rose-50/50 px-3 py-2 text-xs text-rose-700">
    {adm}
  </div>
) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ===== Modal ===== */}
        {open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={closeDay}>
            <div
              className="w-full max-w-[860px] rounded-2xl border border-slate-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">메모 · {selectedDate}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    저장하면 즉시 DB에 반영됩니다. (RLS로 권한 자동 제어)
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className={btn} onClick={closeDay} disabled={saving}>
                    닫기
                  </button>
                  <button className={btnOn} onClick={saveAll} disabled={saving}>
                    {saving ? "저장중..." : "저장"}
                  </button>
                </div>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">공개 메모 (PUBLIC)</div>
                    <button className={btn} onClick={() => onDelete("PUBLIC")} disabled={saving}>
                      삭제
                    </button>
                  </div>
                  <textarea
                    className={`${input} min-h-[110px]`}
                    placeholder="예) 오늘 출고 집중 / 택배 마감 15:00 / 냉동포장 필수 등"
                    value={publicText}
                    onChange={(e) => setPublicText(e.target.value)}
                  />
                </div>

                {isAdmin ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold">관리자 메모 (ADMIN)</div>
                      <button className={btn} onClick={() => onDelete("ADMIN")} disabled={saving}>
                        삭제
                      </button>
                    </div>
                    <textarea
                      className={`${input} min-h-[110px]`}
                      placeholder="(관리자 전용) 예) 미수금/특이사항/내부 메모"
                      value={adminText}
                      onChange={(e) => setAdminText(e.target.value)}
                    />
                    <div className="mt-2 text-xs text-slate-500">
                      ※ 비관리자는 ADMIN 메모를 조회/저장/삭제할 수 없습니다.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}