"use client";

import React from "react";
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
import { useEffect, useMemo, useRef, useState } from "react";

type Category = "ALL" | "기성" | "업체" | "전사지" | "코팅/분사" | "생산용전사지";

type RpcRow = {
  product_name: string;
  product_category: string | null;
  food_type: string | null;
  prev_stock_ea: number | null;
  today_in_ea: number | null;
  today_out_ea: number | null;
  today_discard_ea: number | null;
  today_stock_ea: number | null;
  expiry_date: string;
  barcode: string;
  note: string | null;
  pack_unit?: number | null;
};

type AggRow = {
  product_name: string;
  product_category: string | null;
  food_type: string | null;
  start_stock_ea: number;
  period_in_ea: number;
  period_out_ea: number;
  period_discard_ea: number;
  end_stock_ea: number;
  expiry_date: string;
  barcode: string;
  note: string | null;
  pack_unit?: number | null;
  lot_id?: string | null;
  variant_id?: string | null;
};

function intMin(n: any, min = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.floor(v));
}

function safeStr(v: any) {
  return (v ?? "").toString();
}

function formatYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseYYYYMMDD(s: string) {
  const [y, m, d] = s.split("-").map((v) => Number(v));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function addDays(d: Date, days: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

function diffDaysInclusive(a: Date, b: Date) {
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  const diff = Math.floor((bb - aa) / (24 * 60 * 60 * 1000));
  return diff + 1;
}

const nf = new Intl.NumberFormat("ko-KR");
const fmt = (n: number) => nf.format(intMin(n, 0));

function toBoxAndEa(ea: number, packUnit?: number | null) {
  const u = intMin(packUnit ?? 0, 0);
  const e = intMin(ea, 0);
  if (!u || u <= 0) return { boxText: "", eaText: `${fmt(e)} EA` };
  const box = Math.floor(e / u);
  const rem = e % u;
  const boxText = rem === 0 ? `${fmt(box)} BOX` : `${fmt(box)} BOX (+${fmt(rem)}EA)`;
  return { boxText, eaText: `${fmt(e)} EA` };
}

// 초성 검색 유틸
const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

function getChosung(str: string): string {
  return str.split("").map((ch) => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return ch;
    return CHOSUNG[Math.floor(code / 588)];
  }).join("");
}

function matchesSearch(target: string, keyword: string): boolean {
  const t = target.toLowerCase();
  const k = keyword.toLowerCase();
  if (t.includes(k)) return true;
  // 초성 검색: keyword가 모두 초성으로만 이루어진 경우
  const isAllChosung = [...k].every((ch) => CHOSUNG.includes(ch));
  if (isAllChosung) return getChosung(t).includes(k);
  return false;
}

function csvEscape(v: any) {
  const s = safeStr(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

type ColKey = "name" | "food_type" | "prev_stock" | "in" | "out" | "discard" | "stock" | "expiry" | "barcode" | "note";

const COLS: Record<Exclude<Category, "ALL">, { key: ColKey; label: string }[]> = {
  "코팅/분사": [
    { key: "name",       label: "제품명" },
    { key: "food_type",  label: "식품유형" },
    { key: "prev_stock", label: "전일재고" },
    { key: "in",         label: "입고" },
    { key: "out",        label: "출고" },
    { key: "discard",    label: "폐기" },
    { key: "stock",      label: "재고" },
    { key: "expiry",     label: "소비기한" },
    { key: "barcode",    label: "바코드" },
    { key: "note",       label: "비고" },
  ],
  "생산용전사지": [
    { key: "name",       label: "제품명" },
    { key: "food_type",  label: "식품유형" },
    { key: "prev_stock", label: "전일재고" },
    { key: "in",         label: "입고" },
    { key: "out",        label: "출고" },
    { key: "discard",    label: "폐기" },
    { key: "stock",      label: "재고" },
    { key: "expiry",     label: "소비기한" },
    { key: "barcode",    label: "바코드" },
    { key: "note",       label: "비고" },
  ],
  기성: [
    { key: "name",       label: "제품명" },
    { key: "food_type",  label: "식품유형" },
    { key: "prev_stock", label: "전일재고" },
    { key: "in",         label: "입고" },
    { key: "out",        label: "출고" },
    { key: "discard",    label: "폐기" },
    { key: "stock",      label: "재고" },
    { key: "expiry",     label: "소비기한" },
    { key: "barcode",    label: "바코드" },
    { key: "note",       label: "비고" },
  ],
  업체: [
    { key: "name",       label: "제품명" },
    { key: "food_type",  label: "식품유형" },
    { key: "prev_stock", label: "전일재고" },
    { key: "in",         label: "입고" },
    { key: "out",        label: "출고" },
    { key: "discard",    label: "폐기" },
    { key: "stock",      label: "재고" },
    { key: "expiry",     label: "소비기한" },
    { key: "barcode",    label: "바코드" },
    { key: "note",       label: "비고" },
  ],
  전사지: [
    { key: "name",       label: "제품명" },
    { key: "food_type",  label: "식품유형" },
    { key: "prev_stock", label: "전일재고" },
    { key: "in",         label: "입고" },
    { key: "out",        label: "출고" },
    { key: "discard",    label: "폐기" },
    { key: "stock",      label: "재고" },
    { key: "expiry",     label: "소비기한" },
    { key: "barcode",    label: "바코드" },
    { key: "note",       label: "비고" },
  ],
};

const COLS_ALL: { key: ColKey; label: string }[] = [
  { key: "name",       label: "제품명" },
  { key: "food_type",  label: "식품유형" },
  { key: "prev_stock", label: "전일재고" },
  { key: "in",         label: "입고" },
  { key: "out",        label: "출고" },
  { key: "discard",    label: "폐기" },
  { key: "stock",      label: "재고" },
  { key: "expiry",     label: "소비기한" },
  { key: "barcode",    label: "바코드" },
  { key: "note",       label: "비고" },
];

function getCols(cat: Category) {
  if (cat === "ALL") return COLS_ALL;
  return COLS[cat];
}

// ── 수정 모달: 제품명·식품유형·재고수량만 ──
type EditModalState = {
  open: boolean;
  row: AggRow | null;
  product_name: string;
  food_type: string;
  end_stock_ea: string;
};

// ── 소비기한 전용 모달 ──
type ExpiryModalState = {
  open: boolean;
  row: AggRow | null;
  newExpiry: string;
};

export default function ReportClient() {
  const supabase = useMemo(() => createClient(), []);

  const [mode, setMode] = useState<"DAY" | "RANGE">("DAY");
  const [startDay, setStartDay] = useState<string>(() => formatYYYYMMDD(new Date()));
  const [endDay, setEndDay] = useState<string>(() => formatYYYYMMDD(new Date()));
  const [categoryFilter, setCategoryFilter] = useState<Category>("기성");

  const [rows, setRows] = useState<AggRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [newWoNotifications, setNewWoNotifications] = useState<NewWoNotification[]>([]);
  const [showNewWoModal, setShowNewWoModal] = useState(false);
  const insertChannelRef = useRef<RealtimeChannel | null>(null);
  const pageLoadTimeRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    const channel = supabase
      .channel("wo_report_insert_notify")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "work_orders" }, (payload) => {
        const d = payload.new as Record<string, unknown>;
        const createdAt = String(d.created_at ?? "");
        if (createdAt && createdAt < pageLoadTimeRef.current) return;
        setNewWoNotifications((prev) => [{ id: String(d.id ?? ""), client_name: String(d.client_name ?? ""), product_name: String(d.product_name ?? ""), work_order_no: String(d.work_order_no ?? ""), order_date: String(d.order_date ?? ""), created_at: createdAt }, ...prev]);
        setShowNewWoModal(true);
        playNotificationSound();
      })
      .subscribe((status, err) => { console.log("🔔 [report INSERT채널]", status, err ?? ""); });
    insertChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); insertChannelRef.current = null; };
  }, []); // eslint-disable-line

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSubAdmin, setIsSubAdmin] = useState(false);
const [adminLoaded, setAdminLoaded] = useState(false);

  // ── PIN 모달 state ──
  type PinModalState = {
    open: boolean;
    targetAction: "edit" | "expiry" | "delete" | "discard" | null;
    targetRow: AggRow | null;
    employees: { id: string; name: string; pin: string | null }[];
    selectedEmp: { id: string; name: string; pin: string | null } | null;
    pinInput: string;
    pinError: string;
  };
  const [pinModal, setPinModal] = useState<PinModalState>({
    open: false, targetAction: null, targetRow: null,
    employees: [], selectedEmp: null, pinInput: "", pinError: "",
  });

  // ── 폐기 모달 state ──
  type DiscardModalState = {
    open: boolean;
    row: AggRow | null;
    qty: string;
    saving: boolean;
  };
  const [discardModal, setDiscardModal] = useState<DiscardModalState>({
    open: false, row: null, qty: "", saving: false,
  });

  // ── 수정 모달 state (소비기한 제외) ──
  const [editModal, setEditModal] = useState<EditModalState>({
    open: false, row: null,
    product_name: "", food_type: "", end_stock_ea: "",
  });

  // ── 소비기한 전용 모달 state ──
  const [expiryModal, setExpiryModal] = useState<ExpiryModalState>({
    open: false, row: null, newExpiry: "",
  });

  const [editSaving, setEditSaving] = useState(false);
  const [expirySaving, setExpirySaving] = useState(false);
  // ── 드릴다운 (출고/입고) ──
  const [drillOpen, setDrillOpen] = useState<{ barcode: string; expiry: string; colType: "in" | "out" } | null>(null);
  const [drillMovements, setDrillMovements] = useState<{ type: string; qty: number; happened_at: string; note: string | null }[]>([]);
  const [drillMovLoading, setDrillMovLoading] = useState(false);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "food_type" | "prev_stock" | "in" | "out" | "discard" | "stock" | "expiry" | "barcode" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const printedAt = formatYYYYMMDD(new Date());

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAdminLoaded(true); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
        setIsAdmin(data?.role === "ADMIN");
        setIsSubAdmin(data?.role === "SUBADMIN");
        setAdminLoaded(true);
    })();
  }, []);
  
  // employees(PIN 검증용) 로드
  useEffect(() => {
    if (!adminLoaded) return;
    supabase
      .from("employees")
      .select("id,name,pin")
      .is("resign_date", null)
      .order("name")
      .then(({ data }) => {
        const sorted = (data ?? [])
          .filter((e: any) => !["강미라"].includes(e.name))
          .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
        setPinModal((prev) => ({ ...prev, employees: sorted as any }));
      });
  }, [adminLoaded]); // eslint-disable-line

  useEffect(() => {
    if (adminLoaded) fetchReport();
  }, [adminLoaded]); // eslint-disable-line

  useEffect(() => {
    if (mode === "DAY") setEndDay(startDay);
    setDrillOpen(null);
    setDrillMovements([]);
  }, [mode, startDay]);

  const filteredRows = rows
  .filter((r) => categoryFilter === "ALL" || (r.product_category ?? "") === categoryFilter)
  .filter((r) => {
    if (!searchKeyword.trim()) return true;
    const k = searchKeyword.trim();
    return (
      matchesSearch(safeStr(r.product_name), k) ||
      matchesSearch(safeStr(r.barcode), k)
    );
  })
  .sort((a, b) => {
    if (!sortKey) return 0;
    let cmp = 0;
    if (sortKey === "name")       cmp = safeStr(a.product_name).localeCompare(safeStr(b.product_name), "ko");
    else if (sortKey === "food_type")   cmp = safeStr(a.food_type).localeCompare(safeStr(b.food_type), "ko");
    else if (sortKey === "prev_stock")  cmp = intMin(a.start_stock_ea) - intMin(b.start_stock_ea);
    else if (sortKey === "in")          cmp = intMin(a.period_in_ea) - intMin(b.period_in_ea);
    else if (sortKey === "out")         cmp = intMin(a.period_out_ea) - intMin(b.period_out_ea);
    else if (sortKey === "discard")     cmp = intMin(a.period_discard_ea) - intMin(b.period_discard_ea);
    else if (sortKey === "stock")       cmp = intMin(a.end_stock_ea) - intMin(b.end_stock_ea);
    else if (sortKey === "expiry")      cmp = safeStr(a.expiry_date).localeCompare(safeStr(b.expiry_date));
    else if (sortKey === "barcode")     cmp = safeStr(a.barcode).localeCompare(safeStr(b.barcode));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const periodLabel = startDay === endDay ? `${startDay}` : `${startDay} ~ ${endDay}`;

  const fetchReport = async (cat?: Category) => {
    const activeCat = cat ?? categoryFilter;
    const s = startDay;
    const e = mode === "DAY" ? startDay : endDay;

    if (!isYYYYMMDD(s) || !isYYYYMMDD(e)) {
      setMsg("날짜 형식은 YYYY-MM-DD 입니다. 예) 2026-02-05");
      return;
    }

    const sd = parseYYYYMMDD(s);
    const ed = parseYYYYMMDD(e);
    if (!sd || !ed) { setMsg("날짜를 올바르게 입력해주세요."); return; }
    if (sd.getTime() > ed.getTime()) { setMsg("기간 설정 오류: 시작일이 종료일보다 늦습니다."); return; }

    const days = diffDaysInclusive(sd, ed);
    if (days > 62) { setMsg("기간이 너무 깁니다. 62일 이하로 조회해주세요."); return; }

    setLoading(true);
    setMsg(null);

    try {
      const dayList: string[] = [];
      for (let i = 0; i < days; i++) dayList.push(formatYYYYMMDD(addDays(sd, i)));

      const agg = new Map<string, AggRow>();

      for (let i = 0; i < dayList.length; i++) {
        const d = dayList[i];
        const { data, error } = await supabase.rpc("rpc_daily_stock_report", { p_day: d });
        if (error) throw new Error(error.message);

        const list = (data ?? []) as RpcRow[];
        const isFirst = i === 0;
        const isLast = i === dayList.length - 1;

        for (const r of list) {
          const key = `${safeStr(r.barcode)}__${safeStr(r.expiry_date)}__${safeStr(r.product_name)}`;
          const prevEA = intMin(r.prev_stock_ea ?? 0, 0);
          const inEA = intMin(r.today_in_ea ?? 0, 0);
          const outEA = intMin(r.today_out_ea ?? 0, 0);
          const endEA = intMin(r.today_stock_ea ?? 0, 0);

          const exists = agg.get(key);
          if (!exists) {
            agg.set(key, {
              product_name: r.product_name,
              product_category: r.product_category,
              food_type: r.food_type,
              start_stock_ea: isFirst ? prevEA : 0,
              period_in_ea: inEA,
              period_out_ea: outEA,
              period_discard_ea: intMin(r.today_discard_ea ?? 0, 0),
              end_stock_ea: isLast ? endEA : 0,
              expiry_date: r.expiry_date,
              barcode: r.barcode,
              note: r.note ?? null,
              pack_unit: r.pack_unit ?? null,
            });
          } else {
            if (isFirst) exists.start_stock_ea = prevEA;
            exists.period_in_ea += inEA;
            exists.period_out_ea += outEA;
            exists.period_discard_ea += intMin(r.today_discard_ea ?? 0, 0);
            if (isLast) exists.end_stock_ea = endEA;
            exists.product_category = r.product_category ?? exists.product_category;
            exists.food_type = r.food_type ?? exists.food_type;
            exists.note = (r.note ?? exists.note) as any;
            exists.pack_unit = (r.pack_unit ?? exists.pack_unit) as any;
          }
        }
      }

      // 입고·출고·재고 중 하나라도 있는 행만 표시
      let listAgg = Array.from(agg.values()).filter((r) =>
        intMin(r.period_in_ea) > 0 ||
        intMin(r.period_out_ea) > 0 ||
        intMin(r.end_stock_ea) > 0 ||
        intMin(r.period_discard_ea) > 0
      );

      // ADMIN: lot_id·variant_id 매핑 (쿼리 2번으로 처리)
      if ((isAdmin || isSubAdmin) && listAgg.length > 0) {
        const barcodes = [...new Set(listAgg.map((r) => r.barcode).filter(Boolean))];

        const { data: pvList } = await supabase
          .from("product_variants")
          .select("id, barcode")
          .in("barcode", barcodes);

        if (pvList && pvList.length > 0) {
          const variantIds = pvList.map((v: any) => v.id);
          const barcodeToVariantId: Record<string, string> = {};
          for (const pv of pvList as any[]) {
            barcodeToVariantId[pv.barcode] = pv.id;
          }

          const { data: lotList } = await supabase
            .from("lots")
            .select("id, variant_id, expiry_date")
            .in("variant_id", variantIds);

          if (lotList) {
            for (const row of listAgg) {
              const variantId = barcodeToVariantId[row.barcode];
              if (!variantId) continue;
              const lot = (lotList as any[]).find(
                (l) => l.variant_id === variantId && l.expiry_date === row.expiry_date
              );
              if (lot) {
                row.lot_id = lot.id;
                row.variant_id = lot.variant_id;
              }
            }
          }
        }
      }

      listAgg.sort((a, b) => {
        const pn = safeStr(a.product_name).localeCompare(safeStr(b.product_name), "ko");
        if (pn !== 0) return pn;
        const ex = safeStr(a.expiry_date).localeCompare(safeStr(b.expiry_date));
        if (ex !== 0) return ex;
        return safeStr(a.barcode).localeCompare(safeStr(b.barcode));
      });

      setRows(listAgg);

      const after = activeCat === "ALL"
      ? listAgg
      : listAgg.filter((r) => (r.product_category ?? "") === activeCat);

      setMsg(
        `조회 완료 ✅ ${after.length}건 (${periodLabel})` +
        (activeCat === "ALL" ? "" : ` / 구분: ${activeCat}`)
      );
    } catch (e: any) {
      setRows([]);
      setMsg(e?.message ?? "조회 오류");
    } finally {
      setLoading(false);
    }
  };

  // ── 수정 모달 열기 (소비기한 제외) ──
  function openEdit(r: AggRow) {
    setEditModal({
      open: true,
      row: r,
      product_name: r.product_name ?? "",
      food_type: r.food_type ?? "",
      end_stock_ea: String(r.end_stock_ea ?? 0),
    });
  }

  // ── 수정 저장 (제품명·식품유형·재고수량만) ──
  async function saveEdit() {
    const { row } = editModal;
    if (!row) return;
    setEditSaving(true);
    setMsg(null);
    try {
      const { data: pvData } = await supabase
        .from("product_variants")
        .select("id, product_id")
        .eq("barcode", row.barcode)
        .maybeSingle();

      if (pvData) {
        await supabase
          .from("product_variants")
          .update({ variant_name: editModal.product_name.trim() })
          .eq("id", pvData.id);

        await supabase
          .from("products")
          .update({ food_type: editModal.food_type.trim() })
          .eq("id", pvData.product_id);
      }

      // 재고 수량 조정 (movements IN/OUT)
      if (row.lot_id) {
        const newQty = intMin(Number(editModal.end_stock_ea), 0);
        const currentQty = intMin(row.end_stock_ea, 0);
        const diff = newQty - currentQty;
        if (diff !== 0) {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from("movements").insert({
            lot_id: row.lot_id,
            type: diff > 0 ? "IN" : "OUT",
            qty: Math.abs(diff),
            happened_at: new Date().toISOString(),
            note: `재고대장 수동 수정 (ADMIN)`,
            created_by: user?.id ?? null,
          });
        }
      }

      setMsg("✅ 수정 완료");
      setEditModal((prev) => ({ ...prev, open: false, row: null }));
      await fetchReport();
    } catch (e: any) {
      setMsg("수정 오류: " + (e?.message ?? e));
    } finally {
      setEditSaving(false);
    }
  }

  // ── 소비기한 전용 모달 열기 ──
  function openExpiryModal(r: AggRow) {
    setExpiryModal({ open: true, row: r, newExpiry: r.expiry_date });
  }

  // ── PIN 모달 열기 ──
  function openPinModal(action: PinModalState["targetAction"], row: AggRow) {
    setPinModal((prev) => ({
      ...prev,
      open: true,
      targetAction: action,
      targetRow: row,
      selectedEmp: null,
      pinInput: "",
      pinError: "",
    }));
  }

  function closePinModal() {
    setPinModal((prev) => ({
      ...prev,
      open: false,
      targetAction: null,
      targetRow: null,
      selectedEmp: null,
      pinInput: "",
      pinError: "",
    }));
  }

  function handlePinDigitInventory(digit: string) {
    if (pinModal.pinInput.length >= 4) return;
    const next = pinModal.pinInput + digit;
    setPinModal((prev) => ({ ...prev, pinInput: next, pinError: "" }));
    if (next.length === 4) {
      setTimeout(() => verifyPinInventory(next), 100);
    }
  }

  function verifyPinInventory(pin: string) {
    const emp = pinModal.selectedEmp;
    if (!emp) return;
    if (!emp.pin) {
      setPinModal((prev) => ({ ...prev, pinError: "PIN이 설정되지 않았습니다.", pinInput: "" }));
      return;
    }
    if (emp.pin !== pin) {
      setPinModal((prev) => ({ ...prev, pinError: "PIN이 올바르지 않습니다.", pinInput: "" }));
      return;
    }
    // 인증 성공
    const { targetAction, targetRow } = pinModal;
    closePinModal();
    if (!targetRow) return;
    if (targetAction === "edit")    openEdit(targetRow);
    if (targetAction === "expiry")  openExpiryModal(targetRow);
    if (targetAction === "delete")  deleteRow(targetRow);
    if (targetAction === "discard") setDiscardModal({ open: true, row: targetRow, qty: "", saving: false });
  }

  // ── 폐기 저장 ──
  async function saveDiscard() {
    const { row, qty } = discardModal;
    if (!row || !row.lot_id) {
      setMsg("lot 정보가 없어 폐기할 수 없습니다.");
      return;
    }
    const qtyNum = intMin(Number(qty), 0);
    if (!qtyNum || qtyNum <= 0) { setMsg("폐기 수량을 입력하세요."); return; }
    if (qtyNum > intMin(row.end_stock_ea, 0)) {
      setMsg(`폐기 수량(${qtyNum})이 현재 재고(${intMin(row.end_stock_ea, 0)})를 초과합니다.`);
      return;
    }
    setDiscardModal((prev) => ({ ...prev, saving: true }));
    setMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("movements").insert({
        lot_id: row.lot_id,
        type: "DISCARD",
        qty: qtyNum,
        happened_at: `${startDay}T00:00:00+09:00`,
        note: `재고대장 폐기 처리`,
        created_by: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
      setMsg(`✅ 폐기 완료 — ${row.product_name} ${qtyNum} EA`);
      setDiscardModal({ open: false, row: null, qty: "", saving: false });
      await fetchReport();
    } catch (e: any) {
      setMsg("폐기 오류: " + (e?.message ?? e));
      setDiscardModal((prev) => ({ ...prev, saving: false }));
    }
  }

  // ── 소비기한 저장 (LOT 병합 처리 포함) ──
  async function saveExpiry() {
    const { row, newExpiry } = expiryModal;
    if (!row || !row.lot_id || !row.variant_id) {
      setMsg("lot 정보가 없어 소비기한을 수정할 수 없습니다.");
      return;
    }
    if (!newExpiry) { setMsg("소비기한을 입력해주세요."); return; }
    if (newExpiry === row.expiry_date) { setMsg("변경사항이 없습니다."); return; }

    setExpirySaving(true);
    setMsg(null);
    try {
      // 변경하려는 소비기한 LOT이 이미 있는지 확인
      const { data: existingLot } = await supabase
        .from("lots")
        .select("id")
        .eq("variant_id", row.variant_id)
        .eq("expiry_date", newExpiry)
        .maybeSingle();

      if (existingLot) {
        // 이미 존재 → movements를 기존 LOT으로 이동 후 현재 LOT 삭제
        const { error: mvErr } = await supabase
          .from("movements")
          .update({ lot_id: existingLot.id })
          .eq("lot_id", row.lot_id);
        if (mvErr) throw new Error("movements 이동 실패: " + mvErr.message);

        const { error: delErr } = await supabase
          .from("lots")
          .delete()
          .eq("id", row.lot_id);
        if (delErr) throw new Error("lot 삭제 실패: " + delErr.message);

        setMsg("✅ 소비기한 변경 완료 (기존 LOT에 병합됨)");
      } else {
        // 없으면 단순 UPDATE
        const { error: updateErr } = await supabase
          .from("lots")
          .update({ expiry_date: newExpiry })
          .eq("id", row.lot_id);
        if (updateErr) throw new Error("소비기한 수정 실패: " + updateErr.message);

        setMsg("✅ 소비기한 변경 완료");
      }

      setExpiryModal({ open: false, row: null, newExpiry: "" });
      await fetchReport();
    } catch (e: any) {
      setMsg("오류: " + (e?.message ?? e));
    } finally {
      setExpirySaving(false);
    }
  }

  async function deleteRow(r: AggRow) {
    if (!window.confirm(`"${r.product_name}" 항목을 삭제하시겠습니까?\n관련 movements와 lot이 모두 삭제됩니다.`)) return;
    setMsg(null);
    try {
      if (r.lot_id) {
        await supabase.from("movements").delete().eq("lot_id", r.lot_id);
        await supabase.from("lots").delete().eq("id", r.lot_id);
      }
      setMsg("🗑️ 삭제 완료");
      await fetchReport();
    } catch (e: any) {
      setMsg("삭제 오류: " + (e?.message ?? e));
    }
  }

  const [printModalOpen, setPrintModalOpen] = useState(false);

  const doPrint = () => {
    if (rows.length === 0) { setMsg("인쇄할 데이터가 없습니다. (날짜/필터 확인 후 조회)"); return; }
    setPrintModalOpen(true);
  };

  // ── 드릴다운 핸들러 ──
  async function handleMovDrillDown(r: AggRow, colType: "in" | "out") {
    if (drillOpen?.barcode === r.barcode && drillOpen?.expiry === r.expiry_date && drillOpen?.colType === colType) {
      setDrillOpen(null);
      setDrillMovements([]);
      return;
    }
    if (!r.lot_id) {
      setDrillOpen(null);
      setDrillMovements([]);
      return;
    }
    setDrillOpen({ barcode: r.barcode, expiry: r.expiry_date, colType });
    setDrillMovLoading(true);

    const movType = colType === "out" ? "OUT" : "IN";
    const { data } = await supabase
      .from("movements")
      .select("type, qty, happened_at, note")
      .eq("lot_id", r.lot_id)
      .eq("type", movType)
      .gte("happened_at", `${startDay}T00:00:00+09:00`)
      .lte("happened_at", `${startDay}T23:59:59+09:00`)
      .order("happened_at");

    const movements = data ?? [];

    // note에서 WO번호 및 orders UUID 추출하여 거래처명 조회
    const woPattern = /WO-\d{8}-\d{4}/;
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    const woNos = [...new Set(
      movements.map((m) => m.note?.match(woPattern)?.[0]).filter(Boolean) as string[]
    )];
    const orderIds = [...new Set(
      movements
        .map((m) => {
          const note = m.note ?? "";
          // WO번호가 있으면 UUID가 아님
          if (woPattern.test(note)) return null;
          return note.match(uuidPattern)?.[0] ?? null;
        })
        .filter(Boolean) as string[]
    )];

    const woClientMap: Record<string, string> = {};
    if (woNos.length > 0) {
      const { data: woData } = await supabase
        .from("work_orders")
        .select("work_order_no, client_name")
        .in("work_order_no", woNos);
        (woData ?? []).forEach((w: any) => {
          woClientMap[w.work_order_no] = `${w.client_name} (${w.work_order_no})`;
        });
    }

    const orderClientMap: Record<string, string> = {};
    if (orderIds.length > 0) {
      const { data: orderData } = await supabase
        .from("orders")
        .select("id, customer_name, memo")
        .in("id", orderIds);
      (orderData ?? []).forEach((o: any) => {
        let label = o.customer_name ?? "";
        try {
          const parsed = typeof o.memo === "string" ? JSON.parse(o.memo) : o.memo;
          if (parsed?.orderer_name) label += ` · ${parsed.orderer_name}`;
        } catch {}
        orderClientMap[o.id] = label;
      });
    }

    // 각 movement에 거래처명 추가
    const enriched = movements.map((m) => {
      const note = m.note ?? "";
      const woNo = note.match(woPattern)?.[0];
      const uuid = (!woPattern.test(note)) ? (note.match(uuidPattern)?.[0] ?? null) : null;
      let clientName: string | null = null;
      if (woNo && woClientMap[woNo]) clientName = woClientMap[woNo];
      else if (uuid && orderClientMap[uuid]) clientName = orderClientMap[uuid];
      return { ...m, clientName };
    });

    setDrillMovements(enriched as any);
    setDrillMovLoading(false);
  }

  const downloadExcel = () => {
    if (filteredRows.length === 0) { setMsg("저장할 데이터가 없습니다. (날짜/필터 확인 후 조회)"); return; }

    const cols = getCols(categoryFilter);
    const header = ["기간", "구분필터", ...cols.map((c) => c.label)];
    const lines: string[] = [header.map(csvEscape).join(",")];

    for (const r of filteredRows) {
      const sEA = intMin(r.start_stock_ea ?? 0, 0);
      const inEA = intMin(r.period_in_ea ?? 0, 0);
      const outEA = intMin(r.period_out_ea ?? 0, 0);
      const eEA = intMin(r.end_stock_ea ?? 0, 0);

      const rowData: Record<ColKey, string> = {
        name: safeStr(r.product_name),
        food_type: safeStr(r.food_type ?? "-"),
        prev_stock: String(sEA),
        in: String(inEA),
        out: String(outEA),
        discard: String(intMin(r.period_discard_ea ?? 0, 0)),
        stock: String(eEA),
        expiry: safeStr(r.expiry_date),
        barcode: safeStr(r.barcode),
        note: safeStr(r.note ?? ""),
      };

      lines.push([
        periodLabel,
        categoryFilter === "ALL" ? "전체" : categoryFilter,
        ...cols.map((c) => rowData[c.key]),
      ].map(csvEscape).join(","));
    }

    const bom = "\uFEFF";
    const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `재고대장_${periodLabel.replace(/\s/g, "")}_${categoryFilter === "ALL" ? "전체" : categoryFilter}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg("엑셀(CSV) 저장 완료 ✅");
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const cols = getCols(categoryFilter);
  const isRightAlign = (key: ColKey) => ["prev_stock", "in", "out", "discard", "stock"].includes(key);

  const displayCols = (isAdmin || isSubAdmin)
    ? [...cols, { key: "actions" as any, label: "작업" }]
    : cols;

  // ── 인쇄 모달 ──
  function PrintModal({ onClose }: { onClose: () => void }) {
    const PRINT_CATS: Exclude<Category, "ALL">[] = ["업체", "기성", "전사지", "코팅/분사", "생산용전사지"];
    const [activeTab, setActiveTab] = useState<Exclude<Category, "ALL">>("업체");

    const catRows = (cat: Exclude<Category, "ALL">) =>
      rows.filter((r) => (r.product_category ?? "") === cat);

    function doIframePrint(cat: Exclude<Category, "ALL">) {
      const catData = catRows(cat);
      const cols = COLS[cat];

      const tableRows = catData.map((r) => {
        const sEA = intMin(r.start_stock_ea ?? 0, 0);
        const inEA = intMin(r.period_in_ea ?? 0, 0);
        const outEA = intMin(r.period_out_ea ?? 0, 0);
        const eEA = intMin(r.end_stock_ea ?? 0, 0);
        const unit = intMin(r.pack_unit ?? 0, 0);

        const cellMap: Record<string, string> = {
          name: safeStr(r.product_name ?? "-"),
          food_type: safeStr(r.food_type ?? "-"),
          prev_stock: toBoxAndEa(sEA, unit).boxText
            ? `${toBoxAndEa(sEA, unit).boxText} / ${toBoxAndEa(sEA, unit).eaText}`
            : toBoxAndEa(sEA, unit).eaText,
          in: toBoxAndEa(inEA, unit).boxText
            ? `${toBoxAndEa(inEA, unit).boxText} / ${toBoxAndEa(inEA, unit).eaText}`
            : toBoxAndEa(inEA, unit).eaText,
          out: toBoxAndEa(outEA, unit).boxText
            ? `${toBoxAndEa(outEA, unit).boxText} / ${toBoxAndEa(outEA, unit).eaText}`
            : toBoxAndEa(outEA, unit).eaText,
          discard: (() => {
            const d = intMin(r.period_discard_ea ?? 0, 0);
            return d > 0
              ? (toBoxAndEa(d, unit).boxText
                  ? `${toBoxAndEa(d, unit).boxText} / ${toBoxAndEa(d, unit).eaText}`
                  : toBoxAndEa(d, unit).eaText)
              : "—";
          })(),
          stock: toBoxAndEa(eEA, unit).boxText
            ? `${toBoxAndEa(eEA, unit).boxText} / ${toBoxAndEa(eEA, unit).eaText}`
            : toBoxAndEa(eEA, unit).eaText,
          expiry: safeStr(r.expiry_date),
          barcode: safeStr(r.barcode),
          note: safeStr(r.note ?? ""),
        };

        const tds = cols.map((c) => {
          const isRight = ["prev_stock", "in", "out", "discard", "stock"].includes(c.key);
          return `<td style="padding:3px 6px;border:1px solid #d1d5db;font-size:9pt;text-align:${isRight ? "right" : "left"};">${cellMap[c.key] ?? ""}</td>`;
        }).join("");
        return `<tr>${tds}</tr>`;
      }).join("");

      const ths = cols.map((c) => {
        const isRight = ["prev_stock", "in", "out", "discard", "stock"].includes(c.key);
        return `<th style="padding:4px 6px;border:1px solid #d1d5db;background:#f3f4f6;font-size:9pt;text-align:${isRight ? "right" : "left"};">${c.label}</th>`;
      }).join("");

      const todayKST = (() => {
        const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>재고대장_${cat}_${todayKST}</title>
<style>
@page{size:A4 landscape;margin:10mm 12mm;}
body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:9pt;color:#111;}
*{box-sizing:border-box;}
table{border-collapse:collapse;width:100%;}
thead{display:table-header-group;}
tr{page-break-inside:avoid;}
</style>
</head><body>
<div style="margin-bottom:8px;">
  <div style="font-size:15pt;font-weight:bold;letter-spacing:4px;border-bottom:2px solid #111;padding-bottom:4px;margin-bottom:4px;">재 고 대 장</div>
  <div style="font-size:9pt;color:#444;">
    기준일: <strong>${periodLabel}</strong> &nbsp;|&nbsp; 구분: <strong>${cat}</strong> &nbsp;|&nbsp; 인쇄일: ${todayKST}
  </div>
</div>
<table>
  <thead><tr>${ths}</tr></thead>
  <tbody>${tableRows || '<tr><td colspan="${cols.length}" style="padding:6px;color:#888;">데이터 없음</td></tr>'}</tbody>
</table>
</body></html>`;

      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;width:0;height:0;border:none;";
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      doc.open();
      doc.write(html);
      doc.close();
      iframe.contentWindow?.focus();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => { document.body.removeChild(iframe); }, 2000);
      }, 400);
    }

    const previewRows = catRows(activeTab);
    const cols = COLS[activeTab];

    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", background: "#f1f5f9" }}>
        {/* 헤더 바 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#1e3a5f", color: "#fff", flexShrink: 0 }}>
          <div style={{ fontWeight: "bold", fontSize: "14pt" }}>재고대장 인쇄 미리보기</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => doIframePrint(activeTab)}
              style={{ padding: "8px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: "11pt", fontWeight: "bold", cursor: "pointer" }}
            >
              🖨️ {activeTab} 인쇄
            </button>
            <button
              onClick={onClose}
              style={{ padding: "8px 16px", background: "#64748b", color: "#fff", border: "none", borderRadius: 6, fontSize: "11pt", cursor: "pointer" }}
            >
              닫기
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div style={{ display: "flex", gap: 8, padding: "8px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", flexShrink: 0 }}>
          {PRINT_CATS.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              style={{
                padding: "6px 18px", borderRadius: 8, border: "1px solid",
                borderColor: activeTab === cat ? "#2563eb" : "#cbd5e1",
                background: activeTab === cat ? "#2563eb" : "#fff",
                color: activeTab === cat ? "#fff" : "#374151",
                fontWeight: "bold", fontSize: "11pt", cursor: "pointer",
              }}
            >
              {cat} ({catRows(cat).length}건)
            </button>
          ))}
        </div>

        {/* 미리보기 */}
        <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", justifyContent: "center" }}>
          <div style={{ background: "#fff", width: "277mm", minHeight: "190mm", padding: "10mm 12mm", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}>
            {/* 제목 */}
            <div style={{ fontSize: 15, fontWeight: "bold", letterSpacing: 4, borderBottom: "2px solid #111", paddingBottom: 4, marginBottom: 6 }}>
              재 고 대 장
            </div>
            <div style={{ fontSize: 9, color: "#444", marginBottom: 8 }}>
              기준일: <strong>{periodLabel}</strong> &nbsp;|&nbsp; 구분: <strong>{activeTab}</strong> &nbsp;|&nbsp; 인쇄일: {printedAt}
            </div>

            {/* 테이블 */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
              <thead>
                <tr>
                  {cols.map((c) => {
                    const isRight = ["prev_stock", "in", "out", "discard", "stock"].includes(c.key);
                    return (
                      <th key={c.key} style={{ padding: "4px 6px", border: "1px solid #d1d5db", background: "#f3f4f6", textAlign: isRight ? "right" : "left", whiteSpace: "nowrap" }}>
                        {c.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 ? (
                  <tr><td colSpan={cols.length} style={{ padding: 8, color: "#888", textAlign: "center" }}>데이터 없음</td></tr>
                ) : (
                  previewRows.map((r, idx) => {
                    const sEA = intMin(r.start_stock_ea ?? 0, 0);
                    const inEA = intMin(r.period_in_ea ?? 0, 0);
                    const outEA = intMin(r.period_out_ea ?? 0, 0);
                    const eEA = intMin(r.end_stock_ea ?? 0, 0);
                    const unit = intMin(r.pack_unit ?? 0, 0);
                    const discardEA = intMin(r.period_discard_ea ?? 0, 0);

                    const cellMap: Record<string, React.ReactNode> = {
                      name: <span style={{ fontWeight: 500 }}>{safeStr(r.product_name ?? "-")}</span>,
                      food_type: safeStr(r.food_type ?? "-"),
                      prev_stock: (
                        <div style={{ textAlign: "right", lineHeight: 1.3 }}>
                          {toBoxAndEa(sEA, unit).boxText && <div style={{ fontWeight: 600 }}>{toBoxAndEa(sEA, unit).boxText}</div>}
                          <div>{toBoxAndEa(sEA, unit).eaText}</div>
                        </div>
                      ),
                      in: (
                        <div style={{ textAlign: "right", lineHeight: 1.3 }}>
                          {toBoxAndEa(inEA, unit).boxText && <div style={{ fontWeight: 700 }}>{toBoxAndEa(inEA, unit).boxText}</div>}
                          <div style={{ fontWeight: 700 }}>{toBoxAndEa(inEA, unit).eaText}</div>
                        </div>
                      ),
                      out: (
                        <div style={{ textAlign: "right", lineHeight: 1.3 }}>
                          {toBoxAndEa(outEA, unit).boxText && <div style={{ fontWeight: 700 }}>{toBoxAndEa(outEA, unit).boxText}</div>}
                          <div style={{ fontWeight: 700 }}>{toBoxAndEa(outEA, unit).eaText}</div>
                        </div>
                      ),
                      discard: discardEA > 0 ? (
                        <div style={{ textAlign: "right", lineHeight: 1.3, color: "#dc2626" }}>
                          {toBoxAndEa(discardEA, unit).boxText && <div style={{ fontWeight: 700 }}>{toBoxAndEa(discardEA, unit).boxText}</div>}
                          <div style={{ fontWeight: 700 }}>{toBoxAndEa(discardEA, unit).eaText}</div>
                        </div>
                      ) : <div style={{ textAlign: "right", color: "#ccc" }}>—</div>,
                      stock: (
                        <div style={{ textAlign: "right", lineHeight: 1.3 }}>
                          {toBoxAndEa(eEA, unit).boxText && <div style={{ fontWeight: 700 }}>{toBoxAndEa(eEA, unit).boxText}</div>}
                          <div style={{ fontWeight: 700 }}>{toBoxAndEa(eEA, unit).eaText}</div>
                        </div>
                      ),
                      expiry: safeStr(r.expiry_date),
                      barcode: safeStr(r.barcode),
                      note: safeStr(r.note ?? ""),
                    };

                    return (
                      <tr key={`${r.barcode}-${r.expiry_date}-${idx}`} style={{ borderTop: "1px solid #e5e7eb" }}>
                        {cols.map((c) => (
                          <td key={c.key} style={{ padding: "3px 6px", border: "1px solid #e5e7eb", verticalAlign: "middle" }}>
                            {cellMap[c.key]}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black p-6 print:bg-white print:text-black print:p-0 print:min-h-0">
      {printModalOpen && <PrintModal onClose={() => setPrintModalOpen(false)} />}

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

      

      {/* ── PIN 인증 모달 ── */}
      {pinModal.open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
            {!pinModal.selectedEmp ? (
              <>
                <div className="mb-4 font-bold text-base text-slate-700 text-center">
                  {pinModal.targetAction === "discard" ? "🗑️ 폐기"
                    : pinModal.targetAction === "edit" ? "✏️ 수정"
                    : pinModal.targetAction === "expiry" ? "📅 소비기한 수정"
                    : "🗑️ 삭제"} — 작업자 선택
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {pinModal.employees.map((emp) => (
                    <button key={emp.id}
                      className="rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 active:scale-95 transition-all text-center"
                      onClick={() => setPinModal((prev) => ({ ...prev, selectedEmp: emp, pinInput: "", pinError: "" }))}>
                      {emp.name}
                      <div className="text-[10px] font-normal text-slate-400 mt-0.5">{emp.pin ? "PIN 설정됨" : "PIN 미설정"}</div>
                    </button>
                  ))}
                </div>
                <button className="w-full text-xs text-slate-400 hover:text-slate-600" onClick={closePinModal}>취소</button>
              </>
            ) : (
              <>
                <button className="mb-4 text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => setPinModal((prev) => ({ ...prev, selectedEmp: null, pinInput: "", pinError: "" }))}>
                  ← 작업자 선택으로
                </button>
                <div className="mb-1 font-semibold text-base text-slate-700 text-center">{pinModal.selectedEmp.name}</div>
                <div className="mb-4 text-sm text-slate-500 text-center">PIN 4자리를 입력하세요</div>
                <div className="flex justify-center gap-3 mb-4">
                  {[0,1,2,3].map((i) => (
                    <div key={i} className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-all
                      ${pinModal.pinInput.length > i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-300"}`}>
                      {pinModal.pinInput.length > i ? "●" : "○"}
                    </div>
                  ))}
                </div>
                {pinModal.pinError && <div className="mb-3 text-center text-xs text-red-500">{pinModal.pinError}</div>}
                <div className="grid grid-cols-3 gap-2">
                  {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                    <button key={i}
                      className={`rounded-xl border py-3 text-lg font-semibold transition-all
                        ${d === "" ? "invisible" : "border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-95"}`}
                      onClick={() => {
                        if (d === "⌫") { setPinModal((prev) => ({ ...prev, pinInput: prev.pinInput.slice(0, -1), pinError: "" })); }
                        else if (d !== "") handlePinDigitInventory(d);
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 폐기 모달 ── */}
      {discardModal.open && discardModal.row ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div className="font-semibold text-orange-700">🗑️ 폐기 처리</div>
              <button
                className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5"
                onClick={() => setDiscardModal({ open: false, row: null, qty: "", saving: false })}
              >닫기</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="text-sm font-medium text-slate-700 truncate">{discardModal.row.product_name}</div>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>소비기한: <span className="font-semibold text-slate-700">{discardModal.row.expiry_date}</span></span>
                <span>현재 재고: <span className="font-semibold text-slate-700">{fmt(intMin(discardModal.row.end_stock_ea))} EA</span></span>
              </div>
              {!discardModal.row.lot_id && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  ⚠ lot 정보를 찾을 수 없습니다. 하루 조회 모드로 다시 조회해주세요.
                </div>
              )}
              <div>
                <div className="mb-1 text-xs text-black/60">폐기 수량 (EA) *</div>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm text-right tabular-nums outline-none focus:border-orange-400"
                  value={discardModal.qty}
                  onChange={(e) => setDiscardModal((prev) => ({ ...prev, qty: e.target.value.replace(/[^\d]/g, "") }))}
                  placeholder="0"
                />
              </div>
              <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-700">
                ⚠ DISCARD movement가 기록됩니다. 현재 기준일({startDay}) 기준으로 처리됩니다.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
              <button
                className="rounded-xl border border-black/15 px-4 py-2 text-sm hover:bg-black/5"
                onClick={() => setDiscardModal({ open: false, row: null, qty: "", saving: false })}
              >취소</button>
              <button
                className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                onClick={saveDiscard}
                disabled={discardModal.saving || !discardModal.row.lot_id || !discardModal.qty}
              >{discardModal.saving ? "처리 중..." : "폐기 처리"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── 수정 모달 (제품명·식품유형·재고수량) ── */}
      {editModal.open && editModal.row ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-black/10 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div className="font-semibold">재고 수정 · ADMIN</div>
              <button
                className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5"
                onClick={() => setEditModal((prev) => ({ ...prev, open: false }))}
              >닫기</button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <div className="mb-1 text-xs text-black/60">제품명 (variant_name)</div>
                <input
                  className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  value={editModal.product_name}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, product_name: e.target.value }))}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-black/60">식품유형 (products.food_type)</div>
                <input
                  className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  value={editModal.food_type}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, food_type: e.target.value }))}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-black/60">재고 수량 (EA)</div>
                <input
                  className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm text-right tabular-nums outline-none focus:border-blue-400"
                  inputMode="numeric"
                  value={editModal.end_stock_ea}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, end_stock_ea: e.target.value.replace(/[^\d]/g, "") }))}
                />
                <div className="mt-1 text-xs text-black/40">현재: {fmt(intMin(editModal.row.end_stock_ea))} EA → 차이만큼 movements에 IN/OUT 자동 추가</div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-600">
                ℹ 소비기한 수정은 별도 "소비기한" 버튼을 사용하세요.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
              <button
                className="rounded-xl border border-black/15 px-4 py-2 text-sm hover:bg-black/5"
                onClick={() => setEditModal((prev) => ({ ...prev, open: false }))}
              >취소</button>
              <button
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={saveEdit}
                disabled={editSaving}
              >{editSaving ? "저장 중..." : "저장"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── 소비기한 전용 모달 ── */}
      {expiryModal.open && expiryModal.row ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div className="font-semibold">소비기한 수정 · ADMIN</div>
              <button
                className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5"
                onClick={() => setExpiryModal({ open: false, row: null, newExpiry: "" })}
              >닫기</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="text-sm font-medium text-slate-700 truncate">
                {expiryModal.row.product_name}
              </div>
              <div className="text-xs text-slate-500">
                현재 소비기한: <span className="font-semibold text-slate-700">{expiryModal.row.expiry_date}</span>
              </div>
              {!expiryModal.row.lot_id && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  ⚠ lot 정보를 찾을 수 없습니다. 조회 후 다시 시도해주세요.
                </div>
              )}
              <div>
                <div className="mb-1 text-xs text-black/60">변경할 소비기한</div>
                <input
                  type="date"
                  className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-amber-400"
                  value={expiryModal.newExpiry}
                  onChange={(e) => setExpiryModal((prev) => ({ ...prev, newExpiry: e.target.value }))}
                />
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                ⚠ 동일 제품·다른 소비기한 LOT이 이미 존재하면 자동으로 병합됩니다.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
              <button
                className="rounded-xl border border-black/15 px-4 py-2 text-sm hover:bg-black/5"
                onClick={() => setExpiryModal({ open: false, row: null, newExpiry: "" })}
              >취소</button>
              <button
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                onClick={saveExpiry}
                disabled={expirySaving || !expiryModal.row.lot_id}
              >{expirySaving ? "저장 중..." : "소비기한 변경"}</button>
            </div>
          </div>
        </div>
      ) : null}

      <div id="report-print-area">
      <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">재고대장</h1>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-3 print:hidden">
          <div>
            <label className="text-sm text-black/70">조회 방식</label>
            <select
              className="mt-1 w-44 rounded-xl bg-white border border-black/15 px-3 py-2 outline-none"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="DAY">하루</option>
              <option value="RANGE">기간</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-black/70">{mode === "DAY" ? "기준일" : "시작일"}</label>
            <input
              className="mt-1 w-44 rounded-xl bg-white border border-black/15 px-3 py-2 outline-none font-mono"
              type="date"
              value={startDay}
              onChange={(e) => setStartDay(e.target.value)}
            />
          </div>

          {mode === "RANGE" && (
            <div>
              <label className="text-sm text-black/70">종료일</label>
              <input
                className="mt-1 w-44 rounded-xl bg-white border border-black/15 px-3 py-2 outline-none font-mono"
                type="date"
                value={endDay}
                onChange={(e) => setEndDay(e.target.value)}
              />
            </div>
          )}

<div className="flex items-end gap-1">
{(["ALL", "기성", "업체", "전사지", "코팅/분사", "생산용전사지"] as Category[]).map((cat) => (
              <button
                key={cat}
                className={`rounded-xl px-3 py-2 text-sm font-semibold border transition-all
                  ${categoryFilter === cat
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-black/15 bg-white text-black/70 hover:bg-black/5"}`}
                    onClick={() => { setCategoryFilter(cat); fetchReport(cat); }}
              >
                {cat === "ALL" ? "전체" : cat}
              </button>
            ))}
          </div>

          <button
            className="rounded-xl bg-blue-600 text-white px-4 py-2 font-medium disabled:opacity-60 hover:bg-blue-700"
            disabled={loading}
            onClick={() => fetchReport()}
          >
            {loading ? "조회 중..." : "조회"}
          </button>

          <button
            className="rounded-xl border border-black/15 px-4 py-2 disabled:opacity-60 hover:bg-black/5"
            disabled={loading || filteredRows.length === 0}
            onClick={downloadExcel}
          >
            엑셀 저장
          </button>

          <button
            className="rounded-xl border border-black/15 px-4 py-2 disabled:opacity-60 hover:bg-black/5"
            disabled={loading || filteredRows.length === 0}
            onClick={doPrint}
          >
            PDF/인쇄
          </button>

          <div className="relative w-44">
            <input
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 pr-7 text-sm outline-none focus:border-blue-400"
              placeholder="제품명 또는 바코드 검색"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
            {searchKeyword && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60"
                onClick={() => setSearchKeyword("")}
              >✕</button>
            )}
          </div>

          {msg && (
            <div className={`text-sm ${msg.startsWith("✅") || msg.startsWith("🗑️") ? "text-green-700" : "text-red-600"}`}>
              {msg}
            </div>
          )}
        </div>

<div className="mt-6 rounded-2xl border border-black/10 overflow-x-auto print-tight print:border-black/20">

<table className="w-full text-sm">
<thead className="bg-black/5 print:bg-black/5">

          <tr>
          {displayCols.map((col) => {
                  const colMinW: Record<string, string> = {
                    name: "130px", food_type: "90px",
                    prev_stock: "75px", in: "65px", out: "65px",
                    discard: "55px", stock: "75px",
                    expiry: "88px", barcode: "105px",
                    note: "36px", actions: "130px",
                  };
                  return (
                  <th
                    key={col.key}
                    className={`p-3 print:p-2 ${isRightAlign(col.key as ColKey) ? "text-right" : "text-left"}`}
                    style={{ minWidth: colMinW[col.key] ?? "auto", whiteSpace: "nowrap" }}
                  >
                   {(["name","food_type","prev_stock","in","out","discard","stock","expiry","barcode"] as const).includes(col.key as any) ? (
                      <button
                        className={`flex items-center gap-1 hover:text-blue-600 transition-colors whitespace-nowrap ${isRightAlign(col.key as ColKey) ? "justify-end w-full" : ""}`}
                        onClick={() => {
                          if (sortKey === col.key) {
                            setSortDir((d) => d === "asc" ? "desc" : "asc");
                          } else {
                            setSortKey(col.key as any);
                            setSortDir("asc");
                          }
                        }}
                      >
                        {col.label}
                        <span className="text-xs">
                          {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </button>
                    ) : col.label}
                 </th>
                  );
                })}
              </tr>
             
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="p-3 text-black/60" colSpan={displayCols.length}>
                    데이터가 없습니다. (날짜/필터 확인 후 조회)
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, idx) => {
                  const sEA = intMin(r.start_stock_ea ?? 0, 0);
                  const inEA = intMin(r.period_in_ea ?? 0, 0);
                  const outEA = intMin(r.period_out_ea ?? 0, 0);
                  const eEA = intMin(r.end_stock_ea ?? 0, 0);
                  const unit = intMin(r.pack_unit ?? 0, 0);

                  const nameCell = safeStr(r.product_name ?? "-");
                  const foodTypeCell = safeStr(r.food_type ?? "-");

                  const cellMap: Record<string, React.ReactNode> = {
                    name: <span className="font-medium">{nameCell}</span>,
                    food_type: foodTypeCell,
                    prev_stock: (
                      <div className="text-right leading-tight">
                        <div className="font-semibold">{toBoxAndEa(sEA, unit).boxText}</div>
                        <div className="text-sm font-medium text-black/80 print-sub">{toBoxAndEa(sEA, unit).eaText}</div>
                      </div>
                    ),
                    in: (() => {
                      const isExpanded = drillOpen?.barcode === r.barcode && drillOpen?.expiry === r.expiry_date && drillOpen?.colType === "in";
                      if (inEA > 0 && r.lot_id && mode === "DAY") {
                        return (
                          <button
                            className={`w-full text-right leading-tight underline decoration-dotted hover:decoration-solid transition-colors ${isExpanded ? "text-green-800" : "text-green-700 hover:text-green-900"}`}
                            onClick={() => handleMovDrillDown(r, "in")}
                          >
                            <div className="font-bold">{toBoxAndEa(inEA, unit).boxText}</div>
                            <div className="text-sm font-bold print-sub">{toBoxAndEa(inEA, unit).eaText} {isExpanded ? "▲" : "▼"}</div>
                          </button>
                        );
                      }
                      return (
                        <div className="text-right leading-tight">
                          <div className="font-bold">{toBoxAndEa(inEA, unit).boxText}</div>
                          <div className="text-sm font-bold text-black/80 print-sub">{toBoxAndEa(inEA, unit).eaText}</div>
                        </div>
                      );
                    })(),
                    out: (() => {
                      const isExpanded = drillOpen?.barcode === r.barcode && drillOpen?.expiry === r.expiry_date && drillOpen?.colType === "out";
                      if (outEA > 0 && r.lot_id && mode === "DAY") {
                        return (
                          <button
                            className={`w-full text-right leading-tight underline decoration-dotted hover:decoration-solid transition-colors ${isExpanded ? "text-blue-800" : "text-blue-600 hover:text-blue-800"}`}
                            onClick={() => handleMovDrillDown(r, "out")}
                          >
                            <div className="font-bold">{toBoxAndEa(outEA, unit).boxText}</div>
                            <div className="text-sm font-bold print-sub">{toBoxAndEa(outEA, unit).eaText} {isExpanded ? "▲" : "▼"}</div>
                          </button>
                        );
                      }
                      return (
                        <div className="text-right leading-tight">
                          <div className="font-bold">{toBoxAndEa(outEA, unit).boxText}</div>
                          <div className="text-sm font-bold text-black/80 print-sub">{toBoxAndEa(outEA, unit).eaText}</div>
                        </div>
                      );
                    })(),
                    discard: (() => {
                      const discardEA = intMin(r.period_discard_ea ?? 0, 0);
                      return discardEA > 0 ? (
                        <div className="text-right leading-tight text-red-600">
                          <div className="font-bold">{toBoxAndEa(discardEA, unit).boxText}</div>
                          <div className="text-sm font-bold print-sub">{toBoxAndEa(discardEA, unit).eaText}</div>
                        </div>
                      ) : <div className="text-right text-black/30">—</div>;
                    })(),
                    stock: (
                      <div className="text-right leading-tight">
                        <div className="font-bold">{toBoxAndEa(eEA, unit).boxText}</div>
                        <div className="text-sm font-bold text-black/80 print-sub">{toBoxAndEa(eEA, unit).eaText}</div>
                      </div>
                    
                    ),
                    expiry: safeStr(r.expiry_date),
                    barcode: safeStr(r.barcode),
                    note: safeStr(r.note ?? ""),
                    actions: (isAdmin || isSubAdmin) ? (
                      <div className="flex gap-1 print:hidden">
                        {isAdmin && (
                          <>
                            <button
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                              onClick={() => openPinModal("edit", r)}
                            >수정</button>
                            <button
                              className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                              onClick={() => openPinModal("expiry", r)}
                            >소비기한</button>
                            <button
                              className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                              onClick={() => openPinModal("delete", r)}
                            >삭제</button>
                          </>
                        )}
                        <button
                          className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
                          onClick={() => openPinModal("discard", r)}
                        >폐기</button>
                      </div>
                    ) : null,
                  };

                  const isDrillExpanded =
                    drillOpen?.barcode === r.barcode && drillOpen?.expiry === r.expiry_date;

                  return (
                    <React.Fragment key={`${r.barcode}-${r.expiry_date}-${idx}`}>
                      <tr className="border-t border-black/10 print:border-black/15">
                        {displayCols.map((col) => (
                          <td
                            key={col.key}
                            className="p-3 print:p-2"
                          >
                            {cellMap[col.key]}
                          </td>
                        ))}
                      </tr>
                      {isDrillExpanded && (
                        <tr className={drillOpen?.colType === "out" ? "bg-blue-50" : "bg-green-50"}>
                          <td colSpan={displayCols.length} className="py-2 px-8 w-full">
                            <div className="max-w-xl">
                            {drillMovLoading ? (
                              <div className="text-xs text-slate-400 py-1">불러오는 중...</div>
                            ) : drillMovements.length === 0 ? (
                              <div className="text-xs text-slate-400 py-1">내역이 없습니다.</div>
                            ) : (
                              <div className="space-y-0.5">
                               {drillMovements.map((m: any, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs py-0.5 border-b border-slate-100 last:border-0">
                                    <span className="text-slate-600 flex items-center gap-1.5">
                                      └
                                      {m.clientName && (
                                        <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                          {m.clientName}
                                        </span>
                                      )}
                                      {!m.clientName && m.note && (
                                        <span className="text-slate-400">{m.note}</span>
                                      )}
                                    </span>
                                    <span className="tabular-nums font-semibold text-slate-700 ml-4">{m.qty.toLocaleString()} EA</span>
                                  </div>
                                ))}
                                <div className="flex items-center justify-between text-xs py-1 font-bold border-t border-slate-200 mt-0.5">
                                  <span className={drillOpen?.colType === "out" ? "text-blue-700" : "text-green-700"}>합계</span>
                                  <span className="tabular-nums">{drillMovements.reduce((s, m) => s + m.qty, 0).toLocaleString()} EA</span>
                                </div>
                              </div>
                           )}
                           </div>
                         </td>
                       </tr>
                     )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-black/50 print:hidden">
          ※ 선택한 "구분 필터"가 화면/엑셀/인쇄에 동일하게 적용됩니다. / 기간 조회는 내부적으로 날짜별 재고리포트를 집계합니다.
          {isAdmin && " / ADMIN: 수정(제품명·식품유형·재고수량) · 소비기한 · 삭제 기능 활성화됨"}
        </div>
      </div>

      <button
        type="button"
        onClick={scrollTop}
        className="print:hidden fixed bottom-24 right-6 z-50 rounded-2xl bg-black text-white px-5 py-4 shadow-lg hover:bg-black/85 active:scale-[0.99]"
        aria-label="TOP"
        title="TOP"
      >
        <div className="text-sm font-semibold leading-none">TOP</div>
        <div className="text-[11px] opacity-80 mt-1 leading-none">맨 위로</div>
      </button>
    </div>
  );
}
