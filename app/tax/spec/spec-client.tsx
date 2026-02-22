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

type LineRow = {
  id: string;
  order_id: string;
  line_no: number;
  name: string;
  qty: number;
  unit: number; // 단가
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
};

function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
}
function formatYMDSlashes(ymd: string) {
  // YYYY-MM-DD -> YYYY/MM/DD
  const s = String(ymd ?? "").trim();
  if (!s) return "";
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${y}/${m}/${d}`;
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

  // ✅ 거래처 입력 검색(요청사항)
  const [partnerQuery, setPartnerQuery] = useState<string>("");

  const selectedPartner = useMemo(() => partners.find((p) => p.id === partnerId) ?? null, [partners, partnerId]);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
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

    // URL partner가 있으면 입력창에도 표시
    if (qpPartnerId) {
      const p = list.find((x) => x.id === qpPartnerId);
      if (p) setPartnerQuery(p.business_no ? `${p.name} (${p.business_no})` : p.name);
    }
  }

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

  function pushUrl(nextPartnerId: string, nextDate: string) {
    const qs = new URLSearchParams();
    if (nextPartnerId) qs.set("partnerId", nextPartnerId);
    if (nextDate) qs.set("date", nextDate);
    router.replace(`/tax/spec?${qs.toString()}`);
  }

  async function loadSpec(pId: string, ymd: string) {
    setMsg(null);
    setLoading(true);
    try {
      if (!pId || !ymd) {
        setOrders([]);
        setLines([]);
        setMsg("partnerId 또는 date가 없습니다. (상단에서 거래처/일자 선택 후 조회)");
        return;
      }

      // 1) 해당 거래처 + 해당일 orders
      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name,ship_date,ship_method,memo,supply_amount,vat_amount,total_amount,created_at")
        .eq("customer_id", pId)
        .eq("ship_date", ymd)
        .order("created_at", { ascending: true })
        .limit(5000);

      if (oErr) {
        setMsg(oErr.message);
        return;
      }

      const oList = (oData ?? []) as any as OrderRow[];
      setOrders(oList);

      const orderIds = oList.map((o) => o.id).filter(Boolean);
      if (orderIds.length === 0) {
        setLines([]);
        return;
      }

      // 2) order_lines
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

      setLines((lData ?? []) as any as LineRow[]);
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
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

  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (qpPartnerId && qpDate) {
      setPartnerId(qpPartnerId);
      setDateYMD(qpDate);
      loadSpec(qpPartnerId, qpDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPrint = !!partnerId && !!dateYMD;

  return (
    <div className={`${pageBg} min-h-screen`}>
      {/* ✅ 인쇄 시: 상단 검은 nav(전역 TopNav) 숨김 + 조회영역 숨김 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-card { box-shadow: none !important; }
          nav, header { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        {msg ? (
          <div className="no-print mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {/* ✅ 제목: 거래명세서 YYYY/MM/DD */}
            <div className="text-xl font-semibold">거래명세서 {dateYMD ? formatYMDSlashes(dateYMD) : ""}</div>
          </div>

          <div className="no-print flex gap-2">
            <button className={btn} onClick={() => router.push("/tax/statement")} title="원장으로">
              원장으로
            </button>
            <button className={btn} onClick={() => window.print()} disabled={!canPrint} title={!canPrint ? "거래처/일자를 먼저 선택하세요" : ""}>
              인쇄 / PDF 저장
            </button>
          </div>
        </div>

        {/* 조회 조건 */}
        <div className={`${card} no-print p-4`}>
          <div className="mb-3 text-sm font-semibold">조회 조건</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px_auto] md:items-end">
            {/* ✅ 거래처: 입력 검색 */}
            <div>
              <div className="mb-1 text-xs text-slate-600">거래처</div>
              <div className="relative">
                <input className={input} value={partnerQuery} onChange={(e) => setPartnerQuery(e.target.value)} placeholder="회사명을 입력하세요" />
                {partnerQuery.trim() ? (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <div className="max-h-72 overflow-y-auto">
                      {filteredPartners.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500">검색 결과가 없습니다.</div>
                      ) : (
                        filteredPartners.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => {
                              setPartnerId(p.id);
                              setPartnerQuery(p.business_no ? `${p.name} (${p.business_no})` : p.name);
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
              <div className="mb-1 text-xs text-slate-600">일자</div>
              <input type="date" className={input} value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
            </div>

            <div className="flex gap-2">
              <button
                className={btnOn}
                onClick={() => {
                  pushUrl(partnerId, dateYMD);
                  loadSpec(partnerId, dateYMD);
                }}
                disabled={!partnerId || !dateYMD}
                title={!partnerId || !dateYMD ? "거래처/일자를 먼저 선택하세요" : ""}
              >
                조회
              </button>
            </div>
          </div>
        </div>

        {/* 거래처(좌) / 우리회사(우) - 화면/인쇄 동일 포맷 */}
        <div className={`${card} print-card mt-4 p-4`}>
          <div className="grid grid-cols-2 gap-6 items-start">
            {/* LEFT: 거래처 */}
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
                      업종: {selectedPartner.biz_type ?? ""} {selectedPartner.biz_item ? `/ 업태: ${selectedPartner.biz_item}` : ""}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-slate-500">거래처를 선택하세요.</div>
              )}
            </div>

            {/* RIGHT: 우리회사 (도장 포함) */}
            <div className="text-right">
              <div className="mb-2 text-sm font-semibold opacity-0 select-none">.</div>

              <div className="space-y-1 text-sm">
                <div className="font-semibold">{OUR.name}</div>
                <div>{OUR.business_no}</div>

                {/* 대표 + 도장 */}
                <div className="relative inline-block">
                  <span>대표: {OUR.ceo}</span>
                  {/* ✅ public/stamp.png */}
                  <img
                    src="/stamp.png"
                    alt="stamp"
                    className="pointer-events-none absolute -right-10 -top-3 h-12 w-12"
                  />
                </div>

                <div>주소: {OUR.address1}</div>
                <div>업종: {OUR.biz}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 세부 내역 */}
        <div className={`${card} print-card mt-4 p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">세부 내역</div>
            <div className="text-sm text-slate-600">
              주문(출고) {orders.length}건 · 품목 {lines.length}줄
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full table-fixed text-sm">
              {/* ✅ 품목 1줄(줄바꿈 방지) 위해: 다른 컬럼 폭을 줄이고 품목 auto */}
              <colgroup>
                <col style={{ width: "auto" }} />
                <col style={{ width: "80px" }} />
                <col style={{ width: "80px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "120px" }} />
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
                      {/* ✅ 품목: 1줄 고정 */}
                      <td className="px-3 py-2 whitespace-nowrap overflow-hidden text-ellipsis" title={ln.name}>
                        {ln.name}
                      </td>
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

          {/* 하단 합계 */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-[360px] rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <div className="text-slate-600">공급가</div>
                <div className="font-semibold tabular-nums">{formatMoney(totals.supply)}</div>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <div className="text-slate-600">부가세</div>
                <div className="font-semibold tabular-nums">{formatMoney(totals.vat)}</div>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <div className="text-slate-600">합계</div>
                <div className="font-semibold tabular-nums">{formatMoney(totals.total)}</div>
              </div>

              {/* (기존처럼 미수금 영역이 이미 있다면 그대로 유지되어야 하지만,
                  현재 요청사항에 “미수금 계산 변경”은 없어서 금액 로직은 건드리지 않았습니다.) */}
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-500">※ 거래명세서에는 “입금/출금 라인”을 표시하지 않습니다.</div>
        </div>
      </div>
    </div>
  );
}