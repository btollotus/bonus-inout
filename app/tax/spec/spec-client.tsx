"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  created_at: string;
};

type OrderLineRow = {
  id: string;
  order_id: string;
  line_no: number;
  name: string; // ✅ 품목명
  qty: number; // ✅ 수량
  unit: number; // ✅ 단가(프로젝트에서 unit을 단가로 사용)
  supply_amount: number; // ✅ 공급가
  vat_amount: number; // ✅ 부가세
  total_amount: number; // ✅ 합계
};

function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
}

export default function SpecClient() {
  const supabase = useMemo(() => createClient(), []);
  const sp = useSearchParams();
  const router = useRouter();

  const qpPartnerId = sp.get("partnerId") || sp.get("partner_id") || "";
  const qpDate = sp.get("date") || "";

  const [msg, setMsg] = useState<string | null>(null);

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [partnerId, setPartnerId] = useState<string>(qpPartnerId);
  const [dateYMD, setDateYMD] = useState<string>(qpDate);

  const selectedPartner = useMemo(() => partners.find((p) => p.id === partnerId) ?? null, [partners, partnerId]);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<OrderLineRow[]>([]);
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
    setPartners((data ?? []) as PartnerRow[]);
  }

  function pushUrl(nextPartnerId: string, date: string) {
    const qs = new URLSearchParams();
    if (nextPartnerId) qs.set("partnerId", nextPartnerId);
    if (date) qs.set("date", date);
    router.replace(`/tax/spec?${qs.toString()}`);
  }

  async function loadSpec(pId: string, date: string) {
    setMsg(null);
    setLoading(true);
    try {
      if (!pId || !date) {
        setOrders([]);
        setLines([]);
        setMsg("partnerId 또는 date가 없습니다. (상단에서 거래처/일자 선택 후 조회)");
        return;
      }

      // 1) 해당 거래처 + 해당일 출고(order) 조회
      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name,ship_date,ship_method,memo,supply_amount,vat_amount,total_amount,created_at")
        .eq("customer_id", pId)
        .eq("ship_date", date)
        .order("created_at", { ascending: true })
        .limit(5000);

      if (oErr) {
        setMsg(oErr.message);
        return;
      }

      const orderList = (oData ?? []) as any as OrderRow[];
      setOrders(orderList);

      const orderIds = orderList.map((o) => o.id).filter(Boolean);
      if (orderIds.length === 0) {
        setLines([]);
        return;
      }

      // 2) 해당 주문들의 라인(order_lines) 조회
      const { data: lData, error: lErr } = await supabase
        .from("order_lines")
        .select("id,order_id,line_no,name,qty,unit,supply_amount,vat_amount,total_amount")
        .in("order_id", orderIds)
        .order("order_id", { ascending: true })
        .order("line_no", { ascending: true })
        .limit(20000);

      if (lErr) {
        setMsg(lErr.message);
        return;
      }

      setLines((lData ?? []) as any as OrderLineRow[]);
    } finally {
      setLoading(false);
    }
  }

  // ✅ 하단 합계(라인 기준)
  const sums = useMemo(() => {
    let supply = 0;
    let vat = 0;
    let total = 0;
    for (const ln of lines) {
      supply += Number(ln.supply_amount ?? 0);
      vat += Number(ln.vat_amount ?? 0);
      total += Number(ln.total_amount ?? 0);
    }
    return { supply, vat, total };
  }, [lines]);

  // ✅ 미수금: “해당일 입금(IN) 합계”만 조회해서 total - paid 로 계산 (표에는 입금/출금 라인 표시 안함)
  const [paidOnDay, setPaidOnDay] = useState(0);

  async function loadPaidOnDay(pId: string, date: string) {
    setPaidOnDay(0);
    if (!pId || !date) return;

    const { data, error } = await supabase
      .from("ledger_entries")
      .select("direction,amount")
      .eq("partner_id", pId)
      .eq("entry_date", date)
      .limit(10000);

    if (error) return;

    let sum = 0;
    for (const r of (data ?? []) as any[]) {
      if (String(r.direction) === "IN") sum += Number(r.amount ?? 0);
    }
    setPaidOnDay(sum);
  }

  const outstanding = useMemo(() => {
    const v = Number(sums.total ?? 0) - Number(paidOnDay ?? 0);
    return v > 0 ? v : 0;
  }, [sums.total, paidOnDay]);

  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (qpPartnerId && qpDate) {
      setPartnerId(qpPartnerId);
      setDateYMD(qpDate);
      loadSpec(qpPartnerId, qpDate);
      loadPaidOnDay(qpPartnerId, qpDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`${pageBg} min-h-screen`}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-card { box-shadow: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        {msg ? (
          <div className="no-print mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">거래명세서 (일자별)</div>
            <div className="mt-2">
              <span className={pill}>일자: {dateYMD || "-"}</span>
            </div>
          </div>

          <div className="no-print flex gap-2">
            <button className={btn} onClick={() => router.push("/tax/statement")} title="거래원장으로 돌아가기">
              원장으로
            </button>
            <button className={btn} onClick={() => window.print()} disabled={!partnerId || !dateYMD}>
              인쇄 / PDF 저장
            </button>
          </div>
        </div>

        {/* 조회 조건 */}
        <div className={`${card} no-print p-4`}>
          <div className="mb-3 text-sm font-semibold">조회 조건</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
            <div>
              <div className="mb-1 text-xs text-slate-600">거래처</div>
              <select className={input} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">선택하세요</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.business_no ? `(${p.business_no})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-slate-600">일자</div>
              <input type="date" className={input} value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
            </div>

            <div className="flex gap-2">
              <button
                className={btnOn}
                onClick={() => {
                  pushUrl(partnerId, dateYMD);
                  loadSpec(partnerId, dateYMD);
                  loadPaidOnDay(partnerId, dateYMD);
                }}
              >
                조회
              </button>
            </div>
          </div>
        </div>

        {/* 거래처/회사정보 */}
        <div className={`${card} print-card mt-4 p-4`}>
          <div className="grid grid-cols-2 gap-6 items-start">
            <div>
              <div className="mb-2 text-sm font-semibold">거래처</div>
              {selectedPartner ? (
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">
                    {selectedPartner.name} {selectedPartner.business_no ? `(${selectedPartner.business_no})` : ""}
                  </div>
                  {selectedPartner.ceo_name ? <div>대표: {selectedPartner.ceo_name}</div> : null}
                  {selectedPartner.address1 ? <div>주소: {selectedPartner.address1}</div> : null}
                  {(selectedPartner.biz_type || selectedPartner.biz_item) ? (
                    <div>
                      업종: {selectedPartner.biz_type ?? ""} {selectedPartner.biz_item ? `/ 업태: ${selectedPartner.biz_item}` : ""}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-slate-500">거래처를 선택하세요.</div>
              )}
            </div>

            <div className="text-right">
              <div className="mb-2 text-sm font-semibold opacity-0 select-none">.</div>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">
                  {OUR.name} ({OUR.business_no})
                </div>
                <div>대표: {OUR.ceo}</div>
                <div>주소: {OUR.address1}</div>
                <div>업종: {OUR.biz}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 상세 표 */}
        <div className={`${card} print-card mt-4 p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">세부 내역</div>
            <div className="text-sm text-slate-600">
              주문(출고) {orders.length}건 · 품목 {lines.length}줄
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: "auto" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "140px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "140px" }} />
              </colgroup>

              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
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
                    <td colSpan={6} className="px-4 py-4 text-sm text-slate-500">
                      불러오는 중...
                    </td>
                  </tr>
                ) : lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-sm text-slate-500">
                      표시할 내역이 없습니다. (거래처/일자/주문 데이터 확인)
                    </td>
                  </tr>
                ) : (
                  lines.map((ln) => (
                    <tr key={ln.id} className="border-t border-slate-200 bg-white">
                      <td className="px-3 py-2">{ln.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(ln.qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(ln.unit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(ln.supply_amount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(ln.vat_amount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(ln.total_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 하단 합계 + 미수금 */}
          <div className="mt-4 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <div className="text-slate-500">※ 거래명세서에는 “입금/출금 라인”을 표시하지 않습니다.</div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <div>공급가</div>
                <div className="font-semibold tabular-nums">{formatMoney(sums.supply)}</div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div>부가세</div>
                <div className="font-semibold tabular-nums">{formatMoney(sums.vat)}</div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div>합계</div>
                <div className="font-semibold tabular-nums">{formatMoney(sums.total)}</div>
              </div>
              <div className="mt-2 border-t border-slate-200 pt-2 flex items-center justify-between">
                <div>미수금</div>
                <div className="font-semibold tabular-nums">{formatMoney(outstanding)}</div>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                (미수금 = 해당일 합계 - 해당일 입금 합계 {formatMoney(paidOnDay)})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}