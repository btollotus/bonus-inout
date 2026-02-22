아래 **statement-client.tsx(거래원장)** 전체코드에서, **인쇄 화면에서만** 빨간 박스 표시된 2가지를 제거했습니다.

1. **상단 메뉴바(TopNav / .app-topnav)** → 인쇄 시 숨김
2. 하단 안내문(“※ 출고는 음수…”) → 인쇄 시 숨김

그 외는 **절대 변경 없음**입니다.

```tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

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
  amountSigned: number; // 잔액 계산용(입금 +, 출고 -)
  balance: number; // 누적 잔액
  remark: string; // ✅ 비고(주문자)
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
  const unitPrice = pickNumber(line, ["unit_price", "price", "unitPrice"], 0);

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
        setMsg("partner_id가 없습니다. (상단에서 거래처/기간 선택 후 조회를 누르세요)");
        return;
      }

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
        .eq("partner_id", pId)
        .eq("direction", "IN") // ✅ 구분은 "입금 또는 출고"만 표시
        .gte("entry_date", f)
        .lte("entry_date", t)
        .order("entry_date", { ascending: true })
        .limit(10000);

      if (lErr) {
        setMsg(lErr.message);
        return;
      }

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
        for (const o of oRows) {
          const date = o.ship_date ?? (o.created_at ? o.created_at.slice(0, 10) : "");
          if (o.id) dateMap.set(o.id, date);
          if (o.id) ordererMap.set(o.id, extractOrderer(o.memo));
        }

        for (const line of (olData ?? []) as any as LineLoose[]) {
          const orderId = String(line?.order_id ?? "");
          const date = dateMap.get(orderId) ?? "";
          const remark = ordererMap.get(orderId) ?? "";
          const m = mapLineToAmounts(line);

          if (!m.itemName || !String(m.itemName).trim()) continue;

          const amtSigned = -Number(m.total ?? 0);

          list.push({
            date,
            kind: "출고",
            itemName: m.itemName,
            qty: Number.isFinite(m.qty) ? m.qty : 0,
            unitPrice: Number.isFinite(m.unitPrice) ? m.unitPrice : 0,
            supply: Number.isFinite(m.supply) ? m.supply : 0,
            vat: Number.isFinite(m.vat) ? m.vat : 0,
            amountSigned: amtSigned,
            remark,
          });
        }
      }

      // ✅ 입금: 비고는 비움(요청: 주문자 항목)
      for (const l of (lData ?? []) as any as LedgerRow[]) {
        const date = l.entry_date;
        const amt = Number(l.amount ?? 0);
        list.push({
          date,
          kind: "입금",
          itemName: "",
          qty: null,
          unitPrice: null,
          supply: amt,
          vat: 0,
          amountSigned: amt,
          remark: "",
        });
      }

      // 정렬(일자 우선, 같은 일자는 입금 먼저, 그 다음 출고)
      list.sort((a, b) => {
        const d = String(a.date).localeCompare(String(b.date));
        if (d !== 0) return d;
        if (a.kind === b.kind) return 0;
        return a.kind === "입금" ? -1 : 1;
      });

      // 잔액 누적
      let bal = 0;
      const withBal: StatementRow[] = list.map((r) => {
        bal += Number(r.amountSigned ?? 0);
        return { ...r, balance: bal };
      });

      setRows(withBal);
    } finally {
      setLoading(false);
    }
  }

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

  function downloadExcelCsv() {
    if (!partnerId) return;

    const headers = ["일자", "구분", "품목명", "수량", "단가", "공급가", "부가세", "잔액", "비고"];
    const lines: string[] = [];
    lines.push(headers.map(csvEscape).join(","));

    for (const r of rows) {
      const row = [
        r.date ?? "",
        r.kind ?? "",
        r.itemName ?? "",
        r.qty === null ? "" : formatMoney(r.qty),
        r.unitPrice === null ? "" : formatMoney(r.unitPrice),
        r.supply === null ? "" : formatMoney(r.supply),
        r.vat === null ? "" : formatMoney(r.vat),
        formatMoney(r.balance ?? 0),
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
        const score =
          !q ? 9999 : name.startsWith(q) ? 0 : name.includes(q) ? 1 : biz.includes(q) ? 2 : hit ? 3 : 99;
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

  return (
    <div className={`${pageBg} min-h-screen`}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-card { box-shadow: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 10mm; }
          /* 인쇄 시 가로 스크롤 방지 */
          .table-wrap { overflow: visible !important; }
          table { width: 100% !important; }
          th, td { font-size: 10px !important; padding: 4px 6px !important; }
          .truncate { white-space: normal !important; }

          /* ✅ 인쇄 시 상단 메뉴바 제거(요청) */
          .app-topnav { display: none !important; }

          /* ✅ 인쇄 시 하단 안내문 제거(요청) */
          .print-hide { display: none !important; }
        }
      `}</style>

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
                    <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">※ 목록에서 클릭해서 선택하세요.</div>
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
                  const f = addDays(todayYMD(), -30);
                  const t = todayYMD();
                  setFromYMD(f);
                  setToYMD(t);
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
              <div className="mb-2 text-sm font-semibold">거래처</div>
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
              <span className="font-semibold tabular-nums">{formatMoney(totals.outSum)}</span> · 미수(출고-입금){" "}
              <span className="font-semibold tabular-nums">{formatMoney(Math.max(0, totals.outSum - totals.inSum))}</span>
            </div>
          </div>

          {/* ✅ 세로 스크롤 */}
          <div className="table-wrap max-h-[520px] overflow-y-auto rounded-2xl border border-slate-200">
            <table className="w-full table-fixed text-sm">
              {/* ✅ 인쇄 가로 스크롤 없이: 폭 재조정 */}
              <colgroup>
                <col style={{ width: "76px" }} />
                <col style={{ width: "52px" }} />
                <col style={{ width: "180px" }} />
                <col style={{ width: "52px" }} />
                <col style={{ width: "64px" }} />
                <col style={{ width: "72px" }} />
                <col style={{ width: "60px" }} />
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
                  <th className="px-2 py-2 text-right">잔액</th>
                  <th className="px-2 py-2 text-left">비고</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-4 text-sm text-slate-500">
                      불러오는 중...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-4 text-sm text-slate-500">
                      표시할 내역이 없습니다. (거래처/기간/데이터 확인)
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => {
                    const isMinus = r.amountSigned < 0;
                    const moneyClass = isMinus ? "text-red-600" : "text-blue-700";
                    return (
                      <tr key={`${r.date}-${idx}`} className="border-t border-slate-200 bg-white">
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
                        <td className={`px-2 py-2 text-right tabular-nums font-semibold ${moneyClass}`}>
                          {r.supply === null ? "" : formatMoney(r.supply)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.vat === null ? "" : formatMoney(r.vat)}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold">{formatMoney(r.balance)}</td>
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

          <div className="print-hide mt-2 text-xs text-slate-500">
            ※ 출고는 음수(잔액 감소), 입금은 양수(잔액 증가)로 잔액이 계산됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}
```
