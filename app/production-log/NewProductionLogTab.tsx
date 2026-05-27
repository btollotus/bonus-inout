"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { todayKST } from "@/lib/utils/date";

const supabase = createClient();

const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const btn  = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50";

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

// ─────────────────────── Types ───────────────────────
type WorkOrder = {
  id: string;
  work_order_no: string;
  client_name: string;
  product_name: string;
  assignee_production: string | null;
  assignee_input: string | null;
  skip_production_check: boolean;
  production_done_at: string | null;
  input_done_at: string | null;
  status_input: boolean;
  usages?: { name: string; quantity: number; unit: string }[];
};

type BlendLog = {
  id: string;
  happened_at: string;
  log_date: string;
  employee_name: string;
  recipe_name: string;
  multiplier: number;
  note: string | null;
  items: { material_name: string; quantity_g: number }[];
};

type MaterialUsage = {
  material_name: string;
  total_qty: number;
  unit: string;
};

// ─────────────────────── 날짜 유틸 ───────────────────────
function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const days = ["일","월","화","수","목","금","토"];
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function toKstTime(utcStr: string) {
  return new Date(utcStr).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

// ─────────────────────── Main Tab ───────────────────────
export function NewProductionLogTab({ role, userId, showToast }: {
  role: UserRole;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [selectedDate, setSelectedDate] = useState(todayKST());
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [blendLogs, setBlendLogs] = useState<BlendLog[]>([]);
  const [materialUsages, setMaterialUsages] = useState<MaterialUsage[]>([]);
  const [loading, setLoading] = useState(false);

  // 기간별 인쇄
  const [rangePanelOpen, setRangePanelOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(todayKST());
  const [rangeTo, setRangeTo]   = useState(todayKST());
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeData, setRangeData] = useState<{
    date: string;
    workOrders: WorkOrder[];
    blendLogs: BlendLog[];
    materialUsages: MaterialUsage[];
  }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [woRes, blendRes, usageRes] = await Promise.all([
      supabase
        .from("work_orders")
        .select("id,work_order_no,client_name,product_name,assignee_production,assignee_input,skip_production_check,production_done_at,input_done_at,status_input")
        .gte("production_done_at", `${selectedDate}T00:00:00+09:00`)
        .lt("production_done_at",  `${selectedDate}T23:59:59+09:00`)
        .eq("status_production", true)
        .or("status_input.eq.true,skip_production_check.eq.true")
        .order("production_done_at", { ascending: true }),
      supabase
        .from("blend_logs")
        .select(`id,happened_at,log_date,employee_name,recipe_name,multiplier,note,
          items:blend_log_items(material_name,quantity_g)`)
        .eq("log_date", selectedDate)
        .order("happened_at", { ascending: true }),
        supabase
        .from("material_usage_logs")
        .select("quantity, unit, note, material:materials(name)")
        .eq("used_date", selectedDate)
        .eq("work_type", "product"),
    ]);
    setBlendLogs((blendRes.data ?? []) as any);

    // 원료별 합계 집계 + 작업지시서별 매핑
    const usageMap: Record<string, { total_qty: number; unit: string }> = {};
    const woUsageMap: Record<string, { name: string; quantity: number; unit: string }[]> = {};
    (usageRes.data ?? []).forEach((u: any) => {
      const name = u.material?.name;
      if (!name) return;
      // 전체 합계
      if (!usageMap[name]) usageMap[name] = { total_qty: 0, unit: u.unit ?? "g" };
      usageMap[name].total_qty += Number(u.quantity);
      // 작업지시서별 매핑 — note에서 WO 번호 추출
      const match = (u.note ?? "").match(/WO-[\w-]+/);
      if (match) {
        const woNo = match[0];
        if (!woUsageMap[woNo]) woUsageMap[woNo] = [];
        woUsageMap[woNo].push({ name, quantity: Number(u.quantity), unit: u.unit ?? "g" });
      }
    });
    setMaterialUsages(
      Object.entries(usageMap)
        .map(([material_name, v]) => ({ material_name, ...v }))
        .sort((a, b) => a.material_name.localeCompare(b.material_name))
    );
    // 작업지시서에 원료 사용량 주입
    setWorkOrders((woRes.data ?? []).map((wo: any) => ({
      ...wo,
      usages: woUsageMap[wo.work_order_no] ?? [],
    })) as WorkOrder[]);

    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  // 작업자별 그룹화
  const woByWorker = workOrders.reduce<Record<string, WorkOrder[]>>((acc, wo) => {
    const name = wo.assignee_production ?? "미지정";
    if (!acc[name]) acc[name] = [];
    acc[name].push(wo);
    return acc;
  }, {});

  // 기간 조회
  async function loadRange() {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return;
    setRangeLoading(true);
    const dates: string[] = [];
    const cur = new Date(rangeFrom + "T00:00:00+09:00");
    const end = new Date(rangeTo   + "T00:00:00+09:00");
    while (cur <= end) {
      dates.push(new Date(cur.getTime() + 9*60*60*1000).toISOString().slice(0,10));
      cur.setDate(cur.getDate() + 1);
    }

    const results = await Promise.all(dates.map(async (date) => {
      const [woRes, blendRes, usageRes] = await Promise.all([
        supabase
          .from("work_orders")
          .select("id,work_order_no,client_name,product_name,assignee_production,assignee_input,skip_production_check,production_done_at,input_done_at,status_input")
          .gte("production_done_at", `${date}T00:00:00+09:00`)
          .lt("production_done_at",  `${date}T23:59:59+09:00`)
          .eq("status_production", true)
          .or("status_input.eq.true,skip_production_check.eq.true")
          .order("production_done_at", { ascending: true }),
        supabase
          .from("blend_logs")
          .select(`id,happened_at,log_date,employee_name,recipe_name,multiplier,note,
            items:blend_log_items(material_name,quantity_g)`)
          .eq("log_date", date)
          .order("happened_at", { ascending: true }),
          supabase
          .from("material_usage_logs")
          .select("quantity, unit, note, material:materials(name)")
          .eq("used_date", date)
          .eq("work_type", "product"),
      ]);
      const usageMap: Record<string, { total_qty: number; unit: string }> = {};
      (usageRes.data ?? []).forEach((u: any) => {
        const name = u.material?.name;
        if (!name) return;
        if (!usageMap[name]) usageMap[name] = { total_qty: 0, unit: u.unit ?? "g" };
        usageMap[name].total_qty += Number(u.quantity);
      });
      const materialUsages = Object.entries(usageMap)
        .map(([material_name, v]) => ({ material_name, ...v }))
        .sort((a, b) => a.material_name.localeCompare(b.material_name));
      return {
        date,
        workOrders: (woRes.data ?? []) as WorkOrder[],
        blendLogs: (blendRes.data ?? []) as any,
        materialUsages,
      };
    }));
    setRangeData(results);
    setRangeLoading(false);
  }

  // 인쇄 공통 함수
  function buildPrintHtml(items: { date: string; workOrders: WorkOrder[]; blendLogs: BlendLog[]; materialUsages?: MaterialUsage[] }[]) {
    const th = `border:1px solid #999;padding:4px 6px;text-align:center;font-size:7.5pt;font-weight:bold;background:#f0f0f0;white-space:nowrap;`;
    const td = `border:1px solid #ccc;padding:3px 6px;font-size:8pt;vertical-align:middle;`;
    const tdR = `border:1px solid #ccc;padding:3px 6px;font-size:8pt;vertical-align:middle;text-align:right;`;
    const tdC = `border:1px solid #ccc;padding:3px 6px;font-size:8pt;vertical-align:middle;text-align:center;`;
    const secTitle = `font-size:9pt;font-weight:bold;margin:12px 0 5px 0;padding-left:6px;border-left:3px solid #333;`;

    const pages = items.map(({ date, workOrders: wos, blendLogs: bls, materialUsages: mus = [] }, idx) => {
      const woByWorkerPrint = wos.reduce<Record<string, WorkOrder[]>>((acc, wo) => {
        const name = wo.assignee_production ?? "미지정";
        if (!acc[name]) acc[name] = [];
        acc[name].push(wo);
        return acc;
      }, {});

      // 작업지시서 테이블
      const woRows = Object.entries(woByWorkerPrint).flatMap(([worker, orders]) =>
        orders.map((wo, i) => `
          <tr>
            ${i === 0 ? `<td style="${td}text-align:center;" rowspan="${orders.length}">${worker}</td>` : ""}
            <td style="${td}">${wo.client_name}</td>
            <td style="${td}">${wo.product_name}</td>
            <td style="${tdC}">${wo.production_done_at ? toKstTime(wo.production_done_at) : "—"}</td>
            <td style="${tdC}">${wo.skip_production_check ? "생산완료" : "금속검출완료"}</td>
            <td style="${td}">
              ${(wo.usages ?? []).map(u => `${u.name} ${u.quantity.toLocaleString()}${u.unit}`).join(", ") || "—"}
            </td>
          </tr>
        `)
      ).join("");

      const woTable = wos.length > 0 ? `
        <div style="${secTitle}">생산 완료 내역</div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup>
            <col style="width:50px">
            <col style="width:90px">
            <col>
            <col style="width:45px">
            <col style="width:65px">
            <col style="width:130px">
          </colgroup>
          <thead>
            <tr>
              <th style="${th}">작업자</th>
              <th style="${th}">업체명</th>
              <th style="${th}">제품명</th>
              <th style="${th}">완료시각</th>
              <th style="${th}">상태</th>
              <th style="${th}">원료 사용량</th>
            </tr>
          </thead>
          <tbody>${woRows}</tbody>
        </table>
      ` : "";

      // 원료 사용량 합계 테이블
      const musTable = mus.length > 0 ? `
        <div style="${secTitle}">원료 사용량 합계</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              ${mus.map(m => `<th style="${th}">${m.material_name}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            <tr>
              ${mus.map(m => `<td style="${tdC}">${m.total_qty.toLocaleString()}${m.unit}</td>`).join("")}
            </tr>
          </tbody>
        </table>
      ` : "";

      // 배합 기록 테이블
      const blendRows = bls.map(bl => `
        <tr>
          <td style="${tdC}">${toKstTime(bl.happened_at)}</td>
          <td style="${td}">${bl.recipe_name}</td>
          <td style="${tdC}">${bl.multiplier}배합</td>
          <td style="${td}">${bl.employee_name}</td>
          <td style="${td}">${(bl.items ?? []).map(i => `${i.material_name} ${i.quantity_g}g`).join(", ")}</td>
          <td style="${td}">${bl.note ?? "—"}</td>
        </tr>
      `).join("");

      const blendTable = bls.length > 0 ? `
        <div style="${secTitle}">배합 기록</div>
        <table style="width:100%;border-collapse:collapse;">
          <colgroup>
            <col style="width:45px">
            <col style="width:80px">
            <col style="width:50px">
            <col style="width:50px">
            <col>
            <col style="width:60px">
          </colgroup>
          <thead>
            <tr>
              <th style="${th}">시각</th>
              <th style="${th}">레시피</th>
              <th style="${th}">배합횟수</th>
              <th style="${th}">작업자</th>
              <th style="${th}">원료 사용내역</th>
              <th style="${th}">비고</th>
            </tr>
          </thead>
          <tbody>${blendRows}</tbody>
        </table>
      ` : "";

      const isEmpty = wos.length === 0 && bls.length === 0 && mus.length === 0;
      const pageBreak = idx < items.length - 1 ? `style="page-break-after:always;"` : "";

      return `
        <div ${pageBreak}>
          <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
            <tbody>
              <tr>
                <td style="font-size:14pt;font-weight:bold;padding:6px 0;border-bottom:2px solid #000;">
                  생 산 일 지
                </td>
                <td style="text-align:right;font-size:9pt;color:#555;padding:6px 0;border-bottom:2px solid #000;vertical-align:bottom;">
                  ${formatDateLabel(date)}
                </td>
              </tr>
            </tbody>
          </table>
          ${isEmpty
            ? `<div style="color:#aaa;font-size:9pt;text-align:center;padding:30px;">해당 날짜 생산기록이 없습니다.</div>`
            : `${woTable}${musTable}${blendTable}`
          }
        </div>
      `;
    });
    return pages.join("");
  }

  // 인쇄 공통 함수
  function buildPrintHtml(items: { date: string; workOrders: WorkOrder[]; blendLogs: BlendLog[]; materialUsages?: MaterialUsage[] }[]) {
    const th = `border:1px solid #999;padding:4px 6px;text-align:center;font-size:7.5pt;font-weight:bold;background:#f0f0f0;white-space:nowrap;`;
    const td = `border:1px solid #ccc;padding:3px 6px;font-size:8pt;vertical-align:middle;`;
    const tdC = `border:1px solid #ccc;padding:3px 6px;font-size:8pt;vertical-align:middle;text-align:center;`;
    const secTitle = `font-size:9pt;font-weight:bold;margin:12px 0 5px 0;padding-left:6px;border-left:3px solid #333;`;

    const pages = items.map(({ date, workOrders: wos, blendLogs: bls, materialUsages: mus = [] }, idx) => {
      const woByWorkerPrint = wos.reduce<Record<string, WorkOrder[]>>((acc, wo) => {
        const name = wo.assignee_production ?? "미지정";
        if (!acc[name]) acc[name] = [];
        acc[name].push(wo);
        return acc;
      }, {});

      const woRows = Object.entries(woByWorkerPrint).flatMap(([worker, orders]) =>
        orders.map((wo, i) => `
          <tr>
            ${i === 0 ? `<td style="${td}text-align:center;" rowspan="${orders.length}">${worker}</td>` : ""}
            <td style="${td}">${wo.client_name}</td>
            <td style="${td}">${wo.product_name}</td>
            <td style="${tdC}">${wo.production_done_at ? toKstTime(wo.production_done_at) : "—"}</td>
            <td style="${tdC}">${wo.skip_production_check ? "생산완료" : "금속검출완료"}</td>
            <td style="${td}">${(wo.usages ?? []).map(u => `${u.name} ${u.quantity.toLocaleString()}${u.unit}`).join(", ") || "—"}</td>
          </tr>
        `)
      ).join("");

      const woTable = wos.length > 0 ? `
        <div style="${secTitle}">생산 완료 내역</div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup>
            <col style="width:50px"><col style="width:90px"><col>
            <col style="width:45px"><col style="width:65px"><col style="width:130px">
          </colgroup>
          <thead>
            <tr>
              <th style="${th}">작업자</th><th style="${th}">업체명</th><th style="${th}">제품명</th>
              <th style="${th}">완료시각</th><th style="${th}">상태</th><th style="${th}">원료 사용량</th>
            </tr>
          </thead>
          <tbody>${woRows}</tbody>
        </table>
      ` : "";

      const musTable = mus.length > 0 ? `
        <div style="${secTitle}">원료 사용량 합계</div>
        <table style="border-collapse:collapse;">
          <thead><tr>${mus.map(m => `<th style="${th}">${m.material_name}</th>`).join("")}</tr></thead>
          <tbody><tr>${mus.map(m => `<td style="${tdC}">${m.total_qty.toLocaleString()}${m.unit}</td>`).join("")}</tr></tbody>
        </table>
      ` : "";

      const blendRows = bls.map(bl => `
        <tr>
          <td style="${tdC}">${toKstTime(bl.happened_at)}</td>
          <td style="${td}">${bl.recipe_name}</td>
          <td style="${tdC}">${bl.multiplier}배합</td>
          <td style="${td}">${bl.employee_name}</td>
          <td style="${td}">${(bl.items ?? []).map(i => `${i.material_name} ${i.quantity_g}g`).join(", ")}</td>
          <td style="${td}">${bl.note ?? "—"}</td>
        </tr>
      `).join("");

      const blendTable = bls.length > 0 ? `
        <div style="${secTitle}">배합 기록</div>
        <table style="width:100%;border-collapse:collapse;">
          <colgroup>
            <col style="width:45px"><col style="width:80px"><col style="width:50px">
            <col style="width:50px"><col><col style="width:60px">
          </colgroup>
          <thead>
            <tr>
              <th style="${th}">시각</th><th style="${th}">레시피</th><th style="${th}">배합횟수</th>
              <th style="${th}">작업자</th><th style="${th}">원료 사용내역</th><th style="${th}">비고</th>
            </tr>
          </thead>
          <tbody>${blendRows}</tbody>
        </table>
      ` : "";

      const isEmpty = wos.length === 0 && bls.length === 0 && mus.length === 0;
      const pageBreak = idx < items.length - 1 ? `style="page-break-after:always;"` : "";

      return `
        <div ${pageBreak}>
          <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
            <tbody>
              <tr>
                <td style="font-size:14pt;font-weight:bold;padding:6px 0;border-bottom:2px solid #000;">생 산 일 지</td>
                <td style="text-align:right;font-size:9pt;color:#555;padding:6px 0;border-bottom:2px solid #000;vertical-align:bottom;">${formatDateLabel(date)}</td>
              </tr>
            </tbody>
          </table>
          ${isEmpty
            ? `<div style="color:#aaa;font-size:9pt;text-align:center;padding:30px;">해당 날짜 생산기록이 없습니다.</div>`
            : `${woTable}${musTable}${blendTable}`
          }
        </div>
      `;
    });
    return pages.join("");
  }

  function printDay() {
    const html = buildPrintHtml([{ date: selectedDate, workOrders, blendLogs, materialUsages }]);
    openPrint(html, `생산일지_${selectedDate}`);
  }

  function printRange() {
    if (rangeData.length === 0) return showToast("먼저 조회하세요.", "error");
    const html = buildPrintHtml(rangeData);
    openPrint(html, `생산일지_${rangeFrom}_${rangeTo}`);
  }

  function openPrint(html: string, title: string) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm 20mm; }
        body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9pt; color: #000; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  return (
    <div className="space-y-4">

      {/* 기간별 인쇄 패널 */}
      <div className={`${card} overflow-hidden`}>
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => setRangePanelOpen(v => !v)}
        >
          <span>📅 기간별 인쇄</span>
          <span className="text-slate-400 text-xs">{rangePanelOpen ? "▲ 닫기" : "▼ 열기"}</span>
        </button>
        {rangePanelOpen && (
          <div className="border-t border-slate-100 px-4 py-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="mb-1 text-xs text-slate-500">시작일</div>
                <input type="date" value={rangeFrom} max={rangeTo}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                  onChange={e => { setRangeFrom(e.target.value); setRangeData([]); }} />
              </div>
              <div className="text-slate-400 pb-1.5">~</div>
              <div>
                <div className="mb-1 text-xs text-slate-500">종료일</div>
                <input type="date" value={rangeTo} max={todayKST()}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                  onChange={e => { setRangeTo(e.target.value); setRangeData([]); }} />
              </div>
              <button
                className={`rounded-xl px-4 py-1.5 text-sm font-semibold text-white ${rangeLoading ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700"}`}
                disabled={rangeLoading || !rangeFrom || !rangeTo || rangeFrom > rangeTo}
                onClick={loadRange}
              >
                {rangeLoading ? "조회 중..." : "🔍 조회"}
              </button>
              {rangeData.length > 0 && !rangeLoading && (
                <button
                  className="rounded-xl border border-slate-300 bg-slate-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
                  onClick={printRange}
                >
                  🖨️ 인쇄
                </button>
              )}
            </div>
            {rangeData.length > 0 && !rangeLoading && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {rangeData.map(d => (
                  <span key={d.date} className="mr-3">
                    <span className="font-semibold">{d.date}</span>
                    <span className="text-slate-400 ml-1">
                      작업지시서 {d.workOrders.length}건 · 배합 {d.blendLogs.length}건
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 날짜 선택 바 */}
      <div className={`${card} p-3 flex flex-wrap items-center gap-3`}>
        <span className="text-sm font-semibold text-slate-600">조회 날짜</span>
        <input
          type="date"
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          value={selectedDate}
          max={todayKST()}
          onChange={e => setSelectedDate(e.target.value)}
        />
        <button className={btn} onClick={load}>🔄 새로고침</button>
        <button className={btnSm} onClick={printDay}>🖨️ 인쇄</button>
        {selectedDate !== todayKST() && (
          <>
            <button
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
              onClick={() => setSelectedDate(todayKST())}
            >
              오늘로 돌아가기
            </button>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              과거 기록 조회 중
            </span>
          </>
        )}
      </div>

      {loading ? (
        <div className={`${card} p-10 text-center text-sm text-slate-400`}>불러오는 중...</div>
      ) : (
        <>
          {/* 작업지시서 목록 */}
          <div className={`${card} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold text-sm">
                ✅ 완료된 작업지시서
                <span className="ml-1 text-xs font-normal text-slate-400">
                  ({selectedDate} KST)
                </span>
              </div>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {workOrders.length}건
              </span>
            </div>

            {workOrders.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                해당 날짜 완료된 작업지시서가 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(woByWorker).map(([worker, orders]) => (
                  <div key={worker}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">👤 {worker}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400">
                        {orders.length}건
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {orders.map(wo => (
                      <div key={wo.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-700">{wo.client_name}</span>
                          <span className="mx-1.5 text-slate-300">—</span>
                          <span className="text-sm text-slate-600">{wo.product_name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {wo.production_done_at && (
                            <span className="text-xs text-slate-400 tabular-nums">
                              {toKstTime(wo.production_done_at)}
                            </span>
                          )}
                          {wo.skip_production_check ? (
                            <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                              생산완료
                            </span>
                          ) : (
                            <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                              금속검출완료
                            </span>
                          )}
                        </div>
                      </div>
                      {(wo.usages ?? []).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {(wo.usages ?? []).map((u, idx) => (
                            <span key={idx} className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">
                              {u.name} <span className="font-semibold tabular-nums text-slate-700">{u.quantity.toLocaleString()}{u.unit}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>  
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 원료 사용량 */}
          <div className={`${card} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold text-sm">
                📦 원료 사용량
                <span className="ml-1 text-xs font-normal text-slate-400">({selectedDate} KST)</span>
              </div>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {materialUsages.length}종
              </span>
            </div>
            {materialUsages.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">해당 날짜 원료 사용 내역이 없습니다.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {materialUsages.map((m) => (
                  <div key={m.material_name} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-600">{m.material_name}</span>
                    <span className="ml-2 font-semibold tabular-nums text-slate-800">
                      {m.total_qty.toLocaleString()}{m.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 배합 기록 */}
          <div className={`${card} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold text-sm">
                🧪 배합 기록
                <span className="ml-1 text-xs font-normal text-slate-400">
                  ({selectedDate} KST)
                </span>
              </div>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {blendLogs.length}건
              </span>
            </div>

            {blendLogs.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                해당 날짜 배합 기록이 없습니다.
              </div>
            ) : (
              <div className="space-y-3">
                {blendLogs.map(bl => (
                  <div key={bl.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-sm">{bl.recipe_name}</span>
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                        {bl.multiplier}배합
                      </span>
                      <span className="text-xs text-slate-500">{bl.employee_name}</span>
                      <span className="ml-auto text-xs text-slate-400 tabular-nums">
                        {toKstTime(bl.happened_at)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(bl.items ?? []).map((item, idx) => (
                        <span key={idx} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                          {item.material_name} <span className="font-semibold tabular-nums">{item.quantity_g}g</span>
                        </span>
                      ))}
                    </div>
                    {bl.note && (
                      <div className="mt-1.5 text-xs text-slate-400">비고: {bl.note}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
