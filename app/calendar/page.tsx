// app/calendar/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

// ✅ 출고 방법(택배/퀵) 집계용 (orders 테이블에 ship_method 컬럼이 있다고 가정)
type ShipMethod = "택배" | "퀵" | "기타";

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
    map["2026-03-02"] = "삼일절 대체";
    map["2026-05-25"] = "부처님오신날 대체";
    map["2026-08-17"] = "광복절 대체";
    map["2026-10-05"] = "개천절 대체";
  }

  return map;
}

function normalizeShipMethod(v: any): ShipMethod {
  const s = String(v ?? "").trim();
  if (!s) return "기타";
  if (s.includes("택배")) return "택배";
  if (s.includes("퀵")) return "퀵";
  return "기타";
}

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const todayStr = useMemo(() => ymd(new Date()), []);

  // ✅ 오늘 날짜 셀 포커싱
  const didFocusRef = useRef(false);

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

  const badge =
    "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700";

  const badgeShip =
    "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700";
  const badgeQuick =
    "inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700";
  const badgeEtc =
    "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700";

  const [msg, setMsg] = useState<string | null>(null);

  const [curMonth, setCurMonth] = useState(() => monthKey(new Date())); // ✅ 기본: 오늘이 속한 월

  const curMonthDate = useMemo(() => firstOfMonth(curMonth), [curMonth]);
  const days42 = useMemo(() => build42Days(curMonthDate), [curMonthDate]);

  const holidays = useMemo(
    () => getKoreaHolidaysMap(curMonthDate.getFullYear()),
    [curMonthDate]
  );

  // 메모(월 범위)
  const [memos, setMemos] = useState<CalendarMemoRow[]>([]);

  // ✅ 출고 집계(월 범위) : date -> { total, methods }
  const [shipAgg, setShipAgg] = useState<
    Map<string, { total: number; byMethod: Record<ShipMethod, number> }>
  >(new Map());

  // 모달(날짜 클릭 - 메모)
  const [open, setOpen] = useState(false);
  const [selDate, setSelDate] = useState<string>("");

  const [publicText, setPublicText] = useState("");
  const [adminText, setAdminText] = useState("");
  const [saving, setSaving] = useState(false);

  // ✅ 모달(출고 클릭 - 출고 목록: 거래처 + 출고방식)
  const [openShip, setOpenShip] = useState(false);
  const [selShipDate, setSelShipDate] = useState<string>("");

  const [shipListLoading, setShipListLoading] = useState(false);
  const [shipListErr, setShipListErr] = useState<string | null>(null);

  type ShipRow = { partner_name: string; ship_method: ShipMethod };
  const [shipRows, setShipRows] = useState<ShipRow[]>([]);

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

    // 2) orders 출고 집계 (ship_date + ship_method 기준)
    {
      // ⚠️ orders 테이블에 ship_method 컬럼이 있어야 합니다.
      // (만약 컬럼명이 다르면, 여기 select 컬럼명만 맞춰주면 됩니다)
      const { data, error } = await supabase
        .from("orders")
        .select("ship_date,ship_method")
        .gte("ship_date", range.from)
        .lt("ship_date", range.to)
        .not("ship_date", "is", null);

      if (error) return setMsg(error.message);

      const map = new Map<string, { total: number; byMethod: Record<ShipMethod, number> }>();

      for (const r of (data ?? []) as any[]) {
        const d = String(r.ship_date ?? "").slice(0, 10);
        if (!d) continue;

        const method = normalizeShipMethod(r.ship_method);

        const cur = map.get(d) ?? {
          total: 0,
          byMethod: { 택배: 0, 퀵: 0, 기타: 0 },
        };

        cur.total += 1;
        cur.byMethod[method] = (cur.byMethod[method] ?? 0) + 1;

        map.set(d, cur);
      }

      setShipAgg(map);
    }
  }

  useEffect(() => {
    didFocusRef.current = false;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curMonth]);

  // ✅ 월이 바뀌거나 처음 로드되면 "오늘" 셀에 포커싱
  useEffect(() => {
    if (didFocusRef.current) return;

    // 현재 보고 있는 달이 오늘이 속한 달일 때만 포커싱
    const isSameMonth = curMonth === monthKey(new Date());
    if (!isSameMonth) return;

    // 렌더 후 DOM에서 해당 셀 버튼을 찾아 포커스
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLButtonElement>(`button[data-date="${todayStr}"]`);
      if (el) {
        el.focus();
        didFocusRef.current = true;
      }
    }, 0);

    return () => window.clearTimeout(t);
  }, [curMonth, todayStr]);

  function openDayModal(date: string) {
    setMsg(null);
    setSelDate(date);

    const pub = memoMap.get(memoKey(date, "PUBLIC"))?.content ?? "";
    const adm = memoMap.get(memoKey(date, "ADMIN"))?.content ?? "";

    setPublicText(pub);
    setAdminText(adm);

    setOpen(true);
  }

  // ✅ “출고 n건” 클릭 → 해당 날짜 출고 목록(거래처 + 출고방식) 로드 후 모달 오픈
  async function openShipModal(date: string) {
    setMsg(null);
    setSelShipDate(date);

    setShipListErr(null);
    setShipListLoading(true);
    setShipRows([]);
    setOpenShip(true);

    try {
      // ⚠️ 전제: orders.partner_id -> partners.id FK가 설정되어 있어서 partners(name) 조인이 가능
      const { data, error } = await supabase
        .from("orders")
        .select("ship_method, partner_id, partners(name)")
        .eq("ship_date", date);

      if (error) throw error;

      const rows: ShipRow[] = ((data ?? []) as any[]).map((r) => {
        const partnerName = r?.partners?.name ?? "(거래처 미지정)";
        const method = normalizeShipMethod(r?.ship_method);
        return { partner_name: partnerName, ship_method: method };
      });

      setShipRows(rows);
    } catch (e: any) {
      setShipListErr(e?.message ?? "출고 목록 조회 중 오류");
    } finally {
      setShipListLoading(false);
    }
  }

  const shipSummary = useMemo(() => {
    const total = shipRows.length;
    const byMethod: Record<ShipMethod, number> = { 택배: 0, 퀵: 0, 기타: 0 };
    for (const r of shipRows) byMethod[r.ship_method] += 1;
    return { total, byMethod };
  }, [shipRows]);

  const shipGrouped = useMemo(() => {
    // 거래처 -> (출고방식 -> count)
    const m = new Map<string, Map<ShipMethod, number>>();
    for (const r of shipRows) {
      if (!m.has(r.partner_name)) m.set(r.partner_name, new Map());
      const inner = m.get(r.partner_name)!;
      inner.set(r.ship_method, (inner.get(r.ship_method) ?? 0) + 1);
    }

    // 보기 좋게 정렬(거래처명 오름차순)
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "ko"))
      .map(([partner, inner]) => ({
        partner,
        methods: (["택배", "퀵", "기타"] as ShipMethod[])
          .map((k) => ({ ship_method: k, cnt: inner.get(k) ?? 0 }))
          .filter((x) => x.cnt > 0),
      }));
  }, [shipRows]);

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
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {msg}
          </div>
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

                // ✅ 다른 달(전/다음달)은 "완전 빈칸"으로(혼란 제거)
                if (!inMonth) {
                  return (
                    <div key={ds} className="min-h-[108px] border-t border-slate-200 bg-slate-50" />
                  );
                }

                const dayNum = d.getDate();

                const pub = memoMap.get(memoKey(ds, "PUBLIC"))?.content?.trim() ?? "";
                const adm = memoMap.get(memoKey(ds, "ADMIN"))?.content?.trim() ?? "";

                const shipInfo = shipAgg.get(ds);
                const shipCnt = shipInfo?.total ?? 0;

                const holidayName = holidays[ds] ?? "";
                const isToday = ds === todayStr;

                return (
                  <button
                    key={ds}
                    data-date={ds}
                    className={`min-h-[108px] border-t border-slate-200 p-3 text-left hover:bg-slate-50 bg-white
                      ${isToday ? "ring-2 ring-blue-500/30 bg-blue-50/40" : ""}
                    `}
                    onClick={() => openDayModal(ds)}
                    title="클릭해서 메모 추가/수정"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={`text-sm font-semibold ${dayColor(d)}`}>{dayNum}</div>

                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {holidayName ? (
                          <div className="truncate rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            {holidayName}
                          </div>
                        ) : null}

                        {isToday ? <span className={badge}>오늘</span> : null}
                      </div>
                    </div>

                    {/* ✅ 출고 표시 (orders) - 클릭하면 "거래처+출고방식" 목록 모달 */}
                    {shipCnt > 0 ? (
                      <button
                        type="button"
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs text-slate-800 hover:bg-slate-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          openShipModal(ds);
                        }}
                        title="클릭해서 출고 목록(거래처/출고방식) 확인"
                      >
                        출고{" "}
                        <span className="font-semibold tabular-nums">{shipCnt}</span>
                        건
                      </button>
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
            ※ 메모가 비어 있으면 표시하지 않습니다. · 날짜를 클릭하면 메모를 추가/수정/삭제할 수 있습니다. ·
            출고 건수는 <span className="font-semibold">orders.ship_date</span> 기준입니다.
          </div>
        </div>

        {/* 모달: 메모 */}
        {open ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-[900px] rounded-2xl border border-slate-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
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

              <div className="space-y-4 px-5 py-4">
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

        {/* ✅ 모달: 출고 목록(거래처 + 출고방식) */}
        {openShip ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
            onClick={() => setOpenShip(false)}
          >
            <div
              className="w-full max-w-[900px] rounded-2xl border border-slate-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">출고 목록 · {selShipDate}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    거래처별로 묶어서 출고방식(택배/퀵/기타) 건수를 표시합니다.
                  </div>
                </div>
                <button className={btn} onClick={() => setOpenShip(false)}>
                  닫기
                </button>
              </div>

              <div className="px-5 py-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={badge}>
                      총 <span className="tabular-nums">{shipSummary.total}</span>건
                    </span>
                    <span className={badgeShip}>
                      택배 <span className="tabular-nums">{shipSummary.byMethod["택배"]}</span>
                    </span>
                    <span className={badgeQuick}>
                      퀵 <span className="tabular-nums">{shipSummary.byMethod["퀵"]}</span>
                    </span>
                    <span className={badgeEtc}>
                      기타 <span className="tabular-nums">{shipSummary.byMethod["기타"]}</span>
                    </span>
                  </div>

                  {shipListLoading ? (
                    <div className="text-sm text-slate-600">불러오는 중...</div>
                  ) : shipListErr ? (
                    <div className="text-sm text-red-700">{shipListErr}</div>
                  ) : shipGrouped.length === 0 ? (
                    <div className="text-sm text-slate-600">출고 건이 없습니다.</div>
                  ) : (
                    <div className="space-y-2">
                      {shipGrouped.map((g) => (
                        <div key={g.partner} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="text-sm font-semibold text-slate-900">{g.partner}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {g.methods.map((m) => {
                              const cls =
                                m.ship_method === "택배"
                                  ? badgeShip
                                  : m.ship_method === "퀵"
                                  ? badgeQuick
                                  : badgeEtc;
                              return (
                                <span key={m.ship_method} className={cls}>
                                  {m.ship_method} <span className="tabular-nums">{m.cnt}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 text-xs text-slate-500">
                    ※ 집계/표시는 <span className="font-semibold">orders.ship_date</span> +{" "}
                    <span className="font-semibold">orders.ship_method</span> 기준이며, 거래처명은{" "}
                    <span className="font-semibold">orders.partner_id → partners.name</span> 조인으로 가져옵니다.
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}