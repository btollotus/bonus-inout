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
  food_type: string | null;
  assignee_production: string | null;
  assignee_transfer: string | null;
  assignee_input: string | null;
  skip_production_check: boolean;
  production_done_at: string | null;
  input_done_at: string | null;
  status_input: boolean;
  usages?: { name: string; quantity: number; unit: string }[];
  items?: { name: string; order_qty: number; actual_qty: number; unit_weight: number; defect_qty?: number }[];
  prod_start?: string | null;   // ccp_wo_events start measured_at
  prod_end?: string | null;     // ccp_wo_events end measured_at
  metal_start?: string | null;  // ccp_metal_logs start_time
  metal_end?: string | null;    // ccp_metal_logs b_end_time
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

// ─── 컴파운드/이산화티타늄 분리 표시용 (production-client.tsx와 동일 기준 — 그쪽 변경 시 같이 수정 필요) ───
const DARK_FOOD_TYPES = ["다크화이트","다크옐로우","데코초콜릿","롤리팝다크화이트","다크핑크","다크연두","롤리팝다크핑크"];

function getFoodCategoryForWeight(foodType: string | null | undefined): "다크" | "화이트" | "중간재" | null {
  const ft = (foodType ?? "").trim();
  if (!ft) return null;
  if (ft.includes("초콜릿중간재") || ft.includes("중간재")) return "중간재";
  if (DARK_FOOD_TYPES.some((d) => ft.includes(d))) return "다크";
  return "화이트";
}

function getCompoundNameForWeight(foodType: string | null | undefined): string {
  const ft = foodType ?? "";
  if (ft.includes("딸기")) return "딸기컴파운드";
  return getFoodCategoryForWeight(ft) === "다크" ? "다크컴파운드" : "화이트컴파운드";
}

// 출고/추가생산/불량 텍스트 — "전체 합계를 1회만 반올림"한 뒤, 각 구간은 누적비율-역산 방식으로
// 그 확정된 합계와의 차이로 계산한다. 이렇게 하면 구간별 합이 항상 실제 저장된 반올림 총량과 정확히 일치한다.
// (품목이 하나뿐인 작업지시서 기준 — production-client.tsx의 실제 차감 계산과 동일한 결과)
function renderQtyWeightText(
  orderQty: number,
  actualQty: number,
  defectQty: number,
  unitWeight: number,
  foodType: string | null | undefined
): string {
  if (actualQty <= 0) return "";
  const extraQty = Math.max(actualQty - orderQty, 0);
  if (unitWeight <= 0) {
    if (extraQty > 0 && defectQty > 0) return `주문 ${orderQty.toLocaleString()} + 추가생산 ${extraQty.toLocaleString()} = 출고 ${actualQty.toLocaleString()} + 불량 ${defectQty.toLocaleString()} = ${(actualQty + defectQty).toLocaleString()}개`;
    if (extraQty > 0) return `주문 ${orderQty.toLocaleString()} + 추가생산 ${extraQty.toLocaleString()} = ${actualQty.toLocaleString()}개`;
    if (defectQty > 0) return `출고 ${actualQty.toLocaleString()} + 불량 ${defectQty.toLocaleString()} = ${(actualQty + defectQty).toLocaleString()}개`;
    return `${actualQty.toLocaleString()}개`;
  }

  const grandQty = actualQty + defectQty;
  const grandG = grandQty * unitWeight;
  const isReal = (foodType ?? "").includes("리얼");

  // production-client.tsx와 동일한 공식 — 전체 합계 1회만 반올림 (구간별 개별 반올림 금지)
  const grandCompoundG = isReal ? Math.round((grandG * 10) / 11) : Math.round(grandG);
  const grandTiG = isReal ? Math.round((grandG * 1) / 11) : 0;

  function partG(cumQty: number, grand: number) {
    return Math.round((grand * cumQty) / grandQty);
  }
  const outboundCompoundG = partG(actualQty, grandCompoundG);
  const orderCompoundG = partG(orderQty, grandCompoundG);
  const extraCompoundG = outboundCompoundG - orderCompoundG;
  const defectCompoundG = grandCompoundG - outboundCompoundG;

  const outboundTiG = isReal ? partG(actualQty, grandTiG) : 0;
  const orderTiG = isReal ? partG(orderQty, grandTiG) : 0;
  const extraTiG = outboundTiG - orderTiG;
  const defectTiG = grandTiG - outboundTiG;

  const compoundName = getCompoundNameForWeight(foodType);
  const fmtG = (compG: number, tiG: number) =>
    isReal ? `${compoundName} ${compG.toLocaleString()}g+이산화티타늄 ${tiG.toLocaleString()}g` : `${compG.toLocaleString()}g`;

  const parts: string[] = [];
  if (extraQty > 0) {
    parts.push(`주문 ${orderQty.toLocaleString()}개(${fmtG(orderCompoundG, orderTiG)})`);
    parts.push(`+ 추가생산 ${extraQty.toLocaleString()}개(${fmtG(extraCompoundG, extraTiG)})`);
    parts.push(`= 출고 ${actualQty.toLocaleString()}개(${fmtG(outboundCompoundG, outboundTiG)})`);
  } else {
    parts.push(`출고 ${actualQty.toLocaleString()}개(${fmtG(outboundCompoundG, outboundTiG)})`);
  }
  if (defectQty > 0) {
    parts.push(`+ 불량 ${defectQty.toLocaleString()}개(${fmtG(defectCompoundG, defectTiG)})`);
    parts.push(`= ${grandQty.toLocaleString()}개(${fmtG(grandCompoundG, grandTiG)})`);
  }
  return parts.join(" ");
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
    const [woRes, blendRes, usageRes, ccpEvRes, metalRes] = await Promise.all([
      supabase
        .from("work_orders")
        .select("id,work_order_no,client_name,product_name,food_type,assignee_production,assignee_transfer,assignee_input,skip_production_check,production_done_at,input_done_at,status_input,work_order_items(sub_items,actual_qty,unit_weight,defect_qty)")
        .gte("production_done_at", `${selectedDate}T00:00:00+09:00`)
        .lt("production_done_at",  `${selectedDate}T23:59:59+09:00`)
        .eq("status_production", true)
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
        supabase
        .from("ccp_wo_events")
        .select("work_order_no, event_type, measured_at")
        .gte("measured_at", `${selectedDate}T00:00:00+09:00`)
        .lt("measured_at",  `${selectedDate}T23:59:59+09:00`)
        .order("measured_at", { ascending: true }),
      supabase
        .from("ccp_metal_logs")
        .select("work_order_id, start_time, b_end_time")
        .eq("log_date", selectedDate),
    ]);

    // work_order_no별 생산시간 맵
    const prodStartMap: Record<string, string> = {};
    const prodEndMap: Record<string, string> = {};
    (ccpEvRes.data ?? []).forEach((ev: any) => {
      if (ev.event_type === "start" && !prodStartMap[ev.work_order_no]) {
        prodStartMap[ev.work_order_no] = ev.measured_at;
      }
      if (ev.event_type === "end") {
        prodEndMap[ev.work_order_no] = ev.measured_at;
      }
    });
    // work_order_id별 금속검출 시간 맵
    const metalMap: Record<string, { start: string; end: string }> = {};
    (metalRes.data ?? []).forEach((ml: any) => {
      if (ml.work_order_id) {
        metalMap[ml.work_order_id] = {
          start: ml.start_time ?? "",
          end: ml.b_end_time ?? "",
        };
      }
    });
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
   // 작업지시서에 원료 사용량 + items + 시간 주입
   setWorkOrders((woRes.data ?? []).map((wo: any) => ({
    ...wo,
    usages: woUsageMap[wo.work_order_no] ?? [],
    prod_start: prodStartMap[wo.work_order_no] ?? null,
    prod_end: prodEndMap[wo.work_order_no] ?? null,
    metal_start: metalMap[wo.id]?.start ?? null,
    metal_end: metalMap[wo.id]?.end ?? null,
    items: (wo.work_order_items ?? [])
      .map((woi: any) => ({
        name: (woi.sub_items?.[0]?.name ?? ""),
        order_qty: woi.sub_items?.[0]?.qty ?? woi.order_qty ?? 0,
        actual_qty: woi.actual_qty ?? 0,
        unit_weight: woi.unit_weight ?? 0,
        defect_qty: woi.defect_qty ?? 0,
      }))
      .filter((it: any) => {
        const n = it.name;
        return n && !n.startsWith("아이스박스") && !n.startsWith("택배비") && !n.startsWith("성형틀") && !n.startsWith("인쇄제판") && !n.startsWith("퀵운임") && !n.startsWith("퀵");
      }),
})) as WorkOrder[]);

setLoading(false);
}, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  // 작업자별 그룹화
  const woByWorker = workOrders.reduce<Record<string, WorkOrder[]>>((acc, wo) => {
    const isChuganJae = (wo.product_name ?? "").includes("중간재") || (wo.food_type ?? "").includes("중간재") || (wo.food_type ?? "").includes("전사");
    const name = isChuganJae
      ? (wo.assignee_transfer ?? wo.assignee_production ?? "미지정")
      : (wo.assignee_production ?? "미지정");
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
      const [woRes, blendRes, usageRes, ccpEvRes2, metalRes2] = await Promise.all([
        supabase
          .from("work_orders")
          .select("id,work_order_no,client_name,product_name,food_type,assignee_production,assignee_transfer,assignee_input,skip_production_check,production_done_at,input_done_at,status_input,work_order_items(sub_items,actual_qty,unit_weight,defect_qty)")
          .gte("production_done_at", `${date}T00:00:00+09:00`)
          .lt("production_done_at",  `${date}T23:59:59+09:00`)
          .eq("status_production", true)
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
          supabase
          .from("ccp_wo_events")
          .select("work_order_no, event_type, measured_at")
          .gte("measured_at", `${date}T00:00:00+09:00`)
          .lt("measured_at",  `${date}T23:59:59+09:00`)
          .order("measured_at", { ascending: true }),
        supabase
          .from("ccp_metal_logs")
          .select("work_order_id, start_time, b_end_time")
          .eq("log_date", date),
      ]);
      const prodStartMapR: Record<string, string> = {};
      const prodEndMapR: Record<string, string> = {};
      (ccpEvRes2.data ?? []).forEach((ev: any) => {
        if (ev.event_type === "start" && !prodStartMapR[ev.work_order_no]) {
          prodStartMapR[ev.work_order_no] = ev.measured_at;
        }
        if (ev.event_type === "end") {
          prodEndMapR[ev.work_order_no] = ev.measured_at;
        }
      });
      const metalMapR: Record<string, { start: string; end: string }> = {};
      (metalRes2.data ?? []).forEach((ml: any) => {
        if (ml.work_order_id) {
          metalMapR[ml.work_order_id] = { start: ml.start_time ?? "", end: ml.b_end_time ?? "" };
        }
      });
      const usageMap: Record<string, { total_qty: number; unit: string }> = {};
      const woUsageMapR: Record<string, { name: string; quantity: number; unit: string }[]> = {};
      (usageRes.data ?? []).forEach((u: any) => {
        const name = u.material?.name;
        if (!name) return;
        if (!usageMap[name]) usageMap[name] = { total_qty: 0, unit: u.unit ?? "g" };
        usageMap[name].total_qty += Number(u.quantity);
        const match = (u.note ?? "").match(/WO-[\w-]+/);
        if (match) {
          const woNo = match[0];
          if (!woUsageMapR[woNo]) woUsageMapR[woNo] = [];
          woUsageMapR[woNo].push({ name, quantity: Number(u.quantity), unit: u.unit ?? "g" });
        }
      });
      const materialUsages = Object.entries(usageMap)
        .map(([material_name, v]) => ({ material_name, ...v }))
        .sort((a, b) => a.material_name.localeCompare(b.material_name));
        return {
          date,
          workOrders: (woRes.data ?? []).map((wo: any) => ({
            ...wo,
            usages: woUsageMapR[wo.work_order_no] ?? [],
            prod_start: prodStartMapR[wo.work_order_no] ?? null,
            prod_end: prodEndMapR[wo.work_order_no] ?? null,
            metal_start: metalMapR[wo.id]?.start ?? null,
            metal_end: metalMapR[wo.id]?.end ?? null,
            items: (wo.work_order_items ?? [])
            .map((woi: any) => ({
              name: (woi.sub_items?.[0]?.name ?? ""),
              order_qty: woi.sub_items?.[0]?.qty ?? woi.order_qty ?? 0,
              actual_qty: woi.actual_qty ?? 0,
              unit_weight: woi.unit_weight ?? 0,
              defect_qty: woi.defect_qty ?? 0,
            }))
            .filter((it: any) => {
              const n = it.name;
              return n && !n.startsWith("아이스박스") && !n.startsWith("택배비") && !n.startsWith("성형틀") && !n.startsWith("인쇄제판") && !n.startsWith("퀵운임") && !n.startsWith("퀵");
            }),
          })) as WorkOrder[],
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
    const tdC = `border:1px solid #ccc;padding:3px 6px;font-size:8pt;vertical-align:middle;text-align:center;`;
    const secTitle = `font-size:9pt;font-weight:bold;margin:12px 0 5px 0;padding-left:6px;border-left:3px solid #333;`;

    const pages = items.map(({ date, workOrders: wos, blendLogs: bls, materialUsages: mus = [] }, idx) => {
      const woByWorkerPrint = wos.reduce<Record<string, WorkOrder[]>>((acc, wo) => {
        const isChuganJae = (wo.food_type ?? "").includes("중간재") || (wo.food_type ?? "").includes("전사");
        const name = isChuganJae
          ? (wo.assignee_transfer ?? wo.assignee_production ?? "미지정")
          : (wo.assignee_production ?? "미지정");
        if (!acc[name]) acc[name] = [];
        acc[name].push(wo);
        return acc;
      }, {});

      const woRows = Object.entries(woByWorkerPrint).flatMap(([worker, orders]) => {
        // 작업자별 전체 행 수 계산 (rowspan용)
        const workerTotalRows = orders.reduce((sum, wo) => {
          const woItems = (wo.items ?? []).filter(it => it.name);
          return sum + Math.max(woItems.length, 1);
        }, 0);
        let workerRendered = false;
        return orders.flatMap((wo) => {
          const woItems = (wo.items ?? []).filter(it => it.name);
          const rows = woItems.length > 0 ? woItems : [{ name: wo.product_name, order_qty: 0, actual_qty: 0, unit_weight: 0 }];
          const usageStr = (wo.usages ?? []).map(u => `${u.name} ${u.quantity.toLocaleString()}${u.unit}`).join(", ") || "—";
          return rows.map((item, idx) => {
            const showWorker = !workerRendered && idx === 0;
            if (showWorker) workerRendered = true;
            const showUsage = idx === 0;
            return `
              <tr>
                ${showWorker ? `<td style="${td}text-align:center;" rowspan="${workerTotalRows}">${worker}</td>` : ""}
               <td style="${td}">${wo.client_name}</td>
                <td style="${td}">${item.name}</td>
                <td style="${tdC}">${item.actual_qty > 0 ? item.actual_qty.toLocaleString() : "—"}</td>
                ${idx === 0 ? `<td style="${tdC};font-size:7pt;" rowspan="${rows.length}">${wo.prod_start ? toKstTime(wo.prod_start) : "—"}~${wo.prod_end ? toKstTime(wo.prod_end) : "—"}</td>` : ""}
                ${showUsage ? `<td style="${td}" rowspan="${rows.length}">${usageStr}</td>` : ""}
              </tr>
            `;
          });
        });
      }).join("");

      const woTable = wos.length > 0 ? `
         <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
         <colgroup>
            <col style="width:48px"><col style="width:80px"><col><col style="width:38px">
            <col style="width:75px"><col style="width:110px">
          </colgroup>
          <thead>
            <tr>
              <th style="${th}">작업자</th><th style="${th}">업체명</th><th style="${th}">제품명</th><th style="${th}">수량</th>
              <th style="${th}">생산시간</th><th style="${th}">원료 사용량</th>
            </tr>
          </thead>
          <tbody>${woRows}</tbody>
        </table>
      ` : "";

      const musTable = "";

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
                      {orders.map(wo => {
                        const woItems = (wo.items ?? []).filter(it => it.name);
                        const rows = woItems.length > 0 ? woItems : [{ name: wo.product_name, order_qty: 0, actual_qty: 0, unit_weight: 0 }];
                        return (
                          <div key={wo.id} className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                           {/* 작업지시서 헤더 */}
                           <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
                              <span className="text-xs font-semibold text-slate-500">{wo.client_name}</span>
                              <a href={`/production?wo=${wo.id}`} target="_blank" rel="noopener noreferrer"
                                className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
                                title="작업지시서 상세보기">🔗 상세</a>
                              <div className="ml-auto flex flex-col items-end gap-0.5">
                                {(wo.prod_start || wo.prod_end) && (
                                  <span className="text-[11px] text-slate-400 tabular-nums">
                                    생산 {wo.prod_start ? toKstTime(wo.prod_start) : "—"} ~ {wo.prod_end ? toKstTime(wo.prod_end) : "—"}
                                  </span>
                                )}
                                {(wo.metal_start || wo.metal_end) && (
                                  <span className="text-[11px] text-slate-400 tabular-nums">
                                    금속검출 {wo.metal_start ? wo.metal_start.slice(0,5) : "—"} ~ {wo.metal_end ? wo.metal_end.slice(0,5) : "—"}
                                  </span>
                                )}
                              </div>
                              {(wo.skip_production_check || (wo.food_type ?? "").includes("전사")) ? (
                                <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">생산완료</span>
                              ) : (
                                <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">금속검출완료</span>
                              )}
                            </div>
                           {/* 제품별 행 */}
                           {rows.map((item, idx) => (
                              <div key={idx} className="flex flex-col gap-1 px-3 py-2 border-b border-slate-100 last:border-b-0">
                                <div className="flex items-center gap-3">
                                  <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{item.name}</span>
                                  {(wo.usages ?? []).length > 0 && idx === 0 && (
                                    <div className="flex flex-wrap gap-1 shrink-0">
                                      {(wo.usages ?? []).map((u, ui) => (
                                        <span key={ui} className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">
                                          {u.name} <span className="font-semibold tabular-nums text-slate-700">{u.quantity.toLocaleString()}{u.unit}</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {item.actual_qty > 0 && (
                                  <span className="text-xs text-slate-400 tabular-nums break-words">
                                    {renderQtyWeightText(item.order_qty ?? 0, item.actual_qty, item.defect_qty ?? 0, item.unit_weight ?? 0, wo.food_type)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })}
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
