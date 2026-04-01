"use client";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "거래원장 | BONUSMATE ERP" };

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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


type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
  ceo_name: string | null;
  biz_type: string | null;
  biz_item: string | null;
  phone: string | null;
  address1: string | null;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  ship_date: string | null;
  ship_method: string | null;
  memo: string | null;
  total_amount: number | null;
  created_at: string;
};

type LedgerRow = {
  id: string;
  entry_date: string;
  entry_ts: string | null;
  direction: "IN" | "OUT" | string;
  amount: number;
  category: string | null;
  method: string | null;
  memo: string | null;
  partner_id: string | null;
  counterparty_name: string | null;
  business_no: string | null;
  created_at: string;
};

type LineLoose = Record<string, any>;

type StatementRow = {
  date: string;
  kind: "입금" | "출고";
  itemName: string;
  qty: number | null;
  unitPrice: number | null;
  supply: number | null;
  vat: number | null;
  tradeAmount: number | null; // ✅ 거래금액(공급가+부가세)
  payment: number | null; // ✅ 결제(입금) 표시용
  amountSigned: number; // 잔액 계산용(입금 +, 출고 -)
  balance: number; // 누적 잔액
  remark: string; // ✅ 비고(주문자)

  // ✅ 정렬용(표시에는 사용 안함)
  sortTs?: string | null; // 실제 입력/생성 시간
  sortSeq?: number; // 같은 시각 내 라인 순서

  // ✅ 주문/출고(orders) 묶음 표시 제어용
  groupId?: string | null; // order_id
  groupLast?: boolean; // 같은 주문/출고 입력 건의 "마지막 라인" 여부
};

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(ymd: string, delta: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
}

function safeJsonParse<T>(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function extractOrderer(raw: string | null) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const obj = safeJsonParse<{ orderer_name?: string | null }>(s);
  if (obj && typeof obj === "object") {
    const orderer = String(obj.orderer_name ?? "").trim();
    return orderer ? `주문자:${orderer}` : "";
  }
  return "";
}

// ---- order_lines 컬럼명이 프로젝트마다 다를 수 있어 후보키를 안전하게 매핑 ----
function pickString(row: LineLoose, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return fallback;
}
function pickNumber(row: LineLoose, keys: string[], fallback = 0) {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return fallback;
}

/**
 * 라인 단위 공급가/부가세/합계는:
 * 1) line에 supply_amount/vat_amount/total_amount가 있으면 그대로 사용
 * 2) 없으면 qty*unitPrice로 공급가 만들고, 부가세=0 (세율/면세 판단 불가)
 */
function mapLineToAmounts(line: LineLoose) {
  const itemName = pickString(line, ["item_name", "product_name", "variant_name", "name", "title", "product_title"], "");
  const qty = pickNumber(line, ["qty", "quantity", "ea", "count"], 0);
  let unitPrice = pickNumber(line, ["unit_price", "price", "unitPrice"], 0);

  const supplyRaw = pickNumber(line, ["supply_amount", "supply", "supplyValue", "amount_supply"], Number.NaN);
  const vatRaw = pickNumber(line, ["vat_amount", "vat", "vatValue", "amount_vat"], Number.NaN);
  const totalRaw = pickNumber(line, ["total_amount", "total", "line_total", "amount_total"], Number.NaN);

  let supply = Number.isFinite(supplyRaw) ? supplyRaw : qty * unitPrice;
  let vat = Number.isFinite(vatRaw) ? vatRaw : 0;
  let total = Number.isFinite(totalRaw) ? totalRaw : supply + vat;

  // 혹시 total만 있고 supply/vat가 없는 경우: supply=total, vat=0
  if (!Number.isFinite(supplyRaw) && Number.isFinite(totalRaw) && !Number.isFinite(vatRaw)) {
    supply = totalRaw;
    vat = 0;
    total = totalRaw;
  }

  // ✅ 단가가 비어있는 경우(현재 화면에서 단가 0 표시 문제) 공급가/수량으로 역산
  // - 공급가/수량이 정수로 떨어지는 케이스(예: 227,360 / 1,624 = 140)에 맞춤
  if ((unitPrice === 0 || !Number.isFinite(unitPrice)) && qty > 0 && Number.isFinite(supply) && supply > 0) {
    unitPrice = Math.round(supply / qty);
  }

  return { itemName, qty, unitPrice, supply, vat, total };
}

function csvEscape(s: string) {
  const v = String(s ?? "");
  if (v.includes('"') || v.includes(",") || v.includes("\n") || v.includes("\r")) return `"${v.replaceAll('"', '""')}"`;
  return v;
}

export default function StatementClient() {
  const supabase = useMemo(() => createClient(), []);
  const sp = useSearchParams();
  const router = useRouter();

  const qpPartnerId = sp.get("partner_id") || sp.get("partnerId") || "";
  const qpFrom = sp.get("from") || "";
  const qpTo = sp.get("to") || "";

  const [msg, setMsg] = useState<string | null>(null);

  const [newWoNotifications, setNewWoNotifications] = useState<NewWoNotification[]>([]);
const [showNewWoModal, setShowNewWoModal] = useState(false);
const insertChannelRef = useRef<RealtimeChannel | null>(null);
const pageLoadTimeRef = useRef<string>(new Date().toISOString());

useEffect(() => {
  const channel = supabase
    .channel("wo_statement_insert_notify")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "work_orders" }, (payload) => {
      const d = payload.new as Record<string, unknown>;
      const createdAt = String(d.created_at ?? "");
      if (createdAt && createdAt < pageLoadTimeRef.current) return;
      setNewWoNotifications((prev) => [{ id: String(d.id ?? ""), client_name: String(d.client_name ?? ""), product_name: String(d.product_name ?? ""), work_order_no: String(d.work_order_no ?? ""), order_date: String(d.order_date ?? ""), created_at: createdAt }, ...prev]);
      setShowNewWoModal(true);
      playNotificationSound();
    })
    .subscribe((status, err) => { console.log("🔔 [statement INSERT채널]", status, err ?? ""); });
  insertChannelRef.current = channel;
  return () => { supabase.removeChannel(channel); insertChannelRef.current = null; };
}, []); // eslint-disable-line

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [partnerId, setPartnerId] = useState<string>(qpPartnerId);
  const [fromYMD, setFromYMD] = useState<string>(qpFrom || addDays(todayYMD(), -30));
  const [toYMD, setToYMD] = useState<string>(qpTo || todayYMD());

  // ✅ 거래처 “입력 검색”용
  const [partnerQuery, setPartnerQuery] = useState<string>("");

  // ✅ 드롭다운 열림/닫힘(선택 후에도 "검색결과없음" 창이 남는 문제 해결용)
  const [partnerOpen, setPartnerOpen] = useState(false);
  const partnerWrapRef = useRef<HTMLDivElement | null>(null);
  const blurTimerRef = useRef<number | null>(null);

  const selectedPartner = useMemo(() => partners.find((p) => p.id === partnerId) ?? null, [partners, partnerId]);

  const [rows, setRows] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ 기간 시작 전까지 누적(= 시작 잔액). 기간에 내역이 하나도 없어도 미수/선수금 계산에 필요
  const [startBalance, setStartBalance] = useState<number>(0);

  const OUR = {
    name: "주식회사 보누스메이트",
    business_no: "343-88-03009",
    ceo: "조대성",
    address1: "경기도 파주시 광탄면 장지산로 250-90 1층",
    biz: "제조업 / 업태: 식품제조가공업",
  };

  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";

  async function loadPartners() {
    const { data, error } = await supabase
      .from("partners")
      .select("id,name,business_no,ceo_name,biz_type,biz_item,phone,address1")
      .order("name", { ascending: true })
      .limit(2000);

    if (error) {
      setMsg(error.message);
      return;
    }
    const list = (data ?? []) as PartnerRow[];
    setPartners(list);

    // ✅ URL로 partnerId가 들어왔으면 입력창에도 표시(형식 통일)
    if (qpPartnerId) {
      const p = list.find((x) => x.id === qpPartnerId);
      if (p) setPartnerQuery(p.business_no ? `${p.name} (${p.business_no})` : p.name);
    }
  }

  function pushUrl(nextPartnerId: string, f: string, t: string) {
    const qs = new URLSearchParams();
    if (nextPartnerId) qs.set("partnerId", nextPartnerId);
    if (f) qs.set("from", f);
    if (t) qs.set("to", t);
    router.replace(`/tax/statement?${qs.toString()}`);
  }

  async function loadStatement(pId: string, f: string, t: string) {
    setMsg(null);
    setLoading(true);
    try {
      if (!pId) {
        setRows([]);
        setStartBalance(0);
        setMsg("partner_id가 없습니다. (상단에서 거래처/기간 선택 후 조회를 누르세요)");
        return;
      }

      const p = partners.find((x) => x.id === pId) ?? null;
      const pName = String(p?.name ?? "").trim();
      const pBiz = String(p?.business_no ?? "").trim();

      // ✅ ledger_entries: partner_id가 null로 들어간 케이스(거래내역(통합) 입력)도 포함하기 위해 OR 조건 구성
      // - partner_id = pId 는 기본
      // - partner_id is null 이면서 business_no가 같거나(우선), counterparty_name이 같은 것도 포함(보조)
      const ledgerOr =
        pBiz && pName
          ? `partner_id.eq.${pId},and(partner_id.is.null,business_no.eq.${pBiz}),and(partner_id.is.null,counterparty_name.eq.${pName})`
          : pBiz
            ? `partner_id.eq.${pId},and(partner_id.is.null,business_no.eq.${pBiz})`
            : pName
              ? `partner_id.eq.${pId},and(partner_id.is.null,counterparty_name.eq.${pName})`
              : `partner_id.eq.${pId}`;

      // ✅ 기간 내 데이터
      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name,ship_date,ship_method,memo,total_amount,created_at")
        .eq("customer_id", pId)
        .gte("ship_date", f)
        .lte("ship_date", t)
        .order("ship_date", { ascending: true })
        .limit(5000);

      if (oErr) {
        setMsg(oErr.message);
        return;
      }

      const { data: lData, error: lErr } = await supabase
        .from("ledger_entries")
        .select("id,entry_date,entry_ts,direction,amount,category,method,memo,partner_id,counterparty_name,business_no,created_at")
        .or(ledgerOr)
        .gte("entry_date", f)
        .lte("entry_date", t)
        .order("entry_date", { ascending: true })
        .limit(10000);

      if (lErr) {
        setMsg(lErr.message);
        return;
      }

      // ✅ 최초 기록부터 누적 잔액을 맞추기 위한 "기간 시작 전" 누적값 계산
      let initialBal = 0;

      // 1) 기간 시작 전 ledger 누적
      {
        const { data: lPrev, error: lPrevErr } = await supabase
          .from("ledger_entries")
          .select("direction,amount")
          .or(ledgerOr)
          .lt("entry_date", f)
          .order("entry_date", { ascending: true })
          .limit(20000);

        if (lPrevErr) {
          setMsg(lPrevErr.message);
          return;
        }

        for (const x of (lPrev ?? []) as any[]) {
          const amt = Number(x?.amount ?? 0);
          const dir = String(x?.direction ?? "").toUpperCase();
          const isIn = dir === "IN";
          const isOut = dir === "OUT";
          if (isIn) initialBal += amt;
          else if (isOut) initialBal -= amt;
        }
      }

      // 2) 기간 시작 전 orders 누적(출고는 잔액에 -)
      {
        const { data: oPrev, error: oPrevErr } = await supabase
          .from("orders")
          .select("id,total_amount,created_at,ship_date")
          .eq("customer_id", pId)
          .lt("ship_date", f)
          .order("ship_date", { ascending: true })
          .limit(20000);

        if (oPrevErr) {
          setMsg(oPrevErr.message);
          return;
        }

        const prevOrders = (oPrev ?? []) as any as OrderRow[];
        if (prevOrders.length > 0) {
          const ids = prevOrders.map((x) => x.id).filter(Boolean);

          const prevTotalMap = new Map<string, number>();
          const needLineIds: string[] = [];

          for (const o of prevOrders) {
            const tot = Number(o.total_amount ?? Number.NaN);
            if (o.id) {
              if (Number.isFinite(tot)) prevTotalMap.set(o.id, tot);
              else {
                prevTotalMap.set(o.id, 0);
                needLineIds.push(o.id);
              }
            }
          }

          if (needLineIds.length > 0) {
            const { data: prevLines, error: prevLinesErr } = await supabase
              .from("order_lines")
              .select("*")
              .in("order_id", needLineIds)
              .order("order_id", { ascending: true })
              .order("line_no", { ascending: true });

            if (prevLinesErr) {
              setMsg(prevLinesErr.message);
              return;
            }

            for (const line of (prevLines ?? []) as any as LineLoose[]) {
              const oid = String(line?.order_id ?? "");
              if (!oid) continue;
              const m = mapLineToAmounts(line);
              const supplyVal = Number.isFinite(m.supply) ? m.supply : 0;
              const vatVal = Number.isFinite(m.vat) ? m.vat : 0;
              const totalVal = Number.isFinite(m.total) ? m.total : supplyVal + vatVal;
              prevTotalMap.set(oid, Number(prevTotalMap.get(oid) ?? 0) + Number(totalVal ?? 0));
            }
          }

          for (const oid of ids) {
            const tot = Number(prevTotalMap.get(oid) ?? 0);
            initialBal -= tot;
          }
        }
      }

      // ✅ 시작 잔액 저장(기간 내 내역이 0건이어도 미수/선수금 계산에 사용)
      setStartBalance(initialBal);

      const list: Omit<StatementRow, "balance">[] = [];

      const oRows = (oData ?? []) as any as OrderRow[];

      // ✅ 출고: order_lines로 품목/수량/단가/공급가/부가세 구성
      if (oRows.length > 0) {
        const orderIds = oRows.map((o) => o.id);

        const { data: olData, error: olErr } = await supabase
          .from("order_lines")
          .select("*")
          .in("order_id", orderIds)
          .order("order_id", { ascending: true })
          .order("line_no", { ascending: true });

        if (olErr) {
          setMsg(olErr.message);
          return;
        }

        // order_id -> ship_date / 주문자 매핑
        const dateMap = new Map<string, string>();
        const ordererMap = new Map<string, string>();
        const orderTotalMap = new Map<string, number>();
        const orderHasTotal = new Set<string>();
        const orderCreatedMap = new Map<string, string>();

        for (const o of oRows) {
          const date = o.ship_date ?? (o.created_at ? o.created_at.slice(0, 10) : "");
          if (o.id) dateMap.set(o.id, date);
          if (o.id) ordererMap.set(o.id, extractOrderer(o.memo));
          if (o.id) orderCreatedMap.set(o.id, String(o.created_at ?? ""));

          const tot = Number(o.total_amount ?? Number.NaN);
          if (o.id) {
            if (Number.isFinite(tot)) {
              orderTotalMap.set(o.id, tot);
              orderHasTotal.add(o.id);
            } else {
              orderTotalMap.set(o.id, 0);
            }
          }
        }

        // ✅ order_id별 라인들을 먼저 모으고(총액 계산용), 그 다음 출력(list push)
        const orderIdOrder: string[] = [];
        const perOrder = new Map<
          string,
          {
            date: string;
            remark: string;
            sortTs: string;
            lines: Array<{ itemName: string; qty: number; unitPrice: number; supply: number; vat: number; total: number }>;
          }
        >();

        for (const line of (olData ?? []) as any as LineLoose[]) {
          const orderId = String(line?.order_id ?? "");
          if (!orderId) continue;

          const date = dateMap.get(orderId) ?? "";
          const remark = ordererMap.get(orderId) ?? "";
          const sortTs = orderCreatedMap.get(orderId) ?? "";
          const m = mapLineToAmounts(line);

          if (!m.itemName || !String(m.itemName).trim()) continue;

          const supplyVal = Number.isFinite(m.supply) ? m.supply : 0;
          const vatVal = Number.isFinite(m.vat) ? m.vat : 0;
          const totalVal = Number.isFinite(m.total) ? m.total : supplyVal + vatVal;

          if (!perOrder.has(orderId)) {
            perOrder.set(orderId, { date, remark, sortTs, lines: [] });
            orderIdOrder.push(orderId);
          }
          perOrder.get(orderId)!.lines.push({
            itemName: m.itemName,
            qty: Number.isFinite(m.qty) ? m.qty : 0,
            unitPrice: Number.isFinite(m.unitPrice) ? m.unitPrice : 0,
            supply: supplyVal,
            vat: vatVal,
            total: totalVal,
          });

          // orders.total_amount가 없으면 라인 합계로 계산
          if (!orderHasTotal.has(orderId)) {
            orderTotalMap.set(orderId, Number(orderTotalMap.get(orderId) ?? 0) + Number(totalVal ?? 0));
          }
        }

        // ✅ 같은 주문(order_id) 묶음에서 거래금액은 "총액"을 첫 라인에만 표시
        for (const orderId of orderIdOrder) {
          const pack = perOrder.get(orderId);
          if (!pack) continue;

          const orderTotal = Number(orderTotalMap.get(orderId) ?? 0);
          const lastIdx = Math.max(0, pack.lines.length - 1);

          let first = true;
          let seq = 0;

          for (let i = 0; i < pack.lines.length; i++) {
            const ln = pack.lines[i];
            const amtSigned = -Number(ln.total ?? 0);

            list.push({
              date: pack.date,
              kind: "출고",
              itemName: ln.itemName,
              qty: ln.qty,
              unitPrice: ln.unitPrice,
              supply: ln.supply,
              vat: ln.vat,
              tradeAmount: first ? orderTotal : null, // ✅ 거래금액: 주문/출고 입력 "건" 총액만 표시
              payment: null, // ✅ 출고는 결제칸 비움
              amountSigned: amtSigned,
              remark: pack.remark,
              sortTs: pack.sortTs,
              sortSeq: seq,
              groupId: orderId,
              groupLast: i === lastIdx,
            });

            first = false;
            seq += 1;
          }
        }
      }

      // ✅ 입금/출고(ledger): direction 기준으로 구분 + 잔액 반영
      for (const l of (lData ?? []) as any as LedgerRow[]) {
        const date = l.entry_date;
        const amt = Number(l.amount ?? 0);
        const dir = String(l.direction ?? "").toUpperCase();

        const isIn = dir === "IN";
        const isOut = dir === "OUT";

        const kind: "입금" | "출고" = isIn ? "입금" : "출고";
        const signed = isIn ? amt : -amt;

        // ledger 출고(OUT)는 품목명이 없으니 memo를 품목명 칸에 보여주면
        // 화면에서 "잔액조정용" 같은 항목이 확인 가능
        list.push({
          date,
          kind,
          itemName: isOut ? String(l.memo ?? "") : "",
          qty: null,
          unitPrice: null,
          supply: isOut ? amt : null, // ✅ ledger 출고는 공급가=amt로 표시
          vat: isOut ? 0 : null, // ✅ ledger 출고는 부가세 0
          tradeAmount: isOut ? amt : null, // ✅ ledger 출고는 거래금액=amt
          payment: isIn ? amt : null, // ✅ 입금은 결제(입금)
          amountSigned: signed,
          remark: "",
          sortTs: l.entry_ts && String(l.entry_ts).trim() ? String(l.entry_ts) : String(l.created_at ?? ""),
          sortSeq: 0,
          groupId: null,
          groupLast: false,
        });
      }

      // ✅ 정렬: 날짜는 반드시 일자 기준(오름차순) 유지.
      // ✅ 같은 날짜 내에서는 실제 입력/생성 시간이 최근일수록 "아래"로 가도록 오름차순 정렬(옛날→최근)
      list.sort((a, b) => {
        const d = String(a.date).localeCompare(String(b.date));
        if (d !== 0) return d;

        const ta = String(a.sortTs ?? "");
        const tb = String(b.sortTs ?? "");
        const tcmp = ta.localeCompare(tb);
        if (tcmp !== 0) return tcmp;

        const sa = Number(a.sortSeq ?? 0);
        const sb = Number(b.sortSeq ?? 0);
        if (sa !== sb) return sa - sb;

        if (a.kind !== b.kind) return a.kind === "입금" ? -1 : 1;
        return 0;
      });

      // ✅ 잔액 누적: 기간이 달라도 "최초 기록부터" 누적된 잔액을 유지
      let bal = initialBal;
      const withBal: StatementRow[] = list.map((r) => {
        bal += Number(r.amountSigned ?? 0);
        return { ...r, balance: bal };
      });

      setRows(withBal);
    } finally {
      setLoading(false);
    }
  }

  // ✅ 설정된 기간 내 입금/출고 합계(표시용)
  const totals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;

    for (const r of rows) {
      if (r.kind === "입금") inSum += Math.max(0, Number(r.amountSigned ?? 0));
      if (r.kind === "출고") outSum += Math.abs(Number(r.amountSigned ?? 0));
    }

    const net = inSum - outSum;
    return { inSum, outSum, net };
  }, [rows]);

  // ✅ 주문/출고 입력 "건"의 최종 잔액(그룹 마지막 라인의 balance)을 모아서, 첫 라인(거래금액 표시 라인) 위치에 표시하기 위함
  const groupFinalBalanceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.groupId && r.groupLast) m.set(String(r.groupId), Number(r.balance ?? 0));
    }
    return m;
  }, [rows]);

  function downloadExcelCsv() {
    if (!partnerId) return;

    const headers = ["일자", "구분", "품목명", "수량", "단가", "공급가", "부가세", "거래금액", "결제", "잔액", "비고"];
    const lines: string[] = [];
    lines.push(headers.map(csvEscape).join(","));

    for (const r of rows) {
      const showGroupBalanceHere = !!r.groupId && r.tradeAmount !== null; // ✅ 그룹 첫 라인(거래금액 표시 라인)에 잔액 표시
      const showBalance = r.groupId ? showGroupBalanceHere : true;

      const balVal =
        r.groupId && showGroupBalanceHere ? groupFinalBalanceMap.get(String(r.groupId)) ?? r.balance : r.balance;

      const row = [
        r.date ?? "",
        r.kind ?? "",
        r.itemName ?? "",
        r.qty === null ? "" : formatMoney(r.qty),
        r.unitPrice === null ? "" : formatMoney(r.unitPrice),
        r.supply === null ? "" : formatMoney(r.supply),
        r.vat === null ? "" : formatMoney(r.vat),
        r.tradeAmount === null ? "" : formatMoney(r.tradeAmount),
        r.payment === null ? "" : formatMoney(r.payment),
        showBalance ? formatMoney(balVal ?? 0) : "",
        r.remark ?? "",
      ];
      lines.push(row.map(csvEscape).join(","));
    }

    const csv = "\uFEFF" + lines.join("\n"); // Excel 한글 깨짐 방지(BOM)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const safeName = (selectedPartner?.name ?? "거래원장").replaceAll("/", "-");
    a.href = url;
    a.download = `${safeName}_거래원장_${fromYMD}_${toYMD}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  // ✅ 탭(브라우저 타이틀) 변경
  useEffect(() => {
    document.title = "거래원장 | BONUSMATE ERP";
  }, []);

  // ✅ 입력 검색 필터
  const filteredPartners = useMemo(() => {
    const q = partnerQuery.trim().toLowerCase();
    if (!q) return partners.slice(0, 50);

    const scored = partners
      .map((p) => {
        const name = (p.name ?? "").toLowerCase();
        const biz = (p.business_no ?? "").toLowerCase();
        const key = `${name} ${biz}`;
        const hit = key.includes(q);
        const score = !q ? 9999 : name.startsWith(q) ? 0 : name.includes(q) ? 1 : biz.includes(q) ? 2 : hit ? 3 : 99;
        return { p, score, hit };
      })
      .filter((x) => x.hit)
      .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name));

    return scored.slice(0, 50).map((x) => x.p);
  }, [partners, partnerQuery]);

  const showNoResult = partnerOpen && partnerQuery.trim().length > 0 && filteredPartners.length === 0;

  function onPartnerFocus() {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setPartnerOpen(true);
  }

  function onPartnerBlur() {
    blurTimerRef.current = window.setTimeout(() => {
      setPartnerOpen(false);
      blurTimerRef.current = null;
    }, 120) as unknown as number;
  }

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const el = partnerWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setPartnerOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (qpPartnerId && qpFrom && qpTo) {
      setPartnerId(qpPartnerId);
      setFromYMD(qpFrom);
      setToYMD(qpTo);
      loadStatement(qpPartnerId, qpFrom, qpTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPrint = !!partnerId;

  // ✅ 미수/선수금은 "최초 기록부터 ~ 설정된 기간(to)까지" 누적 기준으로 표시
  // balance = (입금 - 출고) 누적
  const endBalance = useMemo(() => {
    if (rows.length > 0) return Number(rows[rows.length - 1].balance ?? 0);
    return Number(startBalance ?? 0);
  }, [rows, startBalance]);

  const isPrepay = endBalance > 0;
  const diffLabel = isPrepay ? "선수금(입금-출고)" : "미수(출고-입금)";
  const diffValue = Math.abs(endBalance);

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
      {/* ✅ spec-client.tsx와 동일한 방식: 인쇄 시 "statement-print-area"만 보이게 */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #statement-print-area,
          #statement-print-area * {
            visibility: visible !important;
          }
          #statement-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }

          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          @page {
            size: A4;
            margin: 10mm;
          }

          /* 인쇄 시 가로 스크롤 방지 */
          .table-wrap {
            overflow: visible !important;
          }
          table {
            width: 100% !important;
          }
          th,
          td {
            font-size: 10px !important;
            padding: 4px 6px !important;
          }
          .truncate {
            white-space: normal !important;
          }

          /* 혹시 남아있을 수 있는 상단 메뉴바 */
          .app-topnav {
            display: none !important;
          }

          /* 인쇄 시 숨김 */
          .no-print {
            display: none !important;
          }
          .print-card {
            box-shadow: none !important;
          }
          .print-hide {
            display: none !important;
          }
        }
      `}</style>

      {/* ✅ 화면(웹)에서는 그대로 보이되, 인쇄에서는 이 영역만 남김 */}
      <div id="statement-print-area">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
          {msg ? (
            <div className="no-print mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {msg}
            </div>
          ) : null}

          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">거래원장</div>
              <div className="mt-2">
                <span className={pill}>
                  기간: {fromYMD} ~ {toYMD}
                </span>
              </div>
            </div>

            <div className="no-print flex gap-2">
              <button
                className={btn}
                onClick={() => downloadExcelCsv()}
                disabled={!canPrint}
                title={!canPrint ? "거래처를 먼저 선택하세요" : ""}
              >
                엑셀(CSV) 다운로드
              </button>
              <button
                className={btn}
                onClick={() => window.print()}
                disabled={!canPrint}
                title={!canPrint ? "거래처를 먼저 선택하세요" : ""}
              >
                인쇄 / PDF 저장
              </button>
            </div>
          </div>

          {/* 조회 조건 */}
          <div className={`${card} no-print p-4`}>
            <div className="mb-3 text-sm font-semibold">조회 조건</div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
              {/* ✅ 거래처: 입력 검색 */}
              <div>
                <div className="mb-1 text-xs text-slate-600">거래처</div>

                <div ref={partnerWrapRef} className="relative">
                  <input
                    className={input}
                    value={partnerQuery}
                    onChange={(e) => {
                      setPartnerQuery(e.target.value);
                      setPartnerOpen(true);
                    }}
                    onFocus={onPartnerFocus}
                    onBlur={onPartnerBlur}
                    placeholder="회사명을 입력하세요"
                  />

                  {/* ✅ 입력 중 추천 리스트 */}
                  {partnerOpen && partnerQuery.trim() ? (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                      <div className="max-h-72 overflow-y-auto">
                        {showNoResult ? (
                          <div className="px-3 py-2 text-sm text-slate-500">검색 결과가 없습니다.</div>
                        ) : (
                          filteredPartners.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                              onMouseDown={(e) => e.preventDefault()} // blur 먼저 발생 방지
                              onClick={() => {
                                setPartnerId(p.id);
                                setPartnerQuery(p.business_no ? `${p.name} (${p.business_no})` : p.name);
                                setPartnerOpen(false);
                              }}
                            >
                              <span className="truncate">
                                {p.name} {p.business_no ? `(${p.business_no})` : ""}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                      <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
                        ※ 목록에서 클릭해서 선택하세요.
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-600">From</div>
                <input type="date" className={input} value={fromYMD} onChange={(e) => setFromYMD(e.target.value)} />
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-600">To</div>
                <input type="date" className={input} value={toYMD} onChange={(e) => setToYMD(e.target.value)} />
              </div>

              <div className="flex gap-2">
                <button
                  className={btn}
                  onClick={() => {
                    const f2 = addDays(todayYMD(), -30);
                    const t2 = todayYMD();
                    setFromYMD(f2);
                    setToYMD(t2);
                  }}
                >
                  최근 30일
                </button>
                <button
                  className={btnOn}
                  onClick={() => {
                    pushUrl(partnerId, fromYMD, toYMD);
                    loadStatement(partnerId, fromYMD, toYMD);
                  }}
                  disabled={!partnerId}
                  title={!partnerId ? "거래처를 먼저 선택하세요" : ""}
                >
                  조회
                </button>
              </div>
            </div>
          </div>

          {/* 거래처(좌) / 회사정보(우) */}
          <div className={`${card} print-card mt-4 p-4`}>
            <div className="grid grid-cols-2 gap-6 items-start">
              {/* LEFT */}
              <div>
                {/* ✅ "거래처" 라벨 제거 */}
                {selectedPartner ? (
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold">{selectedPartner.name}</div>
                    {selectedPartner.business_no ? <div>{selectedPartner.business_no}</div> : null}
                    {selectedPartner.ceo_name ? <div>대표: {selectedPartner.ceo_name}</div> : null}
                    {selectedPartner.address1 ? <div>주소: {selectedPartner.address1}</div> : null}
                    {selectedPartner.biz_type || selectedPartner.biz_item ? (
                      <div>
                        업종: {selectedPartner.biz_type ?? ""}{" "}
                        {selectedPartner.biz_item ? `/ 업태: ${selectedPartner.biz_item}` : ""}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">거래처를 선택하세요.</div>
                )}
              </div>

              {/* RIGHT */}
              <div className="text-right">
                <div className="mb-2 text-sm font-semibold opacity-0 select-none">.</div>
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{OUR.name}</div>
                  <div className="text-slate-700">{OUR.business_no}</div>
                  <div className="relative inline-block pr-12">
                    <span>대표: {OUR.ceo}</span>
                    <img
                      src="/stamp.png"
                      alt="stamp"
                      className="pointer-events-none absolute right-0 -top-3 h-12 w-12 opacity-90"
                    />
                  </div>
                  <div>주소: {OUR.address1}</div>
                  <div>업종: {OUR.biz}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 표 */}
          <div className={`${card} print-card mt-4 p-4`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">내역</div>
              <div className="text-sm text-slate-600">
                입금 합계 <span className="font-semibold tabular-nums">{formatMoney(totals.inSum)}</span> · 출고 합계{" "}
                <span className="font-semibold tabular-nums">{formatMoney(totals.outSum)}</span> · {diffLabel}{" "}
                <span className="font-semibold tabular-nums">{formatMoney(diffValue)}</span>
              </div>
            </div>

            {/* ✅ 세로 스크롤 */}
            <div className="table-wrap max-h-[520px] overflow-y-auto rounded-2xl border border-slate-200">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "76px" }} />
                  <col style={{ width: "52px" }} />
                  <col style={{ width: "180px" }} />
                  <col style={{ width: "52px" }} />
                  <col style={{ width: "64px" }} />
                  <col style={{ width: "72px" }} />
                  <col style={{ width: "60px" }} />
                  <col style={{ width: "78px" }} />
                  <col style={{ width: "78px" }} />
                  <col style={{ width: "78px" }} />
                  <col style={{ width: "120px" }} />
                </colgroup>

                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left">일자</th>
                    <th className="px-2 py-2 text-left">구분</th>
                    <th className="px-2 py-2 text-left">품목명</th>
                    <th className="px-2 py-2 text-right">수량</th>
                    <th className="px-2 py-2 text-right">단가</th>
                    <th className="px-2 py-2 text-right">공급가</th>
                    <th className="px-2 py-2 text-right">부가세</th>
                    <th className="px-2 py-2 text-right">거래금액</th>
                    <th className="px-2 py-2 text-right">결제</th>
                    <th className="px-2 py-2 text-right">잔액</th>
                    <th className="px-2 py-2 text-left">비고</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-4 text-sm text-slate-500">
                        불러오는 중...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-4 text-sm text-slate-500">
                        표시할 내역이 없습니다. (거래처/기간/데이터 확인)
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, idx) => {
                      const isOut = r.kind === "출고";
                      const supplyClass = isOut ? "text-red-600" : "";
                      const paymentClass = !isOut ? "text-blue-700" : "";
                      const tradeClass = isOut ? "text-red-600" : "";

                      // ✅ 그룹(주문/출고 입력 건) 잔액은: "거래금액(총액)"이 표시되는 첫 라인 위치에만 표시
                      const showGroupBalanceHere = !!r.groupId && r.tradeAmount !== null;
                      const showBalance = r.groupId ? showGroupBalanceHere : true;
                      const balVal =
                        r.groupId && showGroupBalanceHere
                          ? groupFinalBalanceMap.get(String(r.groupId)) ?? r.balance
                          : r.balance;

                      // ✅ 같은 주문/출고 입력 건 내부 라인 사이(예: 마산고운조/자은초)는 구분선 제거
                      const prev = idx > 0 ? rows[idx - 1] : null;
                      const sameGroupAsPrev =
                        !!r.groupId && !!prev?.groupId && String(r.groupId) === String(prev.groupId);

                      return (
                        <tr
                          key={`${r.date}-${idx}`}
                          className={`${sameGroupAsPrev ? "" : "border-t border-slate-200"} bg-white`}
                        >
                          <td className="px-2 py-2 font-semibold tabular-nums">{r.date}</td>
                          <td className="px-2 py-2 font-semibold">{r.kind}</td>
                          <td className="px-2 py-2">
                            <div className="truncate">{r.itemName ? r.itemName : ""}</div>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {r.qty === null ? "" : formatMoney(r.qty)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {r.unitPrice === null ? "" : formatMoney(r.unitPrice)}
                          </td>
                          <td className={`px-2 py-2 text-right tabular-nums font-semibold ${supplyClass}`}>
                            {r.supply === null ? "" : formatMoney(r.supply)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {r.vat === null ? "" : formatMoney(r.vat)}
                          </td>
                          <td className={`px-2 py-2 text-right tabular-nums font-semibold ${tradeClass}`}>
                            {r.tradeAmount === null ? "" : formatMoney(r.tradeAmount)}
                          </td>
                          <td className={`px-2 py-2 text-right tabular-nums font-semibold ${paymentClass}`}>
                            {r.payment === null ? "" : formatMoney(r.payment)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">
                            {showBalance ? formatMoney(balVal) : ""}
                          </td>
                          <td className="px-2 py-2">
                            <div className="truncate">{r.remark ? r.remark : ""}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="print-hide mt-2 text-xs text-slate-500"></div>
          </div>
        </div>
      </div>
    </div>
  );
}