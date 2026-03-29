// app/calendar/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

import type { RealtimeChannel } from "@supabase/supabase-js";

type NewWoNotification = {
  id: string; client_name: string; product_name: string;
  work_order_no: string; order_date: string; created_at: string;
};

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [
      { freq: 523.25, start: 0.0, dur: 0.15 },
      { freq: 659.25, start: 0.18, dur: 0.15 },
      { freq: 783.99, start: 0.36, dur: 0.25 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur + 0.05);
    });
  } catch (e) { console.warn("알림음 재생 실패:", e); }
}

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
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const dow = first.getDay();
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
  if (s.includes("퀵") && (s.includes("착불") || s.includes("후불"))) return "퀵-착불";
  if (s.includes("퀵") && (s.includes("신용") || s.includes("선불") || s.includes("카드"))) return "퀵-신용";
  if (s.includes("퀵")) return "퀵-신용";
  if (s.includes("방문")) return "방문";
  return "기타";
}


export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const todayStr = useMemo(() => ymd(new Date()), []);

  const didFocusRef = useRef(false);

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
  const badgeQuickCredit =
    "inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700";
  const badgeQuickCod =
    "inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-700";
  const badgeVisit =
    "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700";
  const badgeEtc =
    "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700";
  const btnMini =
    "rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50";

  const [msg, setMsg] = useState<string | null>(null);

  const [newWoNotifications, setNewWoNotifications] = useState<NewWoNotification[]>([]);
const [showNewWoModal, setShowNewWoModal] = useState(false);
const insertChannelRef = useRef<RealtimeChannel | null>(null);
const pageLoadTimeRef = useRef<string>(new Date().toISOString());

useEffect(() => {
  const channel = supabase
    .channel("wo_calendar_insert_notify")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "work_orders" }, (payload) => {
      const d = payload.new as Record<string, unknown>;
      const createdAt = String(d.created_at ?? "");
      if (createdAt && createdAt < pageLoadTimeRef.current) return;
      setNewWoNotifications((prev) => [{ id: String(d.id ?? ""), client_name: String(d.client_name ?? ""), product_name: String(d.product_name ?? ""), work_order_no: String(d.work_order_no ?? ""), order_date: String(d.order_date ?? ""), created_at: createdAt }, ...prev]);
      setShowNewWoModal(true);
      playNotificationSound();
    })
    .subscribe((status, err) => { console.log("🔔 [calendar INSERT채널]", status, err ?? ""); });
  insertChannelRef.current = channel;
  return () => { supabase.removeChannel(channel); insertChannelRef.current = null; };
}, []); // eslint-disable-line

  const [curMonth, setCurMonth] = useState(() => monthKey(new Date()));

  const curMonthDate = useMemo(() => firstOfMonth(curMonth), [curMonth]);
  const days42 = useMemo(() => build42Days(curMonthDate), [curMonthDate]);
  const holidays = useMemo(() => getKoreaHolidaysMap(curMonthDate.getFullYear()), [curMonthDate]);

  const [memos, setMemos] = useState<CalendarMemoRow[]>([]);

  type ShipLine = {
    partner_id: string | null;
    partner_name: string;
    ship_method: ShipMethod;
    cnt: number;
    text: string;
  };

  const [shipAgg, setShipAgg] = useState<
    Map<string, { total: number; byMethod: Record<ShipMethod, number>; lines: ShipLine[] }>
  >(new Map());

  const [open, setOpen] = useState(false);
  const [selDate, setSelDate] = useState<string>("");
  const [publicText, setPublicText] = useState("");
  const [adminText, setAdminText] = useState("");
  const [saving, setSaving] = useState(false);

  const [openShip, setOpenShip] = useState(false);
  const [selShipDate, setSelShipDate] = useState<string>("");
  const [shipListLoading, setShipListLoading] = useState(false);
  const [shipListErr, setShipListErr] = useState<string | null>(null);

  type ShipRow = { partner_id: string | null; partner_name: string; ship_method: ShipMethod };
  const [shipRows, setShipRows] = useState<ShipRow[]>([]);

  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingExcelDate, setDownloadingExcelDate] = useState<string | null>(null);

  // ✅ 일괄출력 관련 상태
  const [bulkPrintSelected, setBulkPrintSelected] = useState<Set<string>>(new Set());
  const [bulkPrinting, setBulkPrinting] = useState(false);

  // ✅ 인쇄용 명세서 데이터
  type SpecLine = { itemName: string; qty: number; unitPrice: number; supply: number; vat: number; total: number };
  type BulkSpecPartner = {
    partnerId: string;
    partnerName: string;
    businessNo: string;
    ceoName: string;
    address1: string;
    bizType: string;
    bizItem: string;
    lines: SpecLine[];
    sumSupply: number;
    sumVat: number;
    sumTotal: number;
  };
  const [bulkSpecData, setBulkSpecData] = useState<BulkSpecPartner[]>([]);
  const [bulkSpecLoading, setBulkSpecLoading] = useState(false);
  const [bulkSpecDate, setBulkSpecDate] = useState("");

  const OUR = {
    name: "주식회사 보누스메이트",
    business_no: "343-88-03009",
    ceo: "조대성",
    address1: "경기도 파주시 광탄면 장지산로 250-90 1층",
    biz: "제조업 / 업태: 식품제조가공업",
  };

  const range = useMemo(() => {
    const yyyy = curMonthDate.getFullYear();
    const mm = curMonthDate.getMonth();
    const from = new Date(yyyy, mm, 1);
    const to = new Date(yyyy, mm + 1, 1);
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

  useEffect(() => {
    document.title = "BONUSMATE ERP 출고캘린더";
  }, []);

  function openSpec(partnerId: string | null, date: string) {
    if (!partnerId) return;
    if (!date) return;
    const url = `/tax/spec?partnerId=${encodeURIComponent(partnerId)}&from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}&autoprint=1`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function loadAll() {
    setMsg(null);

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

    {
      const { data, error } = await supabase
        .from("orders")
        .select("ship_date,ship_method,customer_id,customer_name")
        .gte("ship_date", range.from)
        .lt("ship_date", range.to)
        .not("ship_date", "is", null);

      if (error) return setMsg(error.message);

      const map = new Map<string, { total: number; byMethod: Record<ShipMethod, number>; lines: ShipLine[] }>();
      const lineMapByDate = new Map<
        string,
        Map<string, { partner_id: string | null; partner: string; method: ShipMethod; cnt: number }>
      >();

      for (const r of (data ?? []) as any[]) {
        const d = String(r.ship_date ?? "").slice(0, 10);
        if (!d) continue;

        const customerName = String(r?.customer_name ?? "").trim() || "(거래처 미지정)";
        const method = normalizeShipMethod(r?.ship_method);

       const partnerId = r?.customer_id == null ? null : String(r.customer_id);

        const cur = map.get(d) ?? {
          total: 0,
          byMethod: { 택배: 0, "퀵-신용": 0, "퀵-착불": 0, 방문: 0, 기타: 0 },
          lines: [],
        };

        cur.total += 1;
        cur.byMethod[method] = (cur.byMethod[method] ?? 0) + 1;
        map.set(d, cur);

        const key = `${partnerId ?? ""}__${customerName}__${method}`;
        const lm = lineMapByDate.get(d) ?? new Map();
        const prev = lm.get(key);
        if (prev) {
          prev.cnt += 1;
        } else {
          lm.set(key, { partner_id: partnerId, partner: customerName, method, cnt: 1 });
        }
        lineMapByDate.set(d, lm);
      }

      const methodOrder: Record<ShipMethod, number> = { 택배: 0, "퀵-신용": 1, "퀵-착불": 2, 방문: 3, 기타: 4 };

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

  useEffect(() => {
    didFocusRef.current = false;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curMonth]);

  useEffect(() => {
    if (didFocusRef.current) return;
    const isSameMonth = curMonth === monthKey(new Date());
    if (!isSameMonth) return;
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLButtonElement>(`button[data-date="${todayStr}"]`);
      if (el) { el.focus(); didFocusRef.current = true; }
    }, 0);
    return () => window.clearTimeout(t);
  }, [curMonth, todayStr]);

  function openDayModal(date: string) {
    setMsg(null);
    setSelDate(date);
    setPublicText(memoMap.get(memoKey(date, "PUBLIC"))?.content ?? "");
    setAdminText(memoMap.get(memoKey(date, "ADMIN"))?.content ?? "");
    setOpen(true);
  }

  async function openShipModal(date: string) {
    setMsg(null);
    setSelShipDate(date);
    setShipListErr(null);
    setShipListLoading(true);
    setShipRows([]);
    setOpenShip(true);
    // ✅ 모달 열릴 때 기본적으로 전체 선택
    setBulkPrintSelected(new Set());

    try {
      const { data, error } = await supabase
        .from("orders")
        .select("customer_id, customer_name, ship_method")
        .eq("ship_date", date);

      if (error) throw error;

      const rowsAll: ShipRow[] = ((data ?? []) as any[]).map((r) => ({
        partner_id: r?.customer_id == null ? null : String(r.customer_id),
        partner_name: String(r?.customer_name ?? "").trim() || "(거래처 미지정)",
        ship_method: normalizeShipMethod(r?.ship_method),
      }));
      
      setShipRows(rowsAll);

      // ✅ partner_id가 있는 거래처만 일괄출력 대상 → 기본 전체 선택
      const printableIds = new Set(
        rowsAll.filter((r) => r.partner_id).map((r) => r.partner_id as string)  // ← rowsAll로 변경
      );  

      setBulkPrintSelected(printableIds);
    } catch (e: any) {
      setShipListErr(e?.message ?? "출고 목록 조회 중 오류");
    } finally {
      setShipListLoading(false);
    }
  }

  // ✅ 일괄출력: 선택 거래처 데이터 로드 후 캘린더 페이지에서 직접 window.print()
  async function doBulkPrint() {
    if (bulkPrintSelected.size === 0) {
      setMsg("출력할 거래처를 1개 이상 선택하세요.");
      return;
    }

    setBulkPrinting(true);
    setBulkSpecLoading(true);
    setBulkSpecDate(selShipDate);
    setBulkSpecData([]);

    try {
      const ids = Array.from(bulkPrintSelected);

      // 1) 거래처 정보 조회
      const { data: partnerData, error: pErr } = await supabase
        .from("partners")
        .select("id,name,business_no,ceo_name,address1,biz_type,biz_item")
        .in("id", ids);
      if (pErr) throw pErr;

      const partnerMap = new Map<string, any>();
      for (const p of (partnerData ?? [])) partnerMap.set(String(p.id), p);

      // 2) 주문 조회
      const { data: orderData, error: oErr } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name")
        .eq("ship_date", selShipDate)
        .in("customer_id", ids);
      if (oErr) throw oErr;

      const orderIds = (orderData ?? []).map((o: any) => String(o.id));
      const orderToPartner = new Map<string, string>();
      for (const o of (orderData ?? [])) orderToPartner.set(String(o.id), String(o.customer_id));

      // 3) 주문 라인 조회
      const { data: lineData, error: lErr } = await supabase
        .from("order_lines")
        .select("*")
        .in("order_id", orderIds)
        .order("order_id", { ascending: true });
      if (lErr) throw lErr;

      // 4) 거래처별 집계
      const partnerLines = new Map<string, SpecLine[]>();
      for (const id of ids) partnerLines.set(id, []);

      for (const row of (lineData ?? []) as any[]) {
        const pid = orderToPartner.get(String(row.order_id));
        if (!pid) continue;
        // spec-client.tsx의 pickString/pickNumber 동일 로직
        const name = String(row.item_name ?? row.product_name ?? row.variant_name ?? row.name ?? row.title ?? "").trim();
        if (!name) continue;
        const qty = Number(row.qty ?? row.quantity ?? row.ea ?? 0);
        const supply = Number(row.supply_amount ?? row.supply ?? 0);
        const vat = Number(row.vat_amount ?? row.vat ?? 0);
        const total = Number(row.total_amount ?? row.total ?? row.line_total ?? 0);
        let unitPrice = Number(row.unit_price ?? row.price ?? row.unitPrice ?? 0);
        if (unitPrice === 0 && qty > 0 && supply > 0) unitPrice = Math.round(supply / qty);

        const arr = partnerLines.get(pid) ?? [];
        // 같은 품목+단가 합산
        const existing = arr.find(l => l.itemName === name && l.unitPrice === unitPrice);
        if (existing) {
          existing.qty += qty;
          existing.supply += supply;
          existing.vat += vat;
          existing.total += total;
        } else {
          arr.push({ itemName: name, qty, unitPrice, supply, vat, total });
        }
        partnerLines.set(pid, arr);
      }

      // 5) 최종 데이터 조합
      const result: BulkSpecPartner[] = ids
        .filter(id => (partnerLines.get(id) ?? []).length > 0)
        .map(id => {
          const p = partnerMap.get(id) ?? {};
          const lines = partnerLines.get(id) ?? [];
          const sumSupply = lines.reduce((a, l) => a + l.supply, 0);
          const sumVat = lines.reduce((a, l) => a + l.vat, 0);
          const sumTotal = lines.reduce((a, l) => a + l.total, 0);
          return {
            partnerId: id,
            partnerName: String(p.name ?? ""),
            businessNo: String(p.business_no ?? ""),
            ceoName: String(p.ceo_name ?? ""),
            address1: String(p.address1 ?? ""),
            bizType: String(p.biz_type ?? ""),
            bizItem: String(p.biz_item ?? ""),
            lines,
            sumSupply,
            sumVat,
            sumTotal,
          };
        });

      setBulkSpecData(result);

      // 데이터 렌더링 후 인쇄
      await new Promise(r => setTimeout(r, 300));
      window.print();
    } catch (e: any) {
      setMsg(e?.message ?? "일괄출력 오류");
    } finally {
      setBulkPrinting(false);
      setBulkSpecLoading(false);
    }
  }

  const shipSummary = useMemo(() => {
    const total = shipRows.length;
    const byMethod: Record<ShipMethod, number> = { 택배: 0, "퀵-신용": 0, "퀵-착불": 0, 방문: 0, 기타: 0 };
    for (const r of shipRows) byMethod[r.ship_method] += 1;
    return { total, byMethod };
  }, [shipRows]);

  const shipLines = useMemo(() => {
    const m = new Map<string, { partner_id: string | null; partner: string; method: ShipMethod; cnt: number }>();
    for (const r of shipRows) {
      const key = `${r.partner_id ?? ""}__${r.partner_name}__${r.ship_method}`;
      const prev = m.get(key);
      if (prev) prev.cnt += 1;
      else m.set(key, { partner_id: r.partner_id, partner: r.partner_name, method: r.ship_method, cnt: 1 });
    }
    const lines = Array.from(m.values());
    const order: Record<ShipMethod, number> = { 택배: 0, "퀵-신용": 1, "퀵-착불": 2, 방문: 3, 기타: 4 };
    lines.sort((a, b) => {
      const nameCmp = a.partner.localeCompare(b.partner, "ko");
      if (nameCmp !== 0) return nameCmp;
      return (order[a.method] ?? 9) - (order[b.method] ?? 9);
    });
    return lines;
  }, [shipRows]);

  // ✅ 일괄출력 가능한 거래처(partner_id 있는 것만)
  const printableLines = useMemo(
    () => shipLines.filter((x) => x.partner_id),
    [shipLines]
  );

  async function downloadShipExcel(date: string) {
    if (!date) return;
    setDownloadingExcel(true);
    setDownloadingExcelDate(date);
    setMsg(null);

    try {
      const res = await fetch(`/api/shipments/excel?date=${encodeURIComponent(date)}`, { method: "GET" });

      if (!res.ok) {
        let errText = `엑셀 다운로드 실패 (HTTP ${res.status})`;
        try {
          const txt = await res.text();
          try {
            const j = JSON.parse(txt);
            if (j?.error) errText = j.error;
            else if (txt) errText = txt;
          } catch { if (txt) errText = txt; }
        } catch {}
        throw new Error(errText);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
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

  async function upsertMemo(date: string, vis: Visibility, content: string) {
    const existing = memoMap.get(memoKey(date, vis));
    const trimmed = content.trim();

    if (!trimmed) {
      if (!existing) return;
      const { error } = await supabase.from("calendar_memos").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return;
    }

    if (!existing) {
      const { error } = await supabase.from("calendar_memos").insert({ memo_date: date, visibility: vis, content: trimmed, created_by: null });
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
      try {
        await upsertMemo(selDate, "ADMIN", adminText);
      } catch (e: any) {
        throw new Error(e?.message ?? "관리자 메모 저장 실패");
      }
      setOpen(false);
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? "메모 저장 실패");
    } finally {
      setSaving(false);
    }
  }

  function dayColor(dateObj: Date) {
    const dow = dateObj.getDay();
    const dateStr = ymd(dateObj);
    if (!!holidays[dateStr]) return "text-red-600";
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

  const fmtMoney = (n: number) => Number(n ?? 0).toLocaleString("ko-KR");

  return (
    <div className={`${pageBg} min-h-screen`}>
      {showNewWoModal && newWoNotifications.length > 0 && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-[480px] rounded-2xl border border-orange-200 bg-white shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-orange-500 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl animate-bounce">🔔</span>
          <div><div className="text-base font-bold text-white">새 작업지시서 도착!</div><div className="text-xs text-orange-100">새 주문이 등록됐습니다</div></div>
        </div>
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-bold text-white">{newWoNotifications.length}건</span>
      </div>
      <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100">
        {newWoNotifications.map((n, idx) => (
          <div key={n.id} className="px-5 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-800 truncate">{n.client_name}</div>
                <div className="text-sm text-slate-600 truncate mt-0.5">{n.product_name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="text-[11px] text-slate-400 font-mono">{n.work_order_no}</span>
                  <span className="text-[11px] text-slate-400">· 주문일 {n.order_date}</span>
                </div>
              </div>
              {idx === 0 && <span className="shrink-0 rounded-full bg-orange-100 border border-orange-200 px-2 py-0.5 text-[11px] font-semibold text-orange-700">NEW</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
        <button className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600" onClick={() => { setShowNewWoModal(false); setNewWoNotifications([]); }}>확인 ({newWoNotifications.length}건)</button>
        <button className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setShowNewWoModal(false)}>나중에</button>
      </div>
    </div>
  </div>
)}
      {/* ✅ 인쇄용 CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #bulk-print-area, #bulk-print-area * { visibility: visible !important; }
          #bulk-print-area {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
          }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .bulk-print-page { page-break-after: always; }
          .bulk-print-page:last-child { page-break-after: auto; }
        }
        #bulk-print-area { display: none; }
        @media print { #bulk-print-area { display: block !important; } }
      `}</style>

      {/* ✅ 인쇄용 숨김 영역 - 거래처별 명세서 */}
      <div id="bulk-print-area">
        {bulkSpecData.map((p) => (
          <div key={p.partnerId} className="bulk-print-page" style={{ padding: "24px", fontFamily: "sans-serif" }}>
            <div style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "16px" }}>
              거래명세서 {bulkSpecDate.replaceAll("-", "/")}
            </div>

            {/* 양측 정보 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
              <div style={{ fontSize: "13px", lineHeight: "1.8" }}>
                <div style={{ fontWeight: "bold" }}>{p.partnerName}</div>
                <div>{p.businessNo}</div>
                <div>대표: {p.ceoName}</div>
                <div>주소: {p.address1}</div>
                <div>업종: {p.bizType} / 업태: {p.bizItem}</div>
              </div>
              <div style={{ fontSize: "13px", lineHeight: "1.8", textAlign: "right" }}>
  <div style={{ fontWeight: "bold" }}>{OUR.name}</div>
  <div>{OUR.business_no}</div>
  <div style={{ position: "relative", display: "inline-block", paddingRight: "52px" }}>
    대표: {OUR.ceo}
    <img
      src="/stamp.png"
      alt="stamp"
      style={{
        position: "absolute",
        right: 0,
        top: "-6px",
        width: "48px",
        height: "48px",
        opacity: 0.9,
        pointerEvents: "none",
      }}
    />
  </div>
  <div>주소: {OUR.address1}</div>
  <div>{OUR.biz}</div>
</div>
            </div>

            {/* 품목 테이블 */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", marginBottom: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["품목", "수량", "단가", "공급가", "부가세", "합계"].map((h, i) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: i === 0 ? "left" : "right", fontWeight: "600", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.lines.map((l, idx) => (
                    <tr key={idx} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 12px" }}>{l.itemName}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtMoney(l.qty)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtMoney(l.unitPrice)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: "600" }}>{fmtMoney(l.supply)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtMoney(l.vat)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: "600" }}>{fmtMoney(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 합계 */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", minWidth: "260px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span style={{ color: "#64748b" }}>공급가</span>
                  <span style={{ fontWeight: "600" }}>{fmtMoney(p.sumSupply)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span style={{ color: "#64748b" }}>부가세</span>
                  <span style={{ fontWeight: "600" }}>{fmtMoney(p.sumVat)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "1px solid #e2e8f0", marginTop: "4px" }}>
                  <span style={{ fontWeight: "bold" }}>합계</span>
                  <span style={{ fontWeight: "bold", fontSize: "15px" }}>{fmtMoney(p.sumTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
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
              <button className={btn} onClick={() => setCurMonth(monthKey(addMonths(curMonthDate, -1)))}>◀ 이전달</button>
              <button className={btn} onClick={() => setCurMonth(monthKey(new Date()))}>오늘</button>
              <button className={btn} onClick={() => setCurMonth(monthKey(addMonths(curMonthDate, 1)))}>다음달 ▶</button>
              <button className={btnOn} onClick={loadAll}>새로고침</button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <div className="grid grid-cols-7 bg-slate-50 text-xs font-semibold">
              {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
                <div key={w} className={`px-3 py-2 ${weekdayHeaderColor(i)}`}>{w}</div>
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
                const pubItems = pub ? pub.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [];
                const admItems = adm ? adm.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [];

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
                    <div className="absolute left-3 top-2 flex items-center gap-1">
                      <div className={`text-sm font-semibold ${dayColor(d)}`}>{dayNum}</div>
                      {holidayName ? (
                        <div className="truncate rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          {holidayName}
                        </div>
                      ) : null}
                    </div>

                    <div className="absolute right-3 top-2 flex flex-wrap items-center justify-end gap-1">
                      {isToday ? <span className={badge}>오늘</span> : null}
                    </div>

                    {shipCnt > 0 ? (
                      <div
                        className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1"
                        onClick={(e) => { e.stopPropagation(); openShipModal(ds); }}
                        role="button"
                        title="클릭해서 출고 목록 확인"
                      >
                        <div className="mb-1 flex items-center justify-between gap-1 flex-wrap">
                          <div className="text-[11px] font-semibold text-slate-800">
                            출고 <span className="tabular-nums">{shipCnt}</span>건
                          </div>
                          <div className="flex gap-1">
                            {/* ✅ 명세서 일괄출력 버튼 - 눈에 잘 띄게 */}
                            <button
                              type="button"
                              className="rounded-lg border border-blue-400 bg-blue-500 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-blue-600 active:bg-blue-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShipModal(ds);
                              }}
                              title="거래명세서 일괄출력"
                            >
                              명세서
                            </button>
                            <button
                              type="button"
                              className={btnMini}
                              onClick={(e) => { e.stopPropagation(); downloadShipExcel(ds); }}
                              disabled={isDownloadingThisDay}
                            >
                              {isDownloadingThisDay ? "생성중..." : "송장엑셀"}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          {shipLinesInCell.slice(0, 6).map((x, idx) => (
                            <button
                              key={`${ds}__shipline__${idx}`}
                              type="button"
                              className="block w-full truncate text-left text-[11px] text-slate-800 hover:underline"
                              onClick={(e) => { e.stopPropagation(); openSpec(x.partner_id, ds); }}
                              title="클릭하면 당일 거래명세서 출력"
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

                    {pubItems.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {pubItems.map((t, i) => (
                          <div key={`${ds}__pub__${i}`} className="truncate rounded-md border border-yellow-200 bg-yellow-50 px-2 py-1 text-[11px] text-slate-900" title={t}>{t}</div>
                        ))}
                      </div>
                    ) : null}

                    {admItems.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {admItems.map((t, i) => (
                          <div key={`${ds}__adm__${i}`} className="truncate rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] text-slate-900" title={t}>{t}</div>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            ※ 날짜를 클릭하면 메모를 추가/수정/삭제할 수 있습니다. · 출고는 <span className="font-semibold">orders.ship_date</span> 기준이며, 모든 거래처의 출고가 표시됩니다.
          </div>
        </div>

        {/* 모달: 메모 */}
        {open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-[900px] rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">메모 · {selDate}</div>
                  <div className="mt-1 text-xs text-slate-500">비우고 저장하면 삭제됩니다.</div>
                </div>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => setOpen(false)} disabled={saving}>닫기</button>
                  <button className={btnOn} onClick={saveModal} disabled={saving}>{saving ? "저장중..." : "저장"}</button>
                </div>
              </div>
              <div className="space-y-4 px-5 py-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-semibold">공개 메모 (전원)</div>
                  <textarea className={`${input} min-h-[110px] resize-y`} value={publicText} onChange={(e) => setPublicText(e.target.value)} placeholder="예: 2/2 대량 출고 / 택배 마감 16시" />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-semibold">관리자 메모 (관리자만)</div>
                  <textarea className={`${input} min-h-[110px] resize-y`} value={adminText} onChange={(e) => setAdminText(e.target.value)} placeholder="예: 내부 생산/인원 배치/특이사항" />
                  <div className="mt-2 text-xs text-slate-500">※ 권한이 없으면 RLS로 인해 ADMIN 메모는 저장/조회되지 않습니다.</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ✅ 모달: 출고 목록 + 일괄출력 */}
        {openShip ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpenShip(false)}>
            <div className="w-full max-w-[900px] rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">출고 목록 · {selShipDate}</div>
                  <div className="mt-1 text-xs text-slate-500">거래처를 선택 후 일괄출력 버튼을 누르면 이 페이지에서 바로 인쇄창이 열립니다.</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className={btnOn}
                    onClick={() => downloadShipExcel(selShipDate)}
                    disabled={downloadingExcel || !selShipDate}
                  >
                    {downloadingExcel ? "엑셀 생성중..." : "엑셀 다운로드"}
                  </button>
                  <button className={btn} onClick={() => setOpenShip(false)} disabled={downloadingExcel || bulkPrinting}>닫기</button>
                </div>
              </div>

              <div className="px-5 py-4">
                {/* 출고 통계 배지 */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={badge}>총 <span className="tabular-nums">{shipSummary.total}</span>건</span>
                  <span className={badgeShip}>택배 <span className="tabular-nums">{shipSummary.byMethod["택배"]}</span></span>
                  <span className={badgeQuickCredit}>퀵-신용 <span className="tabular-nums">{shipSummary.byMethod["퀵-신용"]}</span></span>
                  <span className={badgeQuickCod}>퀵-착불 <span className="tabular-nums">{shipSummary.byMethod["퀵-착불"]}</span></span>
                  <span className={badgeVisit}>방문 <span className="tabular-nums">{shipSummary.byMethod["방문"]}</span></span>
                  <span className={badgeEtc}>기타 <span className="tabular-nums">{shipSummary.byMethod["기타"]}</span></span>
                </div>

                {/* ✅ 일괄출력 컨트롤 영역 */}
                {printableLines.length > 0 && !shipListLoading ? (
                  <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-blue-900">
                        거래명세서 일괄출력
                        <span className="ml-2 text-xs font-normal text-blue-700">
                          ({bulkPrintSelected.size}/{printableLines.length}개 선택)
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          onClick={() => setBulkPrintSelected(new Set(printableLines.map((x) => x.partner_id as string)))}
                        >
                          전체선택
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          onClick={() => setBulkPrintSelected(new Set())}
                        >
                          전체해제
                        </button>
                        <button
                          type="button"
                          className={`rounded-xl border border-blue-600/20 bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50`}
                          onClick={doBulkPrint}
                          disabled={bulkPrinting || bulkPrintSelected.size === 0}
                        >
                          {bulkPrinting
                            ? `출력중... (${bulkPrintSelected.size}건)`
                            : bulkSpecLoading ? "데이터 로딩중..." : `선택 ${bulkPrintSelected.size}건 일괄출력`}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-blue-700">
                      ※ 거래처별 명세서가 한 번에 로드된 후 인쇄창이 열립니다. 거래처가 많으면 잠시 기다려주세요.
                    </div>
                  </div>
                ) : null}

                {/* 거래처 목록 */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {shipListLoading ? (
                    <div className="text-sm text-slate-600">불러오는 중...</div>
                  ) : shipListErr ? (
                    <div className="text-sm text-red-700">{shipListErr}</div>
                  ) : shipLines.length === 0 ? (
                    <div className="text-sm text-slate-600">출고 건이 없습니다.</div>
                  ) : (
                    <div className="space-y-2">
                      {shipLines.map((x) => {
                        const key = `${x.partner_id ?? ""}__${x.partner}__${x.method}`;
                        const hasPrintId = !!x.partner_id;
                        const isChecked = hasPrintId && bulkPrintSelected.has(x.partner_id as string);

                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                              isChecked ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"
                            }`}
                          >
                            {/* ✅ 일괄출력 체크박스 */}
                            {hasPrintId ? (
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded accent-blue-600"
                                checked={isChecked}
                                onChange={(e) => {
                                  setBulkPrintSelected((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(x.partner_id as string);
                                    else next.delete(x.partner_id as string);
                                    return next;
                                  });
                                }}
                              />
                            ) : (
                              <div className="h-4 w-4 rounded border border-slate-200 bg-slate-100" title="거래처 ID 없음" />
                            )}

                            {/* 거래처명 클릭 → 개별 명세서 출력 */}
                            <button
                              type="button"
                              className="flex-1 text-left text-sm font-semibold text-slate-900 hover:underline"
                              onClick={() => openSpec(x.partner_id, selShipDate)}
                              title="클릭하면 당일 거래명세서(인쇄창까지) 출력"
                            >
                              {x.partner} - {x.method}
                              {x.cnt > 1 ? ` (${x.cnt})` : ""}
                            </button>

                            {/* 개별 출력 버튼 */}
                            {hasPrintId ? (
                              <button
                                type="button"
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                onClick={() => openSpec(x.partner_id, selShipDate)}
                              >
                                개별출력
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-3 text-xs text-slate-500">
                    ※ 체크박스를 선택한 후 <span className="font-semibold">일괄출력</span> 버튼을 누르면 명세서가 거래처별로 순서대로 열립니다. · 거래처 ID가 없는 항목(회색 박스)은 일괄출력에서 제외됩니다.
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
