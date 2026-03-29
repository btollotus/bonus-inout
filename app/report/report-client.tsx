"use client";

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

type Category = "ALL" | "기성" | "업체" | "전사지";

type RpcRow = {
  product_name: string;
  product_category: string | null;
  food_type: string | null;
  prev_stock_ea: number | null;
  today_in_ea: number | null;
  today_out_ea: number | null;
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

function csvEscape(v: any) {
  const s = safeStr(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

type ColKey = "name" | "food_type" | "prev_stock" | "in" | "out" | "stock" | "expiry" | "barcode" | "note";

const COLS: Record<Exclude<Category, "ALL">, { key: ColKey; label: string }[]> = {
  기성: [
    { key: "name",       label: "품목명" },
    { key: "food_type",  label: "식품유형" },
    { key: "prev_stock", label: "전일재고" },
    { key: "in",         label: "입고" },
    { key: "out",        label: "출고" },
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
    { key: "stock",      label: "재고" },
    { key: "expiry",     label: "소비기한" },
    { key: "barcode",    label: "바코드" },
    { key: "note",       label: "비고" },
  ],
  전사지: [
    { key: "name",      label: "품목명" },
    { key: "food_type", label: "식품유형" },
    { key: "in",        label: "입고" },
    { key: "out",       label: "출고" },
    { key: "stock",     label: "재고" },
    { key: "expiry",    label: "소비기한" },
    { key: "barcode",   label: "바코드" },
    { key: "note",      label: "비고" },
  ],
};

const COLS_ALL: { key: ColKey; label: string }[] = [
  { key: "name",       label: "제품명" },
  { key: "food_type",  label: "식품유형" },
  { key: "prev_stock", label: "시작재고" },
  { key: "in",         label: "기간입고합" },
  { key: "out",        label: "기간출고합" },
  { key: "stock",      label: "종료재고" },
  { key: "expiry",     label: "소비기한" },
  { key: "barcode",    label: "바코드" },
  { key: "note",       label: "비고" },
];

function getCols(cat: Category) {
  if (cat === "ALL") return COLS_ALL;
  return COLS[cat];
}

type EditModalState = {
  open: boolean;
  row: AggRow | null;
  product_name: string;
  food_type: string;
  end_stock_ea: string;
  expiry_date: string;
  note: string;
};

export default function ReportClient() {
  const supabase = useMemo(() => createClient(), []);

  const [mode, setMode] = useState<"DAY" | "RANGE">("DAY");
  const [startDay, setStartDay] = useState<string>(() => formatYYYYMMDD(new Date()));
  const [endDay, setEndDay] = useState<string>(() => formatYYYYMMDD(new Date()));
  const [categoryFilter, setCategoryFilter] = useState<Category>("ALL");

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

  const [editModal, setEditModal] = useState<EditModalState>({
    open: false, row: null,
    product_name: "", food_type: "", end_stock_ea: "", expiry_date: "", note: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  const printedAt = formatYYYYMMDD(new Date());

  // ✅ document.title 제거 — inventory-client.tsx의 탭 useEffect에서 관리

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      setIsAdmin(data?.role === "ADMIN");
    })();
  }, []);

  useEffect(() => {
    if (mode === "DAY") setEndDay(startDay);
  }, [mode, startDay]);

  const filteredRows =
    categoryFilter === "ALL"
      ? rows
      : rows.filter((r) => (r.product_category ?? "") === categoryFilter);

  const periodLabel = startDay === endDay ? `${startDay}` : `${startDay} ~ ${endDay}`;

  const fetchReport = async () => {
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
            if (isLast) exists.end_stock_ea = endEA;
            exists.product_category = r.product_category ?? exists.product_category;
            exists.food_type = r.food_type ?? exists.food_type;
            exists.note = (r.note ?? exists.note) as any;
            exists.pack_unit = (r.pack_unit ?? exists.pack_unit) as any;
          }
        }
      }

      let listAgg = Array.from(agg.values());
      if (isAdmin && listAgg.length > 0) {
        const barcodes = listAgg.map((r) => r.barcode).filter(Boolean);
        const { data: lotData } = await supabase
          .from("lots")
          .select("id, expiry_date, variant_id, product_variants(barcode)")
          .in("variant_id", (
            await supabase
              .from("product_variants")
              .select("id")
              .in("barcode", barcodes)
          ).data?.map((v: any) => v.id) ?? []);

        if (lotData) {
          for (const row of listAgg) {
            const lot = (lotData as any[]).find((l) =>
              (l.product_variants as any)?.barcode === row.barcode &&
              l.expiry_date === row.expiry_date
            );
            if (lot) {
              row.lot_id = lot.id;
              row.variant_id = lot.variant_id;
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

      const after = categoryFilter === "ALL"
        ? listAgg
        : listAgg.filter((r) => (r.product_category ?? "") === categoryFilter);

      setMsg(
        `조회 완료 ✅ ${after.length}건 (${periodLabel})` +
        (categoryFilter === "ALL" ? "" : ` / 구분: ${categoryFilter}`)
      );
    } catch (e: any) {
      setRows([]);
      setMsg(e?.message ?? "조회 오류");
    } finally {
      setLoading(false);
    }
  };

  function openEdit(r: AggRow) {
    setEditModal({
      open: true,
      row: r,
      product_name: r.product_name ?? "",
      food_type: r.food_type ?? "",
      end_stock_ea: String(r.end_stock_ea ?? 0),
      expiry_date: r.expiry_date ?? "",
      note: r.note ?? "",
    });
  }

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

      if (row.lot_id) {
        await supabase
          .from("lots")
          .update({ expiry_date: editModal.expiry_date })
          .eq("id", row.lot_id);
      }

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

  const doPrint = () => {
    if (filteredRows.length === 0) { setMsg("인쇄할 데이터가 없습니다. (날짜/필터 확인 후 조회)"); return; }
    window.print();
  };

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
  const isRightAlign = (key: ColKey) => ["prev_stock", "in", "out", "stock"].includes(key);

  const displayCols = isAdmin
    ? [...cols, { key: "actions" as any, label: "작업" }]
    : cols;

  return (
    <div className="min-h-screen bg-white text-black p-6 print:bg-white print:text-black print:p-0 print:min-h-0">
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

      <style jsx global>{`
        @media print {
          header, nav { display: none !important; }
          body * { visibility: hidden !important; }
          #report-print-area, #report-print-area * { visibility: visible !important; }
          #report-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }
          @page { size: A4; margin: 10mm; }
          html, body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px !important; }
          table { border-collapse: collapse !important; font-size: 10px !important; }
          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }
          tr { page-break-inside: avoid !important; }
          th, td { padding-top: 3px !important; padding-bottom: 3px !important; line-height: 1.12 !important; }
          .print-sub { font-size: 9px !important; line-height: 1.1 !important; }
          .print-tight { margin-top: 0 !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          #report-print-area { padding: 0 !important; margin: 0 !important; }
        }
        .print-only { display: none; }
      `}</style>

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
              <div>
                <div className="mb-1 text-xs text-black/60">소비기한</div>
                <input
                  type="date"
                  className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  value={editModal.expiry_date}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, expiry_date: e.target.value }))}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-black/60">비고</div>
                <input
                  className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  value={editModal.note}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, note: e.target.value }))}
                />
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

      <div id="report-print-area">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">재고대장</h1>
              {isAdmin && (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  ADMIN
                </span>
              )}
            </div>
            <div className="print-only" style={{ marginTop: 6 }}>
              인쇄일: {printedAt}<br />
              기간: {periodLabel}<br />
              구분 필터: {categoryFilter === "ALL" ? "전체" : categoryFilter}
            </div>
            <p className="text-black/60 mt-2 print:text-black/70">
              - 시작재고/기간입고합/기간출고합/종료재고를 LOT(소비기한) 단위로 표시합니다.
            </p>
          </div>
          <a href="/" className="no-print inline-flex rounded-xl border border-black/15 px-4 py-2 hover:bg-black/5 print:hidden">
            홈
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-3 no-print">
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

          <div>
            <label className="text-sm text-black/70">구분 필터</label>
            <select
              className="mt-1 w-44 rounded-xl bg-white border border-black/15 px-3 py-2 outline-none"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as Category)}
            >
              <option value="ALL">전체</option>
              <option value="기성">기성</option>
              <option value="업체">업체</option>
              <option value="전사지">전사지</option>
            </select>
          </div>

          <button
            className="rounded-xl bg-blue-600 text-white px-4 py-2 font-medium disabled:opacity-60 hover:bg-blue-700"
            disabled={loading}
            onClick={fetchReport}
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

          {msg && (
            <div className={`text-sm ${msg.startsWith("✅") || msg.startsWith("🗑️") ? "text-green-700" : "text-red-600"}`}>
              {msg}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-black/10 overflow-hidden print-tight print:border-black/20">
          <table className="w-full text-sm">
            <thead className="bg-black/5 print:bg-black/5">
              <tr>
                {displayCols.map((col) => (
                  <th
                    key={col.key}
                    className={`p-3 print:p-2 ${isRightAlign(col.key as ColKey) ? "text-right" : "text-left"}`}
                  >
                    {col.label}
                  </th>
                ))}
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
                        <div>{toBoxAndEa(sEA, unit).boxText}</div>
                        <div className="text-xs text-black/60 print-sub">{toBoxAndEa(sEA, unit).eaText}</div>
                      </div>
                    ),
                    in: (
                      <div className="text-right leading-tight">
                        <div>{toBoxAndEa(inEA, unit).boxText}</div>
                        <div className="text-xs text-black/60 print-sub">{toBoxAndEa(inEA, unit).eaText}</div>
                      </div>
                    ),
                    out: (
                      <div className="text-right leading-tight">
                        <div>{toBoxAndEa(outEA, unit).boxText}</div>
                        <div className="text-xs text-black/60 print-sub">{toBoxAndEa(outEA, unit).eaText}</div>
                      </div>
                    ),
                    stock: (
                      <div className="text-right leading-tight">
                        <div>{toBoxAndEa(eEA, unit).boxText}</div>
                        <div className="text-xs text-black/60 print-sub">{toBoxAndEa(eEA, unit).eaText}</div>
                      </div>
                    ),
                    expiry: safeStr(r.expiry_date),
                    barcode: safeStr(r.barcode),
                    note: safeStr(r.note ?? ""),
                    actions: isAdmin ? (
                      <div className="flex gap-1 no-print">
                        <button
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          onClick={() => openEdit(r)}
                        >수정</button>
                        <button
                          className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                          onClick={() => deleteRow(r)}
                        >삭제</button>
                      </div>
                    ) : null,
                  };

                  return (
                    <tr
                      key={`${r.barcode}-${r.expiry_date}-${idx}`}
                      className="border-t border-black/10 print:border-black/15"
                    >
                      {displayCols.map((col) => (
                        <td
                          key={col.key}
                          className="p-3 print:p-2"
                        >
                          {cellMap[col.key]}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-black/50 no-print">
          ※ 선택한 "구분 필터"가 화면/엑셀/인쇄에 동일하게 적용됩니다. / 기간 조회는 내부적으로 날짜별 재고리포트를 집계합니다.
          {isAdmin && " / ADMIN: 수정·삭제 기능 활성화됨"}
        </div>
      </div>

      <button
        type="button"
        onClick={scrollTop}
        className="no-print fixed bottom-6 right-6 z-50 rounded-2xl bg-black text-white px-5 py-4 shadow-lg hover:bg-black/85 active:scale-[0.99]"
        aria-label="TOP"
        title="TOP"
      >
        <div className="text-sm font-semibold leading-none">TOP</div>
        <div className="text-[11px] opacity-80 mt-1 leading-none">맨 위로</div>
      </button>
    </div>
  );
}
