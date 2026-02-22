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

function safeJsonParse<T>(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

// ✅ {"title":null,"orderer_name":null} 같은 “의미없는 JSON 메모”는 표시 안함
function normalizeRemark(raw: string | null) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const obj = safeJsonParse<{ title?: string | null; orderer_name?: string | null }>(s);
  if (obj && typeof obj === "object") {
    const title = String(obj.title ?? "").trim();
    const orderer = String(obj.orderer_name ?? "").trim();
    if (!title && !orderer) return "";
    const parts: string[] = [];
    if (title) parts.push(title);
    if (orderer) parts.push(`주문자:${orderer}`);
    return parts.join(" / ");
  }

  return s;
}

// ---- order_lines 컬럼명이 프로젝트마다 다를 수 있어서, 여러 후보키를 안전하게 매핑 ----
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
 * 2) 없으면 qty*unitPrice로 공급가를 만들고, 부가세는 0으로 둠(세율/면세 판단 불가)
 */
function mapLineToSpec(line: LineLoose): SpecLine {
  const itemName = pickString(line, ["item_name", "product_name", "variant_name", "name", "title", "product_title"], "");

  const qty = pickNumber(line, ["qty", "quantity", "ea", "count"], 0);
  const unitPrice = pickNumber(line, ["unit_price", "price", "unitPrice"], 0);

  const supplyRaw = pickNumber(line, ["supply_amount", "supply", "supplyValue", "amount_supply"], NaN);
  const vatRaw = pickNumber(line, ["vat_amount", "vat", "vatValue", "amount_vat"], NaN);
  const totalRaw = pickNumber(line, ["total_amount", "total", "line_total", "amount_total"], NaN);

  let supply = Number.isFinite(supplyRaw) ? supplyRaw : qty * unitPrice;
  let vat = Number.isFinite(vatRaw) ? vatRaw : 0;
  let total = Number.isFinite(totalRaw) ? totalRaw : supply + vat;

  // 혹시 total만 있고 supply/vat이 없는 경우: supply=total, vat=0
  if (!Number.isFinite(supplyRaw) && Number.isFinite(totalRaw) && !Number.isFinite(vatRaw)) {
    supply = totalRaw;
    vat = 0;
    total = totalRaw;
  }

  return {
    itemName,
    qty,
    unitPrice,
    supply,
    vat,
    total,
  };
}

export default function SpecClient() {
  const supabase = useMemo(() => createClient(), []);
  const sp = useSearchParams();
  const router = useRouter();

  const qpPartnerId = sp.get("partnerId") || sp.get("partner_id") || "";
  const qpDate = sp.get("date") || "";

  const [msg, setMsg] = useState<string | null>(null);

  const [partnerId, setPartnerId] = useState<string>(qpPartnerId);
  const [dateYMD, setDateYMD] = useState<string>(qpDate);

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const selectedPartner = useMemo(() => partners.find((p) => p.id === partnerId) ?? null, [partners, partnerId]);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<SpecLine[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ “회사정보”
  const OUR = {
    name: "주식회사 보누스메이트",
    ceo: "조대성",
    address1: "경기도 파주시 광탄면 장지산로 250-90 1층",
    biz: "제조업 / 업태: 식품제조가공업",
    business_no: "343-88-03009",
  };

  // ====== Theme (동일 톤) ======
  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";

  function pushUrl(nextPartnerId: string, date: string) {
    const qs = new URLSearchParams();
    if (nextPartnerId) qs.set("partnerId", nextPartnerId);
    if (date) qs.set("date", date);
    router.replace(`/tax/spec?${qs.toString()}`);
  }

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

      // 1) 해당 거래처 + 해당일자의 출고(orders) 조회
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

      const oRows = (oData ?? []) as any as OrderRow[];
      setOrders(oRows);

      if (oRows.length === 0) {
        setLines([]);
        return;
      }

      const orderIds = oRows.map((o) => o.id);

      // 2) order_lines 조회 (FK 관계명/컬럼명이 프로젝트마다 달라서 "order_lines" 기준으로 우선)
      const { data: lData, error: lErr } = await supabase
        .from("order_lines")
        .select("*")
        .in("order_id", orderIds)
        .order("created_at", { ascending: true })
        .limit(20000);

      if (lErr) {
        setMsg(lErr.message);
        return;
      }

      const mapped = (lData ?? []).map((x) => mapLineToSpec(x as any));
      setLines(mapped);
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    const supplySum = lines.reduce((acc, r) => acc + Number(r.supply ?? 0), 0);
    const vatSum = lines.reduce((acc, r) => acc + Number(r.vat ?? 0), 0);
    const totalSum = lines.reduce((acc, r) => acc + Number(r.total ?? 0), 0);

    // ✅ 입금/출금(수금) 반영 안 하므로, 기본 미수금은 “합계와 동일”로 표시
    const receivable = totalSum;

    return { supplySum, vatSum, totalSum, receivable };
  }, [lines]);

  const headerRemark = useMemo(() => {
    // 같은 날짜에 주문이 여러 건이면, memo가 여러 개일 수 있어서 합쳐서 보여줌(빈 값은 제외)
    const ms = orders.map((o) => normalizeRemark(o.memo)).filter((x) => x);
    return ms.length ? ms.join(" / ") : "";
  }, [orders]);

  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 초기: URL 파라미터가 있으면 자동 조회
  useEffect(() => {
    if (qpPartnerId) setPartnerId(qpPartnerId);
    if (qpDate) setDateYMD(qpDate);
    if (qpPartnerId && qpDate) loadSpec(qpPartnerId, qpDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPrint = !!partnerId && !!dateYMD;

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
            <div className="text-xl font-semibold">거래명세서</div>
            <div className="mt-2">
              <span className={pill}>일자: {dateYMD || "-"}</span>
            </div>
            {headerRemark ? <div className="mt-2 text-sm text-slate-700">비고: {headerRemark}</div> : null}
          </div>

          <div className="no-print flex gap-2">
            <button className={btn} onClick={() => window.print()} disabled={!canPrint} title={!canPrint ? "거래처/일자를 먼저 선택하세요" : ""}>
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
                }}
              >
                조회
              </button>
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-500">※ 해당 거래처의 해당 일자(ship_date) 출고 건을 모아서 1장 거래명세서로 표시합니다.</div>
        </div>

        {/* 거래처(좌) / 회사정보(우) */}
        <div className={`${card} print-card mt-4 p-4`}>
          <div className="grid grid-cols-2 gap-6 items-start">
            {/* LEFT: 회사(공급자) */}
            <div>
              <div className="mb-2 text-sm font-semibold">공급자</div>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">
                  {OUR.name} {OUR.business_no ? `(${OUR.business_no})` : ""}
                </div>
                <div>대표: {OUR.ceo}</div>
                <div>주소: {OUR.address1}</div>
                <div>업종: {OUR.biz}</div>
              </div>
            </div>

            {/* RIGHT: 거래처(공급받는자) */}
            <div className="text-right">
              <div className="mb-2 text-sm font-semibold">공급받는자</div>
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
          </div>
        </div>

        {/* 표 */}
        <div className={`${card} print-card mt-4 p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">품목 내역</div>
            <div className="text-sm text-slate-600">출고건수: <span className="font-semibold">{orders.length}</span></div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: "auto" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "130px" }} />
                <col style={{ width: "140px" }} />
                <col style={{ width: "140px" }} />
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
                      표시할 품목 내역이 없습니다. (order_lines 데이터 / 컬럼 확인 필요)
                    </td>
                  </tr>
                ) : (
                  lines.map((r, idx) => (
                    <tr key={idx} className="border-t border-slate-200 bg-white">
                      <td className="px-3 py-2">{r.itemName || "-"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.unitPrice)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(r.supply)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(r.vat)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(r.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 하단 합계 */}
          <div className="mt-4 flex flex-col items-end gap-2">
            <div className="w-full max-w-[520px] rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="grid grid-cols-[1fr_auto] gap-y-2">
                <div className="text-slate-600">공급가 합계</div>
                <div className="text-right font-semibold tabular-nums">{formatMoney(totals.supplySum)}</div>

                <div className="text-slate-600">부가세 합계</div>
                <div className="text-right font-semibold tabular-nums">{formatMoney(totals.vatSum)}</div>

                <div className="text-slate-600">합계</div>
                <div className="text-right font-semibold tabular-nums">{formatMoney(totals.totalSum)}</div>

                <div className="text-slate-600">미수금</div>
                <div className="text-right font-semibold tabular-nums">{formatMoney(totals.receivable)}</div>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              ※ 본 거래명세서는 <span className="font-semibold">입금/출금(수금)</span>을 반영하지 않습니다. (미수금은 합계 기준으로 표시)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}