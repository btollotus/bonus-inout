"use client";

import { createClient } from "@/lib/supabase/browser";
import { useMemo, useState } from "react";

type Category = "ALL" | "기성" | "업체" | "전사지";

type Row = {
  product_name: string;
  product_category: string | null; // 구분
  food_type: string | null; // 식품유형
  prev_stock_ea: number | null;
  today_in_ea: number | null;
  today_out_ea: number | null;
  today_stock_ea: number | null;
  expiry_date: string; // YYYY-MM-DD (date)
  barcode: string;
  note: string | null;
  pack_unit?: number | null;
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

const nf = new Intl.NumberFormat("ko-KR");
const fmt = (n: number) => nf.format(intMin(n, 0));

function toBoxAndEa(ea: number, packUnit?: number | null) {
  const u = intMin(packUnit ?? 0, 0);
  const e = intMin(ea, 0);

  // 하이픈(-)이 점처럼 보이는 렌더링 이슈 방지: em dash 사용
  if (!u || u <= 0) return { boxText: "", eaText: `${fmt(e)} EA` };

  const box = Math.floor(e / u);
  const rem = e % u;
  const boxText = rem === 0 ? `${fmt(box)} BOX` : `${fmt(box)} BOX (+${fmt(rem)}EA)`;
  return { boxText, eaText: `${fmt(e)} EA` };
}

export default function ReportClient() {
  const supabase = useMemo(() => createClient(), []);

  const [day, setDay] = useState<string>(() => formatYYYYMMDD(new Date()));
  const [categoryFilter, setCategoryFilter] = useState<Category>("ALL");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const printedAt = formatYYYYMMDD(new Date());

  const filteredRows =
    categoryFilter === "ALL"
      ? rows
      : rows.filter((r) => (r.product_category ?? "") === categoryFilter);

  const fetchReport = async () => {
    if (!isYYYYMMDD(day)) {
      setMsg("기준일 형식은 YYYY-MM-DD 입니다. 예) 2026-02-05");
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const { data, error } = await supabase.rpc("rpc_daily_stock_report", {
        p_day: day,
      });
      if (error) throw new Error(error.message);

      const list = (data ?? []) as Row[];
      setRows(list);

      // ✅ 메시지는 “필터 적용된 건수” 기준으로
      const after =
        categoryFilter === "ALL"
          ? list
          : list.filter((r) => (r.product_category ?? "") === categoryFilter);

      setMsg(
        `조회 완료 ✅ ${after.length}건 (${day})` +
          (categoryFilter === "ALL" ? "" : ` / 구분: ${categoryFilter}`)
      );
    } catch (e: any) {
      setRows([]);
      setMsg(e?.message ?? "조회 오류");
    } finally {
      setLoading(false);
    }
  };

  const doPrint = () => window.print();

  return (
    <div className="min-h-screen bg-black text-white p-6 print:bg-white print:text-black">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-size: 10px !important;
          }
          table {
            border-collapse: collapse !important;
            font-size: 10px !important;
          }
          th,
          td {
            padding-top: 3px !important;
            padding-bottom: 3px !important;
            line-height: 1.12 !important;
          }
          .print-sub {
            font-size: 9px !important;
            line-height: 1.1 !important;
          }
          .print-tight {
            margin-top: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
        }

        .print-only {
          display: none;
        }
      `}</style>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">일일 재고대장</h1>

          {/* ✅ 인쇄물에만 표시 */}
          <div className="print-only" style={{ marginTop: 6 }}>
            인쇄일: {printedAt}
            <br />
            기준일: {day}
            <br />
            구분 필터: {categoryFilter === "ALL" ? "전체" : categoryFilter}
          </div>

          <p className="text-white/60 mt-2 print:text-black/70">
            - 전일재고/당일입고/당일출고/당일재고를 LOT(소비기한) 단위로 표시합니다.
          </p>
        </div>

        <a
          href="/"
          className="no-print inline-flex rounded-xl border border-white/15 px-4 py-2 hover:bg-white/5 print:hidden"
        >
          홈
        </a>
      </div>

      {/* ✅ 조회/필터 영역 */}
      <div className="mt-6 flex flex-wrap items-end gap-3 no-print">
        <div>
          <label className="text-sm text-white/70">기준일</label>
          <input
            className="mt-1 w-44 rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none font-mono"
            type="text"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            value={day}
            onChange={(e) => setDay(e.target.value.replace(/[^0-9-]/g, ""))}
            onBlur={() => {
              if (day && !isYYYYMMDD(day)) {
                setMsg("기준일 형식은 YYYY-MM-DD 입니다. 예) 2026-02-05");
              }
            }}
          />
        </div>

        <div>
          <label className="text-sm text-white/70">구분 필터</label>
          <select
            className="mt-1 w-44 rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
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
          className="rounded-xl bg-white text-black px-4 py-2 font-medium disabled:opacity-60"
          disabled={loading}
          onClick={fetchReport}
        >
          {loading ? "조회 중..." : "조회"}
        </button>

        <button
          className="rounded-xl border border-white/15 px-4 py-2 disabled:opacity-60"
          disabled={loading || filteredRows.length === 0}
          onClick={doPrint}
        >
          인쇄
        </button>

        {msg && <div className="text-sm text-white/70">{msg}</div>}
      </div>

      {/* ✅ 테이블 (필터 적용된 데이터로 출력/인쇄) */}
      <div className="mt-6 rounded-2xl border border-white/10 overflow-hidden print-tight print:border-black/20">
        <table className="w-full text-sm">
          <thead className="bg-white/5 print:bg-black/5">
            <tr>
              <th className="text-left p-3 print:p-2">제품명</th>
              <th className="text-left p-3 print:p-2">구분</th>
              <th className="text-left p-3 print:p-2">식품유형</th>

              <th className="text-right p-3 print:p-2">전일재고</th>
              <th className="text-right p-3 print:p-2">당일입고</th>
              <th className="text-right p-3 print:p-2">당일출고</th>
              <th className="text-right p-3 print:p-2">당일재고</th>

              <th className="text-left p-3 print:p-2">소비기한</th>
              <th className="text-left p-3 print:p-2">바코드</th>
              <th className="text-left p-3 print:p-2">비고</th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td className="p-3 text-white/60 print:text-black/60" colSpan={10}>
                  데이터가 없습니다. (날짜/필터 확인 후 조회)
                </td>
              </tr>
            ) : (
              filteredRows.map((r, idx) => {
                const prevEA = intMin(r.prev_stock_ea ?? 0, 0);
                const inEA = intMin(r.today_in_ea ?? 0, 0);
                const outEA = intMin(r.today_out_ea ?? 0, 0);
                const todayEA = intMin(r.today_stock_ea ?? 0, 0);

                const unit = intMin(r.pack_unit ?? 0, 0);
                const prev = toBoxAndEa(prevEA, unit);
                const tin = toBoxAndEa(inEA, unit);
                const tout = toBoxAndEa(outEA, unit);
                const tstock = toBoxAndEa(todayEA, unit);

                return (
                  <tr
                    key={`${r.barcode}-${r.expiry_date}-${idx}`}
                    className="border-t border-white/10 print:border-black/15"
                  >
                    <td className="p-3 print:p-2 font-medium">{safeStr(r.product_name)}</td>
                    <td className="p-3 print:p-2">{safeStr(r.product_category ?? "-")}</td>
                    <td className="p-3 print:p-2">{safeStr(r.food_type ?? "-")}</td>

                    <td className="p-3 print:p-2 text-right leading-tight">
                      <div>{prev.boxText}</div>
                      <div className="text-xs text-white/60 print:text-black/60 print-sub">{prev.eaText}</div>
                    </td>

                    <td className="p-3 print:p-2 text-right leading-tight">
                      <div>{tin.boxText}</div>
                      <div className="text-xs text-white/60 print:text-black/60 print-sub">{tin.eaText}</div>
                    </td>

                    <td className="p-3 print:p-2 text-right leading-tight">
                      <div>{tout.boxText}</div>
                      <div className="text-xs text-white/60 print:text-black/60 print-sub">{tout.eaText}</div>
                    </td>

                    <td className="p-3 print:p-2 text-right leading-tight">
                      <div>{tstock.boxText}</div>
                      <div className="text-xs text-white/60 print:text-black/60 print-sub">{tstock.eaText}</div>
                    </td>

                    <td className="p-3 print:p-2">{safeStr(r.expiry_date)}</td>
                    <td className="p-3 print:p-2">{safeStr(r.barcode)}</td>
                    <td className="p-3 print:p-2">{safeStr(r.note ?? "")}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-xs text-white/40 no-print">
        ※ 선택한 “구분 필터”가 화면/인쇄에 동일하게 적용됩니다.
      </div>
    </div>
  );
}