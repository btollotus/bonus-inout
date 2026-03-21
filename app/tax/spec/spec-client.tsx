"use client";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "거래명세서 | BONUSMATE ERP" };

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
  address1: string | null;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  ship_date: string | null;
  ship_method: string | null;
  memo: string | null;
  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  created_at: string;
};

type LineLoose = Record<string, any>;

type SpecLine = {
  itemName: string;
  qty: number;
  unitPrice: number;
  supply: number;
  vat: number;
  total: number;
};

function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
}

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ymdSlash(ymd: string) {
  // YYYY-MM-DD -> YYYY/MM/DD
  if (!ymd) return "";
  return ymd.replaceAll("-", "/");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function safeFileNamePart(s: string) {
  // 윈도우 파일명 금지문자 제거
  return String(s ?? "")
    .replaceAll(/[\\/:*?"<>|]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
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
function mapLineToSpec(line: LineLoose): SpecLine {
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

  // ✅ (요청) 단가가 0으로 뜨는 케이스 보정:
  // - 라인에 unit_price가 없지만 supply(또는 total)와 qty가 있으면 단가를 계산해서 표시
  // - 단가 = 공급가 / 수량 (원단위 반올림)
  if ((unitPrice ?? 0) === 0 && qty > 0) {
    const baseSupply = Number.isFinite(supply) ? supply : 0;
    if (baseSupply > 0) unitPrice = Math.round(baseSupply / qty);
  }

  return { itemName, qty, unitPrice, supply, vat, total };
}

type RawLineWithOrder = SpecLine & { orderId: string };

export default function SpecClient() {
  const supabase = useMemo(() => createClient(), []);
  const sp = useSearchParams();
  const router = useRouter();

  const qpPartnerId = sp.get("partnerId") || sp.get("partner_id") || "";
  const qpDate = sp.get("date") || sp.get("from") || sp.get("to") || "";
  const qpAutoPrint = sp.get("autoprint") || "";

  const [msg, setMsg] = useState<string | null>(null);

  const [newWoNotifications, setNewWoNotifications] = useState<NewWoNotification[]>([]);
const [showNewWoModal, setShowNewWoModal] = useState(false);
const insertChannelRef = useRef<RealtimeChannel | null>(null);
const pageLoadTimeRef = useRef<string>(new Date().toISOString());

useEffect(() => {
  const channel = supabase
    .channel("wo_spec_insert_notify")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "work_orders" }, (payload) => {
      const d = payload.new as Record<string, unknown>;
      const createdAt = String(d.created_at ?? "");
      if (createdAt && createdAt < pageLoadTimeRef.current) return;
      setNewWoNotifications((prev) => [{ id: String(d.id ?? ""), client_name: String(d.client_name ?? ""), product_name: String(d.product_name ?? ""), work_order_no: String(d.work_order_no ?? ""), order_date: String(d.order_date ?? ""), created_at: createdAt }, ...prev]);
      setShowNewWoModal(true);
      playNotificationSound();
    })
    .subscribe((status, err) => { console.log("🔔 [spec INSERT채널]", status, err ?? ""); });
  insertChannelRef.current = channel;
  return () => { supabase.removeChannel(channel); insertChannelRef.current = null; };
}, []); // eslint-disable-line

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [partnerId, setPartnerId] = useState<string>(qpPartnerId);
  const [dateYMD, setDateYMD] = useState<string>(qpDate || "");

  const selectedPartner = useMemo(
    () => partners.find((p) => p.id === partnerId) ?? null,
    [partners, partnerId]
  );

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [rawLines, setRawLines] = useState<RawLineWithOrder[]>([]);
  const [lines, setLines] = useState<SpecLine[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ 여러 주문 중 선택 출력
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // --- 거래처 검색(입력형) UI 상태 ---
  const [partnerQuery, setPartnerQuery] = useState<string>("");
  const [partnerOpen, setPartnerOpen] = useState(false);
  const partnerWrapRef = useRef<HTMLDivElement | null>(null);
  const blurTimerRef = useRef<number | null>(null);

  // ✅ 회사정보 (요청사항만 반영)
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
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200";

  // ✅ 판매채널(주문자 표시 대상)
  const CHANNEL_CUSTOMERS = new Set(["네이버-판매", "쿠팡-판매", "카카오플러스-판매"]);
  const isChannelCustomer = useMemo(() => {
    const n = String(selectedPartner?.name ?? "").trim();
    return CHANNEL_CUSTOMERS.has(n);
  }, [selectedPartner?.name]);

  function pushUrl(nextPartnerId: string, date: string) {
    const qs = new URLSearchParams();
    if (nextPartnerId) qs.set("partnerId", nextPartnerId);
    if (date) qs.set("date", date);
    router.replace(`/tax/spec?${qs.toString()}`);
  }

  async function loadPartners() {
    const { data, error } = await supabase
      .from("partners")
      .select("id,name,business_no,ceo_name,biz_type,biz_item,address1")
      .order("name", { ascending: true })
      .limit(5000);

    if (error) {
      setMsg(error.message);
      return;
    }
    setPartners((data ?? []) as PartnerRow[]);
  }

  function rebuildLines(nextSelectedOrderIds: string[], raw: RawLineWithOrder[]) {
    const sel = new Set(nextSelectedOrderIds);
    const picked = raw.filter((x) => sel.has(x.orderId));

    // ✅ 같은 품목명이라도 "서로 다른 주문"이면 합산 금지
    // - 주문 내에서는 (품목+단가)로 집계
    // - 주문이 다르면 orderId가 달라져서 별도 줄로 유지
    const agg = new Map<string, SpecLine>();
    for (const r of picked) {
      const key = `${r.orderId}||${r.itemName}||${r.unitPrice}`;
      const prev = agg.get(key);
      if (!prev) {
        agg.set(key, {
          itemName: r.itemName,
          qty: r.qty,
          unitPrice: r.unitPrice,
          supply: r.supply,
          vat: r.vat,
          total: r.total,
        });
      } else {
        prev.qty += r.qty;
        prev.supply += r.supply;
        prev.vat += r.vat;
        prev.total += r.total;
      }
    }

    const out = Array.from(agg.values()).filter((x) => x.itemName.trim() !== "");
    setLines(out);
  }

  async function loadSpec(pId: string, date: string) {
    setMsg(null);
    setLoading(true);

    try {
      if (!pId || !date) {
        setOrders([]);
        setRawLines([]);
        setLines([]);
        setSelectedOrderIds([]);
        setMsg("partnerId 또는 date가 없습니다. (상단에서 거래처/일자 선택 후 조회)");
        return;
      }

      // 1) orders
      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name,ship_date,ship_method,memo,supply_amount,vat_amount,total_amount,created_at")
        .eq("customer_id", pId)
        .eq("ship_date", date)
        .order("created_at", { ascending: true })
        .limit(5000);

      if (oErr) throw oErr;

      const oRows = (oData ?? []) as OrderRow[];
      setOrders(oRows);

      if (oRows.length === 0) {
        setRawLines([]);
        setLines([]);
        setSelectedOrderIds([]);
        return;
      }

      const orderIds = oRows.map((o) => o.id);

      // ✅ 기본: 조회되면 전부 선택(기존 동작 유지)
      setSelectedOrderIds(orderIds);

      // 2) order_lines
      const { data: lData, error: lErr } = await supabase
        .from("order_lines")
        .select("*")
        .in("order_id", orderIds)
        .order("order_id", { ascending: true })
        .order("line_no", { ascending: true });

      if (lErr) throw lErr;

      const mappedRaw: RawLineWithOrder[] = (lData ?? []).map((row: any) => {
        const spec = mapLineToSpec(row);
        const oid = String(row?.order_id ?? "");
        return { ...spec, orderId: oid };
      });

      setRawLines(mappedRaw);
      rebuildLines(orderIds, mappedRaw);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setOrders([]);
      setRawLines([]);
      setLines([]);
      setSelectedOrderIds([]);
    } finally {
      setLoading(false);
    }
  }

  // ✅ 초기 로딩
  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ URL 파라미터(직접 링크) 반영
  useEffect(() => {
    if (qpPartnerId) setPartnerId(qpPartnerId);
    if (qpDate) setDateYMD(qpDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ URL로 partnerId/date가 들어온 경우: 자동 조회 1회 실행 (autoprint 포함 케이스 대응)
  const didAutoLoadRef = useRef(false);
  useEffect(() => {
    if (didAutoLoadRef.current) return;
    if (!partnerId || !dateYMD) return;

    // URL로 들어온 값이 있는 경우에만 1회 자동 조회
    if (qpPartnerId || qpDate) {
      didAutoLoadRef.current = true;
      loadSpec(partnerId, dateYMD);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, dateYMD]);

  // ✅ 파트너 선택 시, 검색 입력 텍스트를 “선택값”으로 동기화
  useEffect(() => {
    if (!selectedPartner) return;
    const label = `${selectedPartner.name}${selectedPartner.business_no ? ` (${selectedPartner.business_no})` : ""}`;
    setPartnerQuery(label);
    setPartnerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartner?.id]);

  // --- 검색 필터 ---
  const filteredPartners = useMemo(() => {
    const q = partnerQuery.trim().toLowerCase();
    if (!q) return partners.slice(0, 50);

    return partners
      .filter((p) => {
        const n = (p.name ?? "").toLowerCase();
        const b = (p.business_no ?? "").toLowerCase();
        return n.includes(q) || b.includes(q);
      })
      .slice(0, 50);
  }, [partners, partnerQuery]);

  // ✅ “검색 결과가 없습니다”는 조건: (드롭다운 열림 && 입력값 있음 && 결과 0)
  const showNoResult = partnerOpen && partnerQuery.trim().length > 0 && filteredPartners.length === 0;

  function onPartnerFocus() {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setPartnerOpen(true);
  }

  function onPartnerBlur() {
    // 클릭 선택 중 blur 발생해도 닫히지 않도록 지연
    blurTimerRef.current = window.setTimeout(() => {
      setPartnerOpen(false);
      blurTimerRef.current = null;
    }, 120) as unknown as number;
  }

  function selectPartner(p: PartnerRow) {
    setPartnerId(p.id);
    // ✅ 선택 즉시 드롭다운 닫기
    setPartnerOpen(false);
    setMsg(null);
  }

  // ✅ 바깥 클릭 시 닫기
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const el = partnerWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setPartnerOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  // ✅ 선택 주문 변경 시: 선택된 주문만으로 lines 재구성
  useEffect(() => {
    if (!rawLines.length) return;
    rebuildLines(selectedOrderIds, rawLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderIds]);

  function makePrintTitle(partnerName: string, date: string, seq2: string) {
    const pn = safeFileNamePart(partnerName || "거래처미지정");
    const ds = safeFileNamePart(date || "");
    return `거래명세서-${pn}-${ds}-${seq2}`;
  }

  function nextSeqForDate(partnerKey: string, date: string) {
    // 같은 날짜 기준 01,02... (partnerId 단위로 관리)
    const d = String(date || "").trim();
    const pk = String(partnerKey || "").trim();
    if (!d) return "01";

    const storageKey = `spec_print_seq__${d}__${pk || "no_partner"}`;
    let n = 0;
    try {
      const cur = Number(localStorage.getItem(storageKey) || "0");
      n = Number.isFinite(cur) ? cur : 0;
    } catch {
      n = 0;
    }
    n += 1;
    try {
      localStorage.setItem(storageKey, String(n));
    } catch {}
    return pad2(n);
  }

  function doPrint() {
    const partnerName = selectedPartner?.name ?? orders?.[0]?.customer_name ?? "";
    const seq2 = nextSeqForDate(partnerId, dateYMD);
    const newTitle = makePrintTitle(partnerName, dateYMD, seq2);

    const prevTitle = document.title;
    document.title = newTitle;

    try {
      window.focus();
      window.print();
    } catch {
    } finally {
      // 바로 복구하면 일부 브라우저에서 제목 반영이 덜 될 수 있어 약간 지연
      window.setTimeout(() => {
        document.title = prevTitle;
      }, 800);
    }
  }

  // ✅ autoprint=1 이면 로드 완료 후 인쇄창(CTRL+P) 자동 실행 (1회)
  const didAutoPrintRef = useRef(false);
  useEffect(() => {
    const auto = String(qpAutoPrint ?? "").trim() === "1";
    if (!auto) return;
    if (didAutoPrintRef.current) return;
    if (loading) return;

    // 데이터 로드가 끝났다면(0건이어도) 인쇄창을 띄움
    didAutoPrintRef.current = true;
    const t = window.setTimeout(() => {
      try {
        doPrint();
      } catch {}
    }, 350);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qpAutoPrint, loading, orders.length, lines.length]);

  // --- 합계(선택된 주문 "통합" 기준) ---
  const sumSupply = useMemo(() => lines.reduce((a, r) => a + (r.supply ?? 0), 0), [lines]);
  const sumVat = useMemo(() => lines.reduce((a, r) => a + (r.vat ?? 0), 0), [lines]);
  const sumTotal = useMemo(() => lines.reduce((a, r) => a + (r.total ?? 0), 0), [lines]);

  const selectedOrderCount = useMemo(() => {
    const set = new Set(selectedOrderIds);
    return orders.filter((o) => set.has(o.id)).length;
  }, [orders, selectedOrderIds]);

  // ✅ memo JSON에서 orderer_name 추출
  function extractOrdererName(memo: string | null | undefined) {
    const s = String(memo ?? "").trim();
    if (!s) return "";
    // 1) JSON 파싱 시도
    if (s.startsWith("{") && s.endsWith("}")) {
      try {
        const obj = JSON.parse(s);
        const v = obj?.orderer_name;
        if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
      } catch {}
    }
    // 2) 정규식 fallback
    const m = s.match(/"orderer_name"\s*:\s*"([^"]*)"/);
    if (m && m[1] !== undefined) return String(m[1]).trim();
    return "";
  }

  // ✅ 주문별 "품목 1개 외" 요약
  function buildFirstItemSummary(orderId: string) {
    const rows = rawLines.filter((x) => x.orderId === orderId).filter((x) => String(x.itemName ?? "").trim() !== "");
    if (!rows.length) return "";

    const first = rows[0];
    const firstName = String(first.itemName ?? "").trim();
    const firstQty = Number(first.qty ?? 0);
    const more = rows.length > 1;

    if (!firstName) return "";
    if (more) return `${firstName} ${formatMoney(firstQty)}개 외`;
    return `${firstName} ${formatMoney(firstQty)}개`;
  }

  // ✅ 화면용: 주문 선택 리스트에 표시할 라벨(빨간박스 영역)
  function getOrderSubLabel(o: OrderRow) {
    if (isChannelCustomer) {
      const nm = extractOrdererName(o.memo);
      return nm ? `주문자: ${nm}` : `주문자: `;
    }
    const sum = buildFirstItemSummary(o.id);
    return sum ? sum : `외`;
  }

  // ✅ 인쇄용: 페이지 제목에 붙일 텍스트(날짜 옆)
  function getOrderTitleSuffix(o: OrderRow) {
    if (isChannelCustomer) {
      const nm = extractOrdererName(o.memo);
      return nm ? ` ${nm}` : "";
    }
    return "";
  }

  // ✅ 인쇄용: 주문 1건의 라인 집계(품목+단가)
  function buildLinesForOrder(orderId: string) {
    const picked = rawLines.filter((x) => x.orderId === orderId);
    const agg = new Map<string, SpecLine>();
    for (const r of picked) {
      const key = `${r.itemName}||${r.unitPrice}`;
      const prev = agg.get(key);
      if (!prev) agg.set(key, { itemName: r.itemName, qty: r.qty, unitPrice: r.unitPrice, supply: r.supply, vat: r.vat, total: r.total });
      else {
        prev.qty += r.qty;
        prev.supply += r.supply;
        prev.vat += r.vat;
        prev.total += r.total;
      }
    }
    return Array.from(agg.values()).filter((x) => x.itemName.trim() !== "");
  }

  function sumOf(ls: SpecLine[]) {
    const supply = ls.reduce((a, r) => a + (r.supply ?? 0), 0);
    const vat = ls.reduce((a, r) => a + (r.vat ?? 0), 0);
    const total = ls.reduce((a, r) => a + (r.total ?? 0), 0);
    return { supply, vat, total };
  }

  const selectedOrders = useMemo(() => {
    const set = new Set(selectedOrderIds);
    return orders.filter((o) => set.has(o.id));
  }, [orders, selectedOrderIds]);

  // ✅ (화면용 제목) 판매채널일 때만 날짜 옆에 주문자 표시
  const screenTitleSuffix = useMemo(() => {
    if (!isChannelCustomer) return "";
    if (!selectedOrders.length) return "";

    const names = selectedOrders
      .map((o) => extractOrdererName(o.memo))
      .filter((x) => String(x).trim() !== "");

    if (!names.length) return "";

    const first = names[0];
    const allSame = names.every((n) => n === first);

    if (allSame) return ` ${first}`;
    return ` ${first} 외`;
  }, [isChannelCustomer, selectedOrders]);

  return (
    <div className={`print-shell min-h-screen ${pageBg} p-6`}>

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
        .print-only {
          display: none;
        }
        @media print {
          /* ✅ (수정) 인쇄 시 바깥 래퍼(min-h-screen/padding) 때문에 빈 2페이지가 생기는 문제 방지 */
          .print-shell {
            min-height: 0 !important;
            height: auto !important;
            padding: 0 !important;
          }

          body * {
            visibility: hidden !important;
          }
          #spec-print-area,
          #spec-print-area * {
            visibility: visible !important;
          }
          #spec-print-area {
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

          .avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .screen-only {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }

          /* 주문별 페이지 분리(판매채널에서만 사용) */
          .print-page {
            page-break-after: always !important;
          }
          .print-page:last-child {
            page-break-after: auto !important;
          }
        }
      `}</style>

      <div id="spec-print-area" className="mx-auto max-w-6xl">
        {/* 상단 타이틀/버튼 */}
        <div className="mb-4 flex items-start justify-end gap-3">
          <div className="flex gap-2 no-print">
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              onClick={() => router.push("/tax/statement")}
            >
              원장으로
            </button>
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              onClick={() => doPrint()}
            >
              인쇄 / PDF 저장
            </button>
          </div>
        </div>

        {/* 조회 조건 */}
        <div className={`${card} mb-4 p-4 no-print`}>
          <div className="mb-2 text-sm font-semibold">조회 조건</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_96px] md:items-end">
            <div>
              <div className="mb-1 text-xs text-slate-500">거래처</div>

              <div ref={partnerWrapRef} className="relative">
                <input
                  className={input}
                  value={partnerQuery}
                  placeholder="회사이름/사업자번호 입력"
                  onChange={(e) => {
                    setPartnerQuery(e.target.value);
                    setPartnerOpen(true);
                  }}
                  onFocus={onPartnerFocus}
                  onBlur={onPartnerBlur}
                />

                {partnerOpen && (
                  <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    {showNoResult ? (
                      <div className="p-3 text-sm text-slate-500">
                        검색 결과가 없습니다.
                        <div className="mt-2 text-xs text-slate-400">※ 목록에서 클릭해서 선택하세요.</div>
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-auto">
                        {filteredPartners.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectPartner(p)}
                          >
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-slate-500">{p.business_no ?? ""}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-slate-500">일자</div>
              <input type="date" className={input} value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
            </div>

            <div>
              <button
                className="w-full whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => {
                  const d = dateYMD || todayYMD();
                  pushUrl(partnerId, d);
                  loadSpec(partnerId, d);
                }}
              >
                조회
              </button>
            </div>
          </div>

          {msg && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{msg}</div>}

          {orders.length > 1 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">출고(주문) 선택</div>
                <div className="flex gap-2">
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs"
                    onClick={() => setSelectedOrderIds(orders.map((o) => o.id))}
                    type="button"
                  >
                    전체선택
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs"
                    onClick={() => setSelectedOrderIds([])}
                    type="button"
                  >
                    전체해제
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-600 mb-2">
                선택됨: <span className="font-semibold">{selectedOrderCount}</span>건 / 전체 {orders.length}건
              </div>

              <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white">
                {orders.map((o, idx) => {
                  const checked = selectedOrderIds.includes(o.id);
                  const time = (o.created_at ?? "").slice(11, 19);
                  const subLabel = getOrderSubLabel(o);
                  return (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setSelectedOrderIds((prev) => {
                            const set = new Set(prev);
                            if (on) set.add(o.id);
                            else set.delete(o.id);
                            return Array.from(set);
                          });
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <div className="font-semibold">주문 {idx + 1}</div>
                          {time ? <div className="text-xs text-slate-500">{time}</div> : null}
                          {o.ship_method ? (
                            <div className="text-xs text-slate-500">출고방법: {String(o.ship_method)}</div>
                          ) : null}
                        </div>

                        <div className="mt-0.5 truncate text-xs text-slate-600">{subLabel}</div>
                      </div>
                      <div className="text-right text-xs text-slate-700">
                        <div>합계</div>
                        <div className="font-semibold">{formatMoney(o.total_amount)}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-2 text-xs text-slate-500">
                ※ 체크된 주문만 아래 거래명세서(세부 내역)에 반영됩니다.
              </div>
            </div>
          ) : null}
        </div>

        {/* ===================== 화면용(통합 1장 화면 유지) ===================== */}
        <div className="screen-only">
          <div className={`${card} p-4`}>
            <div className="mb-4 text-base font-bold">{`거래명세서 ${ymdSlash(dateYMD)}${screenTitleSuffix}`}</div>

            <div className={`${card} mb-4 p-4`}>
              <div className="spec-party-grid grid grid-cols-2 gap-4">
                <div>
                  {selectedPartner ? (
                    <div className="space-y-1 text-sm">
                      <div className="font-semibold">{selectedPartner.name}</div>
                      <div className="text-slate-700">{selectedPartner.business_no ?? ""}</div>
                      <div>대표: {selectedPartner.ceo_name ?? ""}</div>
                      <div>주소: {selectedPartner.address1 ?? ""}</div>
                      <div>
                        업종: {selectedPartner.biz_type ?? ""} / 업태: {selectedPartner.biz_item ?? ""}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">거래처를 선택하세요.</div>
                  )}
                </div>

                <div className="relative text-right">
                  <div className="mb-2 text-sm font-semibold"> </div>

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
                    <div>{OUR.biz}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${card} p-4`}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">세부 내역</div>
                <div className="text-xs text-slate-500">
                  주문(출고) {orders.length}건 · 선택 {selectedOrderCount}건 · 품목 {lines.length}줄
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: "40%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "13%" }} />
                  </colgroup>
                  <thead className="bg-slate-50">
                    <tr className="text-xs text-slate-600">
                      <th className="px-3 py-2 text-left">품목</th>
                      <th className="px-3 py-2 text-right">수량</th>
                      <th className="px-3 py-2 text-right">단가</th>
                      <th className="px-3 py-2 text-right">공급가</th>
                      <th className="px-3 py-2 text-right">부가세</th>
                      <th className="px-3 py-2 text-right">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                          불러오는 중...
                        </td>
                      </tr>
                    ) : lines.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                          표시할 내역이 없습니다. (거래처/일자/주문 데이터 확인)
                        </td>
                      </tr>
                    ) : (
                      lines.map((r, idx) => (
                        <tr key={idx} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <div className="truncate">{r.itemName}</div>
                          </td>
                          <td className="px-3 py-2 text-right">{formatMoney(r.qty)}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(r.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatMoney(r.supply)}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(r.vat)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatMoney(r.total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 flex justify-end avoid-break">
                <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                  <div className="flex items-center justify-between py-1">
                    <div className="text-slate-700">공급가</div>
                    <div className="font-semibold">{formatMoney(sumSupply)}</div>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <div className="text-slate-700">부가세</div>
                    <div className="font-semibold">{formatMoney(sumVat)}</div>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <div className="text-slate-900">합계</div>
                    <div className="text-base font-bold">{formatMoney(sumTotal)}</div>
                  </div>
                </div>
              </div>
            </div>

            {!partnerId || !dateYMD ? (
              <div className="mt-4 text-sm text-slate-500">
                상단에서 거래처/일자를 선택하고 <span className="font-semibold">조회</span>를 눌러주세요.
              </div>
            ) : null}
          </div>
        </div>

        {/* ===================== 인쇄용(조건 분기) ===================== */}
        <div className="print-only">
          {selectedOrders.length === 0 ? (
            <div className={`${card} p-4`}>
              <div className="text-sm text-slate-500">표시할 주문이 없습니다.</div>
            </div>
          ) : isChannelCustomer ? (
            // ✅ 판매채널: 선택된 주문들을 "주문별" 페이지 분리 출력
            selectedOrders.map((o) => {
              const orderLines = buildLinesForOrder(o.id);
              const sums = sumOf(orderLines);
              const titleSuffix = getOrderTitleSuffix(o);

              return (
                <div key={o.id} className={`print-page ${card} p-4`}>
                  <div className="mb-4 text-base font-bold">{`거래명세서 ${ymdSlash(dateYMD)}${titleSuffix}`}</div>

                  <div className={`${card} mb-4 p-4`}>
                    <div className="spec-party-grid grid grid-cols-2 gap-4">
                      <div>
                        {selectedPartner ? (
                          <div className="space-y-1 text-sm">
                            <div className="font-semibold">{selectedPartner.name}</div>
                            <div className="text-slate-700">{selectedPartner.business_no ?? ""}</div>
                            <div>대표: {selectedPartner.ceo_name ?? ""}</div>
                            <div>주소: {selectedPartner.address1 ?? ""}</div>
                            <div>
                              업종: {selectedPartner.biz_type ?? ""} / 업태: {selectedPartner.biz_item ?? ""}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">거래처를 선택하세요.</div>
                        )}
                      </div>

                      <div className="relative text-right">
                        <div className="mb-2 text-sm font-semibold"> </div>

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
                          <div>{OUR.biz}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={`${card} p-4`}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold">세부 내역</div>
                      <div className="text-xs text-slate-500">선택 주문 1건 · 품목 {orderLines.length}줄</div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full table-fixed text-sm">
                        <colgroup>
                          <col style={{ width: "40%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "13%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "13%" }} />
                        </colgroup>
                        <thead className="bg-slate-50">
                          <tr className="text-xs text-slate-600">
                            <th className="px-3 py-2 text-left">품목</th>
                            <th className="px-3 py-2 text-right">수량</th>
                            <th className="px-3 py-2 text-right">단가</th>
                            <th className="px-3 py-2 text-right">공급가</th>
                            <th className="px-3 py-2 text-right">부가세</th>
                            <th className="px-3 py-2 text-right">합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderLines.length === 0 ? (
                            <tr>
                              <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                                표시할 내역이 없습니다.
                              </td>
                            </tr>
                          ) : (
                            orderLines.map((r, idx) => (
                              <tr key={idx} className="border-t border-slate-100">
                                <td className="px-3 py-2">
                                  <div className="truncate">{r.itemName}</div>
                                </td>
                                <td className="px-3 py-2 text-right">{formatMoney(r.qty)}</td>
                                <td className="px-3 py-2 text-right">{formatMoney(r.unitPrice)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatMoney(r.supply)}</td>
                                <td className="px-3 py-2 text-right">{formatMoney(r.vat)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatMoney(r.total)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-2 flex justify-end avoid-break">
                      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                        <div className="flex items-center justify-between py-1">
                          <div className="text-slate-700">공급가</div>
                          <div className="font-semibold">{formatMoney(sums.supply)}</div>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <div className="text-slate-700">부가세</div>
                          <div className="font-semibold">{formatMoney(sums.vat)}</div>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <div className="text-slate-900">합계</div>
                          <div className="text-base font-bold">{formatMoney(sums.total)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            // ✅ 일반 거래처: 선택된 여러 주문을 "1건"으로 통합 출력 (요청사항)
            <div className={`${card} p-4`}>
              <div className="mb-4 text-base font-bold">{`거래명세서 ${ymdSlash(dateYMD)}`}</div>

              <div className={`${card} mb-4 p-4`}>
                <div className="spec-party-grid grid grid-cols-2 gap-4">
                  <div>
                    {selectedPartner ? (
                      <div className="space-y-1 text-sm">
                        <div className="font-semibold">{selectedPartner.name}</div>
                        <div className="text-slate-700">{selectedPartner.business_no ?? ""}</div>
                        <div>대표: {selectedPartner.ceo_name ?? ""}</div>
                        <div>주소: {selectedPartner.address1 ?? ""}</div>
                        <div>
                          업종: {selectedPartner.biz_type ?? ""} / 업태: {selectedPartner.biz_item ?? ""}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">거래처를 선택하세요.</div>
                    )}
                  </div>

                  <div className="relative text-right">
                    <div className="mb-2 text-sm font-semibold"> </div>

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
                      <div>{OUR.biz}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${card} p-4`}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">세부 내역</div>
                  <div className="text-xs text-slate-500">
                    선택 {selectedOrderCount}건 · 품목 {lines.length}줄
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: "40%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "13%" }} />
                    </colgroup>
                    <thead className="bg-slate-50">
                      <tr className="text-xs text-slate-600">
                        <th className="px-3 py-2 text-left">품목</th>
                        <th className="px-3 py-2 text-right">수량</th>
                        <th className="px-3 py-2 text-right">단가</th>
                        <th className="px-3 py-2 text-right">공급가</th>
                        <th className="px-3 py-2 text-right">부가세</th>
                        <th className="px-3 py-2 text-right">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length === 0 ? (
                        <tr>
                          <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                            표시할 내역이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        lines.map((r, idx) => (
                          <tr key={idx} className="border-t border-slate-100">
                            <td className="px-3 py-2">
                              <div className="truncate">{r.itemName}</div>
                            </td>
                            <td className="px-3 py-2 text-right">{formatMoney(r.qty)}</td>
                            <td className="px-3 py-2 text-right">{formatMoney(r.unitPrice)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatMoney(r.supply)}</td>
                            <td className="px-3 py-2 text-right">{formatMoney(r.vat)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatMoney(r.total)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-2 flex justify-end avoid-break">
                  <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                    <div className="flex items-center justify-between py-1">
                      <div className="text-slate-700">공급가</div>
                      <div className="font-semibold">{formatMoney(sumSupply)}</div>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <div className="text-slate-700">부가세</div>
                      <div className="font-semibold">{formatMoney(sumVat)}</div>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <div className="text-slate-900">합계</div>
                      <div className="text-base font-bold">{formatMoney(sumTotal)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}