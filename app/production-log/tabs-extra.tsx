"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { todayKST } from "@/lib/utils/date";
import { PinModal } from "@/app/contexts/PinSessionContext";

const supabase = createClient();

function toKSTTime(isoStr: string): string {
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50";



type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;
type WarmSlot = { id: string; slot_name: string; purpose: string };

type CcpSession = {
  id: string; session_date: string; slot_id: string; status: string; note: string | null;
  slot?: WarmSlot | null; events?: CcpEvent[]; orders?: CcpSessionOrder[];
};
type CcpEvent = {
  id: string; session_id: string; event_type: string; measured_at: string;
  temperature: number | null; is_ok: boolean | null; action_note: string | null; created_by: string | null;
};
type CcpSessionOrder = { id: string; work_order_ref: string | null; client_name: string | null; product_name: string | null };
type MetalLog = {
  id: string; log_date: string; product_name: string | null; quantity: number | null;
  start_time: string | null; end_time: string | null; fe_pass: boolean | null;
  sus_pass: boolean | null; product_pass: boolean | null; zone: string | null;
  action_note: string | null; note: string | null; created_by: string | null; approved_by: string | null;
};
type OtherHeatingLog = {
  id: string; log_date: string; work_type: string; measured_at: string;
  temperature: number | null; is_ok: boolean | null; action_note: string | null;
  note: string | null; created_by: string | null; approved_by: string | null;
};
type CompressorLog = {
  id: string; log_date: string; work_type: string; worked_at: string;
  work_hours: number | null; cumulative_hours: number | null; is_damaged: boolean;
  note: string | null; created_by: string | null; approved_by: string | null;
};
type PetStockLog = {
  id: string; log_date: string; log_type: string; quantity: number; defect_qty: number;
  note: string | null; created_by: string | null; approved_by: string | null;
};
type PetStock = { stock_raw: number; stock_coated: number; stock_sprayed_prod: number; stock_sprayed_sale: number; total_print_used_prod: number; total_print_used_sale: number };

const SIGN_MAP: Record<string, string> = {
  "조은미": "/sign-choem.png",
  "강미라": "/sign-kangml.png",
  "나현우": "/sign-nahw.png",
  "나미영": "/sign-namiy.png",
  "조대성": "/sign-chods.png",
  "김영각": "/sign-kimyg.png",
  "고한결": "/sign-gohg.png",
};

const PET_LOG_TYPE_LABELS: Record<string, string> = {
  incoming: "입고", coating_done: "코팅완료", spray_done_prod: "분사완료(생산용)",
  spray_done_sale: "분사완료(판매용)", print_used: "인쇄사용",
  print_used_prod: "인쇄사용(생산용)", print_used_sale: "인쇄사용(판매용)",
  sale_cut: "재단판매", adjustment: "재고조정(PET)",
};
const CCP_EVENT_LABELS: Record<string, string> = {
  start: "시작", mid_check: "중간점검", end: "종료",
  material_in: "원료투입", material_out: "원료소진", vat_refill: "밧트교체", move: "슬롯이동",
};

function eventBadgeCls(type: string) {
  if (type === "start") return "bg-blue-100 border-blue-200 text-blue-700";
  if (type === "end") return "bg-purple-100 border-purple-200 text-purple-700";
  if (type === "material_in") return "bg-green-100 border-green-200 text-green-700";
  if (type === "material_out") return "bg-orange-100 border-orange-200 text-orange-700";
  if (type === "vat_refill") return "bg-amber-100 border-amber-200 text-amber-700";
  if (type === "move") return "bg-teal-100 border-teal-200 text-teal-700";
  return "bg-slate-100 border-slate-200 text-slate-600";
}

// ═══════════════════════════════════════════════════════════
// CCP-1B 조회 탭 — 새 구조 (ccp_slot_events + ccp_wo_events)
// 기존 Ccp1bTab 전체를 이 코드로 교체하세요
// ═══════════════════════════════════════════════════════════

export function Ccp1bTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  const [filterDate, setFilterDate] = useState(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  const [loading, setLoading] = useState(false);
  const [rangePanelOpen, setRangePanelOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState<string>(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  const [rangeTo, setRangeTo] = useState<string>(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeData, setRangeData] = useState<{
    date: string;
    slotEvents: any[];
    woEvents: any[];
    woLabelMap: Record<string, string>;
    assigneeMap: Record<string, string>;
  }[]>([]);
  const [allSlots, setAllSlots] = useState<WarmSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // 슬롯 이벤트 (원료투입/소진/이동) — 슬롯 기준
  const [slotEvents, setSlotEvents] = useState<{
    id: string; slot_id: string; event_date: string; event_type: string;
    measured_at: string; work_order_no: string | null; action_note: string | null;
    material_type: string | null;
  }[]>([]);

  // 작업지시서 온도기록 — 작업지시서 기준
  const [woEvents, setWoEvents] = useState<{
    id: string; work_order_no: string; slot_id: string; event_type: string;
    measured_at: string; temperature: number | null; is_ok: boolean | null;
    action_note: string | null;
  }[]>([]);

  // 수정 state (wo_events 수정용)
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editTemp, setEditTemp] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editIsOk, setEditIsOk] = useState(true);
  const [editActionNote, setEditActionNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [woLabelMap, setWoLabelMap] = useState<Record<string, string>>({});
  const [slotWoMap, setSlotWoMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    supabase.from("warmer_slots").select("id,slot_name,purpose")
      .eq("is_active", true).order("slot_no")
      .then(({ data }) => setAllSlots(data ?? []));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [slotRes, woRes] = await Promise.all([
      supabase.from("ccp_slot_events")
      .select("id, slot_id, event_date, event_type, measured_at, work_order_no, action_note, temperature, is_ok, material_type")
        .eq("event_date", filterDate)
        .order("measured_at", { ascending: true }),
      supabase.from("ccp_wo_events")
        .select("id, work_order_no, slot_id, event_type, measured_at, temperature, is_ok, action_note")
        .order("measured_at", { ascending: true }),
    ]);

    setSlotEvents((slotRes.data ?? []) as any[]);
    const filtered = (woRes.data ?? []).filter((e: any) =>
      e.measured_at.slice(0, 10) === filterDate
    );
    setWoEvents(filtered as any[]);
// work_order_no → 표시 레이블 맵 생성
const allWoNos = [...new Set([
  ...(slotRes.data ?? []).map((e: any) => e.work_order_no).filter(Boolean),
  ...filtered.map((e: any) => e.work_order_no).filter(Boolean),
])] as string[];


if (allWoNos.length > 0) {
  const { data: woData } = await supabase
    .from("work_orders")
    .select("work_order_no, client_name, sub_name, product_name")
    .in("work_order_no", allWoNos);
  const map: Record<string, string> = {};
  for (const wo of woData ?? []) {
    const rawSecond = wo.sub_name ?? wo.product_name ?? "";
    const secondPart = rawSecond.startsWith(wo.client_name)
      ? rawSecond.slice(wo.client_name.length).replace(/^[-_\s·]+/, "")
      : rawSecond;
    const label = secondPart
      ? `${wo.client_name} · ${secondPart}`
      : wo.client_name;


    map[wo.work_order_no] = label;
  }
  setWoLabelMap(map);
}  // ← if (allWoNos.length > 0) 닫는 괄호

// ccp_wo_events(당일 온도기록)에 slot_id + work_order_no가 이미 함께 기록됨
// work_orders.ccp_slot_id는 변경될 수 있어 신뢰 불가 → 사용하지 않음
const slotMap: Record<string, string[]> = {};
for (const e of filtered) {
  if (!e.slot_id || !e.work_order_no) continue;
  if (!slotMap[e.slot_id]) slotMap[e.slot_id] = [];
  if (!slotMap[e.slot_id].includes(e.work_order_no))
    slotMap[e.slot_id].push(e.work_order_no);
}
setSlotWoMap(slotMap);
    setLoading(false);
  }, [filterDate]); 
  async function loadRangeData(): Promise<typeof rangeData> {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return [];
    setRangeLoading(true);

    // 날짜 목록 생성
    const dates: string[] = [];
    const cur = new Date(rangeFrom + "T00:00:00+09:00");
    const end = new Date(rangeTo + "T00:00:00+09:00");
    while (cur <= end) {
      dates.push(cur.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
      cur.setDate(cur.getDate() + 1);
    }

    const results: typeof rangeData = [];

    for (const date of dates) {
      const [slotRes, woRes] = await Promise.all([
        supabase.from("ccp_slot_events")
          .select("id,slot_id,event_date,event_type,measured_at,work_order_no,action_note,temperature,is_ok,material_type")
          .eq("event_date", date)
          .order("measured_at", { ascending: true }),
        supabase.from("ccp_wo_events")
          .select("id,work_order_no,slot_id,event_type,measured_at,temperature,is_ok,action_note")
          .gte("measured_at", `${date}T00:00:00+09:00`)
          .lte("measured_at", `${date}T23:59:59+09:00`)
          .order("measured_at", { ascending: true }),
      ]);

      const sEvents = (slotRes.data ?? []) as any[];
      const wEvents = (woRes.data ?? []) as any[];

      const allWoNos = [...new Set([
        ...sEvents.map((e: any) => e.work_order_no).filter(Boolean),
        ...wEvents.map((e: any) => e.work_order_no).filter(Boolean),
      ])] as string[];

      const labelMap: Record<string, string> = {};
      if (allWoNos.length > 0) {
        const { data: woData } = await supabase
          .from("work_orders")
          .select("work_order_no,client_name,sub_name,product_name")
          .in("work_order_no", allWoNos);
        for (const wo of woData ?? []) {
          const rawSecond = wo.sub_name ?? wo.product_name ?? "";
          const secondPart = rawSecond.startsWith(wo.client_name)
            ? rawSecond.slice(wo.client_name.length).replace(/^[-_\s·]+/, "")
            : rawSecond;
          labelMap[wo.work_order_no] = secondPart
            ? `${wo.client_name} · ${secondPart}`
            : wo.client_name;
        }
      }

    // 담당자 맵 조회 — work_orders.assignee_production 직접 사용
    const allWoNosForAssignee = [...new Set([
      ...sEvents.map((e: any) => e.work_order_no).filter(Boolean),
      ...wEvents.map((e: any) => e.work_order_no).filter(Boolean),
    ])] as string[];
    const assigneeMap: Record<string, string> = {};
    if (allWoNosForAssignee.length > 0) {
      const { data: woData } = await supabase
        .from("work_orders")
        .select("work_order_no, assignee_production, assignee_transfer")
        .in("work_order_no", allWoNosForAssignee);
      for (const wo of woData ?? []) {
        const assignee = wo.assignee_production ?? wo.assignee_transfer;
        if (assignee) assigneeMap[wo.work_order_no] = assignee;
      }
    }

    if (sEvents.length > 0 || wEvents.length > 0) {
      results.push({ date, slotEvents: sEvents, woEvents: wEvents, woLabelMap: labelMap, assigneeMap });
    }
    }

    setRangeData(results);
    setRangeLoading(false);
    return results;
  }

  async function printRange() {
    const results = await loadRangeData();
    if (results.length === 0) return showToast("조회된 기록이 없습니다.", "error");

    const tdS = `border:1px solid #000;padding:2px 3px;font-size:8pt;vertical-align:middle;`;
    const thS = `border:1px solid #000;padding:2px 3px;font-size:7.5pt;font-weight:bold;text-align:center;background:#fff;vertical-align:middle;`;
    const CHUNK_SIZE_R = 7;
    const WO_LABEL: Record<string,string> = { start:"시작", mid_check:"중간점검", end:"종료" };
    const dayNames = ["일","월","화","수","목","금","토"];

    function toKSTTimeStr(isoStr: string): string {
      const d = new Date(isoStr);
      return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    }

    function signImgHtml(name: string | null): string {
      const signMap: Record<string, string> = {
        "조은미":"/sign-choem.png","강미라":"/sign-kangml.png",
        "나현우":"/sign-nahw.png","나미영":"/sign-namiy.png",
        "조대성":"/sign-chods.png","김영각":"/sign-kimyg.png","고한결":"/sign-gohg.png",
      };
      if (!name) return "";
      const src = signMap[name];
      if (src) return `<img src="${src}" style="height:20px;object-fit:contain;display:block;margin:0 auto;" alt="${name}"/><div style="font-size:6pt;">${name}</div>`;
      return `<div style="font-size:7pt;">${name}</div>`;
    }

    function buildRangeSection(slots: WarmSlot[], label: string, dayData: typeof results[0]): string {
      if (slots.length === 0) return "";

      const getSlotMaterialType = (slotId: string) => {
        const lastIn = [...dayData.slotEvents]
          .filter((e: any) => e.slot_id === slotId && e.event_type === "material_in")
          .sort((a: any, b: any) => b.measured_at.localeCompare(a.measured_at))[0];
        return (lastIn as any)?.material_type ?? null;
      };

      const slotWoEventsDedup = (slotId: string) => {
        const seen = new Set<string>();
        return dayData.woEvents
          .filter((e: any) => e.slot_id === slotId)
          .sort((a: any, b: any) => a.measured_at.localeCompare(b.measured_at))
          .filter((e: any) => {
            const key = `${e.measured_at.slice(11,16)}_${e.temperature}`;
            if (seen.has(key)) return false;
            seen.add(key); return true;
          });
      };

      const chunks: WarmSlot[][] = [];
      for (let i = 0; i < slots.length; i += CHUNK_SIZE_R) chunks.push(slots.slice(i, i + CHUNK_SIZE_R));
      if (chunks.length === 0) chunks.push([]);

      const chunkMaxRows = chunks.map(chunk =>
        Math.max(...chunk.map(s => slotWoEventsDedup(s.id).length), 3)
      );
      const totalRowspan = chunks.reduce((sum, _, ci) => sum + 5 + chunkMaxRows[ci], 0);
      const colW = `calc((100% - 44px) / ${CHUNK_SIZE_R})`;

      let html = `<table style="width:100%;border-collapse:collapse;margin-bottom:6px;table-layout:fixed;"><tbody>`;

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const maxRows = chunkMaxRows[ci];
        const empty = CHUNK_SIZE_R - chunk.length;

        // 슬롯명 행
        html += `<tr>`;
        if (ci === 0) html += `<td rowspan="${totalRowspan}" style="${tdS}font-weight:bold;text-align:center;width:44px;font-size:8pt;writing-mode:vertical-rl;">${label}</td>`;
        for (const s of chunk) {
          const mt = getSlotMaterialType(s.id);
          html += `<td style="${tdS}text-align:center;font-weight:bold;font-size:8pt;height:22px;width:${colW};">${s.slot_name}${s.purpose === "유동" ? `<span style="font-size:7pt;color:#854F0B;">(${mt})</span>` : ""}</td>`;
        }
        for (let i = 0; i < empty; i++) html += `<td style="${tdS}width:${colW};"></td>`;
        html += `</tr>`;

        // 원료투입 행
        html += `<tr>`;
        for (const s of chunk) {
          const ev = dayData.slotEvents.filter((e: any) => e.slot_id === s.id && e.event_type === "material_in" && !e.action_note?.includes("→"))
            .sort((a: any, b: any) => a.measured_at.localeCompare(b.measured_at))[0];
          html += `<td style="${tdS}text-align:center;font-size:8pt;height:22px;">${ev ? `원료투입: ${toKSTTimeStr(ev.measured_at)}` : ""}</td>`;
        }
        for (let i = 0; i < empty; i++) html += `<td style="${tdS}"></td>`;
        html += `</tr>`;

        // 슬롯이동 행
        html += `<tr>`;
        for (const s of chunk) {
          const moveEvs = [
            ...dayData.slotEvents.filter((e: any) => e.slot_id === s.id && e.event_type === "material_out" && e.action_note?.startsWith("→")),
            ...dayData.slotEvents.filter((e: any) => e.slot_id === s.id && e.event_type === "material_in" && e.action_note?.includes("→")),
          ].sort((a: any, b: any) => a.measured_at.localeCompare(b.measured_at));
          const cellContent = moveEvs.length === 0 ? "" : moveEvs.map((ev: any) => `슬롯이동: ${toKSTTimeStr(ev.measured_at)} (${ev.action_note})`).join("<br/>");
          html += `<td style="${tdS}text-align:center;font-size:8pt;min-height:22px;">${cellContent}</td>`;
        }
        for (let i = 0; i < empty; i++) html += `<td style="${tdS}"></td>`;
        html += `</tr>`;

        // 온도기록 행
        for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
          html += `<tr>`;
          for (const s of chunk) {
            const ev = slotWoEventsDedup(s.id)[rowIdx];
            const isNG = ev?.is_ok === false;
            html += `<td style="${tdS}text-align:center;font-size:8pt;color:${isNG?"red":"#000"};height:22px;">`;
            if (ev) {
              const bg = ev.event_type === "start" ? "#dbeafe" : ev.event_type === "end" ? "#ede9fe" : "#f1f5f9";
              html += `<span style="font-size:7pt;background:${bg};padding:0 3px;border-radius:2px;margin-right:2px;">${WO_LABEL[ev.event_type] ?? ev.event_type}</span>(${toKSTTimeStr(ev.measured_at)}) ${ev.temperature ?? ""}℃<br/><span style="font-size:6.5pt;color:#475569;">${dayData.woLabelMap?.[ev.work_order_no] ?? ""}</span>`;
            }
            html += `</td>`;
          }
          for (let i = 0; i < empty; i++) html += `<td style="${tdS}"></td>`;
          html += `</tr>`;
        }

        // 빈 행
        html += `<tr>`;
        for (let i = 0; i < CHUNK_SIZE_R; i++) html += `<td style="${tdS}height:22px;"></td>`;
        html += `</tr>`;

        // 판정+서명 행
        html += `<tr>`;
        for (const s of chunk) {
          const evs = dayData.woEvents.filter((e: any) => e.slot_id === s.id);
          if (evs.length === 0) { html += `<td style="${tdS}height:28px;"></td>`; continue; }
          const hasNG = evs.some((e: any) => e.is_ok === false);
          const woNos = [...new Set(dayData.slotEvents.filter((e: any) => e.slot_id === s.id).map((e: any) => e.work_order_no).filter(Boolean))] as string[];
          const assignees = [...new Set(woNos.map((no: string) => dayData.assigneeMap?.[no]).filter(Boolean))] as string[];
          const assigneeName = assignees[0] ?? null;
          html += `<td style="${tdS}text-align:center;font-size:8pt;height:28px;">`;
          html += `<div style="margin-bottom:1px;"><span style="font-weight:bold;color:${hasNG?"red":"#000"};">판정: ${hasNG?"X":"O"}</span></div>`;
          html += signImgHtml(assigneeName);
          html += `</td>`;
        }
        for (let i = 0; i < empty; i++) html += `<td style="${tdS}height:28px;"></td>`;
        html += `</tr>`;
      }

      html += `</tbody></table>`;
      return html;
    }

    let bodyHtml = "";

    for (let di = 0; di < results.length; di++) {
      const dayData = results[di];
      const isLast = di === results.length - 1;
      const d = new Date(dayData.date + "T00:00:00+09:00");
      const dateLabel = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;

      const getSlotMaterialType = (slotId: string) => {
        const lastIn = [...dayData.slotEvents]
          .filter((e: any) => e.slot_id === slotId && e.event_type === "material_in")
          .sort((a: any, b: any) => b.measured_at.localeCompare(a.measured_at))[0];
        return (lastIn as any)?.material_type ?? null;
      };
      const hasActivity = (slotId: string) =>
        dayData.woEvents.some((e: any) => e.slot_id === slotId) ||
        dayData.slotEvents.some((e: any) => e.slot_id === slotId);

      const darkActive = [
        ...allSlots.filter(s => s.purpose === "다크컴파운드"),
        ...allSlots.filter(s => s.purpose === "유동" && getSlotMaterialType(s.id) === "다크"),
      ].filter(s => hasActivity(s.id));
      const whiteActive = [
        ...allSlots.filter(s => s.purpose === "화이트컴파운드"),
        ...allSlots.filter(s => s.purpose === "유동" && getSlotMaterialType(s.id) === "화이트"),
      ].filter(s => hasActivity(s.id));

      const deviations = dayData.woEvents.filter((e: any) => e.is_ok === false)
        .map((e: any) => `${toKSTTimeStr(e.measured_at)} — ${e.temperature ?? ""}°C / ${e.action_note ?? ""}`)
        .join("  /  ") || " ";

      bodyHtml += `<div style="page-break-after:${isLast?"avoid":"always"};">`;

      // 제목+결재란
      bodyHtml += `<table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr>
          <td rowspan="2" style="${tdS}font-size:12pt;font-weight:bold;text-align:center;padding:6px 8px;">중요관리점(CCP-1B) 모니터링일지<br/><span style="font-size:9pt;">[가열공정] 일반</span><br/><span style="font-size:8pt;">*온장고 내 보관기간 : 1개월 미만*</span></td>
          <td rowspan="2" style="${tdS}width:28px;font-weight:bold;text-align:center;font-size:8pt;">결<br/>재<br/>란</td>
          <td style="${tdS}width:80px;text-align:center;font-weight:bold;">작성</td>
          <td style="${tdS}width:80px;text-align:center;font-weight:bold;">승인</td>
        </tr>
        <tr>
          <td style="${tdS}text-align:center;padding:3px;"><img src="/sign-kimyg.png" style="height:30px;object-fit:contain;display:block;margin:0 auto;" alt="김영각"/><div style="font-size:7pt;margin-top:2px;">김영각</div></td>
          <td style="${tdS}text-align:center;padding:3px;"><img src="/sign-chods.png" style="height:30px;object-fit:contain;display:block;margin:0 auto;" alt="조대성"/><div style="font-size:7pt;margin-top:2px;">조대성</div></td>
        </tr>
      </tbody></table>`;

      // 작성일자
      bodyHtml += `<table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr><td style="${tdS}width:80px;font-weight:bold;white-space:nowrap;">작성일자</td><td style="${tdS}">${dateLabel}</td></tr>
      </tbody></table>`;

      // 위해요소/한계기준/주기/방법
      bodyHtml += `<table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr>
          <td style="${tdS}font-weight:bold;white-space:nowrap;width:56px;">위해요소</td>
          <td colspan="3" style="${tdS}font-size:8pt;">병원성 미생물(리스테리아모노사이토제네스, 장출혈성대장균)</td>
          <td style="${tdS}font-weight:bold;text-align:center;width:60px;">온도</td>
          <td style="${tdS}font-weight:bold;text-align:center;width:80px;">시간</td>
        </tr>
        <tr>
          <td rowspan="2" style="${tdS}font-weight:bold;">한계기준</td>
          <td colspan="3" style="${tdS}font-size:8pt;">준초콜릿(다크컴파운드)</td>
          <td style="${tdS}text-align:center;">45±5℃</td>
          <td rowspan="2" style="${tdS}text-align:center;font-size:8pt;white-space:nowrap;">4시간 이상 유지</td>
        </tr>
        <tr>
          <td colspan="3" style="${tdS}font-size:8pt;">당류가공품(화이트컴파운드)</td>
          <td style="${tdS}text-align:center;">45±5℃</td>
        </tr>
        <tr>
          <td style="${tdS}font-weight:bold;">주 기</td>
          <td colspan="5" style="${tdS}font-size:8pt;">작업시작 전, 작업 중 2시간마다, 작업종료</td>
        </tr>
        <tr>
          <td style="${tdS}font-weight:bold;">방 법</td>
          <td colspan="5" style="${tdS}font-size:8pt;">◦ 중탕온도 : 바트 품온 온도 확인  ◦ 가열시간 : 4시간 이상 가열</td>
        </tr>
      </tbody></table>`;

      bodyHtml += buildRangeSection(darkActive, "준초콜릿", dayData);
      bodyHtml += buildRangeSection(whiteActive, "당류가공품", dayData);

      // 이탈 및 조치
      bodyHtml += `<table style="width:100%;border-collapse:collapse;margin-top:4px;"><tbody>
        <tr>
          <td style="${tdS}font-weight:bold;font-size:8pt;width:140px;white-space:nowrap;">한계기준 이탈 및 조치내용</td>
          <td style="${tdS}padding:4px 6px;font-size:8pt;">${deviations}</td>
        </tr>
      </tbody></table>`;

      bodyHtml += `</div>`;
    }

    const printTitle = `CCP-1B_가열공정_${rangeFrom}_${rangeTo}`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>${printTitle}</title>
      <style>
        @page { size: A4 landscape; margin: 8mm 10mm; }
        body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9pt; color: #000; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        table { border-collapse: collapse; }
        img { max-width: none; }
      </style>
    </head><body>${bodyHtml}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  }

  useEffect(() => { loadData(); }, [loadData]);

  // 슬롯별 마지막 상태 (원료 있는지)
  function slotHasMaterial(slotId: string) {
    const events = slotEvents.filter((e) => e.slot_id === slotId)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const last = events[events.length - 1];
    return last && last.event_type !== "material_out";
  }

  // 선택된 슬롯의 슬롯 이벤트
  const selectedSlotEvents = selectedSlotId
    ? slotEvents.filter((e) => e.slot_id === selectedSlotId)
        .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    : [];

  // 선택된 슬롯에서 작업한 작업지시서 온도기록
  const selectedWoEvents = selectedSlotId
    ? woEvents.filter((e) => e.slot_id === selectedSlotId)
        .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    : [];

  // 선택된 슬롯에서 작업한 작업지시서 번호 목록
  const relatedWoNos = selectedSlotId
  ? (slotWoMap[selectedSlotId] ?? [])
  : [];

  function startEdit(ev: typeof woEvents[0]) {
    setEditingEventId(ev.id);
    setEditTemp(ev.temperature != null ? String(ev.temperature) : "");
    setEditTime(ev.measured_at.slice(11, 16));
    setEditIsOk(ev.is_ok ?? true);
    setEditActionNote(ev.action_note ?? "");
  }

  async function saveEditEvent(ev: typeof woEvents[0]) {
    if (!editTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(editTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50°C 범위여야 합니다.", "error");
    setEditSaving(true);
    const { error } = await supabase.from("ccp_wo_events").update({
      measured_at: `${filterDate}T${editTime}:00`,
      temperature: temp,
      is_ok: editIsOk,
      action_note: editActionNote.trim() || null,
    }).eq("id", ev.id);
    setEditSaving(false);
    if (error) return showToast("수정 실패: " + error.message, "error");
    showToast("✅ 수정 완료!");
    setEditingEventId(null);
    await loadData();
  }

  async function deleteWoEvent(eventId: string) {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("ccp_wo_events").delete().eq("id", eventId);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료!");
    await loadData();
  }

  async function deleteSlotEvent(eventId: string) {
    if (!confirm("이 슬롯 기록을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("ccp_slot_events").delete().eq("id", eventId);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료!");
    await loadData();
  }

  const CCP_WO_EVENT_LABELS: Record<string, string> = { start: "시작", mid_check: "중간점검", end: "종료" };
  const CCP_SLOT_EVENT_LABELS: Record<string, string> = { material_in: "원료투입", material_out: "원료소진", move: "슬롯이동", start: "시작", mid_check: "중간점검", end: "종료" };

  function woBadgeCls(type: string) {
    if (type === "start") return "bg-blue-100 border-blue-200 text-blue-700";
    if (type === "end") return "bg-purple-100 border-purple-200 text-purple-700";
    return "bg-slate-100 border-slate-200 text-slate-600";
  }
  function slotBadgeCls(type: string) {
    if (type === "material_in") return "bg-green-100 border-green-200 text-green-700";
    if (type === "material_out") return "bg-orange-100 border-orange-200 text-orange-700";
    if (type === "move") return "bg-teal-100 border-teal-200 text-teal-700";
    if (type === "start") return "bg-blue-100 border-blue-200 text-blue-700";
    if (type === "mid_check") return "bg-slate-100 border-slate-200 text-slate-600";
    if (type === "end") return "bg-purple-100 border-purple-200 text-purple-700";
    return "bg-slate-100 border-slate-200 text-slate-600";
  }

  // 슬롯 목록에서 오늘 활동있는 슬롯 구분
  const activeSlotsToday = new Set(slotEvents.map((e) => e.slot_id));

  const [slotAssigneesState, setSlotAssigneesState] = React.useState<Record<string, string[]>>({});
  const [woAssigneeMapState, setWoAssigneeMapState] = React.useState<Record<string, string>>({});
  const slotAssigneesRef = React.useRef<Record<string, string[]>>({});
  const woAssigneeMapRef = React.useRef<Record<string, string>>({});

async function handlePrint() {
  const activeSlotIds = [...activeSlotsToday];
  if (activeSlotIds.length === 0) {
    // 데이터 없어도 인쇄는 진행
  }

  const woNosPerSlot: Record<string, string[]> = {};
  for (const slotId of activeSlotIds) {
    const wNos = [...new Set([
      ...slotEvents.filter(e => e.slot_id === slotId).map(e => e.work_order_no).filter(Boolean) as string[],
      ...woEvents.filter(e => e.slot_id === slotId).map(e => e.work_order_no),
    ])];
    woNosPerSlot[slotId] = wNos;
  }

  const allWoNos = [...new Set(Object.values(woNosPerSlot).flat())];
  const assigneeMap: Record<string, string> = {};

  if (allWoNos.length > 0) {
   // assignee_production → assignee_transfer 순으로 fallback 조회
   const { data } = await supabase
   .from("work_orders")
   .select("work_order_no, assignee_production, assignee_transfer")
   .in("work_order_no", allWoNos);
 for (const row of data ?? []) {
   const assignee = row.assignee_production ?? row.assignee_transfer;
   if (assignee) assigneeMap[row.work_order_no] = assignee;
 }
  }

  const newSlotAssignees: Record<string, string[]> = {};
    for (const slotId of activeSlotIds) {
      const assignees: string[] = [];
      for (const wNo of woNosPerSlot[slotId] ?? []) {
        if (assigneeMap[wNo] && !assignees.includes(assigneeMap[wNo])) {
          assignees.push(assigneeMap[wNo]);
        }
      }
      if (assignees.length > 0) newSlotAssignees[slotId] = assignees;
    }
  
    slotAssigneesRef.current = newSlotAssignees;
    woAssigneeMapRef.current = assigneeMap;
    setSlotAssigneesState(newSlotAssignees);
    setWoAssigneeMapState(assigneeMap);
    console.log("slotAssigneesRef:", JSON.stringify(newSlotAssignees));
    console.log("woAssigneeMapRef:", JSON.stringify(woAssigneeMapRef.current));
    console.log("slotWoMap:", JSON.stringify(slotWoMap));
  
    setTimeout(() => {
      const content = document.getElementById("ccp1b-print-inner");
      if (!content) return;
      const printTitle = `CCP-1B_가열공정_${filterDate}`;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head>
        <meta charset="utf-8">
        <title>${printTitle}</title>
        <style>
          @page { size: A4 landscape; margin: 8mm 10mm; }
          body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9pt; color: #000; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          table { border-collapse: collapse; page-break-inside: avoid; }
          img { max-width: none; }
        </style>
      </head><body>${content.innerHTML}</body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 500);
    }, 400);
  }

  return (
    <div className="space-y-4">
    {/* ── 조회 기간 + 인쇄 통합 패널 ── */}
    <div className={`${card} p-3 print:hidden flex flex-wrap items-center gap-3`}>
        <span className="text-sm font-semibold text-slate-600">조회 기간</span>
        <input
          type="date"
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          value={rangeFrom}
          max={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })}
          onChange={(e) => { setRangeFrom(e.target.value); setFilterDate(e.target.value); setSelectedSlotId(null); setEditingEventId(null); setRangeData([]); }}
        />
        <span className="text-slate-400">~</span>
        <input
          type="date"
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          value={rangeTo}
          max={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })}
          onChange={(e) => { setRangeTo(e.target.value); setFilterDate(e.target.value); setSelectedSlotId(null); setEditingEventId(null); setRangeData([]); }}
        />
        <button className={btn} onClick={() => { loadData(); }}>🔄 새로고침</button>
        <button
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
          onClick={printRange}
        >🖨️ 기간 인쇄</button>
       
        {(rangeFrom !== new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) || rangeTo !== new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })) && (
          <>
            <button
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
              onClick={() => {
                const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
                setRangeFrom(today); setRangeTo(today); setFilterDate(today);
                setSelectedSlotId(null); setEditingEventId(null);
              }}
            >오늘로 돌아가기</button>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">과거 기록 조회 중</span>
          </>
        )}
      </div>

      {/* 공통사항 */}
      <div className={`${card} p-3 print:hidden`}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span className="font-semibold">⚠ 한계기준:</span> 준초콜릿·당류가공품 45±5°C (40~50°C), 4시간 이상 유지 / 주기: 작업시작 전, 작업 중 2시간마다, 작업종료
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      
        {/* 좌: 슬롯 목록 */}
        <div className={`${card} p-4`} style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
          <div className="mb-3 font-semibold text-sm">🌡️ 슬롯 목록 — {filterDate}</div>
          {loading ? (
            <div className="py-6 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : activeSlotsToday.size === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">
              <div className="text-2xl mb-2">🌡️</div>
              <div>세션이 없습니다.</div>
              <div className="text-xs mt-1 text-slate-300">작업지시서에서 온도 기록 시 자동 생성됩니다.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {allSlots.filter((s) => activeSlotsToday.has(s.id) && s.purpose !== "전사용도" && s.purpose !== "코팅용도").map((s) => {
                const sEvents = slotEvents.filter((e) => e.slot_id === s.id);
                const wEvents = woEvents.filter((e) => e.slot_id === s.id);
                const temps = wEvents.filter((e) => e.temperature != null).map((e) => e.temperature as number);
                const hasNG = wEvents.some((e) => e.is_ok === false);
                const lastTemp = [...wEvents].sort((a, b) => b.measured_at.localeCompare(a.measured_at)).find((e) => e.temperature != null);
                const hasMaterial = slotHasMaterial(s.id);
                const woNos = [...new Set(sEvents.map((e) => e.work_order_no).filter(Boolean))];

                return (
                  <button key={s.id}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${selectedSlotId === s.id ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    onClick={() => { setSelectedSlotId(s.id); setEditingEventId(null); }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm">{s.slot_name}</div>
                      <span className={`... ${
  status === "있음" ? "bg-green-100 border-green-200 text-green-700"
  : status === "슬롯이동" ? "bg-teal-100 border-teal-200 text-teal-700"
  : "bg-slate-100 border-slate-200 text-slate-500"
}`}>
  {status === "있음" ? "원료있음" : status}
</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{s.purpose}</div>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      {lastTemp && <span className={`text-xs font-bold ${hasNG ? "text-red-600" : "text-blue-600"}`}>최근 {lastTemp.temperature}°C</span>}
                      <span className="text-[11px] text-slate-400">슬롯기록 {sEvents.length}건 · 온도기록 {wEvents.length}건</span>
                      {hasNG && <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700">⚠ 이탈</span>}
                    </div>
                    {woNos.length > 0 && (
  <div className="mt-1 text-[10px] text-slate-400 truncate">
   {woNos.map((no) => (no ? woLabelMap[no] ?? no : "")).filter(Boolean).join(", ")}
  </div>
)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 우: 슬롯 상세 */}
        {selectedSlotId ? (() => {
          const slot = allSlots.find((s) => s.id === selectedSlotId);
          return (
            <div className="space-y-3" style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
              {/* 헤더 */}
              <div className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold text-base">
                      🌡️ {slot?.slot_name}
                      <span className="ml-2 text-sm font-normal text-slate-500">({slot?.purpose})</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">{filterDate}</div>
                  </div>
                </div>

                {/* 연결된 작업지시서 */}
                {relatedWoNos.length > 0 && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">📋 이 슬롯을 사용한 작업지시서</div>
                    <div className="flex flex-wrap gap-2">
                    {relatedWoNos.map((no) => (
  <span key={no} title={no} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
    {woLabelMap[no] ?? no}
  </span>
))}
                    </div>
                  </div>
                )}
              </div>

  {/* 통합 기록 */}
  <div className={`${card} p-4`}>
                <div className="mb-3 font-semibold text-sm">🌡️ 기록</div>
                {selectedSlotEvents.length === 0 && selectedWoEvents.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b-2 border-slate-200 bg-slate-50">
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">시각</th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">유형</th>
                            <th className="py-2 px-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">온도</th>
                            <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">판정</th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">비고</th>
                            {isAdminOrSubadmin && <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500">관리</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {/* 슬롯 이벤트 (원료투입/슬롯이동 등) — 중복 제거 */}
                          {(() => {
                            const seen = new Set<string>();
                            return selectedSlotEvents
                              .filter(e => e.event_type === "material_in" || e.event_type === "material_out")
                              .filter(e => {
                                const key = `${e.measured_at}_${e.event_type}`;
                                if (seen.has(key)) return false;
                                seen.add(key); return true;
                              })
                              .map((ev, idx) => {
                                const isMove = (ev.event_type === "material_out" && ev.action_note?.startsWith("→")) || (ev.event_type === "material_in" && ev.action_note?.includes("→"));
                                const label = isMove ? "슬롯이동" : ev.event_type === "material_in" ? "원료투입" : "원료소진";
                                const badgeCls = isMove ? "bg-teal-100 border-teal-200 text-teal-700" : slotBadgeCls(ev.event_type);
                                return (
                                  <tr key={ev.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                    <td className="py-2 px-3 font-mono text-sm text-slate-700 whitespace-nowrap">{toKSTTime(ev.measured_at)}</td>
                                    <td className="py-2 px-3 whitespace-nowrap">
                                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeCls}`}>{label}</span>
                                    </td>
                                    <td className="py-2 px-3 text-right whitespace-nowrap"><span className="text-slate-300">—</span></td>
                                    <td className="py-2 px-3 text-center whitespace-nowrap"><span className="text-slate-300 text-xs">—</span></td>
                                    <td className="py-2 px-3 text-xs text-slate-500">{ev.action_note ?? ""}</td>
                                    {isAdminOrSubadmin && (
                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                        <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500"
                                          onClick={() => deleteSlotEvent(ev.id)}>삭제</button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              });
                          })()}
                          {/* 온도 기록 (시작/중간점검/종료) — 중복 제거 */}
                          {(() => {
                            const seen = new Set<string>();
                            return selectedWoEvents
                              .filter(e => {
                                const key = `${e.measured_at}_${e.event_type}`;
                                if (seen.has(key)) return false;
                                seen.add(key); return true;
                              })
                              .map((ev, idx) => {
                                const isNG = ev.is_ok === false;
                                const isEditing = editingEventId === ev.id;
                                return (
                                  <tr key={ev.id} className={`border-b border-slate-100 ${isEditing ? "bg-blue-50" : isNG ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                    <td className="py-2 px-3 font-mono text-sm text-slate-700 whitespace-nowrap">
                                      {isEditing
                                        ? <input type="time" className="w-24 rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                                        : toKSTTime(ev.measured_at)}
                                    </td>
                                    <td className="py-2 px-3 whitespace-nowrap">
                                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${woBadgeCls(ev.event_type)}`}>
                                        {CCP_WO_EVENT_LABELS[ev.event_type] ?? ev.event_type}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-right whitespace-nowrap">
                                      {isEditing
                                        ? <input className="w-20 rounded-lg border border-blue-300 px-2 py-1 text-xs text-right tabular-nums focus:outline-none" inputMode="decimal" value={editTemp} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setEditTemp(v); if (v) setEditIsOk(Number(v) >= 40 && Number(v) <= 50); }} />
                                        : ev.temperature != null
                                          ? <span className={`text-sm font-bold tabular-nums ${isNG ? "text-red-600" : "text-blue-700"}`}>{ev.temperature}°C</span>
                                          : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="py-2 px-3 text-center whitespace-nowrap">
                                      {isEditing
                                        ? <select className={`rounded-lg border px-1.5 py-1 text-xs focus:outline-none ${editIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`} value={editIsOk ? "ok" : "ng"} onChange={(e) => setEditIsOk(e.target.value === "ok")}>
                                            <option value="ok">O 적합</option><option value="ng">X 부적합</option>
                                          </select>
                                        : ev.is_ok != null
                                          ? <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ev.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>{ev.is_ok ? "O" : "X"}</span>
                                          : <span className="text-slate-300 text-xs">—</span>}
                                    </td>
                                    <td className="py-2 px-3 text-xs">
                                      {isEditing
                                        ? <input className="w-full rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none" value={editActionNote} onChange={(e) => setEditActionNote(e.target.value)} placeholder="조치사항" />
                                        : <span className={isNG ? "text-red-600" : ""}>{ev.action_note ?? ""}</span>}
                                    </td>
                                    {isAdminOrSubadmin && (
                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                        {isEditing
                                          ? <div className="flex gap-1 justify-center">
                                              <button className="rounded-lg border border-blue-400 bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={editSaving} onClick={() => saveEditEvent(ev)}>{editSaving ? "..." : "저장"}</button>
                                              <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50" onClick={() => setEditingEventId(null)}>취소</button>
                                            </div>
                                          : <div className="flex gap-1 justify-center">
                                              <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600" onClick={() => startEdit(ev)}>수정</button>
                                              <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500" onClick={() => deleteWoEvent(ev.id)}>삭제</button>
                                            </div>}
                                      </td>
                                    )}
                                  </tr>
                                );
                              });
                          })()}
                        </tbody>
                      </table>
                    </div>
                    {/* 요약 */}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      {(() => {
                        const seen = new Set<string>();
                        const deduped = selectedWoEvents.filter(e => {
                          const key = `${e.measured_at}_${e.event_type}`;
                          if (seen.has(key)) return false;
                          seen.add(key); return true;
                        });
                        const temps = deduped.filter((e) => e.temperature != null).map((e) => e.temperature as number);
                        const ngCount = deduped.filter((e) => e.is_ok === false).length;
                        const okCount = deduped.filter((e) => e.is_ok === true).length;
                        return (
                          <>
                            <span>온도 측정 <b>{temps.length}</b>회</span>
                            {okCount > 0 && <span className="text-green-600">적합 <b>{okCount}</b>회</span>}
                            {ngCount > 0 && <span className="text-red-600 font-semibold">⚠ 이탈 <b>{ngCount}</b>회</span>}
                            {temps.length > 0 && <span>최저 <b className={Math.min(...temps) < 40 ? "text-red-600" : ""}>{Math.min(...temps)}°C</b></span>}
                            {temps.length > 0 && <span>최고 <b className={Math.max(...temps) > 50 ? "text-red-600" : ""}>{Math.max(...temps)}°C</b></span>}
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })() : (
              <div className={`${card} flex items-center justify-center p-12`}>
            <div className="text-center text-slate-400">
              <div className="text-3xl mb-2">🌡️</div>
              <div className="text-sm">왼쪽 목록에서 슬롯을 선택하세요</div>
              <div className="mt-1 text-xs text-slate-300">작업지시서에서 온도 기록 시 자동으로 생성됩니다</div>
            </div>
          </div>
        )}
      </div>
    
         
{/* ── 인쇄 전용 영역 ── */}
<style>{`
  .ccp-print-only { display: none; }
`}</style>

{/* ── 기간 인쇄 전용 숨김 영역 ── */}
<div id="ccp1b-range-print-inner" style={{ display: "none" }}>
  {rangeData.map((dayData) => {
    const d = new Date(dayData.date + "T00:00:00+09:00");
    const days = ["일","월","화","수","목","금","토"];
    const dateLabel = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
    const CHUNK_SIZE_R = 7;

    const getSlotMaterialType = (slotId: string) => {
      const lastIn = [...dayData.slotEvents]
        .filter((e: any) => e.slot_id === slotId && e.event_type === "material_in")
        .sort((a: any, b: any) => b.measured_at.localeCompare(a.measured_at))[0];
      return (lastIn as any)?.material_type ?? null;
    };

    const hasActivity = (slotId: string) =>
      dayData.woEvents.some((e: any) => e.slot_id === slotId) ||
      dayData.slotEvents.some((e: any) => e.slot_id === slotId);

    const darkActive = [
      ...allSlots.filter(s => s.purpose === "다크컴파운드"),
      ...allSlots.filter(s => s.purpose === "유동" && getSlotMaterialType(s.id) === "다크"),
    ].filter(s => hasActivity(s.id));

    const whiteActive = [
      ...allSlots.filter(s => s.purpose === "화이트컴파운드"),
      ...allSlots.filter(s => s.purpose === "유동" && getSlotMaterialType(s.id) === "화이트"),
    ].filter(s => hasActivity(s.id));

    const slotWoEventsDedup = (slotId: string) => {
      const seen = new Set<string>();
      return dayData.woEvents
        .filter((e: any) => e.slot_id === slotId)
        .sort((a: any, b: any) => a.measured_at.localeCompare(b.measured_at))
        .filter((e: any) => {
          const key = `${e.measured_at.slice(11,16)}_${e.temperature}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
    };

    const WO_LABEL: Record<string,string> = { start:"시작", mid_check:"중간점검", end:"종료" };

    const renderRangeSection = (slots: WarmSlot[], label: string) => {
      if (slots.length === 0) return null;
      const chunks: WarmSlot[][] = [];
      for (let i = 0; i < slots.length; i += CHUNK_SIZE_R) chunks.push(slots.slice(i, i + CHUNK_SIZE_R));
      if (chunks.length === 0) chunks.push([]);

      const chunkMaxRows = chunks.map(chunk =>
        Math.max(...chunk.map(s => slotWoEventsDedup(s.id).length), 3)
      );
      const totalRowspan = chunks.reduce((sum, _, ci) => sum + 5 + chunkMaxRows[ci], 0);
      const tdS: React.CSSProperties = { border:"1px solid #000", padding:"2px 3px", fontSize:"8pt", verticalAlign:"middle" };

      return (
        <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:6, tableLayout:"fixed" }}>
          <tbody>
            {chunks.map((chunk, ci) => {
              const maxRows = chunkMaxRows[ci];
              return (
                <React.Fragment key={ci}>
                  <tr>
                    {ci === 0 && (
                      <td rowSpan={totalRowspan} style={{ ...tdS, fontWeight:"bold", textAlign:"center", width:44, fontSize:"8pt", writingMode:"vertical-rl" as any }}>
                        {label}
                      </td>
                    )}
                    {chunk.map((s, i) => (
                      <td key={i} style={{ ...tdS, textAlign:"center", fontWeight:"bold", fontSize:"8pt", height:22, width:`calc((100% - 44px) / ${CHUNK_SIZE_R})` }}>
                        {s.slot_name}
                        {s.purpose === "유동" && (
                          <span style={{ fontSize:"7pt", marginLeft:2, color:"#854F0B" }}>({getSlotMaterialType(s.id)})</span>
                        )}
                      </td>
                    ))}
                    {Array.from({ length: CHUNK_SIZE_R - chunk.length }).map((_, i) => (
                      <td key={`en-${i}`} style={{ ...tdS, width:`calc((100% - 44px) / ${CHUNK_SIZE_R})` }} />
                    ))}
                  </tr>
                  <tr>
                    {chunk.map((s, i) => {
                      const ev = dayData.slotEvents.filter((e: any) =>
                        e.slot_id === s.id && e.event_type === "material_in" && !e.action_note?.includes("→")
                      ).sort((a: any, b: any) => a.measured_at.localeCompare(b.measured_at))[0];
                      return <td key={i} style={{ ...tdS, textAlign:"center", fontSize:"8pt", height:22 }}>{ev ? `원료투입: ${toKSTTime(ev.measured_at)}` : ""}</td>;
                    })}
                    {Array.from({ length: CHUNK_SIZE_R - chunk.length }).map((_, i) => <td key={i} style={tdS} />)}
                  </tr>
                  <tr>
                    {chunk.map((s, i) => {
                      const moveEvs = [
                        ...dayData.slotEvents.filter((e: any) => e.slot_id === s.id && e.event_type === "material_out" && e.action_note?.startsWith("→")),
                        ...dayData.slotEvents.filter((e: any) => e.slot_id === s.id && e.event_type === "material_in" && e.action_note?.includes("→")),
                      ].sort((a: any, b: any) => a.measured_at.localeCompare(b.measured_at));
                      return (
                        <td key={i} style={{ ...tdS, textAlign:"center", fontSize:"8pt", minHeight:22 }}>
                          {moveEvs.length === 0 ? "" : moveEvs.map((ev: any, mi: number) => (
                            <div key={mi}>{`슬롯이동: ${toKSTTime(ev.measured_at)} (${ev.action_note})`}</div>
                          ))}
                        </td>
                      );
                    })}
                    {Array.from({ length: CHUNK_SIZE_R - chunk.length }).map((_, i) => <td key={i} style={tdS} />)}
                  </tr>
                  {Array.from({ length: maxRows }).map((_, rowIdx) => (
                    <tr key={`t-${rowIdx}`}>
                      {chunk.map((s, i) => {
                        const ev = slotWoEventsDedup(s.id)[rowIdx];
                        const isNG = ev?.is_ok === false;
                        return (
                          <td key={i} style={{ ...tdS, textAlign:"center", fontSize:"8pt", color: isNG ? "red" : "#000", height:22 }}>
                            {ev ? (
                              <>
                                <span style={{ fontSize:"7pt", background: ev.event_type==="start"?"#dbeafe":ev.event_type==="end"?"#ede9fe":"#f1f5f9", padding:"0 3px", borderRadius:2, marginRight:2 }}>
                                  {WO_LABEL[ev.event_type] ?? ev.event_type}
                                </span>
                                {`(${toKSTTime(ev.measured_at)}) ${ev.temperature ?? ""}℃`}
                              </>
                            ) : ""}
                          </td>
                        );
                      })}
                      {Array.from({ length: CHUNK_SIZE_R - chunk.length }).map((_, i) => <td key={i} style={tdS} />)}
                    </tr>
                  ))}
                  <tr>
                    {chunk.map((_, i) => <td key={i} style={{ ...tdS, height:22 }} />)}
                    {Array.from({ length: CHUNK_SIZE_R - chunk.length }).map((_, i) => <td key={i} style={{ ...tdS, height:22 }} />)}
                  </tr>
                  <tr>
                    {chunk.map((s, i) => {
                      const evs = dayData.woEvents.filter((e: any) => e.slot_id === s.id);
                      if (evs.length === 0) return <td key={i} style={{ ...tdS, height:28 }} />;
                      const hasNG = evs.some((e: any) => e.is_ok === false);
                      // 담당자 서명 — slotEvents에서 work_order_no 추출 후 assigneeMap에서 조회
                      const woNos = [...new Set(dayData.slotEvents.filter((e: any) => e.slot_id === s.id).map((e: any) => e.work_order_no).filter(Boolean))] as string[];
                      const assignees = [...new Set(woNos.map((no: string) => dayData.assigneeMap?.[no]).filter(Boolean))] as string[];
                      const signSrc = assignees.length > 0 ? SIGN_MAP[assignees[0]] ?? null : null;
                      const assigneeName = assignees[0] ?? null;
                      return (
                        <td key={i} style={{ ...tdS, textAlign:"center", fontSize:"8pt", height:28 }}>
                          <div style={{ marginBottom: 1 }}>
                            <span style={{ fontWeight:"bold", color: hasNG?"red":"#000" }}>판정: {hasNG?"X":"O"}</span>
                          </div>
                          {signSrc && <img src={signSrc} style={{ height: 20, objectFit:"contain", display:"block", margin:"0 auto" }} alt={assigneeName ?? ""} />}
                          {signSrc && <div style={{ fontSize:"6pt", color:"#000", marginTop: 1 }}>{assigneeName}</div>}
                          {assigneeName && !signSrc && <div style={{ fontSize:"7pt", color:"#555" }}>{assigneeName}</div>}
                        </td>
                      );
                    })}
                    {Array.from({ length: CHUNK_SIZE_R - chunk.length }).map((_, i) => <td key={i} style={{ ...tdS, height:28 }} />)}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      );
    };

    const tdBase2: React.CSSProperties = { border:"1px solid #000", padding:"2px 3px", fontSize:"8pt", verticalAlign:"middle" };

    return (
      <div key={dayData.date} className="range-page">
        {/* 제목 + 결재란 */}
        <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:4 }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ ...tdBase2, fontSize:"12pt", fontWeight:"bold", textAlign:"center", padding:"6px 8px" }}>
                중요관리점(CCP-1B) 모니터링일지<br/>
                <span style={{ fontSize:"9pt" }}>[가열공정] 일반</span><br/>
                <span style={{ fontSize:"8pt" }}>*온장고 내 보관기간 : 1개월 미만*</span>
              </td>
              <td style={{ ...tdBase2, width:28, fontWeight:"bold", textAlign:"center", fontSize:"8pt" }} rowSpan={2}>결<br/>재<br/>란</td>
              <td style={{ ...tdBase2, width:80, textAlign:"center", fontWeight:"bold" }}>작성</td>
              <td style={{ ...tdBase2, width:80, textAlign:"center", fontWeight:"bold" }}>승인</td>
            </tr>
            <tr>
              <td style={{ ...tdBase2, textAlign:"center", padding:"3px" }}>
                <img src="/sign-kimyg.png" style={{ height:30, objectFit:"contain", display:"block", margin:"0 auto" }} alt="김영각" />
                <div style={{ fontSize:"7pt", marginTop:2 }}>김영각</div>
              </td>
              <td style={{ ...tdBase2, textAlign:"center", padding:"3px" }}>
                <img src="/sign-chods.png" style={{ height:30, objectFit:"contain", display:"block", margin:"0 auto" }} alt="조대성" />
                <div style={{ fontSize:"7pt", marginTop:2 }}>조대성</div>
              </td>
            </tr>
          </tbody>
        </table>
        {/* 작성일자 */}
        <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:4 }}>
          <tbody>
            <tr>
              <td style={{ ...tdBase2, width:80, fontWeight:"bold", whiteSpace:"nowrap" }}>작성일자</td>
              <td style={tdBase2}>{dateLabel}</td>
            </tr>
          </tbody>
        </table>
        {/* 위해요소/한계기준/주기/방법 */}
        <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:4 }}>
          <tbody>
            <tr>
              <td style={{ ...tdBase2, fontWeight:"bold", whiteSpace:"nowrap", width:56 }}>위해요소</td>
              <td colSpan={3} style={{ ...tdBase2, fontSize:"8pt" }}>병원성 미생물(리스테리아모노사이토제네스, 장출혈성대장균)</td>
              <td style={{ ...tdBase2, fontWeight:"bold", textAlign:"center", width:60 }}>온도</td>
              <td style={{ ...tdBase2, fontWeight:"bold", textAlign:"center", width:80 }}>시간</td>
            </tr>
            <tr>
              <td rowSpan={2} style={{ ...tdBase2, fontWeight:"bold" }}>한계기준</td>
              <td colSpan={3} style={{ ...tdBase2, fontSize:"8pt" }}>준초콜릿(다크컴파운드)</td>
              <td style={{ ...tdBase2, textAlign:"center" }}>45±5℃</td>
              <td rowSpan={2} style={{ ...tdBase2, textAlign:"center", fontSize:"8pt", whiteSpace:"nowrap" }}>4시간 이상 유지</td>
            </tr>
            <tr>
              <td colSpan={3} style={{ ...tdBase2, fontSize:"8pt" }}>당류가공품(화이트컴파운드)</td>
              <td style={{ ...tdBase2, textAlign:"center" }}>45±5℃</td>
            </tr>
            <tr>
              <td style={{ ...tdBase2, fontWeight:"bold" }}>주 기</td>
              <td colSpan={5} style={{ ...tdBase2, fontSize:"8pt" }}>작업시작 전, 작업 중 2시간마다, 작업종료</td>
            </tr>
            <tr>
              <td style={{ ...tdBase2, fontWeight:"bold" }}>방 법</td>
              <td colSpan={5} style={{ ...tdBase2, fontSize:"8pt" }}>◦ 중탕온도 : 바트 품온 온도 확인 &nbsp;&nbsp; ◦ 가열시간 : 4시간 이상 가열</td>
            </tr>
          </tbody>
        </table>
        {/* 슬롯 데이터 */}
        {renderRangeSection(darkActive, "준초콜릿")}
        {renderRangeSection(whiteActive, "당류가공품")}
        {/* 이탈 및 조치 */}
        <table style={{ width:"100%", borderCollapse:"collapse", marginTop:4 }}>
          <tbody>
            <tr>
              <td style={{ ...tdBase2, fontWeight:"bold", fontSize:"8pt", width:140, whiteSpace:"nowrap" }}>한계기준 이탈 및 조치내용</td>
              <td style={{ ...tdBase2, padding:"4px 6px", fontSize:"8pt" }}>
                {dayData.woEvents.filter((e: any) => e.is_ok === false)
                  .map((e: any) => `${toKSTTime(e.measured_at)} — ${e.temperature ?? ""}°C / ${e.action_note ?? ""}`)
                  .join("  /  ") || " "}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  })}
</div>

<div id="ccp1b-print-inner" className="ccp-print-only" style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: "9pt", color: "#000" }}>

{/* ① 제목 + 결재란 */}
<table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
<tbody>
  <tr>
    <td rowSpan={2} style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold", fontSize: "12pt", textAlign: "center" }}>
      중요관리점(CCP-1B) 모니터링일지<br/>
      <span style={{ fontSize: "9pt" }}>[가열공정] 일반</span><br/>
      <span style={{ fontSize: "8pt" }}>*온장고 내 보관기간 : 1개월 미만*</span>
    </td>
    <td rowSpan={2} style={{ border: "1px solid #000", padding: "2px 4px", fontWeight: "bold", textAlign: "center", fontSize: "8pt", width: 28 }}>결<br/>재<br/>란</td>
    <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "center", fontSize: "8pt", fontWeight: "bold", width: 80 }}>작성</td>
    <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "center", fontSize: "8pt", fontWeight: "bold", width: 80 }}>승인</td>
  </tr>
  <tr>
    <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>
      <img src="/sign-kimyg.png" style={{ height: 30, objectFit: "contain", display: "block", margin: "0 auto" }} alt="김영각" />
      <div style={{ fontSize: "7pt", marginTop: 2 }}>김영각</div>
    </td>
    <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>
      <img src="/sign-chods.png" style={{ height: 30, objectFit: "contain", display: "block", margin: "0 auto" }} alt="조대성" />
      <div style={{ fontSize: "7pt", marginTop: 2 }}>조대성</div>
    </td>
  </tr>
</tbody>
</table>

  {/* ② 작성일자 */}
  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
  <tbody>
    <tr>
    <td style={{ border: "1px solid #000", padding: "1px 6px", fontWeight: "bold", width: 80, whiteSpace: "nowrap" }}>작성일자</td>
      <td style={{ border: "1px solid #000", padding: "2px 6px" }}>
      {(() => { const d = new Date(filterDate + "T00:00:00+09:00"); const days = ["일","월","화","수","목","금","토"]; return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`; })()}
      </td>
    </tr>
  </tbody>
</table>

  {/* ③ 위해요소 / 한계기준 / 주기 / 방법 */}
  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
    <tbody>
      <tr>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", whiteSpace: "nowrap", width: 56 }}>위해요소</td>
        <td colSpan={3} style={{ border: "1px solid #000", padding: "2px 6px", fontSize: "8pt" }}>병원성 미생물(리스테리아모노사이토제네스, 장출혈성대장균)</td>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", textAlign: "center", width: 60 }}>온도</td>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", textAlign: "center", width: 80 }}>시간</td>
      </tr>
      <tr>
        <td rowSpan={2} style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold" }}>한계기준</td>
        <td colSpan={3} style={{ border: "1px solid #000", padding: "2px 6px", fontSize: "8pt" }}>준초콜릿(다크컴파운드)</td>
        <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "center" }}>45±5℃</td>
        <td rowSpan={2} style={{ border: "1px solid #000", padding: "1px 6px", textAlign: "center", fontSize: "8pt", width: 100, whiteSpace: "nowrap" }}>4시간 이상 유지</td>
      </tr>
      <tr>
        <td colSpan={3} style={{ border: "1px solid #000", padding: "2px 6px", fontSize: "8pt" }}>당류가공품(화이트컴파운드)</td>
        <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "center" }}>45±5℃</td>
      </tr>
      <tr>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold" }}>주 기</td>
        <td colSpan={5} style={{ border: "1px solid #000", padding: "2px 6px", fontSize: "8pt" }}>
          작업시작 전, 작업 중 2시간마다, 작업종료
        </td>
      </tr>
      <tr>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold" }}>방 법</td>
        <td colSpan={5} style={{ border: "1px solid #000", padding: "2px 6px", fontSize: "8pt" }}>
          ◦ 중탕온도 : 바트 품온 온도 확인 &nbsp;&nbsp; ◦ 가열시간 : 4시간 이상 가열. ※ 온도계,시계는 연 1회 검·교정 실시 필요
        </td>
      </tr>
    </tbody>
  </table>

 {/* ④ 슬롯별 데이터 */}
{(() => {
  const CHUNK_SIZE = 7;

  const WO_EVENT_TYPE_LABEL: Record<string, string> = {
    start: "시작", mid_check: "중간점검", end: "종료",
  };

  const slotWoEventsDedup = (slotId: string) => {
    const seen = new Set<string>();
    return woEvents
      .filter(e => e.slot_id === slotId)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
      .filter(e => {
        const key = `${e.measured_at.slice(11,16)}_${e.temperature}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  // 슬롯 활동 여부
  function hasActivity(slotId: string) {
    return (
      slotWoEventsDedup(slotId).length > 0 ||
      slotEvents.some(e => e.slot_id === slotId)
    );
  }

  // 유동 슬롯의 material_type 조회
  function getSlotMaterialType(slotId: string): string | null {
    const lastIn = [...slotEvents]
      .filter(e => e.slot_id === slotId && e.event_type === "material_in")
      .sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0];
    return (lastIn as any)?.material_type ?? null;
  }

  // 다크 활동 슬롯: 고정(다크컴파운드) + 유동 중 다크
  const darkActive = [
    ...allSlots.filter(s => s.purpose === "다크컴파운드"),
    ...allSlots.filter(s => s.purpose === "유동" && getSlotMaterialType(s.id) === "다크"),
  ].filter(s => hasActivity(s.id));

  // 화이트 활동 슬롯: 고정(화이트컴파운드) + 유동 중 화이트
  const whiteActive = [
    ...allSlots.filter(s => s.purpose === "화이트컴파운드"),
    ...allSlots.filter(s => s.purpose === "유동" && getSlotMaterialType(s.id) === "화이트"),
  ].filter(s => hasActivity(s.id));

  // CHUNK_SIZE씩 청크로 분할
  function chunkSlots(slots: WarmSlot[]) {
    const chunks: WarmSlot[][] = [];
    for (let i = 0; i < slots.length; i += CHUNK_SIZE) {
      chunks.push(slots.slice(i, i + CHUNK_SIZE));
    }
    return chunks.length > 0 ? chunks : [[]];
  }

  // renderSection 함수 바로 위에 추가

  const slotWoEventsByAssignee = (slotId: string, assignee: string) => {
    const assigneeWoNos = Object.keys(woAssigneeMapRef.current).filter(
      (no) => woAssigneeMapRef.current[no] === assignee
    );
    const seen = new Set<string>();
    return woEvents
      .filter((e) => e.slot_id === slotId && assigneeWoNos.includes(e.work_order_no))
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
      .filter((e) => {
        const key = `${e.measured_at.slice(11, 16)}_${e.temperature}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const renderSection = (slots: WarmSlot[], label: string) => {
    if (slots.length === 0) return null;
    const chunks = chunkSlots(slots);
    const totalRows = chunks.length; // 청크 수 (줄 수)

    // 청크별 maxRows 계산
    const chunkMaxRows = chunks.map(chunk =>
      Math.max(...chunk.flatMap(s => {
        const assignees = slotAssigneesRef.current[s.id] ?? [""];
        return assignees.map(a => a ? slotWoEventsByAssignee(s.id, a).length : slotWoEventsDedup(s.id).length);
      }), 3)
    );

    // 전체 rowspan = 각 청크의 (1슬롯명+1원료+maxRows+1빈+1판정) 합산
    const totalRowspan = chunks.reduce((sum, _, ci) => sum + 5 + chunkMaxRows[ci], 0);
    // 실제로는 section label을 각 청크 첫 행에만 표시하고 rowspan으로 병합

    return (
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6, tableLayout: "fixed", pageBreakInside: "avoid" as any }}>
        <tbody>
          {chunks.map((chunk, chunkIdx) => {
            const maxRows = chunkMaxRows[chunkIdx];
            const isFirstChunk = chunkIdx === 0;

            return (
              <React.Fragment key={chunkIdx}>
                {/* 슬롯명 행 */}
                <tr>
                  {isFirstChunk && (
                    <td rowSpan={totalRowspan} style={{
                      border: "1px solid #000", padding: "2px 4px", fontWeight: "bold",
                      textAlign: "center", width: 44, fontSize: "8pt",
                      writingMode: "vertical-rl" as any,
                    }}>
                      {label}
                    </td>
                  )}
               
               
               {chunk.flatMap((s, i) => {
  const assignees = slotAssigneesRef.current[s.id] ?? [""];

  return assignees.map((assignee, ai) => (
    <td key={`${i}-${ai}`} style={{
      border: "1px solid #000", padding: "4px", textAlign: "center",
      fontWeight: "bold", fontSize: "8pt", height: 22,
      width: `calc((100% - 44px) / ${CHUNK_SIZE})`,
    }}>
      {s.slot_name}
      {assignees.length > 1 && (
        <span style={{ fontSize: "6.5pt", marginLeft: 2, color: "#555" }}>({assignee})</span>
      )}
      {s.purpose === "유동" && (
        <span style={{ fontSize: "7pt", marginLeft: 2, color: getSlotMaterialType(s.id) === "다크" ? "#854F0B" : "#A16207" }}>
          ({getSlotMaterialType(s.id)})
        </span>
      )}
    </td>
  ));
})}
{Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
  <td key={`empty-name-${i}`} style={{ border: "1px solid #000", padding: "4px", width: `calc((100% - 44px) / ${CHUNK_SIZE})` }} />
))}

                </tr>

          {/* 원료투입 행 */}
<tr>
{chunk.flatMap((s, i) => {
  const assignees = slotAssigneesRef.current[s.id] ?? [""];
  const ev = slotEvents.filter(e =>
    e.slot_id === s.id &&
    e.event_type === "material_in" &&

    !e.action_note?.includes("→")
  ).sort((a, b) => a.measured_at.localeCompare(b.measured_at))[0];
  return assignees.map((_, ai) => (
    <td key={`${i}-${ai}`} style={{ border: "1px solid #000", padding: "4px", textAlign: "center", fontSize: "8pt", height: 22 }}>
      {ai === 0 ? (ev ? `원료투입: ${ev.measured_at.slice(5,10).replace("-","/")} ${toKSTTime(ev.measured_at)}` : "") : ""}
    </td>
  ));
})}
{Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
  <td key={`empty-in-${i}`} style={{ border: "1px solid #000", padding: "4px" }} />
))}
</tr>
    
{/* 슬롯이동 행 */}
<tr>
{chunk.flatMap((s, i) => {
  const assignees = slotAssigneesRef.current[s.id] ?? [""];
  const outEv = slotEvents.filter(e =>
    e.slot_id === s.id && e.event_type === "material_out" && e.action_note?.startsWith("→")
  ).sort((a, b) => a.measured_at.localeCompare(b.measured_at))[0];
  const inEv = slotEvents.filter(e =>
    e.slot_id === s.id && e.event_type === "material_in" && e.action_note?.includes("→")
  ).sort((a, b) => a.measured_at.localeCompare(b.measured_at))[0];
  const ev = outEv ?? inEv;
  return assignees.map((_, ai) => (
    <td key={`${i}-${ai}`} style={{ border: "1px solid #000", padding: "4px", textAlign: "center", fontSize: "8pt", height: 22 }}>
      {ai === 0 ? (ev ? `슬롯이동: ${ev.measured_at.slice(5,10).replace("-","/")} ${toKSTTime(ev.measured_at)} (${ev.action_note})` : "") : ""}
    </td>
  ));
})}

{Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
  <td key={`empty-out-${i}`} style={{ border: "1px solid #000", padding: "4px" }} />
))}
</tr>


                {/* 온도기록 행 */}
                {Array.from({ length: maxRows }).map((_, rowIdx) => (
  <tr key={`temp-${rowIdx}`}>
{chunk.flatMap((s, i) => {
  const assignees = slotAssigneesRef.current[s.id] ?? [""];
  return assignees.map((assignee, ai) => {
    const ev = assignee
      ? slotWoEventsByAssignee(s.id, assignee)[rowIdx]

          : slotWoEventsDedup(s.id)[rowIdx];
        const isNG = ev?.is_ok === false;
        const typeLabel = ev ? (WO_EVENT_TYPE_LABEL[ev.event_type] ?? ev.event_type) : "";
        return (
          <td key={`${i}-${ai}`} style={{
            border: "1px solid #000", padding: "4px",
            textAlign: "center", fontSize: "8pt",
            color: isNG ? "red" : "#000", height: 22,
          }}>
            {ev ? (
              <>
                <span style={{
                  fontSize: "7pt",
                  background: ev.event_type === "start" ? "#dbeafe"
                    : ev.event_type === "end" ? "#ede9fe" : "#f1f5f9",
                  padding: "0 3px", borderRadius: 2, marginRight: 2,
                }}>{typeLabel}</span>
                {`(${toKSTTime(ev.measured_at)}) ${ev.temperature ?? ""}℃`}
              </>
            ) : ""}
          </td>
        );
      });
    })}
    {Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
      <td key={`empty-temp-${i}`} style={{ border: "1px solid #000", padding: "4px" }} />
    ))}
  </tr>
))}    

                {/* 빈 행 */}
                <tr>
                {chunk.flatMap((s, i) => {
  const assignees = slotAssigneesRef.current[s.id] ?? [""];
  return assignees.map((_, ai) => (
    <td key={`${i}-${ai}`} style={{ border: "1px solid #000", padding: "4px", height: 22 }} />

    ));
  })}
  {Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
    <td key={`empty-blank-${i}`} style={{ border: "1px solid #000", padding: "4px", height: 22 }} />
  ))}
</tr>

                {/* 판정 + 서명 행 */}
               <tr>
               {chunk.flatMap((s, i) => {
  const assignees = slotAssigneesRef.current[s.id] ?? [""];
  return assignees.map((assignee, ai) => {
    const evs = assignee
      ? woEvents.filter(e => e.slot_id === s.id && Object.keys(woAssigneeMapRef.current).filter(no => woAssigneeMapRef.current[no] === assignee).includes(e.work_order_no))
      : woEvents.filter(e => e.slot_id === s.id);
      const hasWoEvents = evs.length > 0;
      const hasNG = evs.some(e => e.is_ok === false);
      const signSrc = assignee ? SIGN_MAP[assignee] ?? null : null;
      if (!hasWoEvents) return <td key={`${i}-${ai}`} style={{ border: "1px solid #000", padding: "4px", height: 28 }} />;
      return (
        <td key={`${i}-${ai}`} style={{ border: "1px solid #000", padding: "4px", textAlign: "center", fontSize: "8pt", height: 28 }}>
          <div style={{ marginBottom: 2 }}>
            <span style={{ color: hasNG ? "red" : "#000", fontWeight: "bold" }}>판정: {hasNG ? "X" : "O"}</span>
          </div>
          {signSrc && <img src={signSrc} style={{ height: 22, display: "block", margin: "0 auto" }} alt={assignee} />}
          {signSrc && <div style={{ fontSize: "6pt", color: "#000", marginTop: 1 }}>{assignee}</div>}
          {assignee && !signSrc && <div style={{ fontSize: "7pt", color: "#555" }}>{assignee}</div>}
        </td>
      );
    });
  })}
  {Array.from({ length: CHUNK_SIZE - chunk.length }).map((_, i) => (
    <td key={`empty-judge-${i}`} style={{ border: "1px solid #000", padding: "4px", height: 28 }} />
  ))}
</tr>    
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <>
      {renderSection(darkActive, "준초콜릿")}
      {renderSection(whiteActive, "당류가공품")}
    </>
  );
})()}

  {/* ⑤ 한계기준 이탈 및 조치내용 */}
  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}>
    <tbody>
      <tr>
        <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", fontSize: "8pt", width: 140, whiteSpace: "nowrap" }}>
          한계기준 이탈 및 조치내용
        </td>
        <td style={{ border: "1px solid #000", padding: "4px 6px", fontSize: "8pt" }}>
          {woEvents.filter(e => e.is_ok === false)
            .map(e => `${e.measured_at.slice(11,16)} ${e.action_note ?? ""}`)
            .join("  /  ") || " "}
        </td>
      </tr>
    </tbody>
  </table>

</div>
</div>
  );
}

// ═══════════════════════════════════════════════════════════
// 가열공정 탭 — 코팅(7-1,7-2,7-3) + 전사(8) 슬롯 전용
// CCP-1B와 동일한 구조 / 슬롯 4개 고정 표시
// tabs-extra.tsx 의 OtherHeatingTab 전체를 이 코드로 교체하세요
// ═══════════════════════════════════════════════════════════

export function OtherHeatingTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  const [filterDate, setFilterDate] = useState(
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
  );
  const [loading, setLoading] = useState(false);

  // ── 기간 조회/인쇄 (CCP-1B와 동일 패턴) ──
  const [rangeFrom, setRangeFrom] = useState<string>(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  const [rangeTo, setRangeTo] = useState<string>(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeData, setRangeData] = useState<{
    date: string;
    slotEvents: any[];
    woEvents: any[];
    slotAssignees: Record<string, string[]>;
    woAssigneeMap: Record<string, string>;
  }[]>([]);

  // 고정 슬롯 4개 (코팅 3 + 전사 1)
  const [targetSlots, setTargetSlots] = useState<WarmSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // 슬롯 이벤트 (원료투입/소진/이동)
  const [slotEvents, setSlotEvents] = useState<{
    id: string; slot_id: string; event_date: string; event_type: string;
    measured_at: string; work_order_no: string | null; action_note: string | null;
    material_type: string | null;
  }[]>([]);

  // 작업지시서 온도기록
  const [woEvents, setWoEvents] = useState<{
    id: string; work_order_no: string; slot_id: string; event_type: string;
    measured_at: string; temperature: number | null; is_ok: boolean | null;
    action_note: string | null;
  }[]>([]);

  // 슬롯별 연결 작업지시서 레이블
  const [woLabelMap, setWoLabelMap] = useState<Record<string, string>>({});
  const [slotWoMap, setSlotWoMap] = useState<Record<string, string[]>>({});

  // 입력 폼 state
  const [ccpEventType, setCcpEventType] = useState<"start" | "mid_check" | "end">("start");
  const [ccpTime, setCcpTime] = useState("");
  const [ccpTemp, setCcpTemp] = useState("");
  const [ccpIsOk, setCcpIsOk] = useState(true);
  const [ccpActionNote, setCcpActionNote] = useState("");
  const [saving, setSaving] = useState(false);

  // 수정 state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editTemp, setEditTemp] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editIsOk, setEditIsOk] = useState(true);
  const [editActionNote, setEditActionNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // 인쇄용 담당자 맵
  const slotAssigneesRef = React.useRef<Record<string, string[]>>({});
  const woAssigneeMapRef = React.useRef<Record<string, string>>({});

  // 코팅/전사 슬롯만 로드
  useEffect(() => {
    supabase.from("warmer_slots")
      .select("id,slot_name,purpose")
      .eq("is_active", true)
      .in("purpose", ["코팅용도", "전사용도"])
      .order("slot_no")
      .then(({ data }) => setTargetSlots(data ?? []));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const slotIds = targetSlots.map((s) => s.id);
    if (slotIds.length === 0) { setLoading(false); return; }

    const [slotRes, woRes, woSlotRes] = await Promise.all([
      supabase.from("ccp_slot_events")
        .select("id,slot_id,event_date,event_type,measured_at,work_order_no,action_note,material_type")
        .eq("event_date", filterDate)
        .in("slot_id", slotIds)
        .order("measured_at", { ascending: true }),
      supabase.from("ccp_wo_events")
        .select("id,work_order_no,slot_id,event_type,measured_at,temperature,is_ok,action_note")
        .in("slot_id", slotIds)
        .gte("measured_at", `${filterDate}T00:00:00+09:00`)
        .lte("measured_at", `${filterDate}T23:59:59+09:00`)
        .order("measured_at", { ascending: true }),
      supabase.from("work_orders")
        .select("work_order_no,client_name,sub_name,product_name,ccp_slot_id")
        .not("ccp_slot_id", "is", null)
        .in("ccp_slot_id", slotIds)
        .eq("status", "생산중"),
    ]);

    setSlotEvents((slotRes.data ?? []) as any[]);
    setWoEvents((woRes.data ?? []) as any[]);

    const allWoNos = [...new Set([
      ...(slotRes.data ?? []).map((e: any) => e.work_order_no).filter(Boolean),
      ...(woRes.data ?? []).map((e: any) => e.work_order_no).filter(Boolean),
      ...(woSlotRes.data ?? []).map((e: any) => e.work_order_no).filter(Boolean),
    ])] as string[];

    if (allWoNos.length > 0) {
      const { data: woData } = await supabase
        .from("work_orders")
        .select("work_order_no,client_name,sub_name,product_name")
        .in("work_order_no", allWoNos);
      const map: Record<string, string> = {};
      for (const wo of woData ?? []) {
        const rawSecond = wo.sub_name ?? wo.product_name ?? "";
        const secondPart = rawSecond.startsWith(wo.client_name)
          ? rawSecond.slice(wo.client_name.length).replace(/^[-_\s·]+/, "")
          : rawSecond;
        map[wo.work_order_no] = secondPart
          ? `${wo.client_name} · ${secondPart}`
          : wo.client_name;
      }
      setWoLabelMap(map);
    }

    const slotMap: Record<string, string[]> = {};
    for (const wo of woSlotRes.data ?? []) {
      if (!wo.ccp_slot_id) continue;
      if (!slotMap[wo.ccp_slot_id]) slotMap[wo.ccp_slot_id] = [];
      slotMap[wo.ccp_slot_id].push(wo.work_order_no);
    }
    setSlotWoMap(slotMap);
    setLoading(false);
  }, [filterDate, targetSlots]);

  useEffect(() => { loadData(); }, [loadData]);

  function selectSlot(slotId: string) {
    setSelectedSlotId(slotId);
    setEditingEventId(null);
    const slotWoEvs = woEvents
      .filter((e) => e.slot_id === slotId)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const hasStart = slotWoEvs.some((e) => e.event_type === "start");
    setCcpEventType(hasStart ? "mid_check" : "start");
    setCcpTime(""); setCcpTemp(""); setCcpIsOk(true); setCcpActionNote("");
  }

  async function saveEvent() {
    if (!selectedSlotId) return;
    if (!ccpTime || ccpTime.length < 4) return showToast("측정시각을 입력하세요. (예: 1430)", "error");
    if (!ccpTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(ccpTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50°C 범위여야 합니다.", "error");

    const measuredAt = `${filterDate}T${ccpTime.slice(0, 2)}:${ccpTime.slice(2, 4)}:00+09:00`;

    const slotWoEvs = woEvents
      .filter((e) => e.slot_id === selectedSlotId)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    if (slotWoEvs.length > 0) {
      const lastTime = toKSTTime(slotWoEvs[slotWoEvs.length - 1].measured_at);
      const newTime = `${ccpTime.slice(0, 2)}:${ccpTime.slice(2, 4)}`;
      if (newTime <= lastTime)
        return showToast(`⚠ 측정시각은 마지막 기록(${lastTime})보다 늦어야 합니다.`, "error");
    }

    const sorted = [...slotWoEvs];
    const lastEv = sorted[sorted.length - 1];
    if (ccpEventType === "start" && lastEv && lastEv.event_type !== "end")
      return showToast("⚠ 시작은 종료 후에만 다시 기록할 수 있습니다.", "error");
    if (ccpEventType === "mid_check" && (!lastEv || lastEv.event_type === "end"))
      return showToast("⚠ 중간점검은 시작 후에만 기록할 수 있습니다.", "error");
    if (ccpEventType === "end") {
      if (!lastEv || (lastEv.event_type !== "start" && lastEv.event_type !== "mid_check"))
        return showToast("⚠ 종료는 시작 또는 중간점검 후에만 가능합니다.", "error");
      const startEv = [...sorted].reverse().find((e) => e.event_type === "start");
      const hasMidCheck = sorted.some((e) => e.event_type === "mid_check");
      if (startEv && !hasMidCheck) {
        const startTime = new Date(startEv.measured_at);
        const endTime = new Date(measuredAt);
        if ((endTime.getTime() - startTime.getTime()) / 60000 >= 120)
          return showToast("⚠ 시작~종료 2시간 이상 — 중간점검을 먼저 추가해주세요.", "error");
      }
    }

    const relatedWoNos = slotWoMap[selectedSlotId] ?? [];
    const workOrderNo = relatedWoNos[0] ?? null;

    setSaving(true);
    if (workOrderNo) {
      const { error } = await supabase.from("ccp_wo_events").insert({
        work_order_no: workOrderNo, slot_id: selectedSlotId,
        event_type: ccpEventType, measured_at: measuredAt,
        temperature: temp, is_ok: ccpIsOk,
        action_note: ccpActionNote.trim() || null, created_by: userId,
      });
      if (error) { setSaving(false); return showToast("저장 실패: " + error.message, "error"); }
      for (const wNo of relatedWoNos.slice(1)) {
        await supabase.from("ccp_wo_events").insert({
          work_order_no: wNo, slot_id: selectedSlotId,
          event_type: ccpEventType, measured_at: measuredAt,
          temperature: temp, is_ok: ccpIsOk,
          action_note: ccpActionNote.trim() || null, created_by: userId,
        });
      }
    }
    await supabase.from("ccp_slot_events").insert({
      slot_id: selectedSlotId, event_date: filterDate,
      event_type: ccpEventType, measured_at: measuredAt,
      work_order_no: workOrderNo, temperature: temp, is_ok: ccpIsOk,
      action_note: ccpActionNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    showToast("✅ 가열공정 온도 기록 완료!");
    setCcpTemp(""); setCcpActionNote(""); setCcpIsOk(true); setCcpTime("");
    await loadData();
    setCcpEventType("mid_check");
  }

  function startEdit(ev: typeof woEvents[0]) {
    setEditingEventId(ev.id);
    setEditTime(toKSTTime(ev.measured_at).replace(":", ""));
    setEditTemp(ev.temperature != null ? String(ev.temperature) : "");
    setEditIsOk(ev.is_ok ?? true);
    setEditActionNote(ev.action_note ?? "");
  }

  async function saveEdit(ev: typeof woEvents[0]) {
    if (!editTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(editTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50°C 범위여야 합니다.", "error");
    setEditSaving(true);
    const { error } = await supabase.from("ccp_wo_events").update({
      measured_at: `${filterDate}T${editTime.slice(0, 2)}:${editTime.slice(2, 4)}:00+09:00`,
      temperature: temp, is_ok: editIsOk,
      action_note: editActionNote.trim() || null,
    }).eq("id", ev.id);
    setEditSaving(false);
    if (error) return showToast("수정 실패: " + error.message, "error");
    showToast("✅ 수정 완료!");
    setEditingEventId(null);
    await loadData();
  }

  async function deleteEvent(eventId: string) {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    const { data: evData } = await supabase
      .from("ccp_wo_events").select("slot_id,event_type,measured_at").eq("id", eventId).maybeSingle();
    const { error } = await supabase.from("ccp_wo_events").delete().eq("id", eventId);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    if (evData?.slot_id && evData?.measured_at) {
      await supabase.from("ccp_slot_events")
        .delete()
        .eq("slot_id", evData.slot_id)
        .eq("measured_at", evData.measured_at)
        .eq("event_type", evData.event_type);
    }
    showToast("🗑️ 삭제 완료!");
    await loadData();
  }

  const selectedWoEvents = (() => {
    if (!selectedSlotId) return [];
    const seen = new Set<string>();
    return woEvents
      .filter((e) => e.slot_id === selectedSlotId)
      .filter((e) => {
        const key = `${e.measured_at}_${e.event_type}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      })
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  })();

  const relatedWoNos = selectedSlotId ? (slotWoMap[selectedSlotId] ?? []) : [];

  // ── 기간 조회 (CCP-1B의 loadRangeData와 동일 패턴) ──
  async function loadRangeData(): Promise<typeof rangeData> {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return [];
    setRangeLoading(true);

    const slotIds = targetSlots.map((s) => s.id);
    if (slotIds.length === 0) { setRangeLoading(false); return []; }

    const dates: string[] = [];
    const cur = new Date(rangeFrom + "T00:00:00+09:00");
    const end = new Date(rangeTo + "T00:00:00+09:00");
    while (cur <= end) {
      dates.push(cur.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
      cur.setDate(cur.getDate() + 1);
    }

    const results: typeof rangeData = [];

    for (const date of dates) {
      const [slotRes, woRes] = await Promise.all([
        supabase.from("ccp_slot_events")
          .select("id,slot_id,event_date,event_type,measured_at,work_order_no,action_note,material_type")
          .eq("event_date", date)
          .in("slot_id", slotIds)
          .order("measured_at", { ascending: true }),
        supabase.from("ccp_wo_events")
          .select("id,work_order_no,slot_id,event_type,measured_at,temperature,is_ok,action_note")
          .in("slot_id", slotIds)
          .gte("measured_at", `${date}T00:00:00+09:00`)
          .lte("measured_at", `${date}T23:59:59+09:00`)
          .order("measured_at", { ascending: true }),
      ]);

      const sEvents = (slotRes.data ?? []) as any[];
      const wEvents = (woRes.data ?? []) as any[];
      if (sEvents.length === 0 && wEvents.length === 0) continue;

      const allWoNos = [...new Set([
        ...sEvents.map((e: any) => e.work_order_no).filter(Boolean),
        ...wEvents.map((e: any) => e.work_order_no).filter(Boolean),
      ])] as string[];

      const woAssigneeMap: Record<string, string> = {};
      if (allWoNos.length > 0) {
        const { data } = await supabase
          .from("work_orders")
          .select("work_order_no,assignee_production,assignee_transfer")
          .in("work_order_no", allWoNos);
          for (const row of data ?? []) {
            const slot = targetSlots.find(s => {
              const woNosForSlot = [...new Set(
                sEvents.filter((e: any) => e.slot_id === s.id).map((e: any) => e.work_order_no).filter(Boolean)
              )];
              return woNosForSlot.includes(row.work_order_no);
            });
            const isTransferSlot = slot?.purpose === "전사용도";
            const assignee = isTransferSlot
              ? (row.assignee_transfer ?? row.assignee_production)
              : (row.assignee_production ?? row.assignee_transfer);
            if (assignee) woAssigneeMap[row.work_order_no] = assignee;
          }
      }

      const slotAssignees: Record<string, string[]> = {};
      for (const s of targetSlots) {
        const woNosForSlot = [...new Set(
          sEvents.filter((e: any) => e.slot_id === s.id).map((e: any) => e.work_order_no).filter(Boolean)
        )] as string[];
        const assignees: string[] = [];
        for (const wNo of woNosForSlot) {
          if (woAssigneeMap[wNo] && !assignees.includes(woAssigneeMap[wNo])) assignees.push(woAssigneeMap[wNo]);
        }
        if (assignees.length > 0) slotAssignees[s.id] = assignees;
      }

      results.push({ date, slotEvents: sEvents, woEvents: wEvents, slotAssignees, woAssigneeMap });
    }

    setRangeData(results);
    setRangeLoading(false);
    return results;
  }

  // ── 기간 인쇄 (CCP-1B의 printRange와 동일 패턴) ──
  async function printRange() {
    const results = await loadRangeData();
    if (results.length === 0) return showToast("조회된 기록이 없습니다.", "error");

    const tdS = `border:1px solid #000;padding:2px 3px;font-size:8pt;vertical-align:middle;`;
    const CHUNK_SIZE_R = 4;
    const WO_LABEL: Record<string, string> = { start: "시작", mid_check: "중간점검", end: "종료" };
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

    function signImgHtml(name: string | null): string {
      if (!name) return "";
      const src = SIGN_MAP[name];
      if (src) return `<img src="${src}" style="height:20px;object-fit:contain;display:block;margin:0 auto;" alt="${name}"/><div style="font-size:6pt;">${name}</div>`;
      return `<div style="font-size:7pt;">${name}</div>`;
    }

    function slotWoEventsDedupFor(dayData: typeof results[0], slotId: string) {
      const seen = new Set<string>();
      return dayData.woEvents
        .filter((e: any) => e.slot_id === slotId)
        .sort((a: any, b: any) => a.measured_at.localeCompare(b.measured_at))
        .filter((e: any) => {
          const key = `${e.measured_at.slice(11, 16)}_${e.temperature}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
    }

    function slotWoEventsByAssigneeFor(dayData: typeof results[0], slotId: string, assignee: string) {
      const assigneeWoNos = Object.keys(dayData.woAssigneeMap).filter((no) => dayData.woAssigneeMap[no] === assignee);
      const seen = new Set<string>();
      const filtered = dayData.woEvents.filter((e: any) => e.slot_id === slotId && assigneeWoNos.includes(e.work_order_no));
      // 작업지시서별 최초 발생시각 — 같은 WO의 시작~종료가 항상 붙어서 정렬되도록
      const firstTimeByWo: Record<string, string> = {};
      for (const e of filtered) {
        if (!firstTimeByWo[e.work_order_no] || e.measured_at < firstTimeByWo[e.work_order_no]) {
          firstTimeByWo[e.work_order_no] = e.measured_at;
        }
      }
      return filtered
        .sort((a: any, b: any) => {
          const groupCompare = firstTimeByWo[a.work_order_no].localeCompare(firstTimeByWo[b.work_order_no]);
          if (groupCompare !== 0) return groupCompare;
          // 최초시각이 동일한 WO끼리는 work_order_no로 그룹을 먼저 고정 — 같은 WO의 이벤트가 흩어지지 않도록
          const woCompare = a.work_order_no.localeCompare(b.work_order_no);
          if (woCompare !== 0) return woCompare;
          return a.measured_at.localeCompare(b.measured_at);
        })
        .filter((e: any) => {
          // work_order_no를 키에 포함 — 서로 다른 WO의 우연히 같은 시각+온도인 기록이 중복으로 오인되어 삭제되는 것을 방지
          const key = `${e.work_order_no}_${e.measured_at.slice(11, 16)}_${e.temperature}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
    }

    function buildSlotTable(dayData: typeof results[0]): string {
      const slots = targetSlots;
      const maxRows = Math.max(
        ...slots.flatMap((s) => {
          const assignees = dayData.slotAssignees[s.id] ?? [""];
          return assignees.map((a) => a ? slotWoEventsByAssigneeFor(dayData, s.id, a).length : slotWoEventsDedupFor(dayData, s.id).length);
        }),
        3
      );
      const totalSlotCols = slots.reduce((sum, s) => sum + ((dayData.slotAssignees[s.id] ?? [""]).length), 0);
      const colW = `calc((100% - 44px) / ${CHUNK_SIZE_R})`;
      let html = `<table style="width:100%;border-collapse:collapse;margin-bottom:6px;table-layout:fixed;"><tbody>`;

      html += `<tr>`;
      html += `<td rowspan="${5 + maxRows}" style="${tdS}font-weight:bold;text-align:center;width:44px;font-size:8pt;writing-mode:vertical-rl;">코팅·전사</td>`;
      for (const s of slots) {
        const assignees = dayData.slotAssignees[s.id] ?? [""];
        for (const a of assignees) {
          html += `<td style="${tdS}text-align:center;font-weight:bold;font-size:8pt;height:22px;width:${colW};">${s.slot_name}${assignees.length > 1 ? `<span style="font-size:6.5pt;margin-left:2px;color:#555;">(${a})</span>` : ""}</td>`;
        }
      }
      for (let i = 0; i < Math.max(0, CHUNK_SIZE_R - totalSlotCols); i++) html += `<td style="${tdS}width:${colW};"></td>`;
      html += `</tr>`;

      html += `<tr>`;
      for (const s of slots) {
        const assignees = dayData.slotAssignees[s.id] ?? [""];
        const ev = dayData.slotEvents.filter((e: any) => e.slot_id === s.id && e.event_type === "material_in" && !e.action_note?.includes("→"))
          .sort((a: any, b: any) => a.measured_at.localeCompare(b.measured_at))[0];
        assignees.forEach((_, ai) => {
          html += `<td style="${tdS}text-align:center;font-size:8pt;height:22px;">${ai === 0 ? (ev ? `원료투입: ${toKSTTime(ev.measured_at)}` : "") : ""}</td>`;
        });
      }
      for (let i = 0; i < Math.max(0, CHUNK_SIZE_R - totalSlotCols); i++) html += `<td style="${tdS}"></td>`;
      html += `</tr>`;

      html += `<tr>`;
      for (const s of slots) {
        const assignees = dayData.slotAssignees[s.id] ?? [""];
        const moveEvs = [
          ...dayData.slotEvents.filter((e: any) => e.slot_id === s.id && e.event_type === "material_out" && e.action_note?.startsWith("→")),
          ...dayData.slotEvents.filter((e: any) => e.slot_id === s.id && e.event_type === "material_in" && e.action_note?.includes("→")),
        ].sort((a: any, b: any) => a.measured_at.localeCompare(b.measured_at));
        const cellContent = moveEvs.length === 0 ? "" : moveEvs.map((ev: any) => `슬롯이동: ${toKSTTime(ev.measured_at)} (${ev.action_note})`).join("<br/>");
        assignees.forEach((_, ai) => {
          html += `<td style="${tdS}text-align:center;font-size:8pt;min-height:22px;">${ai === 0 ? cellContent : ""}</td>`;
        });
      }
      for (let i = 0; i < Math.max(0, CHUNK_SIZE_R - totalSlotCols); i++) html += `<td style="${tdS}"></td>`;
      html += `</tr>`;

      for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        html += `<tr>`;
        for (const s of slots) {
          const assignees = dayData.slotAssignees[s.id] ?? [""];
          for (const a of assignees) {
            const ev = a ? slotWoEventsByAssigneeFor(dayData, s.id, a)[rowIdx] : slotWoEventsDedupFor(dayData, s.id)[rowIdx];
            const isNG = ev?.is_ok === false;
            html += `<td style="${tdS}text-align:center;font-size:8pt;color:${isNG ? "red" : "#000"};height:22px;">`;
            if (ev) {
              const bg = ev.event_type === "start" ? "#dbeafe" : ev.event_type === "end" ? "#ede9fe" : "#f1f5f9";
              html += `<span style="font-size:7pt;background:${bg};padding:0 3px;border-radius:2px;margin-right:2px;">${WO_LABEL[ev.event_type] ?? ev.event_type}</span>(${toKSTTime(ev.measured_at)}) ${ev.temperature ?? ""}℃`;
            }
            html += `</td>`;
          }
        }
        for (let i = 0; i < Math.max(0, CHUNK_SIZE_R - totalSlotCols); i++) html += `<td style="${tdS}"></td>`;
        html += `</tr>`;
      }

      html += `<tr>`;
      for (let i = 0; i < Math.max(totalSlotCols, CHUNK_SIZE_R); i++) html += `<td style="${tdS}height:22px;"></td>`;
      html += `</tr>`;

      html += `<tr>`;
      for (const s of slots) {
        const assignees = dayData.slotAssignees[s.id] ?? [""];
        const evsAll = dayData.woEvents.filter((e: any) => e.slot_id === s.id);
        for (const a of assignees) {
          const evs = a ? evsAll.filter((e: any) => dayData.woAssigneeMap[e.work_order_no] === a) : evsAll;
          if (evs.length === 0) { html += `<td style="${tdS}height:28px;"></td>`; continue; }
          const hasNG = evs.some((e: any) => e.is_ok === false);
          html += `<td style="${tdS}text-align:center;font-size:8pt;height:28px;">`;
          html += `<div style="margin-bottom:1px;"><span style="font-weight:bold;color:${hasNG ? "red" : "#000"};">판정: ${hasNG ? "X" : "O"}</span></div>`;
          html += signImgHtml(a);
          html += `</td>`;
        }
      }
      for (let i = 0; i < Math.max(0, CHUNK_SIZE_R - totalSlotCols); i++) html += `<td style="${tdS}height:28px;"></td>`;
      html += `</tr>`;

      html += `</tbody></table>`;
      return html;
    }

    let bodyHtml = "";

    for (let di = 0; di < results.length; di++) {
      const dayData = results[di];
      const isLast = di === results.length - 1;
      const d = new Date(dayData.date + "T00:00:00+09:00");
      const dateLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;

      const deviations = dayData.woEvents.filter((e: any) => e.is_ok === false)
        .map((e: any) => `${toKSTTime(e.measured_at)} 슬롯${targetSlots.find((s) => s.id === e.slot_id)?.slot_name ?? ""} — ${e.temperature ?? ""}°C / ${e.action_note ?? ""}`)
        .join("  /  ") || " ";

      bodyHtml += `<div style="page-break-after:${isLast ? "avoid" : "always"};">`;

      bodyHtml += `<table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr>
          <td rowspan="2" style="${tdS}font-size:12pt;font-weight:bold;text-align:center;padding:6px 8px;">기타가공품 가열공정 모니터링일지<br/><span style="font-size:9pt;">*온장고 내 보관기간 : 1개월 미만*</span></td>
          <td rowspan="2" style="${tdS}width:28px;font-weight:bold;text-align:center;font-size:8pt;">결<br/>재<br/>란</td>
          <td style="${tdS}width:80px;text-align:center;font-weight:bold;">작성</td>
          <td style="${tdS}width:80px;text-align:center;font-weight:bold;">승인</td>
        </tr>
        <tr>
          <td style="${tdS}text-align:center;padding:3px;"><img src="/sign-kimyg.png" style="height:30px;object-fit:contain;display:block;margin:0 auto;" alt="김영각"/><div style="font-size:7pt;margin-top:2px;">김영각</div></td>
          <td style="${tdS}text-align:center;padding:3px;"><img src="/sign-chods.png" style="height:30px;object-fit:contain;display:block;margin:0 auto;" alt="조대성"/><div style="font-size:7pt;margin-top:2px;">조대성</div></td>
        </tr>
      </tbody></table>`;

      bodyHtml += `<table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr><td style="${tdS}width:80px;font-weight:bold;white-space:nowrap;">작성일자</td><td style="${tdS}">${dateLabel}</td></tr>
      </tbody></table>`;

      bodyHtml += `<table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr>
          <td style="${tdS}font-weight:bold;white-space:nowrap;width:56px;">위해요소</td>
          <td colspan="3" style="${tdS}font-size:8pt;">병원성 미생물(리스테리아모노사이토제네스, 장출혈성대장균)</td>
          <td style="${tdS}font-weight:bold;text-align:center;width:60px;">온도</td>
          <td style="${tdS}font-weight:bold;text-align:center;width:80px;">시간</td>
        </tr>
        <tr>
          <td style="${tdS}font-weight:bold;">한계기준</td>
          <td colspan="3" style="${tdS}font-size:8pt;">전사지·코팅 공정 (슬롯: 7-1, 7-2, 7-3, 8)</td>
          <td style="${tdS}text-align:center;">45±5℃</td>
          <td style="${tdS}text-align:center;font-size:8pt;white-space:nowrap;">4시간 이상 유지</td>
        </tr>
        <tr>
          <td style="${tdS}font-weight:bold;">주 기</td>
          <td colspan="5" style="${tdS}font-size:8pt;">작업시작 전, 작업 중 2시간마다, 작업종료</td>
        </tr>
        <tr>
          <td rowspan="2" style="${tdS}font-weight:bold;">방 법</td>
          <td style="${tdS}font-weight:bold;white-space:nowrap;">감도 모니터링</td>
          <td colspan="4" style="${tdS}font-size:7.5pt;">중탕온도: 바트 품온 온도 확인</td>
        </tr>
        <tr>
          <td style="${tdS}font-weight:bold;">가열시간</td>
          <td colspan="4" style="${tdS}font-size:7.5pt;">4시간 이상 가열. ※ 온도계·시계는 연 1회 검·교정 실시 필요</td>
        </tr>
      </tbody></table>`;

      bodyHtml += buildSlotTable(dayData);

      bodyHtml += `<table style="width:100%;border-collapse:collapse;margin-top:4px;"><tbody>
        <tr>
          <td style="${tdS}font-weight:bold;font-size:8pt;width:140px;white-space:nowrap;">한계기준 이탈 및 조치내용</td>
          <td style="${tdS}padding:4px 6px;font-size:8pt;">${deviations}</td>
        </tr>
      </tbody></table>`;

      bodyHtml += `</div>`;
    }

    const printTitle = `기타가공품_가열공정_${rangeFrom}_${rangeTo}`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>${printTitle}</title>
      <style>
        @page { size: A4 landscape; margin: 8mm 10mm; }
        body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9pt; color: #000; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        table { border-collapse: collapse; }
        img { max-width: none; }
      </style>
    </head><body>${bodyHtml}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  }

  // ── 인쇄 (기존 단일 날짜용 — 더 이상 버튼에 연결되지 않지만 코드는 보존) ──
  async function handlePrint() {
    const allWoNos = [...new Set(Object.values(slotWoMap).flat())];
    const assigneeMap: Record<string, string> = {};
    if (allWoNos.length > 0) {
      const { data } = await supabase.from("work_orders")
        .select("work_order_no,assignee_production,assignee_transfer").in("work_order_no", allWoNos);
      for (const row of data ?? []) {
        const slot = targetSlots.find(s =>
          (slotWoMap[s.id] ?? []).includes(row.work_order_no)
        );
        const isTransferSlot = slot?.purpose === "전사용도";
        const assignee = isTransferSlot
          ? (row.assignee_transfer ?? row.assignee_production)
          : (row.assignee_production ?? row.assignee_transfer);
        if (assignee) assigneeMap[row.work_order_no] = assignee;
      }
    }
   
    const newAssignees: Record<string, string[]> = {};
for (const s of targetSlots) {
  const assignees: string[] = [];
  for (const wNo of slotWoMap[s.id] ?? []) {
    if (assigneeMap[wNo] && !assignees.includes(assigneeMap[wNo])) {
      assignees.push(assigneeMap[wNo]);
    }
  }
  if (assignees.length > 0) newAssignees[s.id] = assignees;
}


slotAssigneesRef.current = newAssignees;
woAssigneeMapRef.current = assigneeMap;
console.log("slotAssigneesRef:", JSON.stringify(slotAssigneesRef.current));
console.log("woAssigneeMapRef:", JSON.stringify(woAssigneeMapRef.current));
console.log("slotWoMap:", JSON.stringify(slotWoMap));

setTimeout(() => {
  const content = document.getElementById("other-heating-print-inner");
  if (!content) return;
  const printTitle = `기타가공품_가열공정_${filterDate}`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>${printTitle}</title>
    <style>
      @page { size: A4 landscape; margin: 8mm 10mm; }
      body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9pt; color: #000; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      table { border-collapse: collapse; page-break-inside: avoid; }
      img { max-width: none; }
    </style>
  </head><body>${content.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}, 150);
  }

  const CCP_WO_EVENT_LABELS: Record<string, string> = { start: "시작", mid_check: "중간점검", end: "종료" };
  const WO_EVENT_TYPE_LABEL: Record<string, string> = { start: "시작", mid_check: "중간점검", end: "종료" };

  function woBadgeCls(type: string) {
    if (type === "start") return "bg-blue-100 border-blue-200 text-blue-700";
    if (type === "end") return "bg-purple-100 border-purple-200 text-purple-700";
    return "bg-slate-100 border-slate-200 text-slate-600";
  }

  // ── 인쇄용 style 객체 (CCP-1B 완전 동일) ──
  const tdBase: React.CSSProperties = { border: "1px solid #000", padding: "2px 3px", fontSize: "8pt", verticalAlign: "middle" };
  const thBase: React.CSSProperties = { border: "1px solid #000", padding: "2px 3px", fontSize: "7.5pt", fontWeight: "bold", textAlign: "center", background: "#fff", verticalAlign: "middle" };

  // 인쇄용 슬롯별 중복 제거 이벤트
  function slotWoEventsDedup(slotId: string) {
    const seen = new Set<string>();
    return woEvents
      .filter((e) => e.slot_id === slotId)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
      .filter((e) => {
        const key = `${e.measured_at.slice(11, 16)}_${e.temperature}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
  }

  const printDate = (() => {
    const d = new Date(filterDate + "T00:00:00+09:00");
    const days = ["일","월","화","수","목","금","토"];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  })();

  const CHUNK_SIZE = 4;
  const slotWoEventsByAssignee = (slotId: string, assignee: string) => {
    const assigneeWoNos = Object.keys(woAssigneeMapRef.current).filter(
      (no) => woAssigneeMapRef.current[no] === assignee
    );
    const seen = new Set<string>();
    const filtered = woEvents.filter((e) => e.slot_id === slotId && assigneeWoNos.includes(e.work_order_no));
    // 작업지시서별 최초 발생시각 — 같은 WO의 시작~종료가 항상 붙어서 정렬되도록
    const firstTimeByWo: Record<string, string> = {};
    for (const e of filtered) {
      if (!firstTimeByWo[e.work_order_no] || e.measured_at < firstTimeByWo[e.work_order_no]) {
        firstTimeByWo[e.work_order_no] = e.measured_at;
      }
    }
    return filtered
      .sort((a, b) => {
        const groupCompare = firstTimeByWo[a.work_order_no].localeCompare(firstTimeByWo[b.work_order_no]);
        if (groupCompare !== 0) return groupCompare;
        return a.measured_at.localeCompare(b.measured_at);
      })
      .filter((e) => {
        const key = `${e.measured_at.slice(11, 16)}_${e.temperature}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  
  const maxRows = Math.max(
    ...targetSlots.flatMap((s) => {
      const assignees = slotAssigneesRef.current[s.id] ?? [""];
      return assignees.map((a) => a ? slotWoEventsByAssignee(s.id, a).length : slotWoEventsDedup(s.id).length);
    }),
    3
  );

  const colWidth = `calc((100% - 44px) / ${CHUNK_SIZE})`;

  return (
    <div className="space-y-4">

      {/* ── 조회 기간 + 인쇄 통합 패널 (CCP-1B와 동일) ── */}
      <div className={`${card} p-3 flex flex-wrap items-center gap-3`}>
        <span className="text-sm font-semibold text-slate-600">조회 기간</span>
        <input
          type="date"
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          value={rangeFrom}
          max={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })}
          onChange={(e) => { setRangeFrom(e.target.value); setFilterDate(e.target.value); setSelectedSlotId(null); setEditingEventId(null); setRangeData([]); }}
        />
        <span className="text-slate-400">~</span>
        <input
          type="date"
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          value={rangeTo}
          max={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })}
          onChange={(e) => { setRangeTo(e.target.value); setFilterDate(e.target.value); setSelectedSlotId(null); setEditingEventId(null); setRangeData([]); }}
        />
        <button className={btn} onClick={loadData}>🔄 새로고침</button>
        <button className={btnSm} onClick={printRange}>🖨️ 기간 인쇄</button>
        {(rangeFrom !== new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) || rangeTo !== new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })) && (
          <>
            <button
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
              onClick={() => {
                const t = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
                setRangeFrom(t); setRangeTo(t); setFilterDate(t);
                setSelectedSlotId(null); setEditingEventId(null);
              }}
            >오늘로 돌아가기</button>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">과거 기록 조회 중</span>
          </>
        )}
      </div>

      <div className={`${card} p-3`}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span className="font-semibold">⚠ 한계기준:</span> 45±5°C (40~50°C), 4시간 이상 유지 / 주기: 작업시작 전, 작업 중 2시간마다, 작업종료 / 해당 슬롯: 7-1, 7-2, 7-3, 8
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">

        {/* 좌: 슬롯 목록 고정 4개 */}
        <div className={`${card} p-4`} style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
          <div className="mb-3 font-semibold text-sm">🔥 슬롯 목록</div>
          {loading ? (
            <div className="py-6 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : (
            <div className="space-y-2">
              {targetSlots.map((s) => {
                const wEvs = woEvents.filter((e) => e.slot_id === s.id);
                const hasNG = wEvs.some((e) => e.is_ok === false);
                const lastTemp = [...wEvs].sort((a, b) => b.measured_at.localeCompare(a.measured_at))
                  .find((e) => e.temperature != null);
                const woNos = slotWoMap[s.id] ?? [];
                const isSelected = selectedSlotId === s.id;

                return (
                  <button key={s.id}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${
                      isSelected ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                    onClick={() => selectSlot(s.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm">{s.slot_name}</div>
                      {wEvs.length > 0 && (
                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                          hasNG ? "bg-red-100 border-red-200 text-red-700" : "bg-green-100 border-green-200 text-green-700"
                        }`}>{hasNG ? "⚠ 이탈" : "적합"}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{s.purpose}</div>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      {lastTemp
                        ? <span className={`text-xs font-bold ${hasNG ? "text-red-600" : "text-blue-600"}`}>최근 {lastTemp.temperature}°C</span>
                        : <span className="text-xs text-slate-400">기록 없음</span>
                      }
                      {wEvs.length > 0 && <span className="text-[11px] text-slate-400">온도기록 {wEvs.length}건</span>}
                    </div>
                    {woNos.length > 0 && (
                      <div className="mt-1 text-[10px] text-slate-400 truncate">
                        {woNos.map((no) => woLabelMap[no] ?? no).filter(Boolean).join(", ")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 우: 슬롯 상세 */}
        {selectedSlotId ? (() => {
          const slot = targetSlots.find((s) => s.id === selectedSlotId);
          return (
            <div className="space-y-3" style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>

              <div className={`${card} p-4`}>
                <div className="font-bold text-base">
                  🔥 {slot?.slot_name}
                  <span className="ml-2 text-sm font-normal text-slate-500">({slot?.purpose})</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-400">{filterDate}</div>
                {relatedWoNos.length > 0 && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">📋 연결된 작업지시서</div>
                    <div className="flex flex-wrap gap-2">
                      {relatedWoNos.map((no) => (
                        <span key={no} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                          {woLabelMap[no] ?? no}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 온도 기록 입력 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 font-semibold text-sm">🌡️ 온도 기록 입력</div>
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-3">
                  <div>
                    <div className="mb-1 text-xs text-slate-500">유형</div>
                    <div className="flex flex-wrap gap-1">
                      {([
                        { value: "start",     label: "시작",     cls: "bg-blue-100 border-blue-400 text-blue-800" },
                        { value: "mid_check", label: "중간점검", cls: "bg-slate-100 border-slate-400 text-slate-700" },
                        { value: "end",       label: "종료",     cls: "bg-purple-100 border-purple-400 text-purple-800" },
                      ] as { value: string; label: string; cls: string }[]).map((t) => (
                        <button key={t.value} type="button"
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                            ccpEventType === t.value ? t.cls + " shadow-sm scale-105" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                          }`}
                          onClick={() => setCcpEventType(t.value as any)}
                        >{t.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <div>
                      <div className="mb-1 text-xs text-slate-500">측정시각 (HHmm)</div>
                      <input className={inp} inputMode="numeric" placeholder="예: 1430" maxLength={4}
                        value={ccpTime}
                        onChange={(e) => setCcpTime(e.target.value.replace(/[^\d]/g, "").slice(0, 4))} />
                      {ccpTime.length === 4 && (
                        <div className="mt-0.5 text-xs text-slate-400 text-right">
                          {ccpTime.slice(0, 2)}:{ccpTime.slice(2, 4)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">온도 (40~50°C)</div>
                      <input className={inpR} inputMode="numeric" placeholder="예: 45.0" value={ccpTemp}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^\d]/g, "");
                          if (!raw) { setCcpTemp(""); return; }
                          const v = raw.length >= 3 ? `${raw.slice(0, -1)}.${raw.slice(-1)}` : raw;
                          setCcpTemp(v);
                          if (raw.length >= 3) setCcpIsOk(Number(v) >= 40 && Number(v) <= 50);
                        }} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">판정</div>
                      <select className={`${inp} ${ccpIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
                        value={ccpIsOk ? "ok" : "ng"}
                        onChange={(e) => setCcpIsOk(e.target.value === "ok")}>
                        <option value="ok">✅ 적합</option>
                        <option value="ng">❌ 부적합</option>
                      </select>
                    </div>
                  </div>
                  {!ccpIsOk && (
                    <div>
                      <div className="mb-1 text-xs text-red-600 font-semibold">⚠ 한계기준 이탈 — 조치사항 *</div>
                      <input className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm focus:outline-none"
                        value={ccpActionNote} onChange={(e) => setCcpActionNote(e.target.value)}
                        placeholder="온도 이탈 조치 내용" />
                    </div>
                  )}
                  <button
                    className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={saving} onClick={saveEvent}
                  >{saving ? "저장 중..." : "💾 기록"}</button>
                </div>
              </div>

              {/* 기록 테이블 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 font-semibold text-sm">🌡️ 기록된 온도</div>
                {selectedWoEvents.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b-2 border-slate-200 bg-slate-50">
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">시각</th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">유형</th>
                            <th className="py-2 px-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">온도</th>
                            <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">판정</th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">조치</th>
                            {isAdminOrSubadmin && <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500">관리</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedWoEvents.map((ev, idx) => {
                            const isNG = ev.is_ok === false;
                            const isEditing = editingEventId === ev.id;
                            return (
                              <tr key={ev.id} className={`border-b border-slate-100 ${
                                isEditing ? "bg-blue-50" : isNG ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                              }`}>
                                <td className="py-2 px-3 font-mono text-sm text-slate-700 whitespace-nowrap">
                                  {isEditing
                                    ? <input className="w-24 rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none"
                                        inputMode="numeric" placeholder="HHmm" maxLength={4}
                                        value={editTime} onChange={(e) => setEditTime(e.target.value.replace(/[^\d]/g, "").slice(0, 4))} />
                                    : toKSTTime(ev.measured_at)}
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${woBadgeCls(ev.event_type)}`}>
                                    {CCP_WO_EVENT_LABELS[ev.event_type] ?? ev.event_type}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  {isEditing
                                    ? <input className="w-20 rounded-lg border border-blue-300 px-2 py-1 text-xs text-right tabular-nums focus:outline-none"
                                        inputMode="decimal" value={editTemp}
                                        onChange={(e) => {
                                          const raw = e.target.value.replace(/[^\d]/g, "");
                                          if (!raw) { setEditTemp(""); return; }
                                          const v = raw.length >= 3 ? `${raw.slice(0, -1)}.${raw.slice(-1)}` : raw;
                                          setEditTemp(v);
                                          if (raw.length >= 3) setEditIsOk(Number(v) >= 40 && Number(v) <= 50);
                                        }} />
                                    : ev.temperature != null
                                      ? <span className={`text-sm font-bold tabular-nums ${isNG ? "text-red-600" : "text-blue-700"}`}>{ev.temperature}°C</span>
                                      : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  {isEditing
                                    ? <select className={`rounded-lg border px-1.5 py-1 text-xs focus:outline-none ${editIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
                                        value={editIsOk ? "ok" : "ng"} onChange={(e) => setEditIsOk(e.target.value === "ok")}>
                                        <option value="ok">O 적합</option>
                                        <option value="ng">X 부적합</option>
                                      </select>
                                    : ev.is_ok != null
                                      ? <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ev.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>{ev.is_ok ? "O" : "X"}</span>
                                      : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                                <td className="py-2 px-3 text-xs">
                                  {isEditing
                                    ? <input className="w-full rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none"
                                        value={editActionNote} onChange={(e) => setEditActionNote(e.target.value)} placeholder="조치사항" />
                                    : <span className={isNG ? "text-red-600" : ""}>{ev.action_note ?? ""}</span>}
                                </td>
                                {isAdminOrSubadmin && (
                                  <td className="py-2 px-3 text-center whitespace-nowrap">
                                    {isEditing
                                      ? <div className="flex gap-1 justify-center">
                                          <button className="rounded-lg border border-blue-400 bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                            disabled={editSaving} onClick={() => saveEdit(ev)}>{editSaving ? "..." : "저장"}</button>
                                          <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50"
                                            onClick={() => setEditingEventId(null)}>취소</button>
                                        </div>
                                      : <div className="flex gap-1 justify-center">
                                          <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
                                            onClick={() => startEdit(ev)}>수정</button>
                                          <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500"
                                            onClick={() => deleteEvent(ev.id)}>삭제</button>
                                        </div>}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      {(() => {
                        const temps = selectedWoEvents.filter((e) => e.temperature != null).map((e) => e.temperature as number);
                        const ngCount = selectedWoEvents.filter((e) => e.is_ok === false).length;
                        const okCount = selectedWoEvents.filter((e) => e.is_ok === true).length;
                        return (
                          <>
                            <span>온도 측정 <b>{temps.length}</b>회</span>
                            {okCount > 0 && <span className="text-green-600">적합 <b>{okCount}</b>회</span>}
                            {ngCount > 0 && <span className="text-red-600 font-semibold">⚠ 이탈 <b>{ngCount}</b>회</span>}
                            {temps.length > 0 && <span>최저 <b className={Math.min(...temps) < 40 ? "text-red-600" : ""}>{Math.min(...temps)}°C</b></span>}
                            {temps.length > 0 && <span>최고 <b className={Math.max(...temps) > 50 ? "text-red-600" : ""}>{Math.max(...temps)}°C</b></span>}
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>

            </div>
          );
        })() : (
          <div className={`${card} flex items-center justify-center p-12`}>
            <div className="text-center text-slate-400">
              <div className="text-3xl mb-2">🔥</div>
              <div className="text-sm">왼쪽 슬롯을 선택하세요</div>
              <div className="mt-1 text-xs text-slate-300">7-1, 7-2, 7-3, 8 슬롯의 온도를 기록합니다</div>
            </div>
          </div>
        )}
      </div>

      {/* ── 인쇄 전용 영역 (CCP-1B 동일 구조) ── */}
      <style>{`.other-heating-print-only { display: none; }`}</style>
      <div id="other-heating-print-inner" className="other-heating-print-only"
        style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: "9pt", color: "#000" }}>

        {/* ① 제목 + 결재란 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ ...tdBase, fontSize: "12pt", fontWeight: "bold", textAlign: "center", padding: "6px 8px" }}>
                기타가공품 가열공정 모니터링일지<br/>
                <span style={{ fontSize: "9pt" }}>*온장고 내 보관기간 : 1개월 미만*</span>
              </td>
              <td style={{ ...tdBase, width: 28, fontWeight: "bold", textAlign: "center", fontSize: "8pt" }} rowSpan={2}>결<br/>재<br/>란</td>
              <td style={{ ...tdBase, width: 80, textAlign: "center", fontWeight: "bold" }}>작성</td>
              <td style={{ ...tdBase, width: 80, textAlign: "center", fontWeight: "bold" }}>승인</td>
            </tr>
            <tr>
              <td style={{ ...tdBase, textAlign: "center", padding: "3px" }}>
                <img src="/sign-kimyg.png" style={{ height: 30, objectFit: "contain", display: "block", margin: "0 auto" }} alt="김영각" />
                <div style={{ fontSize: "7pt", marginTop: 2 }}>김영각</div>
              </td>
              <td style={{ ...tdBase, textAlign: "center", padding: "3px" }}>
                <img src="/sign-chods.png" style={{ height: 30, objectFit: "contain", display: "block", margin: "0 auto" }} alt="조대성" />
                <div style={{ fontSize: "7pt", marginTop: 2 }}>조대성</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ② 작성일자 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
          <tbody>
            <tr>
              <td style={{ ...tdBase, width: 80, fontWeight: "bold", whiteSpace: "nowrap" }}>작성일자</td>
              <td style={tdBase}>{printDate}</td>
            </tr>
          </tbody>
        </table>

        {/* ③ 위해요소 / 한계기준 / 주기 / 방법 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
          <tbody>
            <tr>
              <td style={{ ...tdBase, fontWeight: "bold", whiteSpace: "nowrap", width: 56 }}>위해요소</td>
              <td colSpan={3} style={{ ...tdBase, fontSize: "8pt" }}>병원성 미생물(리스테리아모노사이토제네스, 장출혈성대장균)</td>
              <td style={{ ...tdBase, fontWeight: "bold", textAlign: "center", width: 60 }}>온도</td>
              <td style={{ ...tdBase, fontWeight: "bold", textAlign: "center", width: 80 }}>시간</td>
            </tr>
            <tr>
              <td style={{ ...tdBase, fontWeight: "bold" }}>한계기준</td>
              <td colSpan={3} style={{ ...tdBase, fontSize: "8pt" }}>전사지·코팅 공정 (슬롯: 7-1, 7-2, 7-3, 8)</td>
              <td style={{ ...tdBase, textAlign: "center" }}>45±5℃</td>
              <td style={{ ...tdBase, textAlign: "center", fontSize: "8pt", whiteSpace: "nowrap" }}>4시간 이상 유지</td>
            </tr>
            <tr>
              <td style={{ ...tdBase, fontWeight: "bold" }}>주 기</td>
              <td colSpan={5} style={{ ...tdBase, fontSize: "8pt" }}>작업시작 전, 작업 중 2시간마다, 작업종료</td>
            </tr>
            <tr>
              <td rowSpan={2} style={{ ...tdBase, fontWeight: "bold" }}>방 법</td>
              <td style={{ ...tdBase, fontWeight: "bold", whiteSpace: "nowrap" }}>감도 모니터링</td>
              <td colSpan={4} style={{ ...tdBase, fontSize: "7.5pt" }}>중탕온도: 바트 품온 온도 확인</td>
            </tr>
            <tr>
              <td style={{ ...tdBase, fontWeight: "bold" }}>가열시간</td>
              <td colSpan={4} style={{ ...tdBase, fontSize: "7.5pt" }}>4시간 이상 가열. ※ 온도계·시계는 연 1회 검·교정 실시 필요</td>
            </tr>
          </tbody>
        </table>

        {/* ④ 슬롯별 데이터 (CCP-1B renderSection 완전 동일 구조) */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6, tableLayout: "fixed", pageBreakInside: "avoid" as any }}>
          <colgroup>
            <col style={{ width: "44px" }} />
            {Array.from({ length: CHUNK_SIZE }).map((_, i) => (
              <col key={i} style={{ width: colWidth }} />
            ))}
          </colgroup>
          <tbody>
            {/* 슬롯명 행 */}
            <tr>
              <td rowSpan={3 + maxRows + 2} style={{ ...tdBase, fontWeight: "bold", textAlign: "center", width: 44, fontSize: "8pt", writingMode: "vertical-rl" as any, verticalAlign: "middle" }}>
                코팅·전사
              </td>
              {targetSlots.flatMap((s, i) => {
  const assignees = slotAssigneesRef.current[s.id] ?? [""];
  return assignees.map((assignee, ai) => (
    <td key={`${i}-${ai}`} style={{ ...tdBase, textAlign: "center", fontWeight: "bold", fontSize: "8pt", height: 22 }}>
      {s.slot_name}
      {assignees.length > 1 && (
        <span style={{ fontSize: "6.5pt", marginLeft: 2, color: "#555" }}>({assignee})</span>
      )}
    </td>
  ));
})}
{Array.from({ length: CHUNK_SIZE - targetSlots.length }).map((_, i) => (
  <td key={`en-${i}`} style={tdBase} />
))}

            </tr>

            {/* 원료투입 행 */}
            <tr>
            {targetSlots.flatMap((s, i) => {
  const assignees = slotAssigneesRef.current[s.id] ?? [""];
  const ev = slotEvents.filter((e) =>
    e.slot_id === s.id && e.event_type === "material_in" && !e.action_note?.includes("→")
  ).sort((a, b) => a.measured_at.localeCompare(b.measured_at))[0];
  return assignees.map((_, ai) => (
    <td key={`${i}-${ai}`} style={{ ...tdBase, textAlign: "center", fontSize: "8pt", height: 22 }}>
      {ai === 0 ? (ev ? `원료투입: ${ev.measured_at.slice(5, 10).replace("-", "/")} ${toKSTTime(ev.measured_at)}` : "") : ""}
    </td>
  ));
})}
{Array.from({ length: CHUNK_SIZE - targetSlots.length }).map((_, i) => (
  <td key={`ei-${i}`} style={tdBase} />
))}
            </tr>

            {/* 슬롯이동 행 */}
            <tr>
            {targetSlots.flatMap((s, i) => {
  const assignees = slotAssigneesRef.current[s.id] ?? [""];
  const outEv = slotEvents.filter((e) =>
    e.slot_id === s.id && e.event_type === "material_out" && e.action_note?.startsWith("→")
  ).sort((a, b) => a.measured_at.localeCompare(b.measured_at))[0];
  const inEv = slotEvents.filter((e) =>
    e.slot_id === s.id && e.event_type === "material_in" && e.action_note?.includes("→")
  ).sort((a, b) => a.measured_at.localeCompare(b.measured_at))[0];
  const ev = outEv ?? inEv;
  return assignees.map((_, ai) => (
    <td key={`${i}-${ai}`} style={{ ...tdBase, textAlign: "center", fontSize: "8pt", height: 22 }}>
      {ai === 0 ? (ev ? `슬롯이동: ${ev.measured_at.slice(5, 10).replace("-", "/")} ${toKSTTime(ev.measured_at)} (${ev.action_note})` : "") : ""}
    </td>
  ));
})}
{Array.from({ length: CHUNK_SIZE - targetSlots.length }).map((_, i) => (
  <td key={`eo-${i}`} style={tdBase} />
))}
            </tr>

            {/* 온도기록 행 */}
            {Array.from({ length: maxRows }).map((_, rowIdx) => (
  <tr key={`temp-${rowIdx}`}>
    {targetSlots.flatMap((s, i) => {
      const assignees = slotAssigneesRef.current[s.id] ?? [""];
      return assignees.map((assignee, ai) => {
        const ev = assignee
          ? slotWoEventsByAssignee(s.id, assignee)[rowIdx]
          : slotWoEventsDedup(s.id)[rowIdx];
        const isNG = ev?.is_ok === false;
        const typeLabel = ev ? (WO_EVENT_TYPE_LABEL[ev.event_type] ?? ev.event_type) : "";
        return (
          <td key={`${i}-${ai}`} style={{ ...tdBase, textAlign: "center", fontSize: "8pt", color: isNG ? "red" : "#000", height: 22 }}>
            {ev ? (
              <>
                <span style={{
                  fontSize: "7pt",
                  background: ev.event_type === "start" ? "#dbeafe" : ev.event_type === "end" ? "#ede9fe" : "#f1f5f9",
                  padding: "0 3px", borderRadius: 2, marginRight: 2,
                }}>{typeLabel}</span>
                {`(${toKSTTime(ev.measured_at)}) ${ev.temperature ?? ""}℃`}
              </>
            ) : ""}
          </td>
        );
      });
    })}
    {Array.from({ length: CHUNK_SIZE - targetSlots.length }).map((_, i) => (
      <td key={`et-${i}`} style={tdBase} />
    ))}
  </tr>
))}     

            {/* 빈 행 */}
            <tr>
  {targetSlots.flatMap((s, i) => {
    const assignees = slotAssigneesRef.current[s.id] ?? [""];
    return assignees.map((_, ai) => (
      <td key={`${i}-${ai}`} style={{ ...tdBase, height: 22 }} />
    ));
  })}
  {Array.from({ length: CHUNK_SIZE - targetSlots.length }).map((_, i) => (
    <td key={`eb-${i}`} style={{ ...tdBase, height: 22 }} />
  ))}
</tr>

            {/* 판정 + 서명 행 */}
            <tr>

            {targetSlots.map((s) => {
  const evs = woEvents.filter((e) => e.slot_id === s.id);
  if (evs.length === 0) return <td key={s.id} style={{ ...tdBase, height: 28 }} />;
  const hasNG = evs.some((e) => e.is_ok === false);
  const assignees = slotAssigneesRef.current[s.id] ?? [];
  if (assignees.length <= 1) {
    const assignee = assignees[0];
    const signSrc = assignee ? SIGN_MAP[assignee] : null;
    return (
      <td key={s.id} style={{ ...tdBase, textAlign: "center", fontSize: "8pt", height: 28 }}>
        <div style={{ marginBottom: 2 }}>
          <span style={{ color: hasNG ? "red" : "#000", fontWeight: "bold" }}>판정: {hasNG ? "X" : "O"}</span>
        </div>
        {signSrc && <img src={signSrc} style={{ height: 22, display: "block", margin: "0 auto" }} alt={assignee} />}
        {assignee && !signSrc && <div style={{ fontSize: "7pt", color: "#555" }}>{assignee}</div>}
      </td>
    );
  }
  // 담당자 2명 이상 — 셀 내부를 세로 분할
  return (
    <td key={s.id} style={{ ...tdBase, fontSize: "8pt", height: 28, padding: 0 }}>
      <div style={{ display: "flex", height: "100%" }}>
        {assignees.map((assignee, i) => {
          const signSrc = SIGN_MAP[assignee] ?? null;
          return (
            <div key={i} style={{
              flex: 1,
              borderLeft: i > 0 ? "0.5px solid #000" : "none",
              textAlign: "center", padding: "2px 3px",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontWeight: "bold" }}>판정: {hasNG ? "X" : "O"}</span>
              {signSrc
                ? <img src={signSrc} style={{ height: 18, display: "block", margin: "0 auto" }} alt={assignee} />
                : <div style={{ fontSize: "7pt", color: "#555" }}>{assignee}</div>}
            </div>
          );
        })}
      </div>
    </td>
  );
})}

              {Array.from({ length: CHUNK_SIZE - targetSlots.length }).map((_, i) => (
                <td key={`ej-${i}`} style={{ ...tdBase, height: 28 }} />
              ))}
            </tr>
          </tbody>
        </table>

        {/* ⑤ 한계기준 이탈 및 조치내용 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}>
          <tbody>
            <tr>
              <td style={{ ...tdBase, fontWeight: "bold", fontSize: "8pt", width: 140, whiteSpace: "nowrap" }}>
                한계기준 이탈 및 조치내용
              </td>
              <td style={{ ...tdBase, padding: "4px 6px", fontSize: "8pt" }}>
                {woEvents.filter((e) => e.is_ok === false)
                  .map((e) => `${toKSTTime(e.measured_at)} 슬롯${targetSlots.find((s) => s.id === e.slot_id)?.slot_name ?? ""} — ${e.temperature ?? ""}°C / ${e.action_note ?? ""}`)
                  .join("  /  ") || " "}
              </td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// 압축공기
// ═══════════════════════════════════════════════════════════
export function CompressorTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const today = todayKST();

  const [logs, setLogs] = useState<any[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCumId, setEditingCumId] = useState<string | null>(null);
  const [editingCumVal, setEditingCumVal] = useState<string>("");

  // PIN
  const [inspector, setInspector] = useState<{ id: string; name: string } | null>(null);
  const [showPin, setShowPin] = useState(false);

 

  // 조회 필터
  const [filterFrom, setFilterFrom] = useState(() => {
    const d = new Date(today + "T00:00:00+09:00");
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [filterTo, setFilterTo] = useState(today);

  useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees((data ?? []) as any));
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("compressor_logs")
    .select("*, work_order:work_orders(client_name, product_name)")
    .gte("log_date", filterFrom)
    .lte("log_date", filterTo)
    .order("worked_at", { ascending: true });
  setLogs(data ?? []);
    setLoading(false);
  }, [filterFrom, filterTo]);

  const [showHidden, setShowHidden] = useState(false);
  const visibleLogs = showHidden ? logs : logs.filter((l: any) => !l.is_hidden);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // 마지막 누계 계산
  async function getLastCumulative(): Promise<number> {
    const { data } = await supabase.from("compressor_logs")
      .select("cumulative_hours")
      .eq("is_hidden", false)
      .order("worked_at", { ascending: false })
      .limit(1);
    return (data?.[0]?.cumulative_hours ?? 0) as number;
  }

  

  async function toggleHidden(id: string, currentHidden: boolean) {
    const { error } = await supabase.from("compressor_logs")
      .update({ is_hidden: !currentHidden })
      .eq("id", id);
    if (error) return showToast("처리 실패: " + error.message, "error");
    showToast(currentHidden ? "✅ 복원 완료!" : "🙈 숨김 처리 완료!");
    loadLogs();
  }

  async function updateCumulative(id: string, newVal: number) {
    if (isNaN(newVal) || newVal <= 0) return showToast("유효한 누계를 입력하세요.", "error");
    const { error } = await supabase.from("compressor_logs")
      .update({ cumulative_hours: newVal })
      .eq("id", id);
    if (error) return showToast("수정 실패: " + error.message, "error");
    showToast("✅ 누계 수정 완료!");
    loadLogs();
  }

  async function deleteLog(id: string) {
    if (!confirm("이 기록을 삭제하시겠습니까?\n삭제 후 누계가 맞지 않을 수 있으니 주의하세요.")) return;
    const { error } = await supabase.from("compressor_logs").delete().eq("id", id);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료!"); loadLogs();
  }

  function handlePrint() {
    const el = document.getElementById("compressor-print-inner");
    if (!el) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>압축공기작업기록</title>
      <style>
        @page { size: A4 portrait; margin: 10mm 12mm; }
        body { margin:0; font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:8pt; color:#000; }
        * { box-sizing:border-box; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
        table { border-collapse:collapse; width:100%; }
        th,td { border:0.5px solid #000; padding:2px 4px; }
      </style>
    </head><body>${el.innerHTML}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  return (
    <div className="space-y-4">

      {/* ── 상단 컨트롤 ── */}
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">조회 기간</div>
            <div className="flex items-center gap-1.5">
              <input type="date" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
                value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
              <span className="text-xs text-slate-400">~</span>
              <input type="date" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
                value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
          </div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          <button className={btnSm} onClick={handlePrint}>🖨️ 인쇄</button>
          

          </div>
      </div>

      {/* PIN 모달 */}
      {showPin && (
        <PinModal
          employees={employees.filter((e) => e.name !== null) as any}
          title="담당자 확인"
          onSuccess={(empId, empName) => {
            setInspector({ id: empId, name: empName });
            setShowPin(false);
          }}
          onCancel={() => setShowPin(false)}
        />
      )}

      

      {/* ── 목록 ── */} 
      <div className={`${card} p-4`}>
        {/* 고정 헤더 정보 */}
        <div className="mb-3 grid grid-cols-2 gap-1 text-xs text-slate-500 border-b border-slate-100 pb-3">
          <div><span className="font-semibold text-slate-600">필터명:</span> Airfinn 에어핀 유수분리기 압축공기 콤프레사 필터</div>
          <div><span className="font-semibold text-slate-600">설치위치:</span> 기계실 &nbsp;|&nbsp; <span className="font-semibold text-slate-600">용도:</span> 압송탱크 공급</div>
          <div><span className="font-semibold text-slate-600">기록담당자:</span> 작업자</div>
          <div><span className="font-semibold text-slate-600">확인담당자:</span> 생산팀장</div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-2 px-3 text-xs text-slate-500 font-semibold text-center w-8">no</th>
                  <th className="py-2 px-3 text-xs text-slate-500 font-semibold text-left">일시</th>
                  <th className="py-2 px-3 text-xs text-slate-500 font-semibold text-right">작업시간</th>
                  <th className="py-2 px-3 text-xs text-slate-500 font-semibold text-right">누계</th>
                  <th className="py-2 px-3 text-xs text-slate-500 font-semibold text-center">파손여부</th>
                  <th className="py-2 px-3 text-xs text-slate-500 font-semibold text-center">담당</th>
                  <th className="py-2 px-3 text-xs text-slate-500 font-semibold text-center">작업</th>
                  <th className="py-2 px-3 text-xs text-slate-500 font-semibold text-left">작업지시서</th>
                  <th className="py-2 px-3 text-xs text-slate-500 font-semibold text-left">비고</th>
                  {isAdminOrSubadmin && <th className="py-2 px-3 w-8"></th>}
                </tr>
              </thead>
              <tbody>
              {visibleLogs.map((log, idx) => (
                  <tr key={log.id} className={`border-b border-slate-100 hover:bg-slate-50 ${(log as any).is_hidden ? "opacity-40 bg-slate-100" : log.is_damaged ? "bg-red-50" : ""}`}>
                    <td className="py-2 px-3 text-center text-xs text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-3 tabular-nums text-slate-700">{log.log_date}{(log as any).is_hidden && <span className="ml-1 text-[9px] text-slate-400">(숨김)</span>}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">{Number(log.work_hours).toFixed(1)} h</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {editingCumId === log.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <input className="w-20 rounded border border-blue-300 px-1.5 py-0.5 text-xs text-right tabular-nums focus:outline-none"
                            inputMode="decimal" value={editingCumVal}
                            onChange={(e) => setEditingCumVal(e.target.value)} />
                          <button className="rounded border border-blue-400 bg-blue-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-blue-700"
                            onClick={() => { updateCumulative(log.id, Number(editingCumVal)); setEditingCumId(null); }}>저장</button>
                          <button className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400"
                            onClick={() => setEditingCumId(null)}>취소</button>
                        </div>
                      ) : (
                        <span
                          className={`tabular-nums font-semibold text-blue-700 ${isAdminOrSubadmin ? "cursor-pointer hover:underline decoration-dotted" : ""}`}
                          onClick={() => { if (isAdminOrSubadmin) { setEditingCumId(log.id); setEditingCumVal(String(Number(log.cumulative_hours))); } }}
                        >{Number(log.cumulative_hours).toFixed(1)} h</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                    {log.is_damaged
                        ? <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">○ 파손</span>
                        : <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">× 이상없음</span>}
                    </td>
                    <td className="py-2 px-3 text-center text-sm font-medium text-slate-700">{log.worker_name ?? "—"}</td>
                    <td className="py-2 px-3 text-center text-xs font-medium text-slate-700">{log.work_type ?? "—"}</td>
                    <td className="py-2 px-3 text-xs text-slate-500">
                      {(log as any).work_order
                        ? `${(log as any).work_order.client_name} — ${(log as any).work_order.product_name}`
                        : "—"}
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-500">{log.note ?? "—"}</td>
                    {isAdminOrSubadmin && (
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <button className="text-[10px] text-slate-400 hover:text-amber-500 mr-1"
                          onClick={() => toggleHidden(log.id, (log as any).is_hidden)}>
                          {(log as any).is_hidden ? "복원" : "숨김"}
                        </button>
                        <button className="text-[10px] text-slate-300 hover:text-red-500" onClick={() => deleteLog(log.id)}>✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td colSpan={2} className="py-2 px-3 text-xs font-semibold text-slate-500">합계</td>
                  <td className="py-2 px-3 text-right tabular-nums text-sm font-bold text-slate-700">
                    {visibleLogs.reduce((s, l) => s + Number(l.work_hours), 0).toFixed(1)} h
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-sm font-bold text-blue-700">
                    {visibleLogs.length > 0 ? Number(visibleLogs[visibleLogs.length - 1].cumulative_hours).toFixed(1) + " h" : "—"}
                  </td>
                  <td colSpan={isAdminOrSubadmin ? 5 : 4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

     {/* ── 인쇄 전용 숨김 영역 ── */}
     <style>{`#compressor-print-inner { display: none; }`}</style>
      <div id="compressor-print-inner">
        <div style={{ fontFamily:"'Malgun Gothic','맑은 고딕',sans-serif", fontSize:"9pt", color:"#000" }}>
          {/* 상단: 회사명 + 기간 */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:3 }}>
            <div style={{ fontSize:"8pt", color:"#555" }}>BONUSMATE</div>
            <div style={{ fontSize:"8pt", color:"#555" }}>{filterFrom} ~ {filterTo}</div>
          </div>
          {/* 제목 */}
          <div style={{ fontSize:"15pt", fontWeight:"bold", textAlign:"center", letterSpacing:"2px", marginBottom:2 }}>
            압 축 공 기 작 업 기 록
          </div>
          {/* 결재란 */}
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:8 }}>
            <div style={{ border:"1px solid #999", width:60, textAlign:"center" }}>
              <div style={{ background:"#f0f0f0", borderBottom:"1px solid #bbb", padding:"3px 0", fontSize:"7.5pt", fontWeight:"bold" }}>확인</div>
              <div style={{ height:36, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"2px 0" }}>
                <img src="/sign-kimyg.png" style={{ height:22, objectFit:"contain" }} alt="김영각" />
                <div style={{ fontSize:"7pt", marginTop:1 }}>김영각</div>
              </div>
            </div>
            <div style={{ border:"1px solid #999", borderLeft:"none", width:60, textAlign:"center" }}>
              <div style={{ background:"#f0f0f0", borderBottom:"1px solid #bbb", padding:"3px 0", fontSize:"7.5pt", fontWeight:"bold" }}>승인</div>
              <div style={{ height:36, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"2px 0" }}>
                <img src="/sign-chods.png" style={{ height:22, objectFit:"contain" }} alt="조대성" />
                <div style={{ fontSize:"7pt", marginTop:1 }}>조대성</div>
              </div>
            </div>
          </div>
          {/* 헤더 정보 테이블 */}
          <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:8, fontSize:"8pt" }}>
            <tbody>
              <tr>
                <td style={{ border:"1px solid #999", padding:"3px 8px", fontWeight:"bold", background:"#f0f0f0", width:72, whiteSpace:"nowrap" }}>필터명</td>
                <td style={{ border:"1px solid #999", padding:"3px 8px" }} colSpan={3}>Airfinn 에어핀 유수분리기 압축공기 콤프레사 필터</td>
              </tr>
              <tr>
                <td style={{ border:"1px solid #999", padding:"3px 8px", fontWeight:"bold", background:"#f0f0f0" }}>설치위치</td>
                <td style={{ border:"1px solid #999", padding:"3px 8px", width:80 }}>기계실</td>
                <td style={{ border:"1px solid #999", padding:"3px 8px", fontWeight:"bold", background:"#f0f0f0", width:48, whiteSpace:"nowrap" }}>용 도</td>
                <td style={{ border:"1px solid #999", padding:"3px 8px" }}>압송탱크 공급</td>
              </tr>
              <tr>
                <td style={{ border:"1px solid #999", padding:"3px 8px", fontWeight:"bold", background:"#f0f0f0" }}>기록담당자</td>
                <td style={{ border:"1px solid #999", padding:"3px 8px" }}>작업자</td>
                <td style={{ border:"1px solid #999", padding:"3px 8px", fontWeight:"bold", background:"#f0f0f0", whiteSpace:"nowrap" }}>확인담당자</td>
                <td style={{ border:"1px solid #999", padding:"3px 8px" }}>생산팀장</td>
              </tr>
            </tbody>
          </table>
          {/* 기록 테이블 */}
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"8pt" }}>
            <thead>
              <tr>
              <th style={{ border:"1px solid #999", padding:"4px 6px", textAlign:"center", background:"#f0f0f0", fontWeight:"bold", whiteSpace:"nowrap", width:24 }}>no</th>
                <th style={{ border:"1px solid #999", padding:"4px 6px", textAlign:"center", background:"#f0f0f0", fontWeight:"bold", whiteSpace:"nowrap", width:72 }}>일 시</th>
                <th style={{ border:"1px solid #999", padding:"4px 6px", textAlign:"center", background:"#f0f0f0", fontWeight:"bold", whiteSpace:"nowrap", width:54 }}>작업시간</th>
                <th style={{ border:"1px solid #999", padding:"4px 6px", textAlign:"center", background:"#f0f0f0", fontWeight:"bold", whiteSpace:"nowrap", width:54 }}>누 계</th>
                <th style={{ border:"1px solid #999", padding:"4px 6px", textAlign:"center", background:"#f0f0f0", fontWeight:"bold", whiteSpace:"nowrap", width:60 }}>파손여부(O,×)</th>
                <th style={{ border:"1px solid #999", padding:"4px 6px", textAlign:"center", background:"#f0f0f0", fontWeight:"bold", whiteSpace:"nowrap", width:44 }}>담 당</th>
                <th style={{ border:"1px solid #999", padding:"4px 6px", textAlign:"center", background:"#f0f0f0", fontWeight:"bold", whiteSpace:"nowrap", width:52 }}>확 인</th>
                <th style={{ border:"1px solid #999", padding:"4px 6px", textAlign:"center", background:"#f0f0f0", fontWeight:"bold" }}>비 고</th>
              </tr>
            </thead>
            <tbody>
            {visibleLogs.map((log, idx) => {
                const signSrc = log.worker_name ? SIGN_MAP[log.worker_name] ?? null : null;
                return (
                  <tr key={log.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ border:"1px solid #bbb", padding:"3px 6px", textAlign:"center", whiteSpace:"nowrap" }}>{idx + 1}</td>
                    <td style={{ border:"1px solid #bbb", padding:"3px 6px", textAlign:"center", whiteSpace:"nowrap" }}>{log.log_date}</td>
                    <td style={{ border:"1px solid #bbb", padding:"3px 6px", textAlign:"right", whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums" }}>{Number(log.work_hours).toFixed(1)} h</td>
                    <td style={{ border:"1px solid #bbb", padding:"3px 6px", textAlign:"right", whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums", fontWeight:"bold" }}>{Number(log.cumulative_hours).toFixed(1)} h</td>
                    <td style={{ border:"1px solid #bbb", padding:"3px 6px", textAlign:"center", whiteSpace:"nowrap", color: log.is_damaged ? "red" : "#000" }}>
                      {log.is_damaged ? "○" : "×"}
                    </td>
                    <td style={{ border:"1px solid #bbb", padding:"3px 6px", textAlign:"center", whiteSpace:"nowrap" }}>{log.worker_name ?? ""}</td>
                    <td style={{ border:"1px solid #bbb", padding:"3px 6px", textAlign:"center" }}>
                      {signSrc
                        ? <><img src={signSrc} style={{ height:20, objectFit:"contain", display:"block", margin:"0 auto" }} alt={log.worker_name ?? ""} /><div style={{ fontSize:"6pt", marginTop:1 }}>{log.worker_name}</div></>
                        : log.worker_name ?? ""}
                    </td>
                    <td style={{ border:"1px solid #bbb", padding:"3px 6px" }}>{log.note ?? ""}</td>
                  </tr>
                );
              })}
              {Array.from({ length: Math.max(0, 20 - visibleLogs.length) }).map((_, i) => (
                <tr key={`empty-${i}`} style={{ background: (visibleLogs.length + i) % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ border:"1px solid #bbb", padding:"3px 6px", textAlign:"center", whiteSpace:"nowrap" }}>{visibleLogs.length + i + 1}</td>
                  <td style={{ border:"1px solid #bbb", padding:"3px 6px" }}></td>
                  <td style={{ border:"1px solid #bbb", padding:"3px 6px" }}></td>
                  <td style={{ border:"1px solid #bbb", padding:"3px 6px" }}></td>
                  <td style={{ border:"1px solid #bbb", padding:"3px 6px" }}></td>
                  <td style={{ border:"1px solid #bbb", padding:"3px 6px" }}></td>
                  <td style={{ border:"1px solid #bbb", padding:"3px 6px" }}></td>
                  <td style={{ border:"1px solid #bbb", padding:"3px 6px" }}></td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* 하단 출력일시 */}
          <div style={{ marginTop:8, fontSize:"7.5pt", color:"#555", display:"flex", justifyContent:"space-between" }}>
            <span>* 본 문서는 BONUSMATE ERP에서 자동 생성되었습니다.</span>
            <span>출력일시: {new Date().toLocaleString("ko-KR", { timeZone:"Asia/Seoul" })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════════════
// PET 수불부
// ═══════════════════════════════════════════════════════════
export function PetLedgerTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";
  const [logs, setLogs] = useState<PetStockLog[]>([]);
  const [stock, setStock] = useState<PetStock | null>(null);
  const filterYearMonth = (() => {
    const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  })();
  const [allLogs, setAllLogs] = useState<PetStockLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);

  // 인쇄용 state
  const [printFrom, setPrintFrom] = useState(() => {
    const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    d.setDate(1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [printTo, setPrintTo] = useState(() => {
    const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [printLoading, setPrintLoading] = useState(false);
 
  const [saleCutDate, setSaleCutDate] = useState(() => {
    const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [saleCutQty, setSaleCutQty] = useState("");
  const [saleCutSaving, setSaleCutSaving] = useState(false);
  const [editingSaleCut, setEditingSaleCut] = useState<{ logId: string; qty: string } | null>(null);
  const [adjustingPet, setAdjustingPet] = useState<{ logId: string; inputQty: string; currentCumRaw: number } | null>(null);
  const [adjustPetSaving, setAdjustPetSaving] = useState(false);
  const [printUsedPopup, setPrintUsedPopup] = useState<{
    note: string | null;
    woInfo: { work_order_no: string; client_name: string; product_name: string; food_type: string | null } | null;
    loading: boolean;
  } | null>(null);

  async function openPrintUsedPopup(note: string | null) {
    setPrintUsedPopup({ note, woInfo: null, loading: true });
    const match = (note ?? "").match(/WO-[\w-]+/);
    if (!match) { setPrintUsedPopup({ note, woInfo: null, loading: false }); return; }
    const woNo = match[0];
    const { data } = await supabase.from("work_orders")
      .select("work_order_no, client_name, product_name, food_type, work_order_items(sub_items)")
      .eq("work_order_no", woNo)
      .maybeSingle();
    if (data) {
      const items = ((data as any).work_order_items ?? []) as { sub_items: { name: string; qty: number }[] }[];
      const filtered = items.filter((item) => {
        const n = (item.sub_items?.[0]?.name ?? "").trim();
        return n && !n.startsWith("성형틀") && !n.startsWith("인쇄제판")
          && !n.startsWith("아이스박스") && !n.startsWith("택배비") && !n.startsWith("퀵");
      });
      const firstName = filtered[0]?.sub_items?.[0]?.name ?? (data as any).product_name ?? "";
      const rest = Math.max(0, filtered.length - 1);
      const displayName = firstName && rest > 0 ? `${firstName} 외 ${rest}건` : firstName;
      setPrintUsedPopup({ note, woInfo: { ...(data as any), product_name: displayName }, loading: false });
    } else {
      setPrintUsedPopup({ note, woInfo: null, loading: false });
    }
  }
  const [editSaleCutSaving, setEditSaleCutSaving] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinPendingAction, setPinPendingAction] = useState<((name: string) => void) | null>(null);

  useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees((data ?? []) as any));
  }, []);

  function requirePin(action: (name: string) => void) {
    setPinPendingAction(() => (name: string) => action(name));
    setShowPinModal(true);
  }
  const [fLogType, setFLogType] = useState("incoming");
  const [fLogDate, setFLogDate] = useState(() => {
    const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [fQty, setFQty] = useState("");
  const [fDefectQty, setFDefectQty] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function printPetLedger() {
    if (!printFrom || !printTo || printFrom > printTo) return showToast("기간을 확인하세요.", "error");
    setPrintLoading(true);

    // printFrom 이전까지 누적 재고
    const prevEndDate = new Date(printFrom + "T00:00:00+09:00");
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    const prevEndStr = prevEndDate.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

    const [prevRes, rangeRes] = await Promise.all([
      supabase.from("pet_stock_logs").select("log_type,quantity").lte("log_date", prevEndStr),
      supabase.from("pet_stock_logs").select("*")
        .gte("log_date", printFrom).lte("log_date", printTo)
        .order("log_date", { ascending: true }).order("created_at", { ascending: true }),
    ]);

    if (!rangeRes.data || rangeRes.data.length === 0) {
      setPrintLoading(false);
      return alert("해당 기간에 PET 수불 내역이 없습니다.");
    }

    let cumRaw = 10724, cumCoating = 519, cumSprayProd = 3343, cumSpraySale = 0;
    for (const log of prevRes.data ?? []) {
      if      (log.log_type === "incoming")        cumRaw       += log.quantity;
      else if (log.log_type === "coating_done")    { cumRaw -= log.quantity; cumCoating   += log.quantity; }
      else if (log.log_type === "spray_done_prod") { cumCoating -= log.quantity; cumSprayProd += log.quantity; }
      else if (log.log_type === "spray_done_sale") { cumCoating -= log.quantity; cumSpraySale += log.quantity; }
      else if (log.log_type === "sale_cut")        cumSpraySale -= log.quantity;
      else if (log.log_type === "print_used_prod") cumSprayProd -= log.quantity;
      else if (log.log_type === "print_used_sale") cumSpraySale -= log.quantity;
      else if (log.log_type === "transfer_used")   cumRaw       -= log.quantity;
      else if (log.log_type === "adjustment")       cumRaw       += log.quantity;
    }

    const days = ["일","월","화","수","목","금","토"];
    const fmt = (v: number) => v !== 0 ? v.toLocaleString() : "";
    const tdS = `border:1px solid #bbb;padding:3px 5px;font-size:8pt;vertical-align:middle;`;
    const tdR = `${tdS}text-align:right;font-variant-numeric:tabular-nums;`;
    const tdC = `${tdS}text-align:center;`;
    const thS = `border:1px solid #999;padding:4px 5px;font-size:7.5pt;font-weight:bold;background:#f0f0f0;text-align:center;white-space:nowrap;`;

    let rows = ``;

    let rowNo = 1;
    for (const log of rangeRes.data as PetStockLog[]) {
      if      (log.log_type === "incoming")        cumRaw       += log.quantity;
      else if (log.log_type === "coating_done")    { cumRaw -= log.quantity; cumCoating   += log.quantity; }
      else if (log.log_type === "spray_done_prod") { cumCoating -= log.quantity; cumSprayProd += log.quantity; }
      else if (log.log_type === "spray_done_sale") { cumCoating -= log.quantity; cumSpraySale += log.quantity; }
      else if (log.log_type === "sale_cut")        cumSpraySale -= log.quantity;
      else if (log.log_type === "print_used_prod") cumSprayProd -= log.quantity;
      else if (log.log_type === "print_used_sale") cumSpraySale -= log.quantity;
      else if (log.log_type === "transfer_used")   cumRaw       -= log.quantity;
      else if (log.log_type === "adjustment")       cumRaw       += log.quantity;

      // 보정 행은 인쇄에서 제외
      if (log.log_type === "adjustment" || (log.note ?? "").includes("초기재고 보정")) continue;

      const d = new Date(log.log_date + "T00:00:00+09:00");
      const dateLabel = `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
      const typeLabel = PET_LOG_TYPE_LABELS[log.log_type] ?? log.log_type;

      rows += `
        <tr>
          <td style="${tdC}">${rowNo++}</td>
          <td style="${tdC}">${dateLabel}</td>
          <td style="${tdR}">${log.log_type === "incoming"        ? fmt(log.quantity) : ""}</td>
          <td style="${tdR}">${log.log_type === "transfer_used"   ? fmt(log.quantity) : ""}</td>
          <td style="${tdR}">${log.log_type === "coating_done"    ? fmt(log.quantity) : ""}</td>
     <td style="${tdR}">${(log.log_type === "spray_done_prod" || log.log_type === "spray_done_sale") ? fmt(log.quantity) : ""}</td>
          <td style="${tdR}">${log.log_type === "sale_cut"        ? fmt(log.quantity) : ""}</td>
          <td style="${tdR}">${(log.log_type === "print_used_prod" || log.log_type === "print_used_sale") ? fmt(log.quantity) : ""}</td>
          <td style="${tdR}">${cumRaw.toLocaleString()}</td>
          <td style="${tdR}">${cumCoating.toLocaleString()}</td>
          <td style="${tdR}">${(cumSprayProd + cumSpraySale).toLocaleString()}</td>
        </tr>`;
    }

    const fromD = new Date(printFrom + "T00:00:00+09:00");
    const toD   = new Date(printTo   + "T00:00:00+09:00");
    const periodLabel = `${fromD.getFullYear()}년 ${fromD.getMonth()+1}월 ${fromD.getDate()}일 ~ ${toD.getFullYear()}년 ${toD.getMonth()+1}월 ${toD.getDate()}일`;

    const html = `
      <style>
        @page { size: A4 landscape; margin: 12mm 15mm; }
        body { margin:0; font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:9pt; color:#000; }
        * { box-sizing:border-box; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
        table { border-collapse:collapse; width:100%; }
        tr:nth-child(even) { background:#fafafa; }
        tr:nth-child(even) td { background:#fafafa; }
      </style>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:3px;">
        <div style="font-size:8pt;color:#555;">BONUSMATE</div>
        <div style="font-size:8pt;color:#555;">${periodLabel}</div>
      </div>
      <div style="font-size:15pt;font-weight:bold;text-align:center;letter-spacing:2px;margin-bottom:2px;">부 자 재 수 불 부</div>
      <div style="font-size:8.5pt;text-align:center;color:#333;margin-bottom:8px;">[ 원료명 : PET / 단위 EA ]</div>
     <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
        <div style="border:1px solid #999;width:60px;text-align:center;">
          <div style="background:#f0f0f0;border-bottom:1px solid #bbb;padding:3px 0;font-size:7.5pt;font-weight:bold;">확인</div>
          <div style="height:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <img src="/sign-kimyg.png" style="height:22px;object-fit:contain;" alt="김영각"/>
            <div style="font-size:7pt;margin-top:1px;">김영각</div>
          </div>
        </div>
        <div style="border:1px solid #999;border-left:none;width:60px;text-align:center;">
          <div style="background:#f0f0f0;border-bottom:1px solid #bbb;padding:3px 0;font-size:7.5pt;font-weight:bold;">승인</div>
          <div style="height:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <img src="/sign-chods.png" style="height:22px;object-fit:contain;" alt="조대성"/>
            <div style="font-size:7pt;margin-top:1px;">조대성</div>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="${thS}" rowspan="2">No</th>
            <th style="${thS}" rowspan="2">일자</th>
         <th style="${thS}" colspan="6">사용량</th>
            <th style="${thS}" colspan="3">당일재고량</th>
          </tr>
          <tr>
            <th style="${thS}">입고</th>
            <th style="${thS}">전사</th>
            <th style="${thS}">코팅</th>
          <th style="${thS}">분사</th>
            <th style="${thS}">재단</th>
            <th style="${thS}">인쇄</th>
           <th style="${thS}">PET</th>
            <th style="${thS}">코팅완료</th>
            <th style="${thS}">분사완료</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:8px;font-size:7.5pt;color:#555;display:flex;justify-content:space-between;">
        <span>* 본 문서는 BONUSMATE ERP에서 자동 생성되었습니다.</span>
        <span>출력일시: ${new Date().toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</span>
      </div>`;

    setPrintLoading(false);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>PET수불부_${printFrom}_${printTo}</title></head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const today = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    const to = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    const from = "2026-05-19";
    const [logRes, stockRes] = await Promise.all([
      supabase.from("pet_stock_logs").select("*").lte("log_date", to).order("log_date", { ascending: true }),
      supabase.from("v_pet_stock").select("*").single(),
    ]);
    setDateRange({ from, to });
    setAllLogs((logRes.data ?? []) as PetStockLog[]);
    setLogs((logRes.data ?? []) as PetStockLog[]);
    setStock(stockRes.data as PetStock ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function doSaveSaleCut(actionBy: string) {
    if (!saleCutQty || Number(saleCutQty) <= 0) return showToast("재단 수량을 입력하세요.", "error");
    if (!saleCutDate) return showToast("날짜를 선택하세요.", "error");
    setSaleCutSaving(true);
    const { error } = await supabase.from("pet_stock_logs").insert({
      log_date: saleCutDate, log_type: "sale_cut", quantity: Number(saleCutQty),
      defect_qty: 0, note: `재단판매 — ${actionBy}`, created_by: userId,
    });
    setSaleCutSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 재단 기록 완료!");
    setSaleCutQty("");
    loadData();
  }

  function saveSaleCut() {
    if (!saleCutQty || Number(saleCutQty) <= 0) return showToast("재단 수량을 입력하세요.", "error");
    requirePin((name) => doSaveSaleCut(name));
  }

  async function doEditSaleCut(logId: string, qty: string, actionBy: string) {
    if (!qty || Number(qty) <= 0) return showToast("수량을 입력하세요.", "error");
    setEditSaleCutSaving(true);
    const { error } = await supabase.from("pet_stock_logs").update({
      quantity: Number(qty),
      note: `재단판매 — ${actionBy}`,
    }).eq("id", logId);
    setEditSaleCutSaving(false);
    if (error) return showToast("수정 실패: " + error.message, "error");
    showToast("✅ 재단 수정 완료!");
    setEditingSaleCut(null);
    loadData();
  }

  function editSaleCut(logId: string, qty: string) {
    requirePin((name) => doEditSaleCut(logId, qty, name));
  }

  async function doEditIncoming(logId: string, qty: string, actionBy: string) {
    if (!qty || Number(qty) <= 0) return showToast("수량을 입력하세요.", "error");
    setEditSaleCutSaving(true);
    const { error } = await supabase.from("pet_stock_logs").update({
      quantity: Number(qty),
      note: `입고등록(수정) — ${actionBy}`,
    }).eq("id", logId);
    setEditSaleCutSaving(false);
    if (error) return showToast("수정 실패: " + error.message, "error");
    showToast("✅ 입고 수정 완료!");
    setEditingSaleCut(null);
    loadData();
  }

  function editIncoming(logId: string, qty: string) {
    requirePin((name) => doEditIncoming(logId, qty, name));
  }

  function deleteIncoming(logId: string) {
    if (!confirm("이 입고 기록을 삭제하시겠습니까?")) return;
    requirePin(async () => {
      const { error } = await supabase.from("pet_stock_logs").delete().eq("id", logId);
      if (error) return showToast("삭제 실패: " + error.message, "error");
      showToast("🗑️ 삭제 완료!");
      loadData();
    });
  }

  async function doSaveLog(actionBy: string) {
    setSaving(true);
    const note = `입고등록 — ${actionBy}`;
    const { error } = await supabase.from("pet_stock_logs").insert({
      log_date: fLogDate, log_type: fLogType, quantity: Number(fQty),
      defect_qty: 0, note, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ PET 입고 등록 완료!");
    setFQty("");
    loadData();
  }

  function saveLog() {
    if (!fQty || Number(fQty) <= 0) return showToast("입고 수량을 입력하세요.", "error");
    requirePin((name) => doSaveLog(name));
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("pet_stock_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!"); loadData();
  }

  // 날짜별 누적 재고 계산
  const logRows = (() => {
    // 해당 월 이전 누적값 먼저 계산
    const monthFrom = dateRange?.from ?? `${filterYearMonth}-01`;
    let cumRaw = 10724, cumCoating = 519, cumSprayProd = 3343, cumSpraySale = 0;
    for (const log of allLogs.filter(l => l.log_date < monthFrom)) {
      if (log.log_type === "incoming") cumRaw += log.quantity;
      else if (log.log_type === "coating_done") { cumRaw -= log.quantity; cumCoating += log.quantity; }
      else if (log.log_type === "spray_done_prod") { cumCoating -= log.quantity; cumSprayProd += log.quantity; }
      else if (log.log_type === "spray_done_sale") { cumCoating -= log.quantity; cumSpraySale += log.quantity; }
      else if (log.log_type === "sale_cut") cumSpraySale -= log.quantity;
      else if (log.log_type === "print_used_prod") cumSprayProd -= log.quantity;
      else if (log.log_type === "print_used_sale") cumSpraySale -= log.quantity;
      else if (log.log_type === "transfer_used") cumRaw -= log.quantity;
      else if (log.log_type === "adjustment")    cumRaw += log.quantity;
    }
    // 해당 월 로그 각 건별로 누적 계산
    const monthLogs = allLogs.filter(l => l.log_date >= monthFrom && l.log_date <= (dateRange?.to ?? "9999-99-99"));
    return monthLogs.map(log => {
      if (log.log_type === "incoming") cumRaw += log.quantity;
      else if (log.log_type === "coating_done") { cumRaw -= log.quantity; cumCoating += log.quantity; }
      else if (log.log_type === "spray_done_prod") { cumCoating -= log.quantity; cumSprayProd += log.quantity; }
      else if (log.log_type === "spray_done_sale") { cumCoating -= log.quantity; cumSpraySale += log.quantity; }
      else if (log.log_type === "sale_cut") cumSpraySale -= log.quantity;
      else if (log.log_type === "print_used_prod") cumSprayProd -= log.quantity;
      else if (log.log_type === "print_used_sale") cumSpraySale -= log.quantity;
      else if (log.log_type === "transfer_used") cumRaw -= log.quantity;
      else if (log.log_type === "adjustment")    cumRaw += log.quantity;
      return {
        log,
        cumRaw, cumCoating, cumSprayProd, cumSpraySale,
      };
    });
  })();

  return (
    <div className="space-y-4">
    {printUsedPopup && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
        onClick={() => setPrintUsedPopup(null)}>
        <div className="w-full max-w-[360px] rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">🎞️ 인쇄 투입 작업지시서</span>
            <button className="text-slate-400 hover:text-slate-600 text-xs" onClick={() => setPrintUsedPopup(null)}>✕</button>
          </div>
          <div className="px-4 py-4">
            {printUsedPopup.loading ? (
              <div className="py-4 text-center text-sm text-slate-400">조회 중...</div>
            ) : printUsedPopup.woInfo ? (
              <div className="space-y-2">
                <div className="flex gap-2 text-sm">
                  <span className="text-slate-400 w-20 shrink-0">거래처</span>
                  <span className="font-semibold text-slate-800">{printUsedPopup.woInfo.client_name}</span>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-slate-400 w-20 shrink-0">제품명</span>
                  <span className="text-slate-700">{printUsedPopup.woInfo.product_name}</span>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-slate-400 w-20 shrink-0">식품유형</span>
                  <span className="text-slate-700">{printUsedPopup.woInfo.food_type ?? "—"}</span>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-slate-400 w-20 shrink-0">작업지시서</span>
                  <span className="font-mono text-xs text-slate-500">{printUsedPopup.woInfo.work_order_no}</span>
                </div>
              </div>
            ) : (
              <div className="py-2 text-sm text-slate-400">
                {printUsedPopup.note
                  ? <><div className="mb-1">연결된 작업지시서를 찾을 수 없습니다.</div><div className="text-xs text-slate-300">{printUsedPopup.note}</div></>
                  : "note 정보가 없습니다."}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    <div className={`${card} p-4`}>
      <div className="flex flex-wrap gap-3 items-end">
      <button className={btn} onClick={loadData}>🔄 조회</button>
        <div className="flex items-center gap-1.5">
          <input type="date"
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:border-violet-400"
            value={printFrom} onChange={(e) => setPrintFrom(e.target.value)} />
          <span className="text-xs text-slate-400">~</span>
          <input type="date"
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:border-violet-400"
            value={printTo} onChange={(e) => setPrintTo(e.target.value)} />
          <button
            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
            disabled={printLoading}
            onClick={printPetLedger}>
            {printLoading ? "조회 중..." : "🖨️ 인쇄"}
          </button>
        </div>
        </div>
      </div>
     
      
      {showPinModal && (
        <PinModal
          employees={employees.filter((e) => e.name !== null) as any}
          title="본인 확인"
          onSuccess={(empId, empName) => {
            setShowPinModal(false);
            if (pinPendingAction) { pinPendingAction(empName); setPinPendingAction(null); }
          }}
          onCancel={() => { setShowPinModal(false); setPinPendingAction(null); }}
        />
      )}

<div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm text-blue-700">📥 PET 입고 등록</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-slate-500">입고일 *</div>
            <input type="date" className={inp} value={fLogDate}
              onChange={(e) => setFLogDate(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">입고 수량 (EA) *</div>
            <input className={inpR} inputMode="numeric" value={fQty}
              onChange={(e) => setFQty(e.target.value.replace(/[^\d]/g, ""))} placeholder="예: 1000" />
          </div>
        </div>
        <div className="mt-3">
          <button
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={saving}
            onClick={saveLog}>
            {saving ? "저장 중..." : "💾 입고 등록"}
          </button>
        </div>
      </div>

      <div className={`${card} p-4`}>
      <div className="mb-3 font-semibold text-sm">📋 PET 수불부 — {dateRange ? `${dateRange.from} ~ ${dateRange.to}` : ""}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
         : logRows.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" style={{ minWidth: 680 }}>
                <thead>
                  <tr className="bg-slate-50">
                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-center text-[11px] font-semibold text-slate-500 align-middle whitespace-nowrap">일자</th>
                    <th colSpan={6} className="border border-slate-200 px-2 py-1 text-center text-[11px] font-semibold text-slate-500">사용량</th>
                    <th colSpan={3} className="border border-slate-200 px-2 py-1 text-center text-[11px] font-semibold text-slate-500">당일재고량</th>
                  </tr>
                  <tr className="bg-slate-50">
                  {["입고","전사","코팅","분사","재단","인쇄"].map(h => (
                      <th key={h} className="border border-slate-200 px-2 py-1 text-center text-[11px] font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                    {["PET","코팅완료","분사완료"].map(h => (
                      <th key={h} className="border border-slate-200 px-2 py-1 text-center text-[11px] font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                {logRows.filter(({ log }) =>
                    log.log_type !== "adjustment" &&
                    !(log.note ?? "").includes("초기재고 보정")
                  ).map(({ log, cumRaw, cumCoating, cumSprayProd, cumSpraySale }, idx) => {
                    const d = new Date(log.log_date + "T00:00:00+09:00");
                    const dateLabel = `${d.getMonth()+1}/${d.getDate()}`;
                    const isEven = idx % 2 === 0;
                    const isSaleCut = log.log_type === "sale_cut";
                    const isEditing = isSaleCut && editingSaleCut?.logId === log.id;
                    return (
                      <tr key={log.id} className={isEven ? "bg-white" : "bg-slate-50/50"}>
                        <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500 whitespace-nowrap">{dateLabel}</td>
                        {(() => {
                          const isIncoming = log.log_type === "incoming";
                          const isEditingIncoming = isIncoming && editingSaleCut?.logId === log.id;
                          if (isEditingIncoming && editingSaleCut) {
                            return (
                              <td className="border border-slate-200 px-1 py-1">
                                <div className="flex items-center gap-1">
                                  <input
                                    className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-right tabular-nums focus:border-blue-400 focus:outline-none"
                                    inputMode="numeric"
                                    value={editingSaleCut.qty}
                                    onChange={(e) => setEditingSaleCut({ ...editingSaleCut, qty: e.target.value.replace(/[^\d]/g, "") })}
                                  />
                                  <button className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                                    disabled={editSaleCutSaving}
                                    onClick={() => editIncoming(editingSaleCut.logId, editingSaleCut.qty)}
                                  >{editSaleCutSaving ? "..." : "저장"}</button>
                                  <button className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-50"
                                    onClick={() => setEditingSaleCut(null)}>취소</button>
                                </div>
                              </td>
                            );
                          }
                          if (isIncoming) {
                            return (
                              <td className="border border-slate-200 px-2 py-1.5">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-xs text-blue-700 font-semibold tabular-nums">{log.quantity.toLocaleString()}</span>
                                  <button className="text-[9px] text-slate-300 hover:text-blue-400" title="수정"
                                    onClick={() => setEditingSaleCut({ logId: log.id, qty: String(log.quantity) })}>✎</button>
                                  <button className="text-[9px] text-slate-300 hover:text-red-500" title="삭제"
                                    onClick={() => deleteIncoming(log.id)}>✕</button>
                                </div>
                              </td>
                            );
                          }
                          return <td className="border border-slate-200 px-2 py-1.5"></td>;
                        })()}
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums text-slate-700">
                          {log.log_type === "transfer_used" ? log.quantity.toLocaleString() : ""}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums text-red-600">
                          {log.log_type === "coating_done" ? log.quantity.toLocaleString() : ""}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums text-red-600">
                          {(log.log_type === "spray_done_prod" || log.log_type === "spray_done_sale") ? log.quantity.toLocaleString() : ""}
                        </td>
                        {/* 재단 셀 */}
                        {isSaleCut && isEditing && editingSaleCut ? (
                          <td className="border border-slate-200 px-1 py-1">
                            <div className="flex items-center gap-1">
                              <input
                                className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-right tabular-nums focus:border-purple-400 focus:outline-none"
                                inputMode="numeric"
                                value={editingSaleCut.qty}
                                onChange={(e) => setEditingSaleCut({ ...editingSaleCut, qty: e.target.value.replace(/[^\d]/g, "") })}
                              />
                              <button className="rounded border border-purple-300 bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-60"
                                disabled={editSaleCutSaving}
                                onClick={() => editSaleCut(editingSaleCut.logId, editingSaleCut.qty)}
                              >{editSaleCutSaving ? "..." : "저장"}</button>
                              <button className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-50"
                                onClick={() => setEditingSaleCut(null)}>취소</button>
                            </div>
                          </td>
                        ) : isSaleCut ? (
                          <td className="border border-slate-200 px-2 py-1.5">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs text-red-600 tabular-nums">{log.quantity.toLocaleString()}</span>
                              <button className="text-[9px] text-slate-300 hover:text-blue-400" title="수정"
                                onClick={() => setEditingSaleCut({ logId: log.id, qty: String(log.quantity) })}>✎</button>
                              <button className="text-[9px] text-slate-300 hover:text-red-500" title="삭제"
                                onClick={() => {
                                  if (!confirm("이 재단 기록을 삭제하시겠습니까?")) return;
                                  requirePin(async () => {
                                    const { error } = await supabase.from("pet_stock_logs").delete().eq("id", log.id);
                                    if (error) return showToast("삭제 실패: " + error.message, "error");
                                    showToast("🗑️ 삭제 완료!");
                                    loadData();
                                  });
                                }}>✕</button>
                            </div>
                          </td>
                       ) : (
                        <td className="border border-slate-200 px-2 py-1.5"></td>
                      )}
                     {/* 인쇄 셀 */}
                     <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums text-red-600">
                        {(log.log_type === "print_used_prod" || log.log_type === "print_used_sale") ? (
                          <button
                            className="underline underline-offset-2 decoration-dotted hover:text-red-800 cursor-pointer"
                            onClick={() => openPrintUsedPopup(log.note)}
                          >
                            {log.quantity.toLocaleString()}
                          </button>
                        ) : ""}
                      </td>
                       {/* PET 열 — 클릭 시 수량 조정 */}
                       {adjustingPet?.logId === log.id ? (
                          <td className="border border-slate-200 px-1 py-1" colSpan={1}>
                            <div className="flex items-center gap-1">
                              <input
                                className="w-20 rounded border border-amber-300 px-1.5 py-0.5 text-xs text-right tabular-nums focus:border-amber-500 focus:outline-none"
                                inputMode="numeric"
                                placeholder={cumRaw.toLocaleString()}
                                value={adjustingPet.inputQty}
                                onChange={(e) => setAdjustingPet({ ...adjustingPet, inputQty: e.target.value.replace(/[^\d]/g, "") })}
                              />
                              <button
                                className="rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                                disabled={adjustPetSaving}
                                onClick={() => {
                                  const inputVal = Number(adjustingPet.inputQty);
                                  if (!adjustingPet.inputQty || isNaN(inputVal)) return showToast("수량을 입력하세요.", "error");
                                  const delta = inputVal - adjustingPet.currentCumRaw;
                                  if (delta === 0) { setAdjustingPet(null); return showToast("현재고와 동일합니다.", "error"); }
                                  requirePin(async (actionBy) => {
                                    setAdjustPetSaving(true);
                                    const { error } = await supabase.from("pet_stock_logs").insert({
                                      log_date: log.log_date,
                                      log_type: "adjustment",
                                      quantity: delta,
                                      defect_qty: 0,
                                      note: `PET재고조정 — ${actionBy} (${adjustingPet.currentCumRaw.toLocaleString()}→${inputVal.toLocaleString()})`,
                                      created_by: userId,
                                    });
                                    setAdjustPetSaving(false);
                                    if (error) return showToast("저장 실패: " + error.message, "error");
                                    showToast(`✅ PET 재고 조정 완료 (${delta > 0 ? "+" : ""}${delta.toLocaleString()})`);
                                    setAdjustingPet(null);
                                    loadData();
                                  });
                                }}
                              >{adjustPetSaving ? "..." : "저장"}</button>
                              <button
                                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-50"
                                onClick={() => setAdjustingPet(null)}
                              >취소</button>
                            </div>
                          </td>
                        ) : (
                          <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800">
                            <button
                              className="tabular-nums font-semibold text-slate-800 hover:text-amber-600 hover:underline decoration-dotted underline-offset-2 transition-colors"
                              title="클릭하여 재고 조정"
                              onClick={() => setAdjustingPet({ logId: log.id, inputQty: "", currentCumRaw: cumRaw })}
                            >{cumRaw.toLocaleString()}</button>
                          </td>
                        )}
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800">{cumCoating.toLocaleString()}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800">{(cumSprayProd + cumSpraySale).toLocaleString()}</td>
                      </tr>
                    );
                  })}
              </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
