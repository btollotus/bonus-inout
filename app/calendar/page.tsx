// app/calendar/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Visibility = "PUBLIC" | "ADMIN";

type CalendarMemoRow = {
  id: string;
  memo_date: string; // YYYY-MM-DD
  visibility: Visibility;
  content: string;
  created_at: string;
  updated_at: string;
};

type OrdersAggRow = {
  ship_date: string; // YYYY-MM-DD
  cnt: number;
};

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function firstOfMonth(ym: string) {
  // ym: YYYY-MM
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
function startOfCalendarGrid(monthDate: Date) {
  // 달력은 "일요일 시작" 기준
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const dow = first.getDay(); // 0=일
  const start = new Date(first);
  start.setDate(first.getDate() - dow);
  return start;
}
function build42Days(monthDate: Date) {
  const start = startOfCalendarGrid(monthDate);
  return Array.from({ length: 42 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * 대한민국 공휴일(간단 버전)
 * - 고정(양력): 1/1, 3/1, 5/5, 6/6, 8/15, 10/3, 10/9, 12/25
 * - 2026년 음력 기반(하드코딩): 설날(2/16~2/18), 부처님오신날(5/24), 추석(9/24~9/26)
 * - 대체공휴일(간단): 2026년 기준으로 필요한 것만 반영
 *
 * 필요하면 연도별로 테이블을 늘려가면 됩니다.
 */
function getKoreaHolidaysMap(year: number): Record<string, string> {
  const map: Record<string, string> = {};

  // 고정 공휴일
  const fixed = [
    [`${year}-01-01`, "신정"],
    [`${year}-03-01`, "삼일절"],
    [`${year}-05-05`, "어린이날"],
    [`${year}-06-06`, "현충일"],
    [`${year}-08-15`, "광복절"],
    [`${year}-10-03`, "개천절"],
    [`${year}-10-09`, "한글날"],
    [`${year}-12-25`, "성탄절"],
  ];
  for (const [d, name] of fixed) map[d] = name;

  // 2026 음력 기반 공휴일 (정확 표시용)
  if (year === 2026) {
    map["2026-02-16"] = "설날(연휴)";
    map["2026-02-17"] = "설날";
    map["2026-02-18"] = "설날(연휴)";

    map["2026-05-24"] = "부처님오신날";
    map["2026-09-24"] = "추석(연휴)";
    map["2026-09-25"] = "추석";
    map["2026-09-26"] = "추석(연휴)";

    // 2026 대체공휴일(주요)
    // 3/1(일) → 3/2(월)
    map["2026-03-02"] = "삼일절 대체";
    // 5/24(일) 부처님오신날 → 5/25(월)
    map["2026-05-25"] = "부처님오신날 대체";
    // 8/15(토) → 8/17(월)
    map["2026-08-17"] = "광복절 대체";
    // 10/3(토) → 10/5(월)
    map["2026-10-05"] = "개천절 대체";
  }

  return map;
}

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);

  // 테마: TradeClient와 동일 톤
  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";

  const [msg, setMsg] = useState<string | null>(null);

  const [curMonth, setCurMonth] = useState(() => {
    const now = new Date();
    return monthKey(now); // YYYY-MM
  });

  const curMonthDate = useMemo(() => firstOfMonth(curMonth), [curMonth]);
  const days42 = useMemo(() => build42Days(curMonthDate), [curMonthDate]);

  const holidays = useMemo(() => getKoreaHolidaysMap(curMonthDate.getFullYear()), [curMonthDate]);

  // 메모(월 범위)
  const [memos, setMemos] = useState<CalendarMemoRow[]>([]);
  // 출고 집계(월 범위)
  const [orderAgg, setOrderAgg] = useState<Map<string, number>>(new Map());

  // 모달(날짜 클릭)
  const [open, setOpen] = useState(false);
  const [selDate, setSelDate] = useState<string>("");

  const [publicText, setPublicText] = useState("");
  const [adminText, setAdminText] = useState("");

  const [saving, setSaving] = useState(false);

  const range = useMemo(() => {
    const yyyy = curMonthDate.getFullYear();
    const mm = curMonthDate.getMonth(); // 0-based
    const from = new Date(yyyy, mm, 1);
    const to = new Date(yyyy, mm + 1, 1); // 다음달 1일(미포함)
    return { from: ymd(from), to: ymd(to) };
  }, [curMonthDate]);

  function memoKey(date: string, vis: Visibility) {
    return `${date}__${vis}`;
  }

  const memoMap = useMemo(() => {
    const map = new Map<string, CalendarMemoRow>();
    for (const m of memos) map.set(memoKey(m.memo_date, m.visibility), m);
    return map;
  }, [memos]);

  async function loadAll() {
    setMsg(null);

    // 1) calendar_memos (PUBLIC은 전원, ADMIN은 RLS로 관리자만 내려옴)
    {
      const { data, error } = await supabase
        .from("calendar_memos")
        .select("id,memo_date,visibility,content,created_at,updated_at")
        .gte("memo_date", range.from)
        .lt("memo_date", range.to)
        .order("memo_date", { ascending: true });

      if (error) return setMsg(error.message);
      setMemos((data ?? []) as CalendarMemoRow[]);
    }

    // 2) orders 출고 집계 (ship_date 기준)
    {
      const { data, error } = await supabase
        .from("orders")
        .select("ship_date")
        .gte("ship_date", range.from)
        .lt("ship_date", range.to)
        .not("ship_date", "is", null);

      if (error) return setMsg(error.message);

      const map = new Map<string, number>();
      for (const r of (data ?? []) as any[]) {
        const d = String(r.ship_date ?? "").slice(0, 10);
        if (!d) continue;
        map.set(d, (map.get(d) ?? 0) + 1);
      }
      setOrderAgg(map);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curMonth]);

  function openDayModal(date: string) {
    setMsg(null);
    setSelDate(date);

    const pub = memoMap.get(memoKey(date, "PUBLIC"))?.content ?? "";
    const adm = memoMap.get(memoKey(date, "ADMIN"))?.content ?? "";

    setPublicText(pub);
    setAdminText(adm);

    setOpen(true);
  }

  async function upsertMemo(date: string, vis: Visibility, content: string) {
    const existing = memoMap.get(memoKey(date, vis));
    const trimmed = content.trim();

    // 빈 값이면 "삭제"로 취급(요청: 일정 없으면 빈칸)
    if (!trimmed) {
      if (!existing) return;
      const { error } = await supabase.from("calendar_memos").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return;
    }

    if (!existing) {
      const payload: any = {
        memo_date: date,
        visibility: vis,
        content: trimmed,
        created_by: null,
      };
      const { error } = await supabase.from("calendar_memos").insert(payload);
      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await supabase.from("calendar_memos").update({ content: trimmed }).eq("id", existing.id);
    if (error) throw new Error(error.message);
  }

  async function saveModal() {
    if (!selDate) return;
    setSaving(true);
    setMsg(null);
    try {
      await upsertMemo(selDate, "PUBLIC", publicText);
      await upsertMemo(selDate, "ADMIN", adminText);
      setOpen(false);
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "저장 중 오류");
    } finally {
      setSaving(false);
    }
  }

  function dayColor(dateObj: Date) {
    const dow = dateObj.getDay(); // 0=일, 6=토
    const dateStr = ymd(dateObj);
    const isHoliday = !!holidays[dateStr];

    // 공휴일은 빨강(관공서 기준)
    if (isHoliday) return "text-red-600";
    if (dow === 0) return "text-red-600"; // 일
    if (dow === 6) return "text-blue-600"; // 토
    return "text-slate-900";
  }

  function weekdayHeaderColor(idx: number) {
    // 0=일, 6=토
    if (idx === 0) return "text-red-600";
    if (idx === 6) return "text-blue-600";
    return "text-slate-600";
  }

  const monthLabel = useMemo(() => {
    const d = curMonthDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [curMonthDate]);

  return (
    <div className={`${pageBg} min-h-screen`}>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        {/* 상단 */}
        <div className={`${card} p-4`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold">출고 캘린더 메모</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={pill}>월: {monthLabel}</span>
                <span className="text-xs text-slate-500">공개메모: 전원 / 관리자메모: 관리자만</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className={btn}
                onClick={() => {
                  const prev = addMonths(curMonthDate, -1);
                  setCurMonth(monthKey(prev));
                }}
              >
                ◀ 이전달
              </button>
              <button
                className={btn}
                onClick={() => {
                  setCurMonth(monthKey(new Date()));
                }}
              >
                오늘
              </button>
              <button
                className={btn}
                onClick={() => {
                  const next = addMonths(curMonthDate, 1);
                  setCurMonth(monthKey(next));
                }}
              >
                다음달 ▶
              </button>
              <button className={btnOn} onClick={loadAll}>
                새로고침
              </button>
            </div>
          </div>

          {/* 요일 헤더 */}
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <div className="grid grid-cols-7 bg-slate-50 text-xs font-semibold">
              {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
                <div key={w} className={`px-3 py-2 ${weekdayHeaderColor(i)}`}>
                  {w}
                </div>
              ))}
            </div>

            {/* 달력 본문 */}
            <div className="grid grid-cols-7">
              {days42.map((d) => {
                const ds = ymd(d);
                const inMonth = d.getMonth() === curMonthDate.getMonth();
                const dayNum = d.getDate();

                const pub = memoMap.get(memoKey(ds, "PUBLIC"))?.content?.trim() ?? "";
                const adm = memoMap.get(memoKey(ds, "ADMIN"))?.content?.trim() ?? "";
                const shipCnt = orderAgg.get(ds) ?? 0;

                const holidayName = holidays[ds] ?? "";

                return (
                  <button
                    key={ds}
                    className={`min-h-[108px] border-t border-slate-200 p-3 text-left hover:bg-slate-50 ${
                      inMonth ? "bg-white" : "bg-slate-50"
                    }`}
                    onClick={() => openDayModal(ds)}
                    title="클릭해서 메모 추가/수정"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={`text-sm font-semibold ${dayColor(d)}`}>{dayNum}</div>
                      {holidayName ? (
                        <div className="truncate rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          {holidayName}
                        </div>
                      ) : null}
                    </div>

                    {/* 출고 표시 (orders) */}
                    {shipCnt > 0 ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800">
                        출고 <span className="font-semibold tabular-nums">{shipCnt}</span>건
                      </div>
                    ) : null}

                    {/* 메모 표시: 없으면 아무것도 안 보이게(요청사항) */}
                    {pub ? (
                      <div className="mt-2 line-clamp-2 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">공개</span>: {pub}
                      </div>
                    ) : null}

                    {adm ? (
                      <div className="mt-1 line-clamp-2 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">관리</span>: {adm}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            ※ 메모가 비어 있으면 표시하지 않습니다. (기존 “공개메모 없음” 제거) · 날짜를 클릭하면 메모를 추가/수정/삭제할 수 있습니다.
          </div>
        </div>

        {/* 모달 */}
        {open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
            <div className="w-full max-w-[900px] rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">메모 · {selDate}</div>
                  <div className="mt-1 text-xs text-slate-500">비우고 저장하면 삭제됩니다.</div>
                </div>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => setOpen(false)} disabled={saving}>
                    닫기
                  </button>
                  <button className={btnOn} onClick={saveModal} disabled={saving}>
                    {saving ? "저장중..." : "저장"}
                  </button>
                </div>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-semibold">공개 메모 (전원)</div>
                  <textarea
                    className={`${input} min-h-[110px] resize-y`}
                    value={publicText}
                    onChange={(e) => setPublicText(e.target.value)}
                    placeholder="예: 2/2 대량 출고 / 택배 마감 16시"
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-semibold">관리자 메모 (관리자만)</div>
                  <textarea
                    className={`${input} min-h-[110px] resize-y`}
                    value={adminText}
                    onChange={(e) => setAdminText(e.target.value)}
                    placeholder="예: 내부 생산/인원 배치/특이사항"
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    ※ 권한이 없으면 RLS로 인해 ADMIN 메모는 저장/조회되지 않습니다.
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  출고 건수는 <span className="font-semibold">orders.ship_date</span> 기준으로 자동 표시됩니다.
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}