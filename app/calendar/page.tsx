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

// ✅ 출고 방법(택배/퀵-신용/퀵-착불/방문/기타) 집계용 (orders.ship_method 기준)
type ShipMethod = "택배" | "퀵-신용" | "퀵-착불" | "방문" | "기타";

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
 * 대한민국 공휴일(간단 버전) + 회사 내부 고정 기념일
 * - 고정(양력): 1/1, 3/1, 5/5, 6/6, 8/15, 10/3, 10/9, 12/25
 * - ✅ 회사 고정 기념일: 1/2 창립기념일
 * - 2026년 음력 기반(하드코딩): 설날(2/16~2/18), 부처님오신날(5/24), 추석(9/24~9/26)
 * - 대체공휴일(간단): 2026년 기준으로 필요한 것만 반영
 */
function getKoreaHolidaysMap(year: number): Record<string, string> {
  const map: Record<string, string> = {};

  const fixed = [
    [`${year}-01-01`, "신정"],
    [`${year}-03-01`, "삼일절"],
    [`${year}-05-05`, "어린이날"],
    [`${year}-06-06`, "현충일"],
    [`${year}-08-15`, "광복절"],
    [`${year}-10-03`, "개천절"],
    [`${year}-10-09`, "한글날"],
    [`${year}-12-25`, "성탄절"],

    // ✅ 회사 고정 기념일(공휴일이 아니라 사내 휴무/표시용)
    [`${year}-01-02`, "창립기념일"],
  ];
  for (const [d, name] of fixed) map[d] = name;

  if (year === 2026) {
    map["2026-02-16"] = "설날(연휴)";
    map["2026-02-17"] = "설날";
    map["2026-02-18"] = "설날(연휴)";

    map["2026-05-24"] = "부처님오신날";
    map["2026-09-24"] = "추석(연휴)";
    map["2026-09-25"] = "추석";
    map["2026-09-26"] = "추석(연휴)";

    // ✅ 라벨 문구 개선: “삼일절 대체” → “대체공휴일(삼일절)”
    map["2026-03-02"] = "대체공휴일(삼일절)";
    map["2026-05-25"] = "대체공휴일(부처님오신날)";
    map["2026-08-17"] = "대체공휴일(광복절)";
    map["2026-10-05"] = "대체공휴일(개천절)";
  }

  return map;
}

function normalizeShipMethod(v: any): ShipMethod {
  const s = String(v ?? "").trim();
  if (!s) return "기타";
  if (s.includes("택배")) return "택배";

  // ✅ 퀵은 신용/착불을 먼저 분기
  if (s.includes("퀵-신용")) return "퀵-신용";
  if (s.includes("퀵-착불")) return "퀵-착불";

  // (fallback) 퀵 문자열만 있으면 기본 퀵-신용으로 분류(기존 데이터 호환)
  if (s.includes("퀵")) return "퀵-신용";

  if (s.includes("방문")) return "방문";
  return "기타";
}

// ✅ 모달/셀 출고표시에서 숨길 “판매 채널”
const HIDE_CUSTOMERS = new Set(["카카오플러스-판매", "네이버-판매", "쿠팡-판매"]);

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const todayStr = useMemo(() => ymd(new Date()), []);

  // ✅ 오늘 날짜 셀 포커싱
  const didFocusRef = useRef(false);

  // ✅ 관리자 여부(관리자 메모 노출/저장 제어)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // 테마: TradeClient와 동일 톤
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

  const badge =
    "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700";

  const badgeShip =
    "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700";
  const badgeQuick =
    "inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700";
  const badgeVisit =
    "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700";
  const badgeEtc =
    "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700";

  // ✅ 날짜 셀에서도 바로 쓰는 “송장엑셀” 버튼 스타일(추가)
  const btnMini =
    "rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50";

  const [msg, setMsg] = useState<string | null>(null);
  const [curMonth, setCurMonth] = useState(() => monthKey(new Date())); // ✅ 기본: 오늘이 속한 월

  const curMonthDate = useMemo(() => firstOfMonth(curMonth), [curMonth]);
  const days42 = useMemo(() => build42Days(curMonthDate), [curMonthDate]);

  const holidays = useMemo(() => getKoreaHolidaysMap(curMonthDate.getFullYear()), [curMonthDate]);

  // 메모(월 범위)
  const [memos, setMemos] = useState<CalendarMemoRow[]>([]);

  type ShipLine = {
    partner_id: string | null;
    partner_name: string;
    ship_method: ShipMethod;
    cnt: number;
    text: string;
  };

  // ✅ 출고 집계(월 범위) : date -> { total, methods, lines }
  const [shipAgg, setShipAgg] = useState<
    Map<
      string,
      {
        total: number;
        byMethod: Record<ShipMethod, number>;
        lines: ShipLine[]; // ✅ 셀에 표시할 출고 라인(줄단위)
      }
    >
  >(new Map());

  // 모달(날짜 클릭 - 메모)
  const [open, setOpen] = useState(false);
  const [selDate, setSelDate] = useState<string>("");

  const [publicText, setPublicText] = useState("");
  const [adminText, setAdminText] = useState("");
  const [saving, setSaving] = useState(false);

  // ✅ 모달(출고 클릭 - 출고 목록: 업체명-택배 형태)
  const [openShip, setOpenShip] = useState(false);
  const [selShipDate, setSelShipDate] = useState<string>("");

  const [shipListLoading, setShipListLoading] = useState(false);
  const [shipListErr, setShipListErr] = useState<string | null>(null);

  type ShipRow = { partner_id: string | null; partner_name: string; ship_method: ShipMethod };
  const [shipRows, setShipRows] = useState<ShipRow[]>([]);

  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingExcelDate, setDownloadingExcelDate] = useState<string | null>(null); // ✅ 추가(해당 날짜 버튼만 로딩)

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

  // ✅ 거래명세서 열기 + 인쇄 다이얼로그(= PDF 인쇄 화면) 자동 호출용 파라미터 추가
  function openSpec(partnerId: string | null, date: string) {
    if (!partnerId) return;
    if (!date) return;
    const url = `/tax/spec?partnerId=${encodeURIComponent(partnerId)}&from=${encodeURIComponent(
      date
    )}&to=${encodeURIComponent(date)}&autoprint=1`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function loadAll() {
    setMsg(null);

    // 1) calendar_memos
    {
      let q = supabase
        .from("calendar_memos")
        .select("id,memo_date,visibility,content,created_at,updated_at")
        .gte("memo_date", range.from)
        .lt("memo_date", range.to)
        .order("memo_date", { ascending: true });

      if (!isAdmin) {
        q = q.eq("visibility", "PUBLIC");
      }

      const { data, error } = await q;

      if (error) return setMsg(error.message);
      setMemos((data ?? []) as CalendarMemoRow[]);
    }

    // 2) orders 출고 집계 + ✅ 셀용 "출고 라인" 생성 (숨김 채널 제외)
    {
      const { data, error } = await supabase
        .from("orders")
        .select("ship_date,ship_method,customer_id,customer_name")
        .gte("ship_date", range.from)
        .lt("ship_date", range.to)
        .not("ship_date", "is", null);

      if (error) return setMsg(error.message);

      const map = new Map<
        string,
        { total: number; byMethod: Record<ShipMethod, number>; lines: ShipLine[] }
      >();

      const lineMapByDate = new Map<
        string,
        Map<string, { partner_id: string | null; partner: string; method: ShipMethod; cnt: number }>
      >();

      for (const r of (data ?? []) as any[]) {
        const d = String(r.ship_date ?? "").slice(0, 10);
        if (!d) continue;

        const customerName = String(r?.customer_name ?? "").trim() || "(거래처 미지정)";
        if (HIDE_CUSTOMERS.has(customerName)) continue;

        const partnerId = r?.customer_id == null ? null : String(r.customer_id);

        const method = normalizeShipMethod(r?.ship_method);

        const cur = map.get(d) ?? {
          total: 0,
          byMethod: { 택배: 0, "퀵-신용": 0, "퀵-착불": 0, 방문: 0, 기타: 0 },
          lines: [],
        };

        cur.total += 1;
        cur.byMethod[method] = (cur.byMethod[method] ?? 0) + 1;
        map.set(d, cur);

        const key = `${partnerId ?? ""}__${customerName}__${method}`;
        const lm =
          lineMapByDate.get(d) ??
          new Map<string, { partner_id: string | null; partner: string; method: ShipMethod; cnt: number }>();

        const prev = lm.get(key);
        if (prev) {
          prev.cnt += 1;
        } else {
          lm.set(key, { partner_id: partnerId, partner: customerName, method, cnt: 1 });
        }
        lineMapByDate.set(d, lm);
      }

      const methodOrder: Record<ShipMethod, number> = {
        택배: 0,
        "퀵-신용": 1,
        "퀵-착불": 2,
        방문: 3,
        기타: 4,
      };

      for (const [d, agg] of map.entries()) {
        const lm = lineMapByDate.get(d);
        if (!lm) continue;

        const lines = Array.from(lm.values()).map((x) => {
          const tail = x.cnt > 1 ? ` (${x.cnt})` : "";
          return {
            partner_id: x.partner_id,
            partner_name: x.partner,
            ship_method: x.method,
            cnt: x.cnt,
            text: `${x.partner}-${x.method}${tail}`,
          } as ShipLine;
        });

        lines.sort((a, b) => {
          const nameCmp = a.partner_name.localeCompare(b.partner_name, "ko");
          if (nameCmp !== 0) return nameCmp;
          return (methodOrder[a.ship_method] ?? 9) - (methodOrder[b.ship_method] ?? 9);
        });

        agg.lines = lines;
      }

      setShipAgg(map);
    }
  }

  // ✅ 현재 로그인 유저가 관리자(bonusmate@naver.com)인지 확인
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const email = (data?.user?.email ?? "").toLowerCase();
        if (!alive) return;
        setIsAdmin(email === "bonusmate@naver.com");
      } catch {
        if (!alive) return;
        setIsAdmin(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (isAdmin === null) return;
    didFocusRef.current = false;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curMonth, isAdmin]);

  // ✅ 월이 바뀌거나 처음 로드되면 "오늘" 셀에 포커싱
  useEffect(() => {
    if (didFocusRef.current) return;

    const isSameMonth = curMonth === monthKey(new Date());
    if (!isSameMonth) return;

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
    if (isAdmin) setAdminText(adm);
    else setAdminText("");

    setOpen(true);
  }

  async function openShipModal(date: string) {
    setMsg(null);
    setSelShipDate(date);

    setShipListErr(null);
    setShipListLoading(true);
    setShipRows([]);
    setOpenShip(true);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select("customer_id, customer_name, ship_method")
        .eq("ship_date", date);

      if (error) throw error;

      const rowsAll: ShipRow[] = ((data ?? []) as any[]).map((r) => {
        const customerName = String(r?.customer_name ?? "").trim() || "(거래처 미지정)";
        const method = normalizeShipMethod(r?.ship_method);
        const partnerId = r?.customer_id == null ? null : String(r.customer_id);
        return { partner_id: partnerId, partner_name: customerName, ship_method: method };
      });

      const rows = rowsAll.filter((r) => !HIDE_CUSTOMERS.has(r.partner_name));
      setShipRows(rows);
    } catch (e: any) {
      setShipListErr(e?.message ?? "출고 목록 조회 중 오류");
    } finally {
      setShipListLoading(false);
    }
  }

  const shipSummary = useMemo(() => {
    const total = shipRows.length;
    const byMethod: Record<ShipMethod, number> = { 택배: 0, "퀵-신용": 0, "퀵-착불": 0, 방문: 0, 기타: 0 };
    for (const r of shipRows) byMethod[r.ship_method] += 1;
    return { total, byMethod };
  }, [shipRows]);

  const shipLines = useMemo(() => {
    const m = new Map<
      string,
      { partner_id: string | null; partner: string; method: ShipMethod; cnt: number }
    >(); // key -> cnt
    for (const r of shipRows) {
      const key = `${r.partner_id ?? ""}__${r.partner_name}__${r.ship_method}`;
      const prev = m.get(key);
      if (prev) prev.cnt += 1;
      else m.set(key, { partner_id: r.partner_id, partner: r.partner_name, method: r.ship_method, cnt: 1 });
    }

    const lines = Array.from(m.values()).map((x) => {
      return { partner_id: x.partner_id, partner: x.partner, method: x.method, cnt: x.cnt };
    });

    const order: Record<ShipMethod, number> = { 택배: 0, "퀵-신용": 1, "퀵-착불": 2, 방문: 3, 기타: 4 };
    lines.sort((a, b) => {
      const nameCmp = a.partner.localeCompare(b.partner, "ko");
      if (nameCmp !== 0) return nameCmp;
      return (order[a.method] ?? 9) - (order[b.method] ?? 9);
    });

    return lines;
  }, [shipRows]);

  // ✅ “해당 날짜 전체 출고”를 송장(택배 양식) 엑셀로 다운로드
  async function downloadShipExcel(date: string) {
    if (!date) return;
    setDownloadingExcel(true);
    setDownloadingExcelDate(date);
    setMsg(null);

    try {
      const res = await fetch(`/api/shipments/excel?date=${encodeURIComponent(date)}`, {
        method: "GET",
      });

      if (!res.ok) {
        let errText = "엑셀 다운로드 실패";
        try {
          const j = await res.json();
          if (j?.error) errText = j.error;
        } catch {}
        throw new Error(errText);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      // 파일명만 사용자 표시용으로 “송장” 느낌으로 변경(내용/기능은 동일)
      a.download = `송장_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setMsg(e?.message ?? "엑셀 다운로드 중 오류");
    } finally {
      setDownloadingExcel(false);
      setDownloadingExcelDate(null);
    }
  }

  // ✅ 메모 저장/삭제는 서버 API로 처리 (RLS 이슈 회피)
  async function upsertMemo(date: string, vis: Visibility, content: string) {
    const trimmed = content.trim();

    const res = await fetch("/api/calendar/memo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memo_date: date,
        visibility: vis,
        content: trimmed, // 빈 문자열이면 서버에서 삭제 처리
      }),
    });

    if (!res.ok) {
      let errText = "메모 저장 실패";
      try {
        const j = await res.json();
        if (j?.error) errText = j.error;
      } catch {}
      throw new Error(errText);
    }
  }

  async function saveModal() {
    if (!selDate) return;
    setSaving(true);
    setMsg(null);
    try {
      await upsertMemo(selDate, "PUBLIC", publicText);
      if (isAdmin) {
        await upsertMemo(selDate, "ADMIN", adminText);
      }
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

    if (isHoliday) return "text-red-600";
    if (dow === 0) return "text-red-600";
    if (dow === 6) return "text-blue-600";
    return "text-slate-900";
  }

  function weekdayHeaderColor(idx: number) {
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
              <button className={btn} onClick={() => setCurMonth(monthKey(new Date()))}>
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
              <button className={btnOn} onClick={loadAll} disabled={isAdmin === null}>
                새로고침
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <div className="grid grid-cols-7 bg-slate-50 text-xs font-semibold">
              {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
                <div key={w} className={`px-3 py-2 ${weekdayHeaderColor(i)}`}>
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days42.map((d) => {
                const ds = ymd(d);
                const inMonth = d.getMonth() === curMonthDate.getMonth();

                if (!inMonth) {
                  return <div key={ds} className="min-h-[108px] border-t border-slate-200 bg-slate-50" />;
                }

                const dayNum = d.getDate();

                const pub = memoMap.get(memoKey(ds, "PUBLIC"))?.content?.trim() ?? "";
                const adm = memoMap.get(memoKey(ds, "ADMIN"))?.content?.trim() ?? "";

                const shipInfo = shipAgg.get(ds);
                const shipCnt = shipInfo?.total ?? 0;
                const shipLinesInCell = shipInfo?.lines ?? [];

                const holidayName = holidays[ds] ?? "";
                const isToday = ds === todayStr;

                const isDownloadingThisDay = downloadingExcel && downloadingExcelDate === ds;

                return (
                  <button
                    key={ds}
                    data-date={ds}
                    className={`relative min-h-[108px] border-t border-slate-200 p-3 pt-8 text-left hover:bg-slate-50 bg-white ${
                      isToday ? "bg-blue-100/60 ring-2 ring-blue-500/40" : ""
                    }`}
                    onClick={() => openDayModal(ds)}
                    title="클릭해서 메모 추가/수정"
                  >
                    {/* ✅ 날짜(일자 숫자) 좌상단 고정 + ✅ 공휴일/기념일 배지를 날짜 옆에 바로 붙임 */}
                    <div className="absolute left-3 top-2 flex items-center gap-1">
                      <div className={`text-sm font-semibold ${dayColor(d)}`}>{dayNum}</div>
                      {holidayName ? (
                        <div className="truncate rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          {holidayName}
                        </div>
                      ) : null}
                    </div>

                    {/* 우상단 배지(오늘) */}
                    <div className="absolute right-3 top-2 flex flex-wrap items-center justify-end gap-1">
                      {isToday ? <span className={badge}>오늘</span> : null}
                    </div>

                    {/* ✅ 출고가 제일 위(메모보다 위), 줄단위 */}
                    {shipCnt > 0 ? (
                      <div
                        className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          openShipModal(ds);
                        }}
                        title="클릭해서 출고 목록(업체명-출고방식) 확인"
                        role="button"
                      >
                        {/* ✅ 여기: 날짜 셀에서 바로 “송장 엑셀(해당 날짜 전체)” 다운로드 버튼 추가 */}
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold text-slate-800">
                            출고 <span className="tabular-nums">{shipCnt}</span>건
                          </div>

                          <button
                            type="button"
                            className={btnMini}
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadShipExcel(ds);
                            }}
                            disabled={isDownloadingThisDay}
                            title="해당 날짜 출고 예정 전체를 송장(택배 양식) 엑셀로 다운로드"
                          >
                            {isDownloadingThisDay ? "생성중..." : "송장엑셀"}
                          </button>
                        </div>

                        <div className="space-y-0.5">
                          {shipLinesInCell.slice(0, 6).map((x, idx) => (
                            <button
                              key={`${ds}__shipline__${idx}`}
                              type="button"
                              className="block w-full truncate text-left text-[11px] text-slate-800 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSpec(x.partner_id, ds);
                              }}
                              title="클릭하면 당일 거래명세서(인쇄창까지) 출력"
                            >
                              {x.text}
                            </button>
                          ))}
                          {shipLinesInCell.length > 6 ? (
                            <div className="text-[11px] text-slate-500">외 {shipLinesInCell.length - 6}건…</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {/* 메모는 출고 아래 */}
                    {pub ? (
                      <div className="mt-2 truncate text-[11px] text-slate-700">
                        <span className="font-semibold text-slate-900">공개</span>: {pub}
                      </div>
                    ) : null}

                    {isAdmin && adm ? (
                      <div className="mt-1 truncate text-[11px] text-slate-700">
                        <span className="font-semibold text-slate-900">관리</span>: {adm}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            ※ 메모가 비어 있으면 표시하지 않습니다. · 날짜를 클릭하면 메모를 추가/수정/삭제할 수 있습니다. · 출고는{" "}
            <span className="font-semibold">orders.ship_date</span> +{" "}
            <span className="font-semibold">orders.ship_method</span> 기준이며,{" "}
            <span className="font-semibold">카카오플러스-판매/네이버-판매/쿠팡-판매</span>는 제외합니다.
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

                {isAdmin ? (
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
                ) : null}

                <div className="text-xs text-slate-500">
                  출고 건수는 <span className="font-semibold">orders.ship_date</span> 기준으로 자동 표시됩니다.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* 모달: 출고 목록 */}
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
                    업체명-출고방식(택배/퀵-신용/퀵-착불/방문/기타) 형태로 표시합니다.
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className={btnOn}
                    onClick={() => downloadShipExcel(selShipDate)}
                    disabled={downloadingExcel || !selShipDate}
                    title="해당 날짜 출고 목록을 엑셀로 다운로드"
                  >
                    {downloadingExcel ? "엑셀 생성중..." : "엑셀 다운로드"}
                  </button>
                  <button className={btn} onClick={() => setOpenShip(false)} disabled={downloadingExcel}>
                    닫기
                  </button>
                </div>
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
                      퀵-신용 <span className="tabular-nums">{shipSummary.byMethod["퀵-신용"]}</span>
                    </span>
                    <span className={badgeQuick}>
                      퀵-착불 <span className="tabular-nums">{shipSummary.byMethod["퀵-착불"]}</span>
                    </span>
                    <span className={badgeVisit}>
                      방문 <span className="tabular-nums">{shipSummary.byMethod["방문"]}</span>
                    </span>
                    <span className={badgeEtc}>
                      기타 <span className="tabular-nums">{shipSummary.byMethod["기타"]}</span>
                    </span>
                  </div>

                  {shipListLoading ? (
                    <div className="text-sm text-slate-600">불러오는 중...</div>
                  ) : shipListErr ? (
                    <div className="text-sm text-red-700">{shipListErr}</div>
                  ) : shipLines.length === 0 ? (
                    <div className="text-sm text-slate-600">출고 건이 없습니다.</div>
                  ) : (
                    <div className="space-y-2">
                      {shipLines.map((x) => (
                        <div
                          key={`${x.partner_id ?? ""}__${x.partner}__${x.method}`}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                        >
                          <button
                            type="button"
                            className="text-left text-sm font-semibold text-slate-900 hover:underline"
                            onClick={() => openSpec(x.partner_id, selShipDate)}
                            title="클릭하면 당일 거래명세서(인쇄창까지) 출력"
                          >
                            {x.partner} - {x.method}
                            {x.cnt > 1 ? ` (${x.cnt})` : ""}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 text-xs text-slate-500">
                    ※ 엑셀 다운로드는 <span className="font-semibold">order_shipments 기준</span>으로 생성됩니다. (배송지 2개면 2줄) · 제품명은{" "}
                    <span className="font-semibold">order_lines를 합쳐 1칸</span>에 출력합니다. ·{" "}
                    <span className="font-semibold">카카오플러스-판매/네이버-판매/쿠팡-판매</span>는 숨김 처리됩니다.
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