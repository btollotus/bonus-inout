"use client";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "재고대장 | BONUSMATE ERP" };

import { createClient } from "@/lib/supabase/browser";
import { useEffect, useMemo, useState } from "react";

type Category = "ALL" | "기성" | "업체" | "전사지";

type RpcRow = {
  product_name: string;
  product_category: string | null; // 구분
  food_type: string | null; // 식품유형
  prev_stock_ea: number | null;
  today_in_ea: number | null;
  today_out_ea: number | null;
  today_stock_ea: number | null;
  expiry_date: string; // YYYY-MM-DD
  barcode: string;
  note: string | null;
  pack_unit?: number | null;
};

type AggRow = {
  product_name: string;
  product_category: string | null;
  food_type: string | null;

  start_stock_ea: number; // 시작재고(시작일 기준 전일재고)
  period_in_ea: number; // 기간입고합
  period_out_ea: number; // 기간출고합
  end_stock_ea: number; // 종료재고(종료일 기준 당일재고)

  expiry_date: string;
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

function parseYYYYMMDD(s: string) {
  // 로컬 타임존 기준 안전 파싱
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

function shouldReplaceFoodType(cur: string | null | undefined) {
  const s = (cur ?? "").trim();
  if (!s) return true;
  // ✅ 재고대장에서 식품유형 칸에 EA/BOX 같은 값이 들어오는 케이스 방지
  if (s === "EA" || s === "BOX") return true;
  return false;
}

export default function ReportClient() {
  const supabase = useMemo(() => createClient(), []);

  // ✅ 하루/기간 선택
  const [mode, setMode] = useState<"DAY" | "RANGE">("DAY");

  const [startDay, setStartDay] = useState<string>(() => formatYYYYMMDD(new Date()));
  const [endDay, setEndDay] = useState<string>(() => formatYYYYMMDD(new Date()));

  const [categoryFilter, setCategoryFilter] = useState<Category>("ALL");

  const [rows, setRows] = useState<AggRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const printedAt = formatYYYYMMDD(new Date());

  useEffect(() => {
    // ✅ 탭 제목
    document.title = "BONUSMATE ERP 재고대장";
  }, []);

  // DAY 모드에서는 endDay를 startDay와 동일하게 유지
  useEffect(() => {
    if (mode === "DAY") setEndDay(startDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, startDay]);

  const filteredRows =
    categoryFilter === "ALL"
      ? rows
      : rows.filter((r) => (r.product_category ?? "") === categoryFilter);

  const periodLabel = startDay === endDay ? `${startDay}` : `${startDay} ~ ${endDay}`;

  const enrichFoodTypes = async (listAgg: AggRow[]) => {
    const barcodes = Array.from(
      new Set(
        listAgg
          .map((r) => safeStr(r.barcode).trim())
          .filter((b) => b && b.length >= 3)
      )
    );
    if (barcodes.length === 0) return listAgg;

    // ✅ 가능한 소스 2군데를 순서대로 시도 (스키마/뷰 차이 대비)
    let map = new Map<string, string>();

    // 1) product_variants (가장 가능성 높음)
    try {
      const { data, error } = await supabase
        .from("product_variants")
        .select("barcode, food_type")
        .in("barcode", barcodes);

      if (!error && data) {
        for (const r of data as any[]) {
          const b = safeStr(r?.barcode).trim();
          const ft = safeStr(r?.food_type).trim();
          if (b && ft) map.set(b, ft);
        }
      }
    } catch {
      // ignore
    }

    // 2) v_tradeclient_products (대체)
    if (map.size === 0) {
      try {
        const { data, error } = await supabase
          .from("v_tradeclient_products")
          .select("barcode, food_type")
          .in("barcode", barcodes);

        if (!error && data) {
          for (const r of data as any[]) {
            const b = safeStr(r?.barcode).trim();
            const ft = safeStr(r?.food_type).trim();
            if (b && ft) map.set(b, ft);
          }
        }
      } catch {
        // ignore
      }
    }

    if (map.size === 0) return listAgg;

    for (const r of listAgg) {
      const b = safeStr(r.barcode).trim();
      const ft = map.get(b);
      if (ft && shouldReplaceFoodType(r.food_type)) {
        r.food_type = ft;
      }
    }
    return listAgg;
  };

  const fetchReport = async () => {
    const s = mode === "DAY" ? startDay : startDay;
    const e = mode === "DAY" ? startDay : endDay;

    if (!isYYYYMMDD(s) || !isYYYYMMDD(e)) {
      setMsg("날짜 형식은 YYYY-MM-DD 입니다. 예) 2026-02-05");
      return;
    }

    const sd = parseYYYYMMDD(s);
    const ed = parseYYYYMMDD(e);
    if (!sd || !ed) {
      setMsg("날짜를 올바르게 입력해주세요.");
      return;
    }

    // 시작일 > 종료일 방지
    if (sd.getTime() > ed.getTime()) {
      setMsg("기간 설정 오류: 시작일이 종료일보다 늦습니다.");
      return;
    }

    const days = diffDaysInclusive(sd, ed);
    // 너무 긴 기간 방지(서버 RPC 연속 호출)
    if (days > 62) {
      setMsg("기간이 너무 깁니다. 62일 이하로 조회해주세요.");
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      // ✅ 날짜 리스트 생성
      const dayList: string[] = [];
      for (let i = 0; i < days; i++) {
        dayList.push(formatYYYYMMDD(addDays(sd, i)));
      }

      // ✅ 기존 rpc_daily_stock_report를 “날짜별로” 호출 후 집계
      const agg = new Map<string, AggRow>();

      for (let i = 0; i < dayList.length; i++) {
        const d = dayList[i];
        const { data, error } = await supabase.rpc("rpc_daily_stock_report", {
          p_day: d,
        });
        if (error) throw new Error(error.message);

        const list = (data ?? []) as RpcRow[];

        const isFirst = i === 0;
        const isLast = i === dayList.length - 1;

        for (const r of list) {
          const key = `${safeStr(r.barcode)}__${safeStr(r.expiry_date)}__${safeStr(
            r.product_name
          )}`;

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
            // 시작재고는 "첫날 prev_stock"만
            if (isFirst) exists.start_stock_ea = prevEA;

            exists.period_in_ea += inEA;
            exists.period_out_ea += outEA;

            // 종료재고는 "마지막날 today_stock"
            if (isLast) exists.end_stock_ea = endEA;

            // 메타 정보는 최신값으로 보정(혹시 변경된 경우 대비)
            exists.product_category = r.product_category ?? exists.product_category;
            exists.food_type = r.food_type ?? exists.food_type;
            exists.note = (r.note ?? exists.note) as any;
            exists.pack_unit = (r.pack_unit ?? exists.pack_unit) as any;
          }
        }
      }

      let listAgg = Array.from(agg.values());

      // ✅ 식품유형 표시 보정(바코드 기준으로 제품/바코드 등록 화면과 동일 값 사용)
      listAgg = await enrichFoodTypes(listAgg);

      // 정렬(제품명 -> 소비기한 -> 바코드)
      listAgg.sort((a, b) => {
        const pn = safeStr(a.product_name).localeCompare(safeStr(b.product_name), "ko");
        if (pn !== 0) return pn;
        const ex = safeStr(a.expiry_date).localeCompare(safeStr(b.expiry_date));
        if (ex !== 0) return ex;
        return safeStr(a.barcode).localeCompare(safeStr(b.barcode));
      });

      setRows(listAgg);

      const after =
        categoryFilter === "ALL"
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

  const doPrint = () => {
    // ✅ 빈 페이지 1장 출력 방지: 데이터 없으면 인쇄 차단
    if (filteredRows.length === 0) {
      setMsg("인쇄할 데이터가 없습니다. (날짜/필터 확인 후 조회)");
      return;
    }
    window.print();
  };

  const downloadExcel = () => {
    if (filteredRows.length === 0) {
      setMsg("저장할 데이터가 없습니다. (날짜/필터 확인 후 조회)");
      return;
    }

    const header = [
      "기간",
      "구분필터",
      "제품명",
      "구분",
      "식품유형",
      "시작재고(EA)",
      "기간입고합(EA)",
      "기간출고합(EA)",
      "종료재고(EA)",
      "소비기한",
      "바코드",
      "비고",
    ];

    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(","));

    for (const r of filteredRows) {
      lines.push(
        [
          periodLabel,
          categoryFilter === "ALL" ? "전체" : categoryFilter,
          safeStr(r.product_name),
          safeStr(r.product_category ?? "-"),
          safeStr(r.food_type ?? "-"),
          String(intMin(r.start_stock_ea, 0)),
          String(intMin(r.period_in_ea, 0)),
          String(intMin(r.period_out_ea, 0)),
          String(intMin(r.end_stock_ea, 0)),
          safeStr(r.expiry_date),
          safeStr(r.barcode),
          safeStr(r.note ?? ""),
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    // ✅ 엑셀 호환: UTF-8 BOM + CSV
    const bom = "\uFEFF";
    const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `재고대장_${periodLabel.replace(/\s/g, "")}_${
      categoryFilter === "ALL" ? "전체" : categoryFilter
    }.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setMsg("엑셀(CSV) 저장 완료 ✅");
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="min-h-screen bg-white text-black p-6 print:bg-white print:text-black print:p-0 print:min-h-0">
      <style jsx global>{`
        /* ✅ 인쇄/PDF에서 상단 네비(TopNav 등) 같이 찍히는 문제 방지 + 2페이지 빈 페이지 방지 */
        @media print {
          /* next/layout 쪽 header/nav가 있으면 통째로 숨김 */
          header,
          nav {
            display: none !important;
          }

          /* 우리 페이지 내부에서만 프린트 대상 지정: 다른 요소 숨김 */
          body * {
            visibility: hidden !important;
          }
          #report-print-area,
          #report-print-area * {
            visibility: visible !important;
          }
          #report-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }

          @page {
            size: A4;
            margin: 10mm;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
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

          thead {
            display: table-header-group !important;
          }

          tfoot {
            display: table-footer-group !important;
          }

          tr {
            page-break-inside: avoid !important;
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

          /* ✅ 추가 여백/공백 방지 */
          #report-print-area {
            padding: 0 !important;
            margin: 0 !important;
          }
        }

        .print-only {
          display: none;
        }
      `}</style>

      {/* ✅ 프린트 대상 영역 */}
      <div id="report-print-area">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">재고대장</h1>

            {/* ✅ 인쇄물에만 표시 */}
            <div className="print-only" style={{ marginTop: 6 }}>
              인쇄일: {printedAt}
              <br />
              기간: {periodLabel}
              <br />
              구분 필터: {categoryFilter === "ALL" ? "전체" : categoryFilter}
            </div>

            <p className="text-black/60 mt-2 print:text-black/70">
              - 시작재고/기간입고합/기간출고합/종료재고를 LOT(소비기한) 단위로 표시합니다.
            </p>
          </div>

          <a
            href="/"
            className="no-print inline-flex rounded-xl border border-black/15 px-4 py-2 hover:bg-black/5 print:hidden"
          >
            홈
          </a>
        </div>

        {/* ✅ 조회/필터 영역 */}
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

          {/* ✅ 날짜: 달력 선택 입력 */}
          <div>
            <label className="text-sm text-black/70">{mode === "DAY" ? "기준일" : "시작일"}</label>
            <input
              className="mt-1 w-44 rounded-xl bg-white border border-black/15 px-3 py-2 outline-none font-mono"
              type="date"
              value={startDay}
              onChange={(e) => setStartDay(e.target.value)}
              onBlur={() => {
                if (startDay && !isYYYYMMDD(startDay)) {
                  setMsg("날짜 형식은 YYYY-MM-DD 입니다. 예) 2026-02-05");
                }
              }}
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
                onBlur={() => {
                  if (endDay && !isYYYYMMDD(endDay)) {
                    setMsg("날짜 형식은 YYYY-MM-DD 입니다. 예) 2026-02-05");
                  }
                }}
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

          {msg && <div className="text-sm text-black/70">{msg}</div>}
        </div>

        {/* ✅ 테이블 */}
        <div className="mt-6 rounded-2xl border border-black/10 overflow-hidden print-tight print:border-black/20">
          <table className="w-full text-sm">
            <thead className="bg-black/5 print:bg-black/5">
              <tr>
                <th className="text-left p-3 print:p-2">제품명</th>
                <th className="text-left p-3 print:p-2">구분</th>
                <th className="text-left p-3 print:p-2">식품유형</th>

                <th className="text-right p-3 print:p-2">시작재고</th>
                <th className="text-right p-3 print:p-2">기간입고합</th>
                <th className="text-right p-3 print:p-2">기간출고합</th>
                <th className="text-right p-3 print:p-2">종료재고</th>

                <th className="text-left p-3 print:p-2">소비기한</th>
                <th className="text-left p-3 print:p-2">바코드</th>
                <th className="text-left p-3 print:p-2">비고</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="p-3 text-black/60 print:text-black/60" colSpan={10}>
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
                  const s = toBoxAndEa(sEA, unit);
                  const tin = toBoxAndEa(inEA, unit);
                  const tout = toBoxAndEa(outEA, unit);
                  const e = toBoxAndEa(eEA, unit);

                  return (
                    <tr
                      key={`${r.barcode}-${r.expiry_date}-${idx}`}
                      className="border-t border-black/10 print:border-black/15"
                    >
                      <td className="p-3 print:p-2 font-medium">{safeStr(r.product_name)}</td>
                      <td className="p-3 print:p-2">{safeStr(r.product_category ?? "-")}</td>
                      <td className="p-3 print:p-2">{safeStr(r.food_type ?? "-")}</td>

                      <td className="p-3 print:p-2 text-right leading-tight">
                        <div>{s.boxText}</div>
                        <div className="text-xs text-black/60 print:text-black/60 print-sub">
                          {s.eaText}
                        </div>
                      </td>

                      <td className="p-3 print:p-2 text-right leading-tight">
                        <div>{tin.boxText}</div>
                        <div className="text-xs text-black/60 print:text-black/60 print-sub">
                          {tin.eaText}
                        </div>
                      </td>

                      <td className="p-3 print:p-2 text-right leading-tight">
                        <div>{tout.boxText}</div>
                        <div className="text-xs text-black/60 print:text-black/60 print-sub">
                          {tout.eaText}
                        </div>
                      </td>

                      <td className="p-3 print:p-2 text-right leading-tight">
                        <div>{e.boxText}</div>
                        <div className="text-xs text-black/60 print:text-black/60 print-sub">
                          {e.eaText}
                        </div>
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

        <div className="mt-2 text-xs text-black/50 no-print">
          ※ 선택한 “구분 필터”가 화면/엑셀/인쇄에 동일하게 적용됩니다. / 기간 조회는 내부적으로 날짜별
          재고리포트를 집계합니다.
        </div>
      </div>

      {/* ✅ TOP 버튼 */}
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